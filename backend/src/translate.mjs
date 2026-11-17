import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { translateSrt } from './subtitles.mjs';

const client = new TranslateClient({ region:process.env.AWS_REGION });
const translateLanguageCodes = {
  'ja-JP':'ja', 'zh-CN':'zh', 'zh-TW':'zh-TW',
  'en-US':'en', 'en-GB':'en', 'ko-KR':'ko', 'th-TH':'th',
  ja:'ja', zh:'zh', en:'en', ko:'ko', th:'th'
};

// Transcribe returns locale-qualified codes (for example, es-US and fr-FR),
// while Translate expects its own language-code set. Keep explicit variants
// where Translate distinguishes them, otherwise fall back to the base code.
export function normalizeTranslateLanguageCode(sourceLanguage = 'auto') {
  if (!sourceLanguage || sourceLanguage === 'auto') return 'auto';
  return translateLanguageCodes[sourceLanguage] || sourceLanguage.split('-')[0];
}

export async function translateSubtitleFile(srt, sourceLanguage = 'auto') {
  const normalizedSource = normalizeTranslateLanguageCode(sourceLanguage);
  return translateSrt(srt, async (text) => {
    const result = await client.send(new TranslateTextCommand({
      Text:text,
      SourceLanguageCode:normalizedSource,
      TargetLanguageCode:'th'
    }));
    return result.TranslatedText || text;
  });
}
