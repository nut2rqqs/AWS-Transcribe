import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TranscribeClient, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { translateSubtitleFile } from './translate.mjs';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const transcribe = new TranscribeClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;

async function readSubtitle(uri) {
  if (!uri) throw new Error('Amazon Transcribe did not return an SRT subtitle URI.');
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Unable to download Transcribe SRT: HTTP ${response.status}`);
  return response.text();
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
  const result = await ddb.send(new GetCommand({ TableName: table, Key: { jobId } }));
  const job = result.Item;
  if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return;

  if (transcribeStatus === 'FAILED') {
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, errorMessage = :message, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'FAILED',
        ':message': detail.FailureReason || 'Amazon Transcribe could not process this file.',
        ':now': new Date().toISOString()
      }
    }));
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
    const thaiSrt = !job.translateToThai || sourceLanguage === 'th'
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
      UpdateExpression: 'SET #status = :status, sourceLanguageDetected = :language, originalSrtKey = :original, thaiSrtKey = :thai, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':language': sourceLanguage,
        ':original': originalKey,
        ':thai': thaiKey,
        ':now': new Date().toISOString()
      }
    }));
  } catch (error) {
    console.error('Transcribe completion processing failed', { jobId, error });
    await ddb.send(new UpdateCommand({
      TableName: table,
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, errorMessage = :message, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'FAILED',
        ':message': 'Transcription finished, but subtitle export or Thai translation failed. Please retry this job.',
        ':now': new Date().toISOString()
      }
    }));
    throw error;
  }
};
