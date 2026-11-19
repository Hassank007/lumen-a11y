/**
 * Content script: injected into the active tab on demand (chrome.scripting).
 * It scans the page and applies fixes the user approves, so real assistive
 * technology on that page benefits immediately.
 */
import { extractMainText, extractOutline, findContactEmail, findImageIssues, findImagesOk, findLinkIssues } from './lib/scan';
import { AXE_TAGS, summarizeAxe } from './lib/audit';

type Msg =
  | { type: 'lumen:scan' }
  | { type: 'lumen:audit' }
  | { type: 'lumen:apply-alt'; id: string; alt: string }
  | { type: 'lumen:apply-link'; id: string; label: string }
  | { type: 'lumen:highlight'; id: string; color?: string };

declare global {
  interface Window {
    __lumenLoaded?: boolean;
    axe?: { run(ctx: unknown, opts: unknown): Promise<{ violations: Array<{ id: string; help: string; impact?: string | null; nodes: unknown[] }> }> };
  }
}

if (!window.__lumenLoaded) {
  window.__lumenLoaded = true;

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    switch (msg.type) {
      case 'lumen:scan':
        sendResponse({
          url: location.href,
          title: document.title,
          images: findImageIssues(document),
          imagesOk: findImagesOk(document),
          links: findLinkIssues(document),
          text: extractMainText(document),
          outline: extractOutline(document),
          email: findContactEmail(document),
        });
        break;
      case 'lumen:audit':
        // axe-core (injected just before this script) checks the live page, including Lumen's applied fixes.
        if (!window.axe) { sendResponse({ error: 'The accessibility engine did not load on this page.' }); break; }
        window.axe
          .run(document, { runOnly: { type: 'tag', values: AXE_TAGS }, resultTypes: ['violations'] })
          .then((r) => sendResponse(summarizeAxe(r.violations)))
          .catch((e: unknown) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
        break;
      case 'lumen:apply-alt': {
        const el = document.querySelector(`[data-lumen-id="${msg.id}"]`);
        if (el) {
          if (msg.alt === 'DECORATIVE') el.setAttribute('alt', '');
          else el.setAttribute('alt', msg.alt);
          el.setAttribute('data-lumen-fixed', 'alt');
        }
        sendResponse({ ok: Boolean(el) });
        break;
      }
      case 'lumen:apply-link': {
        const el = document.querySelector(`[data-lumen-id="${msg.id}"]`);
        if (el) {
          // WCAG 2.5.3 Label in Name: the spoken name must contain the visible text, or voice-control
          // users can't activate the link by what they see. So rewrite the visible text when the link is
          // plain text; only fall back to aria-label when there is no visible text (icon or empty link).
          const visible = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (!el.hasAttribute('data-lumen-original')) el.setAttribute('data-lumen-original', visible);
          if (el.children.length === 0) {
            el.textContent = msg.label;
            el.removeAttribute('aria-label');
          } else if (!visible) {
            el.setAttribute('aria-label', msg.label);
          } else {
            el.setAttribute('aria-label', `${visible}: ${msg.label}`);
          }
          el.setAttribute('data-lumen-fixed', 'link');
        }
        sendResponse({ ok: Boolean(el) });
        break;
      }
      case 'lumen:highlight': {
        const el = document.querySelector<HTMLElement>(`[data-lumen-id="${msg.id}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          el.style.outline = `4px solid ${msg.color ?? '#ffb300'}`;
          el.style.outlineOffset = '3px';
          setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 2500);
        }
        sendResponse({ ok: Boolean(el) });
        break;
      }
    }
    return true;
  });
}
