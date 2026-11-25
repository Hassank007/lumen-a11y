/**
 * Content script: injected into the active tab on demand (chrome.scripting).
 * In the hosted demo there is no extension, so the handler is put on window instead.
 */
import { handle, type PageMessage } from './lib/page-agent';

declare global {
  interface Window {
    __lumenLoaded?: boolean;
    __lumenHandle?: (msg: PageMessage) => Promise<unknown>;
  }
}

if (!window.__lumenLoaded) {
  window.__lumenLoaded = true;
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg: PageMessage, _sender, sendResponse) => {
      if (!String(msg?.type).startsWith('lumen:')) return false;
      void handle(msg).then(sendResponse);
      return true;
    });
  } else {
    window.__lumenHandle = handle;
  }
}
