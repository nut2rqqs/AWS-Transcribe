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

export async function translateCueTexts(texts, translateText, maxBytes = 4500) {
  const output = new Array(texts.length);
  const groups = [];
  let group = [];
  let bytes = 0;

  for (let index = 0; index < texts.length; index += 1) {
    const text = String(texts[index] ?? '');
    if (!text) {
      output[index] = text;
      continue;
    }
    const marker = `⟦CUE${String(index).padStart(6, '0')}⟧`;
    const entryBytes = Buffer.byteLength(marker, 'utf8') + Buffer.byteLength(text, 'utf8') + 2;
    if (group.length && bytes + entryBytes > maxBytes) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push({ index, marker, text });
    bytes += entryBytes;
  }
  if (group.length) groups.push(group);

  for (const entries of groups) {
    if (entries.length === 1) {
      output[entries[0].index] = String((await translateText(entries[0].text)) ?? '');
      continue;
    }

    const combined = entries.map(entry => `${entry.marker}\n${entry.text}`).join('\n\n');
    const translated = String((await translateText(combined)) ?? '');

    const positions = entries.map(entry => translated.indexOf(entry.marker));
    const valid = positions.every((position, index) =>
      position >= 0 &&
      translated.indexOf(entries[index].marker, position + entries[index].marker.length) === -1 &&
      (index === 0 || position > positions[index - 1])
    );

    if (valid) {
      for (let index = 0; index < entries.length; index += 1) {
        const start = positions[index] + entries[index].marker.length;
        const end = index + 1 < entries.length ? positions[index + 1] : translated.length;
        output[entries[index].index] = translated.slice(start, end).replace(/^\s*\n?/, '').replace(/\s*$/, '');
      }
    } else {
      // If Translate alters or drops a marker, preserve cue alignment by
      // translating the original cues separately rather than guessing splits.
      for (const entry of entries) {
        output[entry.index] = String((await translateText(entry.text)) ?? '');
      }
    }
  }
  return output;
}

export async function translateSrt(srt, translateText) {
  const cues = parseSrt(srt);
  const texts = await translateCueTexts(cues.map(cue => cue.text), translateText);
  return formatSrt(cues.map((cue, index) => ({
    ...cue,
    text: texts[index] || '[ฟังไม่ชัด]'
  })));
}
 