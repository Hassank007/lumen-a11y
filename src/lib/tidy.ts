/**
 * Small models don't always respect length limits, so the output is tidied
 * before it is shown: first line only, quotes and "Alt text:"-style preambles
 * removed, then cut at a word boundary.
 */
function clean(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
  return firstLine
    .replace(/^[-*•\d.)\s]+/, '')
    .replace(/^(alt text|link text|description|caption)\s*:\s*/i, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/^(an? )?(image|picture) of\s+/i, '')
    .replace(/\*\*/g, '')
    .trim();
}

function cutAtWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars + 1);
  const space = cut.lastIndexOf(' ');
  return (space > maxChars * 0.5 ? cut.slice(0, space) : text.slice(0, maxChars)).replace(/[\s,;:–—-]+$/, '');
}

/** Alt text: one sentence, at most ~125 characters (common screen reader guidance). */
export function tidyAlt(raw: string, maxChars = 125): string {
  const text = clean(raw);
  if (/^decorative\.?$/i.test(text)) return 'DECORATIVE';
  const firstSentence = text.match(/^.+?[.!?](\s|$)/)?.[0].trim() ?? text;
  const out = cutAtWord(firstSentence, maxChars);
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Plain text for the page: models often add markdown, which would show (and be read aloud) as symbols. Safe to run on half-streamed text. */
export function tidyPlain(raw: string): string {
  return raw
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/^([ \t]*)[*+-][ \t]+/gm, '$1• ')
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Link text: a short label, at most 6 words / 60 characters, no trailing period. */
export function tidyLink(raw: string, maxWords = 6, maxChars = 60): string {
  const words = clean(raw).replace(/[.!]+$/, '').split(/\s+/).filter(Boolean).slice(0, maxWords).join(' ');
  return cutAtWord(words, maxChars);
}
