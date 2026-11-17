import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, formatSrt, translateSrt } from '../src/subtitles.mjs';

test('parses and formats SRT while preserving timestamps', () => {
  const input = '1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld';
  const cues = parseSrt(input);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, '00:00:01,000');
  assert.match(formatSrt(cues), /00:00:03,000 --> 00:00:04,000/);
});

test('passes adult/profane source text unchanged to the translation provider', async () => {
  const source = '1\n00:00:01,000 --> 00:00:02,500\nExplicit adult dialogue and profanity';
  let received = '';
  const output = await translateSrt(source, async text => { received = text; return 'คำแปลภาษาไทย'; });
  assert.equal(received, 'Explicit adult dialogue and profanity');
  assert.match(output, /คำแปลภาษาไทย/);
  assert.match(output, /00:00:01,000 --> 00:00:02,500/);
});

test('keeps uncertain speech explicit instead of inventing dialogue', async () => {
  const output = await translateSrt('1\n00:00:00,000 --> 00:00:01,000\n[unintelligible]', async () => '[ฟังไม่ชัด]');
  assert.match(output, /\[ฟังไม่ชัด\]/);
});
