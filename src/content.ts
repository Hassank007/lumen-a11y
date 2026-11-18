/**
 * Content script: injected into the active tab on demand (chrome.scripting).
 * It scans the page and applies fixes the user approves, so real assistive
 * technology on that page benefits immediately.
 */
import { extractMainText, findImageIssues, findImagesOk, findLinkIssues } from './lib/scan';

type Msg =
  | { type: 'lumen:scan' }
  | { type: 'lumen:apply-alt'; id: string; alt: string }
  | { type: 'lumen:apply-link'; id: string; label: string }
  | { type: 'lumen:highlight'; id: string; color?: string };

declare global {
  interface Window { __lumenLoaded?: boolean }
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
        });
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
          el.setAttribute('aria-label', msg.label);
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
