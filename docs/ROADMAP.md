# Implementation roadmap

## Milestone 1 — Web foundation
- [x] Mobile-first upload and queue workspace shell
- [x] Language selection and Thai translation toggle in the UI
- [x] Document privacy, deployment direction, and lawful 18+ dialogue requirement
- [x] CI build workflow
- [ ] Connect UI to a real API (current upload list is local UI state only)

## Milestone 2 — AWS processing
- [ ] Private S3 input/output buckets and presigned upload
- [ ] API Gateway + Lambda job API
- [ ] DynamoDB job records
- [ ] SQS queue and single-concurrency worker
- [ ] Amazon Transcribe batch job integration
- [ ] Poll/complete transcription and persist output

## Milestone 3 — Subtitles and translation
- [ ] Convert Transcribe word/segment timestamps to valid SRT
- [ ] Translate subtitle segments to Thai
- [ ] Preserve profanity, explicit vocabulary, speaker intent, and register for lawful adult dialogue
- [ ] Keep original transcript/SRT alongside Thai SRT
- [ ] Test Japanese, Chinese, English, and Thai source audio
- [ ] Run explicit lawful adult-dialogue QA samples and compare translation fidelity
- [ ] Mark unintelligible speech rather than hallucinating words

## Milestone 4 — Production
- [ ] Job history, retry, cancellation, cleanup, and download bundles
- [ ] CloudFront + S3 static hosting
- [ ] Monitoring, usage limits, retention policy, and cost alerts
- [ ] Deploy to AWS; GitHub remains source control/CI only

## Acceptance criteria for 18+ translation
1. No app-side profanity masking, asterisk replacement, euphemism, or blanket adult-dialogue rejection.
2. Translate lawful adult dialogue faithfully without toning down the meaning.
3. Preserve timestamps and speaker labels where available.
4. Test with user-authorized, lawful sample audio before claiming compatibility.
5. Respect AWS Translate and any alternate provider's current terms; if a provider blocks a category, disclose it and offer a compliant alternative rather than silently censoring.
6. Never process sexual content involving minors or other illegal material.
