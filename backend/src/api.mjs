import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { TranscribeClient, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { parseSrt, formatSrt } from './subtitles.mjs';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const sqs = new SQSClient({ region });
const transcribe = new TranscribeClient({ region });
const translate = new TranslateClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;
const queueUrl = process.env.JOBS_QUEUE_URL;
const allowed = new Set(['audio/mpeg','audio/mp4','video/mp4','audio/wav','audio/x-wav','audio/flac','audio/ogg','video/webm','audio/webm']);
const sourceLanguages = new Set(['auto','ja','zh','en','ko','th']);
const languageCodes = { ja:'ja', zh:'zh', en:'en', ko:'ko', th:'th', 'ja-JP':'ja', 'zh-CN':'zh', 'en-US':'en', 'ko-KR':'ko', 'th-TH':'th' };

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type':'application/json', 'access-control-allow-origin': process.env.ALLOWED_ORIGIN || '*', 'access-control-allow-headers':'content-type,authorization', 'access-control-allow-methods':'GET,POST,OPTIONS' },
  body: JSON.stringify(body)
});

async function bodyText(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function makeDownloadUrl(key) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket:bucket, Key:key }), { expiresIn:900 });
}

async function refreshJob(job) {
  if (!job.transcribeJobName || !['TRANSCRIBING','PROCESSING'].includes(job.status)) return job;
  const result = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName:job.transcribeJobName }));
  const transcription = result.TranscriptionJob;
  if (transcription?.TranscriptionJobStatus === 'FAILED') {
    await ddb.send(new UpdateCommand({
      TableName:table, Key:{jobId:job.jobId},
      UpdateExpression:'SET #status = :failed, errorMessage = :message, updatedAt = :now',
      ExpressionAttributeNames:{'#status':'status'},
      ExpressionAttributeValues:{':failed':'FAILED',':message':transcription.FailureReason || 'Amazon Transcribe could not process this file.',':now':new Date().toISOString()}
    }));
    return { ...job, status:'FAILED', errorMessage:transcription.FailureReason || 'Amazon Transcribe could not process this file.' };
  }
  if (transcription?.TranscriptionJobStatus !== 'COMPLETED' || job.status === 'PROCESSING') return job;

  try {
    await ddb.send(new UpdateCommand({
      TableName:table, Key:{jobId:job.jobId},
      UpdateExpression:'SET #status = :processing, updatedAt = :now',
      ConditionExpression:'#status = :transcribing',
      ExpressionAttributeNames:{'#status':'status'},
      ExpressionAttributeValues:{':processing':'PROCESSING',':transcribing':'TRANSCRIBING',':now':new Date().toISOString()}
    }));
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      const latest = await ddb.send(new GetCommand({ TableName:table, Key:{jobId:job.jobId} }));
      return latest.Item || job;
    }
    throw error;
  }

  try {
    const originalKey = `transcripts/${job.jobId}/original.srt`;
    const originalObject = await s3.send(new GetObjectCommand({ Bucket:bucket, Key:originalKey }));
    const originalSrt = await bodyText(originalObject.Body);
    const update = {
      originalSrtKey:originalKey,
      detectedLanguage:transcription.LanguageCode || transcription.IdentifyLanguage || job.sourceLanguage
    };
    if (job.translateToThai) {
      const cues = parseSrt(originalSrt);
      const translated = [];
      for (const cue of cues) {
        let translatedText = cue.text;
        if (cue.text) {
          const result = await translate.send(new TranslateTextCommand({
            Text:cue.text,
            SourceLanguageCode:languageCodes[transcription.LanguageCode] || languageCodes[job.sourceLanguage] || 'auto',
            TargetLanguageCode:'th'
          }));
          translatedText = result.TranslatedText || cue.text;
        }
        translated.push({ ...cue, text:translatedText });
      }
      const thaiKey = `transcripts/${job.jobId}/thai.srt`;
      await s3.send(new PutObjectCommand({ Bucket:bucket, Key:thaiKey, Body:formatSrt(translated), ContentType:'text/plain; charset=utf-8' }));
      update.thaiSrtKey = thaiKey;
    }
    await ddb.send(new UpdateCommand({
      TableName:table, Key:{jobId:job.jobId},
      UpdateExpression:'SET #status = :done, originalSrtKey = :original, updatedAt = :now' + (update.thaiSrtKey ? ', thaiSrtKey = :thai' : ''),
      ExpressionAttributeNames:{'#status':'status'},
      ExpressionAttributeValues:{':done':'COMPLETED',':original':originalKey,':now':new Date().toISOString(),...(update.thaiSrtKey ? {':thai':update.thaiSrtKey} : {})}
    }));
    return { ...job, ...update, status:'COMPLETED' };
  } catch (error) {
    console.error('Unable to finalize transcription', {jobId:job.jobId,error});
    await ddb.send(new UpdateCommand({
      TableName:table, Key:{jobId:job.jobId},
      UpdateExpression:'SET #status = :failed, errorMessage = :message, updatedAt = :now',
      ExpressionAttributeNames:{'#status':'status'},
      ExpressionAttributeValues:{':failed':'FAILED',':message':'Transcription finished but subtitle preparation failed. Check S3 output and Translate permissions.',':now':new Date().toISOString()}
    }));
    return { ...job, status:'FAILED', errorMessage:'Transcription finished but subtitle preparation failed. Check S3 output and Translate permissions.' };
  }
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return response(204, {});
  try {
    const method = event.requestContext?.http?.method || event.httpMethod;
    const path = event.rawPath || event.path || '';
    const body = event.body ? JSON.parse(event.body) : {};

    if (method === 'POST' && path.endsWith('/uploads')) {
      const { fileName, contentType, size } = body;
      if (!fileName || !contentType || !allowed.has(contentType) || !Number.isFinite(size) || size <= 0 || size > 2 * 1024 * 1024 * 1024) {
        return response(400, { error: 'Invalid file metadata. Supported files: MP3, MP4, WAV, FLAC, OGG; maximum 2 GB.' });
      }
      const jobId = randomUUID();
      const safeName = String(fileName).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0,160);
      const key = `incoming/${jobId}/${safeName}`;
      const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket:bucket, Key:key, ContentType:contentType }), { expiresIn:900 });
      return response(200, { jobId, key, uploadUrl, expiresIn:900 });
    }

    if (method === 'POST' && path.endsWith('/jobs')) {
      const { jobId, key, fileName, sourceLanguage = 'auto', translateToThai = true } = body;
      if (!jobId || !key || !fileName || !sourceLanguages.has(sourceLanguage) || !key.startsWith(`incoming/${jobId}/`)) return response(400, { error:'Invalid uploaded file reference.' });
      const now = new Date().toISOString();
      const item = { jobId, key, fileName, sourceLanguage, translateToThai:Boolean(translateToThai), status:'QUEUED', createdAt:now, updatedAt:now };
      await ddb.send(new PutCommand({ TableName:table, Item:item, ConditionExpression:'attribute_not_exists(jobId)' }));
      await sqs.send(new SendMessageCommand({ QueueUrl:queueUrl, MessageBody:JSON.stringify({ jobId }) }));
      return response(202, item);
    }

    const jobMatch = path.match(/\/jobs\/([a-f0-9-]+)$/i);
    if (method === 'GET' && jobMatch) {
      const result = await ddb.send(new GetCommand({ TableName:table, Key:{jobId:jobMatch[1]} }));
      if (!result.Item) return response(404,{error:'Job not found'});
      const job = await refreshJob(result.Item);
      const output = { ...job };
      if (job.status === 'COMPLETED') {
        if (job.originalSrtKey) output.originalDownloadUrl = await makeDownloadUrl(job.originalSrtKey);
        if (job.thaiSrtKey) output.thaiDownloadUrl = await makeDownloadUrl(job.thaiSrtKey);
      }
      return response(200,output);
    }
    return response(404,{error:'Route not found'});
  } catch (error) {
    console.error('API error', error);
    return response(500,{error:'Internal server error'});
  }
};
