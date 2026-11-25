/**
 * How the panel reaches a web page. In the extension that is the active tab; in
 * the hosted demo it is the page shown next to the panel.
 */
import type { PageMessage } from '../lib/page-agent';

export interface Host {
  /** Attach to the page the user is looking at, loading Lumen's page script if needed. */
  connect(): Promise<void>;
  send<T>(msg: PageMessage): Promise<T>;
  /** Calls back when the user moves to another page than the one connected. */
  onPageChange(cb: () => void): void;
  /** Opens the extension's microphone permission page; false where the browser asks by itself. */
  openMicPermission(): Promise<boolean>;
}

const RELOADED = 'The page was reloaded or changed. Scan the page again.';

function extensionHost(): Host {
  let tabId: number | null = null;
  return {
    async connect() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !/^(https?|file):/.test(tab.url)) {
        throw new Error("Open a regular web page first. Lumen can't scan browser pages.");
      }
      tabId = tab.id;
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['axe.min.js', 'content.js'] });
      } catch { throw new Error("Chrome doesn't let extensions read this page."); }
    },
    async send<T>(msg: PageMessage) {
      if (tabId === null) throw new Error('No page scanned yet.');
      try {
        return await chrome.tabs.sendMessage(tabId, msg) as T;
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        throw /Receiving end does not exist|Could not establish connection/.test(m) ? new Error(RELOADED) : err;
      }
    },
    onPageChange(cb) {
      chrome.tabs.onActivated.addListener((i) => {
        if (tabId === null || i.tabId === tabId) return;
        void chrome.windows.getCurrent().then((w) => { if (w.id === i.windowId) cb(); });
      });
      chrome.tabs.onUpdated.addListener((id, info) => { if (id === tabId && (info.url || info.status === 'loading')) cb(); });
    },
    async openMicPermission() {
      await chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
      return true;
    },
  };
}

function demoHost(): Host {
  const frame = () => window.parent.document.getElementById('demo-page') as HTMLIFrameElement;
  const base = document.baseURI;
  const load = (doc: Document, src: string) => new Promise<void>((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = new URL(src, base).href;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    doc.head.append(s);
  });
  let connected: Window | null = null;
  return {
    async connect() {
      const win = frame().contentWindow;
      const doc = frame().contentDocument;
      if (!win || !doc) throw new Error("The demo page hasn't loaded yet.");
      if (!win.__lumenHandle) { await load(doc, 'axe.min.js'); await load(doc, 'content.js'); }
      connected = win;
    },
    async send<T>(msg: PageMessage) {
      if (!connected?.__lumenHandle) throw new Error(RELOADED);
      return await connected.__lumenHandle(msg) as T;
    },
    onPageChange(cb) { frame().addEventListener('load', () => { if (connected) cb(); }); },
    async openMicPermission() { return false; },
  };
}

export const isDemo = !(typeof chrome !== 'undefined' && chrome.runtime?.id) && window.parent !== window;
export const host: Host = isDemo ? demoHost() : extensionHost();
