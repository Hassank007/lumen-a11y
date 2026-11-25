/**
 * Picks the parts of a page that fit a question. Gemini Nano reads only a few
 * thousand words at a time, so a long page has to be cut. Cutting it at the top
 * would lose the footer, which is where contact details usually are.
 */

/** Words that mean the same thing when someone asks about a web page. */
const GROUPS: string[][] = [
  ['contact', 'call', 'phone', 'telephone', 'tel', 'email', 'mail', 'message', 'reach', 'address', 'helpline', 'support', 'help', 'chat', 'feedback', 'enquiries', 'enquiry', 'inquiries', '@'],
  ['open', 'opening', 'hours', 'close', 'closed', 'closing', 'when', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekend'],
  ['price', 'prices', 'pricing', 'cost', 'costs', 'fee', 'fees', 'charge', 'pay', 'payment', 'free', 'donate', '£', '$', '€'],
  ['where', 'address', 'location', 'map', 'directions', 'find', 'visit', 'street', 'road', 'lane'],
  ['book', 'booking', 'appointment', 'reserve', 'schedule'],
  ['login', 'log', 'sign', 'signin', 'account', 'register'],
  ['language', 'translate', 'english', 'translation'],
  ['accessibility', 'accessible', 'disability', 'disabled', 'wheelchair'],
];

const STOP = new Set('a an and are at be by can do does for from get have how i in is it me my of on or page site that the their them there these they this to us we what which who will with you your'.split(' '));

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+|[@£$€]/gu) ?? [];
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ies|es|s|ed)$/, '') : w);

/** The question's own words score 2, related words score 1. */
export function questionTerms(question: string): Map<string, number> {
  const terms = new Map<string, number>();
  const asked = words(question).filter((w) => !STOP.has(w));
  for (const w of asked) terms.set(stem(w), 2);
  for (const g of GROUPS) {
    if (!g.some((w) => asked.includes(w))) continue;
    for (const w of g) if (!terms.has(stem(w))) terms.set(stem(w), 1);
  }
  return terms;
}

function score(text: string, terms: Map<string, number>): number {
  let s = 0;
  for (const w of new Set(words(text).map(stem))) s += terms.get(w) ?? 0;
  return s;
}

/**
 * Chooses items up to a character budget: the opening ones (what the page is
 * about), then the best matches, then whatever else fits, in page order.
 */
export function pickRelevant(items: string[], question: string, budget: number, lead = 0): string[] {
  const terms = questionTerms(question);
  const chosen = new Set<number>();
  let used = 0;
  const add = (i: number, cap = budget): void => {
    if (chosen.has(i)) return;
    const len = items[i].length + 1;
    if (used + len > cap) return;
    chosen.add(i);
    used += len;
  };
  for (let i = 0; i < items.length && used < lead; i++) add(i, lead);
  const ranked = items.map((t, i) => ({ i, s: score(t, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i);
  for (const { i } of ranked) add(i);
  for (let i = 0; i < items.length; i++) add(i);
  return [...chosen].sort((a, b) => a - b).map((i) => items[i]);
}

/** Splits long text into parts at line breaks, then sentences, so a small model can work through all of it. */
export function splitText(text: string, max = 3500): string[] {
  const pieces = text.split('\n').flatMap((line) => {
    if (line.length <= max) return [line];
    const sentences = line.match(/[^.!?]+[.!?]*\s*|[.!?]+\s*/g) ?? [line];
    return sentences.flatMap((s) => s.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g')) ?? []);
  });
  const out: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && cur.length + p.length + 1 > max) { out.push(cur); cur = ''; }
    cur = cur ? `${cur}\n${p}` : p;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
