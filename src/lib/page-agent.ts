/**
 * The part of Lumen that runs inside a web page: scans it, applies the fixes the
 * user approves (so real assistive technology benefits at once), and undoes them.
 * Used by the extension's content script and by the hosted demo.
 */
import { AXE_TAGS, summarizeAxe, type AuditSummary, type AxeLikeViolation } from './audit';
import {
  extractMainText, extractOutline, extractPageBlocks, findContactEmail, findImageIssues, findImagesOk, findLinkIssues,
  type ImageIssue, type ImageOk, type LinkIssue, type PageOutline,
} from './scan';
import { checkSensitive, type Sensitivity } from './sensitive';

export interface ScanResult {
  url: string;
  title: string;
  images: ImageIssue[];
  imagesOk: ImageOk[];
  links: LinkIssue[];
  text: string;
  blocks: string[];
  outline: PageOutline;
  email: string | null;
  privacy: Sensitivity;
}

export type PageMessage =
  | { type: 'lumen:scan' }
  | { type: 'lumen:audit' }
  | { type: 'lumen:apply-alt'; id: string; alt: string }
  | { type: 'lumen:apply-link'; id: string; label: string }
  | { type: 'lumen:undo'; id: string }
  | { type: 'lumen:highlight'; id: string; color?: string };

interface Axe { run(ctx: unknown, opts: unknown): Promise<{ violations: AxeLikeViolation[] }> }

const ATTRS = ['alt', 'aria-label', 'aria-labelledby'];
interface Original { attrs: Array<[string, string | null]>; text: string | null }

const originals = new Map<string, Original>();

function find(doc: Document, id: string): Element | null {
  return /^lumen-\d+$/.test(id) ? doc.querySelector(`[data-lumen-id="${id}"]`) : null;
}

function remember(el: Element, id: string): void {
  if (originals.has(id)) return; // keep the page's own version, even if the user applies twice
  originals.set(id, { attrs: ATTRS.map((a) => [a, el.getAttribute(a)]), text: el.children.length === 0 ? el.textContent : null });
}

export function applyAlt(doc: Document, id: string, alt: string): boolean {
  const el = find(doc, id);
  if (!el) return false;
  remember(el, id);
  // Either of these would win over alt and keep the old name.
  el.removeAttribute('aria-labelledby');
  el.removeAttribute('aria-label');
  el.setAttribute('alt', alt === 'DECORATIVE' ? '' : alt);
  el.setAttribute('data-lumen-fixed', 'alt');
  return true;
}

export function applyLink(doc: Document, id: string, label: string): boolean {
  const el = find(doc, id);
  if (!el) return false;
  remember(el, id);
  // WCAG 2.5.3 Label in Name: the spoken name must contain the visible text, or voice-control
  // users can't activate the link by what they see. So rewrite the visible text when the link is
  // plain text; only fall back to aria-label when there is no visible text (icon or empty link).
  const visible = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  el.removeAttribute('aria-labelledby'); // it would win over both the text and aria-label
  if (el.children.length === 0 && visible) {
    el.textContent = label;
    el.removeAttribute('aria-label');
  } else if (!visible) {
    el.setAttribute('aria-label', label);
  } else {
    el.setAttribute('aria-label', `${visible}: ${label}`);
  }
  el.setAttribute('data-lumen-fixed', 'link');
  return true;
}

/** Puts the page's own version back. */
export function undo(doc: Document, id: string): boolean {
  const el = find(doc, id);
  const o = originals.get(id);
  if (!el || !o) return false;
  for (const [name, value] of o.attrs) {
    if (value === null) el.removeAttribute(name); else el.setAttribute(name, value);
  }
  if (o.text !== null && el.tagName !== 'IMG' && el.textContent !== o.text) el.textContent = o.text;
  el.removeAttribute('data-lumen-fixed');
  originals.delete(id);
  return true;
}

export function scanPage(doc: Document, url: string): ScanResult {
  return {
    url,
    title: doc.title,
    images: findImageIssues(doc),
    imagesOk: findImagesOk(doc),
    links: findLinkIssues(doc),
    text: extractMainText(doc),
    blocks: extractPageBlocks(doc),
    outline: extractOutline(doc),
    email: findContactEmail(doc),
    privacy: checkSensitive(doc, url),
  };
}

/** True when Lumen lists this exact element with a fix. Elements inside frames or shadow roots are not listed. */
export function isListed(doc: Document, node: unknown, listed: Set<string>): boolean {
  const target = (node as { target?: unknown[] }).target;
  if (target?.length !== 1 || typeof target[0] !== 'string') return false;
  const el = doc.querySelector(target[0]);
  if (!el) return false;
  if (listed.has(el.getAttribute('data-lumen-id') ?? '')) return true;
  // A link holding only an image is fixed by describing that image.
  return [...el.querySelectorAll('img')].some((i) => listed.has(i.getAttribute('data-lumen-id') ?? ''));
}

/** axe-core checks the live page, including Lumen's applied fixes. */
async function audit(doc: Document, axe: Axe | undefined): Promise<AuditSummary | { error: string }> {
  if (!axe) return { error: 'The accessibility engine did not load on this page.' };
  const listed = new Set([...findImageIssues(doc), ...findLinkIssues(doc)].map((i) => i.id));
  try {
    const r = await axe.run(doc, { runOnly: { type: 'tag', values: AXE_TAGS }, resultTypes: ['violations'] });
    return summarizeAxe(r.violations, (node) => isListed(doc, node, listed));
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

function highlight(doc: Document, id: string, color = '#ffb300'): boolean {
  const el = find(doc, id) as HTMLElement | null;
  if (!el) return false;
  const calm = doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  el.style.outline = `4px solid ${color}`;
  el.style.outlineOffset = '3px';
  setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2500);
  return true;
}

export async function handle(msg: PageMessage): Promise<unknown> {
  switch (msg.type) {
    case 'lumen:scan': return scanPage(document, location.href);
    case 'lumen:audit': return audit(document, (window as Window & { axe?: Axe }).axe);
    case 'lumen:apply-alt': return { ok: applyAlt(document, msg.id, msg.alt) };
    case 'lumen:apply-link': return { ok: applyLink(document, msg.id, msg.label) };
    case 'lumen:undo': return { ok: undo(document, msg.id) };
    case 'lumen:highlight': return { ok: highlight(document, msg.id, msg.color) };
  }
}
