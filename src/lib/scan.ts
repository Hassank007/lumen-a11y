/**
 * Pure page-scanning helpers. They take a Document and return plain data,
 * so they can run in a content script and be unit-tested in jsdom.
 */
import { isHidden, nameOf } from './names';

export { nameOf };

export interface ImageIssue {
  id: string;            // data-lumen-id assigned to the element
  src: string;
  reason: 'missing-alt' | 'filename-alt' | 'generic-alt';
  currentAlt: string | null;
  width: number;
  height: number;
}

export interface LinkIssue {
  id: string;
  text: string;          // current accessible text
  href: string;
  context: string;       // surrounding sentence/paragraph, used to suggest a better name
}

/** Link texts that say nothing out of context (WCAG 2.4.4). */
export const VAGUE_LINK_TEXT = [
  'click here', 'here', 'read more', 'more', 'learn more', 'link', 'this',
  'this link', 'go', 'details', 'continue', 'see more', 'more info', 'info',
];

const GENERIC_ALT = ['image', 'img', 'photo', 'picture', 'graphic', 'icon', 'logo', 'banner', 'placeholder', 'untitled'];

/** True when alt text looks like a file name, e.g. "IMG_2041.jpg" or "hero-banner_v2.png". */
export function looksLikeFilename(alt: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i.test(alt.trim()) || /^(img|dsc|image|photo)[-_ ]?\d+/i.test(alt.trim());
}

/** Small or invisible images are almost always decorative or tracking pixels. */
export function isTooSmallToMatter(width: number, height: number): boolean {
  return width > 0 && height > 0 && (width < 24 || height < 24);
}

let counter = 0;
function tag(el: Element): string {
  const existing = el.getAttribute('data-lumen-id');
  if (existing) return existing;
  const id = `lumen-${++counter}`;
  el.setAttribute('data-lumen-id', id);
  return id;
}

/** An image Lumen checked and left alone, with the reason it's fine. */
export interface ImageOk {
  id: string;
  src: string;
  why: 'has-alt' | 'decorative' | 'hidden';
  alt: string;
}

type Classified =
  | { kind: 'issue'; reason: ImageIssue['reason'] }
  | { kind: 'ok'; why: ImageOk['why'] }
  | { kind: 'skip' }; // tiny images and images with no source: not worth listing

function classifyImage(img: HTMLImageElement): Classified {
  if (!(img.currentSrc || img.src)) return { kind: 'skip' };
  if (isHidden(img) || /^(presentation|none)$/.test(img.getAttribute('role') ?? '')) return { kind: 'ok', why: 'hidden' };
  const name = nameOf(img); // aria-labelledby, aria-label, alt, then title: what a screen reader really says
  if (img.getAttribute('alt') === '' && !name) return { kind: 'ok', why: 'decorative' }; // explicitly decorative: respect the author's choice
  if (isTooSmallToMatter(img.naturalWidth || img.width, img.naturalHeight || img.height)) return { kind: 'skip' };
  if (!name) return { kind: 'issue', reason: 'missing-alt' };
  if (looksLikeFilename(name)) return { kind: 'issue', reason: 'filename-alt' };
  if (GENERIC_ALT.includes(name.toLowerCase())) return { kind: 'issue', reason: 'generic-alt' };
  return { kind: 'ok', why: 'has-alt' };
}

export function findImageIssues(doc: Document): ImageIssue[] {
  const issues: ImageIssue[] = [];
  doc.querySelectorAll('img').forEach((img) => {
    const c = classifyImage(img);
    if (c.kind !== 'issue') return;
    issues.push({
      id: tag(img), src: img.currentSrc || img.src, reason: c.reason, currentAlt: nameOf(img) || null,
      width: img.naturalWidth || img.width, height: img.naturalHeight || img.height,
    });
  });
  return issues;
}

/** Images that were checked and need nothing, so the user can see every image was looked at. */
export function findImagesOk(doc: Document): ImageOk[] {
  const ok: ImageOk[] = [];
  doc.querySelectorAll('img').forEach((img) => {
    const c = classifyImage(img);
    if (c.kind !== 'ok') return;
    ok.push({ id: tag(img), src: img.currentSrc || img.src, why: c.why, alt: c.why === 'has-alt' ? nameOf(img) : '' });
  });
  return ok;
}

