import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { getAuthenticatedUserId } from './auth.mjs';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const sqs = new SQSClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;
const queueUrl = process.env.JOBS_QUEUE_URL;
const allowed = new Set(['audio/mpeg','audio/mp4','video/mp4','audio/wav','audio/x-wav','audio/flac','audio/ogg','video/webm','audio/webm']);
const sourceLanguages = new Set(['auto','ja','zh','en','ko','th']);

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type':'application/json', 'access-control-allow-origin': process.env.ALLOWED_ORIGIN || '*', 'access-control-allow-headers':'content-type,authorization', 'access-control-allow-methods':'GET,POST,OPTIONS' },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  if (event.requestContext?.http?.method === 'OPTIONS') return response(204, {});
  const ownerId = getAuthenticatedUserId(event);
  if (!ownerId) return response(401, { error:'Authentication required.' });

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
      const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 900 });
      return response(200, { jobId, key, uploadUrl, expiresIn: 900 });
    }

    if (method === 'POST' && path.endsWith('/jobs')) {
      const { jobId, key, fileName, sourceLanguage = 'auto', translateToThai = true } = body;
      if (!jobId || !key || !fileName || !sourceLanguages.has(sourceLanguage) || !key.startsWith(`incoming/${jobId}/`)) return response(400, { error: 'Invalid uploaded file reference.' });
      const now = new Date().toISOString();
      const item = { jobId, ownerId, key, fileName, sourceLanguage, translateToThai: Boolean(translateToThai), status:'QUEUED', createdAt:now, updatedAt:now };
      await ddb.send(new PutCommand({ TableName: table, Item:item, ConditionExpression:'attribute_not_exists(jobId)' }));
      await sqs.send(new SendMessageCommand({ QueueUrl:queueUrl, MessageBody:JSON.stringify({ jobId }) }));
      return response(202, item);
    }

    const jobMatch = path.match(/\/jobs\/([a-f0-9-]+)$/i);
    if (method === 'GET' && jobMatch) {
      const result = await ddb.send(new GetCommand({ TableName:table, Key:{ jobId:jobMatch[1] } }));
      if (!result.Item || result.Item.ownerId !== ownerId) return response(404,{error:'Job not found'});
      const item = result.Item;
      const downloads = {};
      if (item.originalSrtKey) downloads.original = await getSignedUrl(s3, new GetObjectCommand({ Bucket:bucket, Key:item.originalSrtKey }), { expiresIn:900 });
      if (item.thaiSrtKey) downloads.thai = await getSignedUrl(s3, new GetObjectCommand({ Bucket:bucket, Key:item.thaiSrtKey }), { expiresIn:900 });
      return response(200,{...item,downloads});
    }
    return response(404,{error:'Route not found'});
  } catch (error) {
    console.error('API error', error);
    return response(500,{error:'Internal server error'});
  }
};
