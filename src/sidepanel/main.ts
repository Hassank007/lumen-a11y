import type { ImageIssue, ImageOk, LinkIssue, PageOutline } from '../lib/scan';
import { issueCount, type AuditSummary } from '../lib/audit';
import { fill } from '../lib/prompts';
import { tidyAlt, tidyLink } from '../lib/tidy';
import { loadRemoteSettings } from '../lib/firebase';
import { generate, generateStream, imagePart, type AIResult, type Privacy } from '../lib/ai';

interface ScanResult { url: string; title: string; images: ImageIssue[]; imagesOk?: ImageOk[]; links: LinkIssue[]; text: string; outline?: PageOutline }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $('status');
let settingsPromise = loadRemoteSettings();
let tabId: number | null = null;
let lastScan: ScanResult | null = null;
let baseline: AuditSummary | null = null;

/** Polite screen-reader announcement (clear first so repeats are spoken). */
function announce(msg: string): void {
  status.textContent = '';
  setTimeout(() => { status.textContent = msg; }, 50);
}

function privacy(): Privacy {
  const checked = document.querySelector<HTMLInputElement>('input[name="privacy"]:checked');
  return (checked?.value as Privacy) ?? 'hybrid';
}

function badge(r: AIResult): HTMLElement {
  const b = document.createElement('span');
  const onDevice = r.source === 'on_device';
  b.className = `badge ${r.source}`;
  b.textContent = `${onDevice ? 'On device' : r.source === 'in_cloud' ? 'Cloud' : 'AI'} · ${(r.ms / 1000).toFixed(1)} s`;
  return b;
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
    throw new Error('Open a regular web page first. Lumen can\'t scan browser pages.');
  }
  return tab.id;
}

