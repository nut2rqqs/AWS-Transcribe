# AWS backend

This folder contains the first deployable SAM backend foundation.

## Current API

- `POST /uploads`: validates file metadata and returns a short-lived S3 presigned PUT URL.
- Browser uploads directly to the private S3 bucket.
- `POST /jobs`: creates a DynamoDB job and enqueues it in SQS.
- `GET /jobs/{jobId}`: returns the job state.

The SQS worker starts an Amazon Transcribe batch job and requests an original-language SRT output.

## Important current limitation

This is not yet an end-to-end finished service. A completion poller/state machine is still required to observe Transcribe completion, retrieve the transcript, translate subtitle segments into Thai, and expose downloadable output files. The web UI is not yet connected to these endpoints. Do not deploy this stack until the SAM template has been validated and the AWS account, Region, cost limits, and IAM permissions have been reviewed.

## Deploy

From this directory, after installing AWS SAM CLI and configuring the intended AWS account:

```bash
npm install
sam validate --lint
sam build
sam deploy --guided
```

Keep the S3 bucket private. Set `AllowedOrigin` to the exact CloudFront website origin before production; do not leave wildcard CORS in production.
