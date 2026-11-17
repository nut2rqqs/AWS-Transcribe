function parseTimestamp(value) {
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  if (Number(minutes) > 59 || Number(seconds) > 59) return null;
  return (((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000) + Number(milliseconds);
}

export function parseSrt(srt) {
  const source = String(srt ?? '').replace(/^\uFEFF/, '').trim();
  if (!source) return [];

  const blocks = source.split(/\r?\n\s*\r?\n/).filter(block => block.trim());
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/);
    const timeIndex = lines.findIndex(line => line.includes('-->'));
    if (timeIndex < 0) {
      throw new Error(`Invalid SRT block ${index + 1}: missing timestamp line.`);
    }

    const timing = lines[timeIndex].trim();
    const match = timing.match(/^(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})(.*)$/);
    if (!match) {
      throw new Error(`Invalid SRT block ${index + 1}: malformed timestamp line.`);
    }

    const startMs = parseTimestamp(match[1]);
    const endMs = parseTimestamp(match[2]);
    if (startMs === null || endMs === null || endMs < startMs) {
      throw new Error(`Invalid SRT block ${index + 1}: invalid or reversed timestamps.`);
    }

    return {
      start: match[1],
      end: match[2],
      settings: match[3] || '',
      text: lines.slice(timeIndex + 1).join('\n').trim()
    };
  });
}

export function formatSrt(cues) {
  return cues.map((cue, index) =>
    `${index + 1}\n${cue.start} --> ${cue.end}${cue.settings || ''}\n${cue.text || '[ฟังไม่ชัด]'}`
  ).join('\n\n') + (cues.length ? '\n' : '');
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
