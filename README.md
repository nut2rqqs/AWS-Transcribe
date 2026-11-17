# AWS Transcribe Web

A mobile-first web application for uploading audio/video files, processing them in a queue, transcribing with Amazon Transcribe, and exporting timestamped subtitles.

## Product requirements

- Web app (not a native Android app); responsive on Android browsers and desktop.
- Upload MP3 and MP4 files, including multiple files in one selection.
- Process files one at a time through a queue and show each job's status.
- Generate original-language transcript and SRT subtitles.
- Translate subtitles to Thai while preserving meaning, register, profanity, and lawful adult dialogue. Do not add profanity masking, euphemization, or adult-content filtering in the application.
- Keep unclear audio marked as uncertain rather than inventing dialogue.
- Download original transcript, original SRT, Thai SRT, and a ZIP package.
- Keep AWS credentials on the server; never expose credentials in browser code.
- Cognito sign-up, email confirmation, sign-in, token refresh, and owner-scoped job access.

## Current implementation

The web workspace now includes a Cognito account screen and sends the Cognito ID token as a Bearer token to the protected API. The browser calls Cognito directly for sign-up, confirmation, sign-in, and refresh; AWS service credentials remain server-side.

Set these Vite environment variables for a deployed/test environment:

- `VITE_API_BASE_URL`: API Gateway HTTP API base URL.
- `VITE_COGNITO_REGION`: AWS Region containing the user pool.
- `VITE_COGNITO_USER_POOL_ID`: Cognito User Pool ID.
- `VITE_COGNITO_CLIENT_ID`: public app-client ID (no client secret).

See `.env.example` for the local variable names. Do not commit real environment values or AWS credentials. The web app cannot complete sign-up/login until Cognito has been deployed and these public configuration values are supplied.

## Planned AWS architecture

- Static web hosting: Amazon S3 + CloudFront.
- API: Amazon API Gateway + AWS Lambda.
- Authentication: Amazon Cognito User Pool + API Gateway JWT authorizer.
- Upload and output storage: private Amazon S3 buckets with short-lived presigned URLs.
- Queue: Amazon SQS (one worker at a time initially).
- Speech recognition: Amazon Transcribe (batch jobs).
- Thai translation: Amazon Translate, with an adapter boundary so a different translation provider can be added if quality or content handling requires it.
- Job metadata: DynamoDB.
- Secrets/configuration: AWS Systems Manager Parameter Store or Secrets Manager.

GitHub is for source control, development, and CI only. The production application is intended to run on AWS without depending on GitHub Actions.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

The current milestone is source implementation and CI validation. AWS resources have not been deployed by these source changes. Do not deploy until account, Region, IAM permissions, CORS origin, service quotas, budget alerts, and end-to-end behavior have been reviewed.

## Important content-handling requirement

The app must not implement its own adult-content censor, profanity replacement, or blanket rejection of lawful 18+ dialogue. Translation providers may have their own service terms and limitations; test real, lawful adult-dialogue samples before claiming full compatibility. Never use this service to process illegal sexual content or sexual content involving minors.
