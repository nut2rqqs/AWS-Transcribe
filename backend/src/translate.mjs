import { TranslateClient, TranslateTextCommand } from '@aws-sdk/client-translate';
import { translateSrt } from './subtitles.mjs';

const client = new TranslateClient({ region:process.env.AWS_REGION });

export async function translateSubtitleFile(srt, sourceLanguage = 'auto') {
  return translateSrt(srt, async (text) => {
    const result = await client.send(new TranslateTextCommand({
      Text:text,
      SourceLanguageCode:sourceLanguage === 'auto' ? 'auto' : sourceLanguage,
      TargetLanguageCode:'th'
    }));
    return result.TranslatedText || text;
  });
}
