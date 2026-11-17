import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTranslateLanguageCode } from '../src/translate.mjs';

test('normalizes common Transcribe locale codes to Translate language codes', () => {
  assert.equal(normalizeTranslateLanguageCode('ja-JP'), 'ja');
  assert.equal(normalizeTranslateLanguageCode('zh-CN'), 'zh');
  assert.equal(normalizeTranslateLanguageCode('en-US'), 'en');
  assert.equal(normalizeTranslateLanguageCode('ko-KR'), 'ko');
  assert.equal(normalizeTranslateLanguageCode('th-TH'), 'th');
});

test('preserves Translate-specific Traditional Chinese language code', () => {
  assert.equal(normalizeTranslateLanguageCode('zh-TW'), 'zh-TW');
});

test('normalizes additional Transcribe locales instead of passing unsupported region suffixes', () => {
  assert.equal(normalizeTranslateLanguageCode('es-US'), 'es');
  assert.equal(normalizeTranslateLanguageCode('fr-FR'), 'fr');
  assert.equal(normalizeTranslateLanguageCode('de-DE'), 'de');
  assert.equal(normalizeTranslateLanguageCode('pt-BR'), 'pt');
});

test('keeps auto detection as auto and handles missing source language', () => {
  assert.equal(normalizeTranslateLanguageCode('auto'), 'auto');
  assert.equal(normalizeTranslateLanguageCode(undefined), 'auto');
});
