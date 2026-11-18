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

## Planned AWS architecture

- Static web hosting: Amazon S3 + CloudFront.
- API: Amazon API Gateway + AWS Lambda.
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
npm run dev
```

The current first milestone is the responsive web foundation and documented AWS deployment contract. AWS resources are not created by this repository commit; deploy only after reviewing the account, region, IAM permissions, and estimated costs.

## Important content-handling requirement

The app must not implement its own adult-content censor, profanity replacement, or blanket rejection of lawful 18+ dialogue. Translation providers may have their own service terms and limitations; test real, lawful adult-dialogue samples before claiming full compatibility. Never use this service to process illegal sexual content or sexual content involving minors.


## Cognito authentication and deployment configuration

The API is protected by an Amazon Cognito JWT authorizer. Public self-registration is disabled; create user accounts from the Cognito console as an administrator.

After reviewing the AWS resources and estimated charges, deploy the backend from the `backend/` directory with AWS SAM. The stack outputs include:

- `ApiBaseUrl`
- `CognitoUserPoolId`
- `CognitoUserPoolClientId`
- `UploadBucketName`

Build the web app with these environment variables set to the matching stack outputs:

- `VITE_API_BASE_URL` = `ApiBaseUrl`
- `VITE_COGNITO_USER_POOL_ID` = `CognitoUserPoolId`
- `VITE_COGNITO_CLIENT_ID` = `CognitoUserPoolClientId`

Create an administrator-managed user in the Cognito user pool and deliver the temporary password securely. On first sign-in, the app prompts the user to set a new password. Never put AWS access keys or secret keys in Vite environment variables or browser code.

Set the SAM parameter `AllowedOrigin` to the exact HTTPS origin of the deployed website before production. Do not leave it as `*` for production. The Cognito pool and app client are billable/subject to AWS pricing and account quotas; review the account's region and costs before deployment.
