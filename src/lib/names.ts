/** Accessible names, as a screen reader would speak them (a practical subset of the W3C name computation). */

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** True when the element or an ancestor is hidden from assistive technology. */
export function isHidden(el: Element): boolean {
  if (el.closest('[hidden], [aria-hidden="true"], template')) return true;
  // jsdom has no layout, so this check only runs in a browser. Opacity is ignored on purpose:
  // opacity 0 is still announced.
  const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return typeof check === 'function' ? !check.call(el, { visibilityProperty: true }) : false;
}

const BLOCK = /^(ADDRESS|ARTICLE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|H[1-6]|HR|LI|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

function contentName(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (!(node instanceof Element) || depth > 20) return '';
  const tag = node.tagName.toUpperCase();
  if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag)) return '';
  if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return '';
  const label = clean(node.getAttribute('aria-label'));
  if (label) return ` ${label} `;
  if (tag === 'IMG') return ` ${node.getAttribute('alt') ?? node.getAttribute('title') ?? ''} `;
  if (tag === 'SVG') return ` ${node.querySelector(':scope > title')?.textContent ?? ''} `;
  const inner = [...node.childNodes].map((n) => contentName(n, depth + 1)).join('');
  return BLOCK.test(tag) ? ` ${inner} ` : inner;
}

/** aria-labelledby text, or '' when it is missing or points nowhere. A referenced element may be hidden; it still counts. */
export function labelledByText(el: Element): string {
  const by = el.getAttribute('aria-labelledby');
  if (!by) return '';
  return clean(by.split(/\s+/).map((id) => {
    const ref = id ? el.ownerDocument.getElementById(id) : null;
    if (!ref) return '';
    return clean(ref.getAttribute('aria-label')) || [...ref.childNodes].map((n) => contentName(n, 1)).join('');
  }).join(' '));
}

/** What a screen reader would call this element. */
export function nameOf(el: Element): string {
  const by = labelledByText(el);
  if (by) return by;
  const label = clean(el.getAttribute('aria-label'));
  if (label) return label;
  if (el instanceof HTMLImageElement) return clean(el.getAttribute('alt')) || clean(el.getAttribute('title'));
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    const l = clean([...(el.labels ?? [])].map((x) => x.textContent).join(' '));
    if (l) return l;
    if (el instanceof HTMLInputElement) {
      if (['submit', 'reset', 'button'].includes(el.type) && clean(el.value)) return clean(el.value);
      if (el.type === 'submit') return 'Submit';
      if (el.type === 'image') return clean(el.alt) || clean(el.title);
    }
    return clean(el.getAttribute('title')) || clean(el.getAttribute('placeholder'));
  }
  const text = clean([...el.childNodes].map((n) => contentName(n, 1)).join(''));
  return text || clean(el.getAttribute('title'));
}
