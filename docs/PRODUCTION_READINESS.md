# Production Readiness Plan

This checklist is the release gate for AWS Transcribe Studio. A green frontend build alone is not a production approval.

## Release gates

### 1. Identity, privacy and security
- [ ] Add an authentication and authorization layer before any public deployment.
- [ ] Ensure every job read, download and mutation is scoped to its owner.
- [ ] Keep S3 objects private; use short-lived presigned URLs only.
- [ ] Validate upload object ownership, content type, file size and actual media format.
- [ ] Add API throttling, request validation and abuse protection.
- [ ] Review IAM policies for least privilege.
- [ ] Define privacy, retention, deletion and incident-response behavior.

### 2. Upload and job lifecycle
- [ ] Support multi-file selection and a durable server-side job history.
- [ ] Verify uploaded objects before enqueueing work.
- [ ] Make job creation and queue publication recoverable if either step fails.
- [ ] Make worker and completion handling idempotent.
- [ ] Define retry limits, visibility timeout, dead-letter handling and manual retry.
- [ ] Add cancellation and safe deletion of uploaded media and outputs.
- [ ] Persist progress and clear user-facing error states.

### 3. Transcription and subtitle quality
- [ ] Verify every selected language and Auto Detect in the deployment Region.
- [ ] Verify MP3 and MP4 media extraction, including video containers with supported audio tracks.
- [ ] Verify SRT output exists for all supported language paths.
- [ ] Preserve cue order, timestamps, multiline text and formatting.
- [ ] Never silently discard malformed or unparsed subtitle cues.
- [ ] Translate with context-aware batching where practical; preserve timestamps exactly.
- [ ] Keep unclear speech explicitly marked rather than hallucinating dialogue.
- [ ] Do not add app-level profanity masking, euphemization or blanket filtering of lawful adult dialogue. Provider terms and applicable law still apply.

### 4. Web experience
- [ ] Finish responsive mobile-first upload, queue, settings and result views.
- [ ] Restore job history after refresh and on a second device after authentication is implemented.
- [ ] Show upload and processing progress accurately.
- [ ] Provide original SRT, Thai SRT and ZIP downloads with useful filenames.
- [ ] Handle expired download links by requesting fresh links.
- [ ] Provide accessible controls, keyboard support and clear empty/loading/error states.
- [ ] Test on Android Chrome and Firefox plus desktop browsers.

### 5. AWS operations and cost controls
- [ ] Deploy only after reviewing account ID, Region, quotas and estimated service costs.
- [ ] Use supported Lambda runtime (currently Node.js 24) and validate/build with AWS SAM.
- [ ] Set exact production website origin; do not use wildcard CORS in production.
- [ ] Keep S3 lifecycle retention explicit and documented.
- [ ] Add CloudWatch structured logs, metrics, alarms and DLQ monitoring.
- [ ] Add budget alerts and per-job/file-size guardrails.
- [ ] Test cleanup and recovery paths; verify no orphaned media or Transcribe jobs remain.

### 6. Verification and release
- [ ] Web production build passes.
- [ ] Backend syntax checks and unit tests pass.
- [ ] SAM validate --lint passes.
- [ ] SAM build passes.
- [ ] Integration test passes in the selected AWS Region.
- [ ] Real MP3 and MP4 test files complete end-to-end.
- [ ] Original and Thai SRT timestamps and text are verified.
- [ ] ZIP downloads and opens correctly on Android.
- [ ] Duplicate events, failed translation, expired URLs and queue retries are tested.
- [ ] Cost and retention behavior are verified.
- [ ] Only then mark the PR ready and approve production deployment.

## Current known blockers

- API endpoints currently have no user authentication/authorization. API throttling is only a secondary safeguard and does not replace identity controls.
- Browser job history is local to the current browser; cross-device history requires authenticated ownership and server-side listing.
- End-to-end AWS integration tests have not yet been performed.
- Current translation is cue-by-cue; context-aware translation and language-quality evaluation remain to be implemented.
- No production infrastructure has been deployed by the code changes in this PR.