export function findLinkIssues(doc: Document): LinkIssue[] {
  const issues: LinkIssue[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (isHidden(a)) return;
    const text = nameOf(a);
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
    if (text && !VAGUE_LINK_TEXT.includes(normalized)) return;
    // Lumen already lists the image inside, and describing it names the link too.
    if (!text && [...a.querySelectorAll('img')].some((i) => classifyImage(i).kind === 'issue')) return;
    const block = a.closest('p, li, td, article, section, div');
    const context = (block?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    issues.push({ id: tag(a), text, href: a.href, context });
  });
  return issues;
}

const BLOCK_TAGS = 'h1, h2, h3, h4, h5, h6, p, li, tr, dt, dd, figcaption, caption, address, blockquote, pre, legend, label, summary, div, section, article, main, aside, header, footer, nav, form, body';
const SKIP_TEXT = 'script, style, noscript, template, svg, iframe, select, textarea';

/** The page's visible text as blocks in reading order. A table row stays on one line, so "Monday | 9 am to 5 pm" keeps its meaning. */
function textBlocks(root: Element): string[] {
  const out: string[] = [];
  let current: Element | null = null;
  let buffer = '';
  let cell: Element | null = null;
  const hidden = new Map<Element, boolean>();
  const flush = () => {
    const t = buffer.replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
    buffer = '';
  };
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !(n.nodeValue ?? '').trim() || parent.closest(SKIP_TEXT)) {
      if (buffer) buffer += ' ';
      continue;
    }
    if (!hidden.has(parent)) hidden.set(parent, isHidden(parent));
    if (hidden.get(parent)) continue;
    const row = parent.closest('tr');
    const block = row ?? parent.closest(BLOCK_TAGS) ?? root;
    if (block !== current) { flush(); current = block; cell = null; }
    const c = row ? parent.closest('td, th') : null;
    if (c !== cell) { if (buffer.trim()) buffer += ' | '; cell = c; }
    buffer += n.nodeValue ?? '';
  }
  flush();
  return out;
}

const MAIN = 'main, [role="main"], article';

/** The main readable text, for the plain-language version: no menus, no footer. */
export function extractMainText(doc: Document, maxChars = 24000): string {
  const root = doc.querySelector(MAIN) ?? doc.body;
  return root ? textBlocks(root).join('\n').slice(0, maxChars) : '';
}

/** Everything on the page, main content first, so answers can come from footers and tables too. */
export function extractPageBlocks(doc: Document, maxBlocks = 800): string[] {
  if (!doc.body) return [];
  const main = doc.querySelector(MAIN);
  const all = textBlocks(doc.body);
  if (!main) return all.slice(0, maxBlocks);
  const first = textBlocks(main);
  const seen = new Set(first);
  return [...first.slice(0, maxBlocks - 200), ...all.filter((b) => !seen.has(b)).slice(-200)].slice(0, maxBlocks);
}

export interface PageOutline { headings: string[]; controls: string[] }

/**
 * The page as a screen reader user navigates it: headings with levels, then the
 * links, buttons and form fields by name, main content first. The whole page is
 * listed; relevance.ts picks the part that fits a question.
 */
export function extractOutline(doc: Document, maxHeadings = 120, maxControls = 800): PageOutline {
  const headings: string[] = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const t = nameOf(h);
    if (t && headings.length < maxHeadings && !isHidden(h)) headings.push(`h${h.tagName[1]}: ${t.slice(0, 120)}`);
  });
  const main = doc.querySelector(MAIN);
  const els = [...doc.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea')];
  const ordered = main ? [...els.filter((e) => main.contains(e)), ...els.filter((e) => !main.contains(e))] : els;
  const seen = new Set<string>();
  const controls: string[] = [];
  for (const el of ordered) {
    if (controls.length >= maxControls) break;
    if (isHidden(el)) continue;
    const kind = el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' || ['submit', 'button', 'reset', 'image'].includes((el as HTMLInputElement).type) ? 'button' : 'field';
    const key = `${kind}: ${nameOf(el).slice(0, 80) || '(no name)'}`;
    if (!seen.has(key)) { seen.add(key); controls.push(key); }
  }
  return { headings, controls };
}

/** A contact email for the site, from a mailto link or the page text, for "Tell the site owner". */
export function findContactEmail(doc: Document): string | null {
  const mailto = doc.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  if (mailto) return decodeURIComponent(mailto.href.replace(/^mailto:/i, '').split('?')[0]) || null;
  const m = (doc.body?.textContent ?? '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return m ? m[0].replace(/\.$/, '') : null;
}
