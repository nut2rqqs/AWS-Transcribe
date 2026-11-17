import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { translateSrt } from './subtitles.mjs';

const client = new TranslateClient({ region:process.env.AWS_REGION });
const translateLanguageCodes = { 'ja-JP':'ja', 'zh-CN':'zh', 'en-US':'en', 'ko-KR':'ko', 'th-TH':'th', ja:'ja', zh:'zh', en:'en', ko:'ko', th:'th' };

export async function translateSubtitleFile(srt, sourceLanguage = 'auto') {
  return translateSrt(srt, async (text) => {
    const result = await client.send(new TranslateTextCommand({
      Text:text,
      SourceLanguageCode:sourceLanguage === 'auto' ? 'auto' : (translateLanguageCodes[sourceLanguage] || sourceLanguage),
      TargetLanguageCode:'th'
    }));
    return result.TranslatedText || text;
  });
}
