# AWS backend

The SAM backend now contains the first end-to-end processing path. It is still a development milestone and must pass CI plus a real AWS deployment test before production use.

## API

- `POST /uploads`: validates file metadata and returns a short-lived S3 presigned PUT URL.
- Browser uploads directly to the private S3 bucket.
- `POST /jobs`: creates a DynamoDB job and enqueues it in SQS.
- `GET /jobs/{jobId}`: returns job state and short-lived download URLs when SRT outputs are ready.

## Processing flow

1. SQS invokes the serialized Transcribe worker.
2. The worker starts an Amazon Transcribe batch job and requests SRT subtitles.
3. Amazon Transcribe emits a state-change event to EventBridge.
4. The completion Lambda handles COMPLETED and FAILED events.
5. On success, it retrieves the original SRT, translates each cue to Thai with Amazon Translate when enabled, and stores both SRT files in the private S3 bucket.
6. DynamoDB is updated to COMPLETED with the output object keys. The API then returns temporary download URLs.

The web app polls job state, provides individual Original/Thai SRT links, and can package available subtitle files into a ZIP in the browser.

## Development and validation

From this directory:

```bash
npm install
npm run check
npm test
sam validate --lint
sam build
```

Deploy only after reviewing the AWS account, Region, IAM permissions, service quotas, expected Transcribe/Translate/S3/DynamoDB/SQS costs, and the website origin. Keep the S3 bucket private and set `AllowedOrigin` to the exact CloudFront website origin before production.

## Known limitations before production

- A real AWS integration test is still required for EventBridge delivery, Transcribe subtitle URI behavior, Translate language-code compatibility, and signed downloads.
- Large media files and long subtitle files need load testing and timeout/retry tuning.
- The initial language selector supports auto, Japanese, Chinese, English, Korean, and Thai; automatic detection is limited by Amazon Transcribe language identification support in the selected Region.
- ZIP packaging currently runs in the browser after downloading the SRT objects.
- No AWS infrastructure has been deployed by these source-code changes.

## Content handling

The application does not add profanity masking, euphemization, or a blanket filter for lawful adult dialogue. Amazon Translate and other AWS services remain subject to their own service terms and content handling; verify lawful test samples before claiming provider-level support. Never process illegal sexual content or sexual content involving minors.
