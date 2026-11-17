import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TranscribeClient, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { translateSubtitleFile, normalizeTranslateLanguageCode } from './translate.mjs';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const transcribe = new TranscribeClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;
const COMPLETION_LEASE_SECONDS = 600;

function isConditionalFailure(error) {
  return error?.name === 'ConditionalCheckFailedException';
}

async function claimCompletion(jobId) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { jobId },
      UpdateExpression: 'SET #status = :processing, completionLeaseUntil = :lease, updatedAt = :updated',
      ConditionExpression: '#status = :starting OR #status = :transcribing OR #status = :transcribeCompleted OR (#status = :processing AND (attribute_not_exists(completionLeaseUntil) OR completionLeaseUntil < :now))',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':starting': 'STARTING',
        ':transcribing': 'TRANSCRIBING',
        ':transcribeCompleted': 'TRANSCRIBE_COMPLETED',
        ':processing': 'COMPLETING',
        ':lease': now + COMPLETION_LEASE_SECONDS,
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

async function markFailed(jobId, message) {
  await ddb.send(new UpdateCommand({
    TableName: table,
    Key: { jobId },
    UpdateExpression: 'SET #status = :failed, errorMessage = :message, updatedAt = :now REMOVE completionLeaseUntil',
    ConditionExpression: '#status = :processing',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':failed': 'FAILED',
      ':processing': 'COMPLETING',
      ':message': message,
      ':now': new Date().toISOString()
    }
  }));
}

export const handler = async (event) => {
  const detail = event.detail || {};
  const transcribeJobName = detail.TranscriptionJobName;
  const transcribeStatus = detail.TranscriptionJobStatus;

  if (!transcribeJobName || !['COMPLETED', 'FAILED'].includes(transcribeStatus)) {
    console.log('Ignoring unrelated Transcribe event', detail);
    return;
  }

  const jobId = transcribeJobName.replace(/^aws-ts-/, '');
  if (!jobId || jobId === transcribeJobName) {
    console.warn('Ignoring Transcribe event with an unexpected job name', transcribeJobName);
    return;
  }

  const result = await ddb.send(new GetCommand({ TableName: table, Key: { jobId } }));
  const existing = result.Item;
  if (!existing || ['COMPLETED', 'FAILED'].includes(existing.status)) return;

  const job = await claimCompletion(jobId);
  if (!job) {
    console.log('Completion is already claimed or finalized', { jobId, status: existing.status });
    return;
  }

  if (transcribeStatus === 'FAILED') {
    await markFailed(jobId, detail.FailureReason || 'Amazon Transcribe could not process this file.');
    return;
  }

  try {
    const response = await transcribe.send(new GetTranscriptionJobCommand({
      TranscriptionJobName: transcribeJobName
    }));
    const transcription = response.TranscriptionJob;
    const subtitleUris = transcription?.Subtitles?.SubtitleFileUris || [];
    const originalSrt = await readSubtitle(subtitleUris[0]);
    const sourceLanguage = transcription?.LanguageCode || job.sourceLanguage || 'auto';
    const thaiSrt = !job.translateToThai || normalizeTranslateLanguageCode(sourceLanguage) === 'th'
      ? originalSrt
      : await translateSubtitleFile(originalSrt, sourceLanguage);

    const originalKey = `outputs/${jobId}/original.srt`;
    const thaiKey = `outputs/${jobId}/thai.srt`;
    await Promise.all([
      s3.send(new PutObjectCommand({
        Bucket: bucket, Key: originalKey, Body: originalSrt,
        ContentType: 'application/x-subrip; charset=utf-8'
      })),
      s3.send(new PutObjectCommand({
        Bucket: bucket, Key: thaiKey, Body: thaiSrt,
        ContentType: 'application/x-subrip; charset=utf-8'
      }))
    ]);

    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, sourceLanguageDetected = :language, originalSrtKey = :original, thaiSrtKey = :thai, updatedAt = :now REMOVE completionLeaseUntil',
      ConditionExpression: '#status = :processing',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':processing': 'COMPLETING',
        ':language': sourceLanguage,
        ':original': originalKey,
        ':thai': thaiKey,
        ':now': new Date().toISOString()
      }
    }));
  } catch (error) {
    console.error('Transcribe completion processing failed; allowing EventBridge retry', { jobId, error });
    try {
      await ddb.send(new UpdateCommand({
        TableName: table,
        Key: { jobId },
        UpdateExpression: 'SET #status = :transcribing, updatedAt = :now REMOVE completionLeaseUntil',
        ConditionExpression: '#status = :processing',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':transcribing': 'TRANSCRIBING',
          ':processing': 'COMPLETING',
          ':now': new Date().toISOString()
        }
      }));
    } catch (releaseError) {
      console.error('Unable to release completion lease; it will expire automatically', { jobId, releaseError });
    }
    throw error;
  }
};

async function readSubtitle(uri) {
  if (!uri) throw new Error('Amazon Transcribe did not return an SRT subtitle URI.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to download Transcribe SRT: HTTP ${response.status}`);
  return response.text();
}