async function send<T>(message: unknown): Promise<T> {
  if (tabId === null) throw new Error('No page scanned yet.');
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

async function checkDevice(): Promise<void> {
  const el = $('device-status');
  try {
    const lm = (globalThis as unknown as { LanguageModel?: { availability(o?: unknown): Promise<string> } }).LanguageModel;
    if (!lm) { el.textContent = 'On-device AI isn\'t available in this browser. Lumen will use the cloud.'; return; }
    const a = await lm.availability({ expectedInputs: [{ type: 'image' }] });
    el.textContent = a === 'available'
      ? 'Gemini Nano is ready on this device.'
      : a === 'unavailable' ? 'This device can\'t run Gemini Nano. Lumen will use the cloud.'
      : 'Gemini Nano can be downloaded to this device (one time, about 4 GB).';
  } catch { el.textContent = 'Couldn\'t check on-device AI.'; }
}

function setBusy(btn: HTMLButtonElement, busy: boolean, label?: string): void {
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
  if (label) btn.textContent = label;
}

function errorLine(li: HTMLElement, err: unknown): void {
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
  li.append(p);
  announce(p.textContent);
}

// ---------- Images ----------
function reasonText(r: ImageIssue['reason']): string {
  return r === 'missing-alt' ? 'No alt text' : r === 'filename-alt' ? 'Alt text is a file name' : 'Alt text is too generic';
}

function renderImage(issue: ImageIssue, index: number): HTMLLIElement {
  const li = document.createElement('li');
  li.dataset.id = issue.id;
  const thumb = document.createElement('img');
  thumb.className = 'thumb';
  thumb.src = issue.src;
  thumb.alt = `Image ${index + 1} on the page`;
  const reason = document.createElement('p');
  reason.textContent = `Image ${index + 1}: ${reasonText(issue.reason)}${issue.currentAlt ? ` ("${issue.currentAlt}")` : ''}.`;

  const fieldId = `alt-${issue.id}`;
  const label = document.createElement('label');
  label.htmlFor = fieldId;
  label.textContent = `Suggested alt text for image ${index + 1}`;
  const field = document.createElement('textarea');
  field.id = fieldId;
  field.rows = 2;

  const row = document.createElement('div');
  row.className = 'row';
  const gen = button(`Write alt text`, `Write alt text for image ${index + 1}`);
  const apply = button(`Apply to page`, `Apply alt text to image ${index + 1}`);
  const show = button(`Show on page`, `Show image ${index + 1} on the page`);
  apply.disabled = true;
  row.append(gen, apply, show);
  li.append(thumb, reason, label, field, row);

  gen.addEventListener('click', () => writeAlt(issue, index, li, field, gen, apply));
  wireApply(li, field, apply, `image ${index + 1}`, () => ({ type: 'lumen:apply-alt', id: issue.id, alt: field.value.trim() }),
    () => field.value.trim() === 'DECORATIVE' ? `Image ${index + 1} is now marked decorative, so screen readers skip it.` : `Alt text applied to image ${index + 1}.`);
  show.addEventListener('click', () => send({ type: 'lumen:highlight', id: issue.id }));
  return li;
}

async function writeAlt(issue: ImageIssue, index: number, li: HTMLElement, field: HTMLTextAreaElement, gen: HTMLButtonElement, apply: HTMLButtonElement): Promise<void> {
  setBusy(gen, true, 'Writing…');
  li.querySelectorAll('.badge, .error').forEach((n) => n.remove());
  try {
    const { prompts, cloudModel } = await settingsPromise;
    const r = await generate([prompts.altText, await imagePart(issue.src)], { privacy: privacy(), cloudModel, withImages: true });
    field.value = tidyAlt(r.text);
    field.dispatchEvent(new Event('input'));
    apply.disabled = false;
    gen.after(badge(r));
    announce(`Alt text written for image ${index + 1}${r.source === 'on_device' ? ', on your device' : ''}.`);
  } catch (err) { errorLine(li, err); }
  finally { setBusy(gen, false, 'Write alt text'); }
}

function okReason(o: ImageOk): string {
  return o.why === 'decorative' ? 'Marked decorative (alt=""), so screen readers skip it. Correct for decoration.'
    : o.why === 'hidden' ? 'Hidden from screen readers by the page.'
    : `Has alt text: "${o.alt}"`;
}

function renderImageOk(o: ImageOk, index: number): HTMLLIElement {
  const li = document.createElement('li');
  const thumb = document.createElement('img');
  thumb.className = 'thumb small';
  thumb.src = o.src;
  thumb.alt = '';
  const p = document.createElement('p');
  p.textContent = okReason(o);
  const show = button('Show on page', `Show OK image ${index + 1} on the page`);
  show.addEventListener('click', () => send({ type: 'lumen:highlight', id: o.id }));
  li.append(thumb, p, show);
  return li;
}

// ---------- Links ----------
function renderLink(issue: LinkIssue, index: number): HTMLLIElement {
  const li = document.createElement('li');
  const desc = document.createElement('p');
  desc.textContent = `Link ${index + 1}: "${issue.text || '(no text)'}" → ${issue.href}`;
  const fieldId = `link-${issue.id}`;
  const label = document.createElement('label');
  label.htmlFor = fieldId;
  label.textContent = `Better link text for link ${index + 1}`;
  const field = document.createElement('input');
  field.id = fieldId;
  field.type = 'text';
  const row = document.createElement('div');
  row.className = 'row';
  const gen = button('Suggest text', `Suggest text for link ${index + 1}`);
  const apply = button('Apply to page', `Apply text to link ${index + 1}`);
  const show = button('Show on page', `Show link ${index + 1} on the page`);
  apply.disabled = true;
  row.append(gen, apply, show);
  li.append(desc, label, field, row);

  gen.addEventListener('click', async () => {
    setBusy(gen, true, 'Thinking…');
    li.querySelectorAll('.badge, .error').forEach((n) => n.remove());
    try {
      const { prompts, cloudModel } = await settingsPromise;
      const prompt = fill(prompts.linkText, { text: issue.text || '(empty)', href: issue.href, context: issue.context });
      const r = await generate([prompt], { privacy: privacy(), cloudModel });
      field.value = tidyLink(r.text);
      field.dispatchEvent(new Event('input'));
      apply.disabled = false;
      gen.after(badge(r));
      announce(`Suggestion ready for link ${index + 1}.`);
    } catch (err) { errorLine(li, err); }
    finally { setBusy(gen, false, 'Suggest text'); }
  });
  wireApply(li, field, apply, `link ${index + 1}`, () => ({ type: 'lumen:apply-link', id: issue.id, label: field.value.trim() }),
    () => `Link ${index + 1} now reads "${field.value.trim()}" to screen readers.`);
  show.addEventListener('click', () => send({ type: 'lumen:highlight', id: issue.id }));
  return li;
}

/**
 * Apply button with visible and announced feedback: the button turns into
 * "Applied ✓", a result line appears under it, and the element flashes on the
 * page. Editing the text re-enables Apply. Failures are shown, never silent.
 */
function wireApply(
  li: HTMLElement,
  field: HTMLInputElement | HTMLTextAreaElement,
  apply: HTMLButtonElement,
  what: string,
  message: () => { type: string; id: string },
  successText: () => string,
): void {
  const result = document.createElement('p');
  result.className = 'apply-result';
  result.hidden = true;
  li.append(result);

  const reset = () => {
    apply.textContent = 'Apply to page';
    apply.classList.remove('applied');
    apply.disabled = field.value.trim() === '';
    result.hidden = true;
  };
  field.addEventListener('input', reset);

  apply.addEventListener('click', async () => {
    const text = field.value.trim();
    result.classList.remove('error');
    if (!text) {
      result.textContent = `Write or type text for ${what} first.`;
      result.classList.add('error');
      result.hidden = false;
      announce(result.textContent);
      return;
    }
    setBusy(apply, true, 'Applying…');
    try {
      const msg = message();
      const res = await send<{ ok: boolean } | undefined>(msg);
      if (!res?.ok) throw new Error(`Couldn't find ${what} on the page any more. Scan the page again.`);
      void send({ type: 'lumen:highlight', id: msg.id, color: '#2e7d32' }).catch(() => undefined);
      apply.textContent = 'Applied ✓';
      apply.classList.add('applied');
      apply.setAttribute('aria-busy', 'false');
      result.textContent = successText();
      result.hidden = false;
      announce(result.textContent);
      scheduleRecheck();
    } catch (err) {
      setBusy(apply, false, 'Apply to page');
      const m = err instanceof Error ? err.message : String(err);
      result.textContent = /Receiving end does not exist|Could not establish connection/.test(m)
        ? 'The page was reloaded or changed. Scan the page again, then apply.'
        : `Error: ${m}`;
      result.classList.add('error');
      result.hidden = false;
      announce(result.textContent);
    }
  });
}

function button(text: string, accessibleName: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  if (accessibleName !== text) b.setAttribute('aria-label', accessibleName);
  return b;
}

// ---------- Scan ----------
async function scan(): Promise<void> {
  const btn = $<HTMLButtonElement>('scan');
  setBusy(btn, true, 'Scanning…');
  try {
    tabId = await activeTabId();
    await chrome.scripting.executeScript({ target: { tabId }, files: ['axe.min.js', 'content.js'] });
    lastScan = await send<ScanResult>({ type: 'lumen:scan' });
    $('page-title').textContent = lastScan.title || lastScan.url;
    $('img-count').textContent = String(lastScan.images.length);
    $('link-count').textContent = String(lastScan.links.length);
    $('img-list').replaceChildren(...lastScan.images.map(renderImage));
    const ok = lastScan.imagesOk ?? [];
    $('img-ok-count').textContent = `${ok.length} image${ok.length === 1 ? '' : 's'}`;
    $('img-ok-list').replaceChildren(...ok.map(renderImageOk));
    $<HTMLDetailsElement>('img-ok').hidden = ok.length === 0;
    $<HTMLDetailsElement>('img-ok').open = false;
    $('link-list').replaceChildren(...lastScan.links.map(renderLink));
    $<HTMLButtonElement>('fix-all-images').hidden = lastScan.images.length === 0;
    const checked = lastScan.images.length + ok.length;
    const summary = `Checked ${checked} image${checked === 1 ? '' : 's'}: ${lastScan.images.length} need${lastScan.images.length === 1 ? 's' : ''} alt text, ${ok.length} already OK. Found ${lastScan.links.length} unclear link${lastScan.links.length === 1 ? '' : 's'}.`;
    $('summary').textContent = summary;
    $('results').hidden = false;
    announce(summary);
    $('results-h').setAttribute('tabindex', '-1');
    $('results-h').focus();
    $('ask-log').replaceChildren();
    baseline = null;
    void runAudit();
  } catch (err) {
    announce(err instanceof Error ? err.message : String(err));
    $('summary').textContent = err instanceof Error ? err.message : String(err);
    $('results').hidden = false;
  } finally { setBusy(btn, false, 'Scan this page'); }
}

async function fixAllImages(): Promise<void> {
  const btn = $<HTMLButtonElement>('fix-all-images');
  setBusy(btn, true, 'Writing alt text…');
  const items = [...$('img-list').querySelectorAll<HTMLLIElement>('li')];
  for (const [i, li] of items.entries()) {
    announce(`Writing alt text for image ${i + 1} of ${items.length}.`);
    li.querySelector<HTMLButtonElement>('button')?.click();
    // wait for that item's request to finish before starting the next (keeps the device responsive)
    await new Promise<void>((resolve) => {
      const check = () => (li.querySelector('.badge, .error') ? resolve() : setTimeout(check, 300));
      check();
    });
  }
  setBusy(btn, false, 'Write alt text for all images');
  announce('Finished writing alt text. Review each one, then apply.');
}

async function simplify(): Promise<void> {
  const btn = $<HTMLButtonElement>('simplify');
  const out = $('simplified');
  if (!lastScan?.text) { announce('Scan a page first.'); return; }
  setBusy(btn, true, 'Simplifying…');
  // Visible progress (not a live region: streaming text would flood a screen reader).
  const progress = document.createElement('p');
  progress.className = 'progress';
  const body = document.createElement('div');
  out.replaceChildren(progress, body);
  out.hidden = false;
  const t0 = performance.now();
  let gotText = false;
  const tick = () => {
    const s = Math.round((performance.now() - t0) / 1000);
    progress.textContent = gotText ? `Writing… ${s} s` : `Starting the AI model… ${s} s (the first run on a device can take up to a minute)`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  announce('Simplifying the page. This can take up to a minute on your device.');
  try {
    const { prompts, cloudModel } = await settingsPromise;
    const r = await generateStream([fill(prompts.simplify, { text: lastScan.text })], { privacy: privacy(), cloudModel }, (soFar) => {
      gotText = true;
      body.textContent = soFar;
    });
    clearInterval(timer);
    body.textContent = r.text;
    progress.replaceChildren(badge(r));
    out.focus();
    announce(`Plain-language version ready, ${r.source === 'on_device' ? 'written on your device' : 'written in the cloud'} in ${(r.ms / 1000).toFixed(0)} seconds.`);
  } catch (err) {
    clearInterval(timer);
    progress.textContent = '';
    body.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    body.className = 'error';
    announce(body.textContent);
  } finally { setBusy(btn, false, 'Simplify this page'); }
}

$('scan').addEventListener('click', scan);
$('fix-all-images').addEventListener('click', fixAllImages);
$('simplify').addEventListener('click', simplify);
document.querySelectorAll('input[name="privacy"]').forEach((r) => r.addEventListener('change', () => {
  announce(privacy() === 'device-only' ? 'On-device only. Page content will not leave this computer.' : 'On-device first, cloud if needed.');
}));
void checkDevice();
settingsPromise = settingsPromise.catch(() => loadRemoteSettings());

// ---------- Accessibility check (axe-core, before vs now) ----------
let recheckTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRecheck(): void {
  clearTimeout(recheckTimer);
  recheckTimer = setTimeout(() => void runAudit(), 700);
}

function renderRules(a: AuditSummary): void {
  $('rule-list').replaceChildren(...a.rules.map((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.help}: ${r.count} (${r.impact})`;
    if (r.lumenFixes) {
      const tag = document.createElement('span');
      tag.className = 'rule-fix';
      tag.textContent = ' · Lumen can fix this';
      li.append(tag);
    }
    return li;
  }));
  $<HTMLDetailsElement>('rules').hidden = a.rules.length === 0;
}

async function runAudit(): Promise<void> {
  const btn = $<HTMLButtonElement>('recheck');
  setBusy(btn, true, 'Checking…');
  try {
    const a = await send<AuditSummary | { error: string }>({ type: 'lumen:audit' });
    if ('error' in a) throw new Error(a.error);
    const now = $('score-now');
    if (!baseline) {
      baseline = a;
      $('score-before').textContent = issueCount(a.issues);
      now.textContent = issueCount(a.issues);
      now.classList.remove('better');
      const fixable = a.rules.filter((r) => r.lumenFixes).reduce((n, r) => n + r.count, 0);
      $('score-note').textContent = fixable ? `${issueCount(fixable)} of these Lumen can fix. Apply fixes below and the check updates.` : 'Nothing here that Lumen fixes automatically.';
    } else {
      now.textContent = issueCount(a.issues);
      now.classList.toggle('better', a.issues < baseline.issues);
      const fixed = baseline.issues - a.issues;
      $('score-note').textContent = fixed > 0 ? `${issueCount(fixed)} fixed by Lumen on this page.` : 'No change yet.';
      announce(`Accessibility check: ${issueCount(baseline.issues)} before, ${issueCount(a.issues)} now.`);
    }
    renderRules(a);
  } catch (err) {
    $('score-note').textContent = `Couldn't run the check: ${err instanceof Error ? err.message : String(err)}`;
  } finally { setBusy(btn, false, 'Check again'); }
}

// ---------- Ask about this page ----------
async function ask(question: string): Promise<void> {
  const q = question.trim();
  if (!q) { announce('Type a question first.'); $('ask-q').focus(); return; }
  if (!lastScan) { announce('Scan a page first.'); return; }
  const btn = $<HTMLButtonElement>('ask-btn');
  setBusy(btn, true, 'Thinking…');
  const li = document.createElement('li');
  const qp = document.createElement('p');
  qp.className = 'q';
  qp.textContent = q;
  const ap = document.createElement('p');
  ap.className = 'a';
  ap.textContent = 'Thinking…';
  li.append(qp, ap);
  $('ask-log').prepend(li);
  try {
    const { prompts, cloudModel } = await settingsPromise;
    const o = lastScan.outline ?? { headings: [], controls: [] };
    const prompt = fill(prompts.ask, {
      question: q,
      title: lastScan.title,
      headings: o.headings.join('\n') || '(none)',
      controls: o.controls.join('\n') || '(none)',
      text: lastScan.text.slice(0, 3500),
    });
    const r = await generateStream([prompt], { privacy: privacy(), cloudModel }, (soFar) => { ap.textContent = soFar; });
    ap.textContent = r.text;
    li.append(badge(r));
    announce(r.text);
  } catch (err) {
    ap.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    ap.className = 'a error';
    announce(ap.textContent);
  } finally { setBusy(btn, false, 'Ask'); }
}

$('recheck').addEventListener('click', () => void runAudit());
$('ask-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>('ask-q');
  void ask(input.value);
  input.value = '';
});
document.querySelectorAll<HTMLButtonElement>('.suggest .chip').forEach((b) => b.addEventListener('click', () => void ask(b.textContent ?? '')));
