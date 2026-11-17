import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSrt, formatSrt, translateSrt, translateCueTexts } from '../src/subtitles.mjs';

test('parses and formats multiple SRT cues while preserving timestamps', () => {
  const input = '1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld';
  const cues = parseSrt(input);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].start, '00:00:01,000');
  assert.match(formatSrt(cues), /00:00:03,000 --> 00:00:04,000/);
});

test('supports BOM, Windows line endings, multiline cues and timing settings', () => {
  const input = '\uFEFF1\r\n00:00:01,000 --> 00:00:02,500 align:start\r\nFirst line\r\nSecond line';
  const [cue] = parseSrt(input);
  assert.equal(cue.text, 'First line\nSecond line');
  assert.equal(cue.settings, ' align:start');
  assert.match(formatSrt([cue]), /align:start\nFirst line\nSecond line/);
});

test('returns an empty list for an empty subtitle file', () => {
  assert.deepEqual(parseSrt('\uFEFF  \r\n'), []);
  assert.equal(formatSrt([]), '');
});

test('rejects malformed blocks instead of silently dropping subtitle dialogue', () => {
  assert.throws(() => parseSrt('1\nThis block has no timestamp'), /missing timestamp/);
  assert.throws(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\nReversed'), /invalid or reversed timestamps/);
  assert.throws(() => parseSrt('1\n00:99:01,000 --> 00:99:02,000\nInvalid time'), /invalid or reversed timestamps/);
});

test('passes adult/profane source text unchanged to the translation provider', async () => {
  const source = '1\n00:00:01,000 --> 00:00:02,500\nExplicit adult dialogue and profanity';
  let received = '';
  const output = await translateSrt(source, async text => { received = text; return 'คำแปลภาษาไทย'; });
  assert.equal(received, 'Explicit adult dialogue and profanity');
  assert.match(output, /คำแปลภาษาไทย/);
  assert.match(output, /00:00:01,000 --> 00:00:02,500/);
});

test('batches adjacent cues for context while preserving cue order and timestamps', async () => {
  const calls = [];
  const output = await translateSrt('1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:01,000 --> 00:00:02,000\nWorld', async text => {
    calls.push(text);
    return text.replace('Hello', 'สวัสดี').replace('World', 'โลก');
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Hello[\s\S]*World/);
  assert.match(output, /1\n00:00:00,000 --> 00:00:01,000\nสวัสดี/);
  assert.match(output, /2\n00:00:01,000 --> 00:00:02,000\nโลก/);
});

test('falls back to individual cues if the translation provider changes alignment markers', async () => {
  const calls = [];
  const result = await translateCueTexts(['First', 'Second'], async text => {
    calls.push(text);
    if (text.includes('⟦CUE')) return 'markers removed';
    return `TH:${text}`;
  });
  assert.deepEqual(result, ['TH:First', 'TH:Second']);
  assert.equal(calls.length, 3);
});

test('keeps uncertain speech explicit instead of inventing dialogue', async () => {
  const output = await translateSrt('1\n00:00:00,000 --> 00:00:01,000\n[unintelligible]', async () => '[ฟังไม่ชัด]');
  assert.match(output, /\[ฟังไม่ชัด\]/);
});
