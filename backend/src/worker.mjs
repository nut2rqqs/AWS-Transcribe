import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand
} from '@aws-sdk/client-transcribe';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const transcribe = new TranscribeClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;
const transcribeLanguageCodes = { ja:'ja-JP', zh:'zh-CN', en:'en-US', ko:'ko-KR', th:'th-TH' };
const START_LEASE_SECONDS = 300;

function isConditionalFailure(error) {
  return error?.name === 'ConditionalCheckFailedException';
}

function isAlreadyExists(error) {
  return error?.name === 'ConflictException' || error?.name === 'ResourceAlreadyExistsException';
}

async function claimJob(jobId) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { jobId },
      UpdateExpression: 'SET #status = :starting, leaseUntil = :lease, updatedAt = :updated',
      ConditionExpression: '#status = :queued OR (#status = :starting AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now))',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':queued': 'QUEUED',
        ':starting': 'STARTING',
        ':lease': now + START_LEASE_SECONDS,
        ':now': now,
        ':updated': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    }));
    return result.Attributes || null;
  } catch (error) {
    if (isConditionalFailure(error)) return null;
    throw error;
  }
}

async function startOrRecoverTranscription(job, transcribeJobName) {
  try {
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName,
      Media: { MediaFileUri: `s3://${bucket}/${job.key}` },
      IdentifyLanguage: job.sourceLanguage === 'auto',
      ...(job.sourceLanguage !== 'auto'
        ? { LanguageCode: transcribeLanguageCodes[job.sourceLanguage] || job.sourceLanguage }
        : {}),
      OutputBucketName: bucket,
      OutputKey: `transcripts/${job.jobId}/original`,
      Subtitles: { Formats: ['srt'], OutputStartIndex: 1 }
    }));
    return 'IN_PROGRESS';
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    // A previous invocation may have started the remote job but failed before
    // persisting that fact. Reuse the deterministic Transcribe job name.
    const existing = await transcribe.send(new GetTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName
    }));
    const status = existing.TranscriptionJob?.TranscriptionJobStatus;
    if (!['QUEUED', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      throw new Error(`Existing Transcribe job is not recoverable (status: ${status || 'unknown'}).`);
    }
    return status;
  }
}

export const handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records || []) {
    let jobId = 'unknown';
    let claimed = false;
    try {
      ({ jobId } = JSON.parse(record.body));
      if (!jobId) throw new Error('Queue message is missing jobId.');

      const job = await claimJob(jobId);
      if (!job) continue;
      claimed = true;

      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: job.key }));
      const transcribeJobName = job.transcribeJobName || `aws-ts-${jobId}`.slice(0, 200);
      const remoteStatus = await startOrRecoverTranscription(job, transcribeJobName);

      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { jobId },
        UpdateExpression: 'SET #status = :status, transcribeJobName = :name, updatedAt = :now REMOVE leaseUntil',
        ConditionExpression: '#status = :starting',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': remoteStatus === 'COMPLETED' ? 'TRANSCRIBE_COMPLETED' : 'TRANSCRIBING',
          ':name': transcribeJobName,
          ':starting': 'STARTING',
          ':now': new Date().toISOString()
        }
      }));
    } catch (error) {
      console.error('Transcribe start/recovery failed', { jobId, error });
      if (claimed) {
        try {
          await ddb.send(new UpdateCommand({
            TableName: table,
            Key: { jobId },
            UpdateExpression: 'SET #status = :queued, updatedAt = :now REMOVE leaseUntil',
            ConditionExpression: '#status = :starting',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':queued': 'QUEUED',
              ':starting': 'STARTING',
              ':now': new Date().toISOString()
            }
          }));
        } catch (releaseError) {
          console.error('Unable to release Transcribe start lease', { jobId, releaseError });
        }
      }
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
