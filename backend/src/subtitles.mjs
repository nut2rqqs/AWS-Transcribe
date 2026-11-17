export function parseSrt(srt) {
  return String(srt).replace(/^\uFEFF/, '').trim().split(/\r?\n\s*\r?\n/).filter(Boolean).map(block => {
    const lines = block.split(/\r?\n/);
    const timeIndex = lines.findIndex(line => line.includes('-->'));
    if (timeIndex < 0) return null;
    const timing = lines[timeIndex].trim();
    const match = timing.match(/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})(.*)$/);
    if (!match) return null;
    return { start:match[1], end:match[2], settings:match[3] || '', text:lines.slice(timeIndex + 1).join('\n').trim() };
  }).filter(Boolean);
}

export function formatSrt(cues) {
  return cues.map((cue,index) => `${index + 1}\n${cue.start} --> ${cue.end}${cue.settings || ''}\n${cue.text || '[ฟังไม่ชัด]'}`).join('\n\n') + '\n';
}

export async function translateSrt(srt, translateText) {
  const cues = parseSrt(srt);
  const translated = [];
  for (const cue of cues) {
    // Pass the complete subtitle text through unchanged. No profanity masking,
    // euphemization, adult-dialogue filtering, or asterisk replacement here.
    const text = cue.text ? await translateText(cue.text) : cue.text;
    translated.push({ ...cue, text: text || '[ฟังไม่ชัด]' });
  }
  return formatSrt(translated);
}
