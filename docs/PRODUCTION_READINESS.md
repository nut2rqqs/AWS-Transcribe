# Production Readiness Plan

This checklist distinguishes source-code implementation from behavior verified in a deployed AWS environment. A green CI build is not production approval.

## Implemented in the current PR (source inspection only)

- [x] Cognito sign-up, email confirmation, sign-in, refresh and logout flow in the web client.
- [x] API Gateway JWT authorizer and owner-scoped job reads.
- [x] Private S3 bucket with public-access blocks, encryption and lifecycle retention.
- [x] Short-lived presigned upload and download URLs.
- [x] Multi-file upload UI and queued job processing.
- [x] SQS worker with conditional start lease and deterministic Transcribe job-name recovery.
- [x] EventBridge completion handler with conditional completion lease and retry behavior.
- [x] Original SRT and Thai SRT exports, plus browser-side ZIP packaging.
- [x] Context-batched subtitle translation with cue-marker validation and per-cue fallback.
- [x] SQS dead-letter queue, API throttling and basic upload metadata/size validation.
- [x] CI checks for web build, backend syntax/unit tests, SAM validation and SAM build.
- [x] No application-level profanity masking or blanket filtering of lawful adult dialogue.

These are code-presence checks, not proof that AWS runtime behavior works.

## Remaining release gates

### 1. Identity, privacy and security
- [ ] Deploy Cognito and verify sign-up, email confirmation, sign-in, refresh and logout with real tokens.
- [ ] Verify cross-user job access is denied for every API route.
- [ ] Verify upload URLs cannot be used to overwrite or attach another user's objects.
- [ ] Verify actual uploaded media format and content type, not only browser-supplied metadata.
- [ ] Review IAM policies for least privilege.
- [ ] Define user-facing privacy, retention, deletion and incident-response behavior.

### 2. Upload and job lifecycle
- [ ] Add automated integration tests for queue enqueue failure and polling-based recovery.
- [ ] Test concurrent pollers and verify the cooldown prevents duplicate SQS floods.
- [ ] Test worker lease contention, lease expiry and duplicate SQS delivery.
- [ ] Test Transcribe ConflictException recovery against a real or faithful AWS test double.
- [ ] Test SQS retry exhaustion and DLQ behavior.
- [ ] Add cancellation and safe deletion of uploaded media and outputs.
- [ ] Verify job history restoration after refresh and on a second device; current history behavior must be confirmed in the deployed app.

### 3. Transcription and subtitle quality
- [ ] Verify Auto Detect and every advertised language in the selected AWS Region.
- [ ] Verify MP3 and MP4 media processing, including MP4 files with supported audio tracks.
- [ ] Verify Transcribe returns usable SRT subtitle URIs for each supported language path.
- [ ] Verify Thai translation quality on representative short and long recordings.
- [ ] Verify cue order, timestamps, multiline text and formatting remain intact.
- [ ] Verify unclear speech is marked rather than hallucinated.
- [ ] Verify lawful adult dialogue is not altered by application-level filtering; provider terms and applicable law still apply.

### 4. Web experience
- [ ] Test multi-file upload and sequential processing on Android Chrome and Firefox.
- [ ] Verify upload progress, processing state and clear error recovery.
- [ ] Verify expired download URLs are refreshed automatically or on user action.
- [ ] Verify Original SRT, Thai SRT and ZIP filenames and ZIP extraction on Android.
- [ ] Verify responsive layout, accessibility and empty/loading/error states.

### 5. AWS operations and cost controls
- [ ] Confirm AWS account, selected Region, service quotas and supported Transcribe language identification.
- [ ] Confirm exact website origin; do not deploy with wildcard CORS.
- [ ] Add AWS Budgets alerts and verify cost guardrails before accepting real uploads.
- [ ] Review CloudWatch logs, metrics, alarms and DLQ monitoring.
- [ ] Verify S3 lifecycle retention and cleanup of orphaned media and Transcribe jobs.
- [ ] Estimate per-minute Transcribe and Translate costs and test file-size/job limits.

### 6. Verification and release
- [x] Web production build passes on the current PR head.
- [x] Backend syntax checks and unit tests pass on the current PR head.
- [x] SAM validate --lint passes on the current PR head.
- [x] SAM build passes on the current PR head.
- [ ] Clean CI passes on the next PR head after any further changes.
- [ ] Deploy to a controlled AWS test environment.
- [ ] Complete real MP3 and MP4 end-to-end tests through Cognito, S3, SQS, Transcribe, EventBridge, Translate and signed downloads.
- [ ] Verify original and Thai SRT content and timestamps.
- [ ] Verify ZIP download and extraction on Android.
- [ ] Verify duplicate events, failed translation, expired URLs, queue retries and DLQ behavior.
- [ ] Verify actual AWS costs and retention behavior.
- [ ] Only then mark the PR ready and approve production deployment.

## Current release status

The current PR has passing source-level CI, but no AWS infrastructure has been deployed by these code changes. Real Cognito authentication, AWS service integration, media processing, subtitle delivery and cost behavior remain unverified. Keep this PR in Draft until all release gates above are complete.
