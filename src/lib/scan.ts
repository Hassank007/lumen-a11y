/**
 * Pure page-scanning helpers. They take a Document and return plain data,
 * so they can run in a content script and be unit-tested in jsdom.
 */

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
  if (img.getAttribute('aria-hidden') === 'true' || img.getAttribute('role') === 'presentation') return { kind: 'ok', why: 'hidden' };
  const alt = img.getAttribute('alt');
  if (alt === '') return { kind: 'ok', why: 'decorative' }; // explicitly decorative — respect the author's choice
  if (isTooSmallToMatter(img.naturalWidth || img.width, img.naturalHeight || img.height)) return { kind: 'skip' };
  if (alt === null) return { kind: 'issue', reason: 'missing-alt' };
  if (looksLikeFilename(alt)) return { kind: 'issue', reason: 'filename-alt' };
  if (GENERIC_ALT.includes(alt.trim().toLowerCase())) return { kind: 'issue', reason: 'generic-alt' };
  return { kind: 'ok', why: 'has-alt' };
}

export function findImageIssues(doc: Document): ImageIssue[] {
  const issues: ImageIssue[] = [];
  doc.querySelectorAll('img').forEach((img) => {
    const c = classifyImage(img);
    if (c.kind !== 'issue') return;
    issues.push({
      id: tag(img), src: img.currentSrc || img.src, reason: c.reason, currentAlt: img.getAttribute('alt'),
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
    ok.push({ id: tag(img), src: img.currentSrc || img.src, why: c.why, alt: img.getAttribute('alt') ?? '' });
  });
  return ok;
}

function accessibleLinkText(a: HTMLAnchorElement): string {
  const label = a.getAttribute('aria-label');
  if (label && label.trim()) return label.trim();
  return (a.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function findLinkIssues(doc: Document): LinkIssue[] {
  const issues: LinkIssue[] = [];
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const text = accessibleLinkText(a);
    const normalized = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
    const isEmpty = text.length === 0 && !a.querySelector('img[alt]:not([alt=""])');
    if (!isEmpty && !VAGUE_LINK_TEXT.includes(normalized)) return;
    const block = a.closest('p, li, td, article, section, div');
    const context = (block?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    issues.push({ id: tag(a), text, href: a.href, context });
  });
  return issues;
}

/** Main readable text of the page, for plain-language simplification. */
export function extractMainText(doc: Document, maxChars = 6000): string {
  const root = doc.querySelector('main, article, [role="main"]') ?? doc.body;
  const parts: string[] = [];
  root?.querySelectorAll('h1, h2, h3, p, li').forEach((el) => {
    const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (t.length > 0) parts.push(t);
  });
  return parts.join('\n').slice(0, maxChars);
}
