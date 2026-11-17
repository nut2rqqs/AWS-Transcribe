import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TranscribeClient, StartTranscriptionJobCommand } from '@aws-sdk/client-transcribe';

const region = process.env.AWS_REGION;
const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const transcribe = new TranscribeClient({ region });
const table = process.env.JOBS_TABLE;
const bucket = process.env.UPLOAD_BUCKET;

export const handler = async (event) => {
  for (const record of event.Records || []) {
    const { jobId } = JSON.parse(record.body);
    const result = await ddb.send(new (await import('@aws-sdk/lib-dynamodb')).GetCommand({ TableName:table, Key:{jobId} }));
    const job = result.Item;
    if (!job) continue;
    try {
      await s3.send(new HeadObjectCommand({ Bucket:bucket, Key:job.key }));
      const mediaUri = `s3://${bucket}/${job.key}`;
      const transcribeJobName = `aws-ts-${jobId}`.slice(0,200);
      await transcribe.send(new StartTranscriptionJobCommand({
        TranscriptionJobName:transcribeJobName,
        Media:{ MediaFileUri:mediaUri },
        IdentifyLanguage: job.sourceLanguage === 'auto',
        ...(job.sourceLanguage !== 'auto' ? { LanguageCode:job.sourceLanguage } : {}),
        OutputBucketName:bucket,
        OutputKey:`transcripts/${jobId}/original.json`,
        Subtitles:{ Formats:['srt'], OutputStartIndex:1 }
      }));
      await ddb.send(new UpdateCommand({
        TableName:table, Key:{jobId},
        UpdateExpression:'SET #status = :status, transcribeJobName = :name, updatedAt = :now',
        ExpressionAttributeNames:{'#status':'status'},
        ExpressionAttributeValues:{':status':'TRANSCRIBING',':name':transcribeJobName,':now':new Date().toISOString()}
      }));
    } catch (error) {
      console.error('Transcribe start failed', {jobId,error});
      await ddb.send(new UpdateCommand({
        TableName:table, Key:{jobId},
        UpdateExpression:'SET #status = :status, errorMessage = :message, updatedAt = :now',
        ExpressionAttributeNames:{'#status':'status'},
        ExpressionAttributeValues:{':status':'FAILED',':message':'Unable to start transcription. Check file format, region support, and IAM permissions.',':now':new Date().toISOString()}
      }));
      throw error;
    }
  }
};
