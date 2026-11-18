import { beforeEach, describe, expect, it } from 'vitest';
import { extractMainText, findImageIssues, findImagesOk, findLinkIssues, looksLikeFilename } from '../src/lib/scan';

function setSize(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { value: w });
  Object.defineProperty(img, 'naturalHeight', { value: h });
}

describe('looksLikeFilename', () => {
  it.each(['IMG_2041.jpg', 'hero-banner_v2.png', 'DSC0001', 'photo-12'])('flags %s', (s) => expect(looksLikeFilename(s)).toBe(true));
  it.each(['A golden retriever on a beach', 'Company logo', 'Chart of sales by month'])('accepts %s', (s) => expect(looksLikeFilename(s)).toBe(false));
});

describe('findImageIssues', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('finds missing, filename and generic alt; ignores decorative and tiny images', () => {
    document.body.innerHTML = `
      <img id="a" src="https://x.test/a.jpg">
      <img id="b" src="https://x.test/b.jpg" alt="IMG_2041.jpg">
      <img id="c" src="https://x.test/c.jpg" alt="image">
      <img id="d" src="https://x.test/d.jpg" alt="">
      <img id="e" src="https://x.test/e.jpg" alt="A red bicycle">
      <img id="f" src="https://x.test/f.gif">
      <img id="g" src="https://x.test/g.jpg" aria-hidden="true">`;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'g']) setSize(document.getElementById(id) as HTMLImageElement, 300, 200);
    setSize(document.getElementById('f') as HTMLImageElement, 1, 1); // tracking pixel

    const issues = findImageIssues(document);
    expect(issues.map((i) => i.reason)).toEqual(['missing-alt', 'filename-alt', 'generic-alt']);
    expect(new Set(issues.map((i) => i.id)).size).toBe(3);
    expect(document.getElementById('a')!.getAttribute('data-lumen-id')).toBe(issues[0].id);
  });

  it('lists checked images that are already fine, with the reason, and leaves out tracking pixels', () => {
    document.body.innerHTML = `
      <img id="a" src="https://x.test/a.jpg">
      <img id="d" src="https://x.test/d.jpg" alt="">
      <img id="e" src="https://x.test/e.jpg" alt="A red bicycle">
      <img id="f" src="https://x.test/f.gif">
      <img id="g" src="https://x.test/g.jpg" aria-hidden="true">`;
    for (const id of ['a', 'd', 'e', 'g']) setSize(document.getElementById(id) as HTMLImageElement, 300, 200);
    setSize(document.getElementById('f') as HTMLImageElement, 1, 1);

    const ok = findImagesOk(document);
    expect(ok.map((o) => [o.why, o.alt])).toEqual([['decorative', ''], ['has-alt', 'A red bicycle'], ['hidden', '']]);
    expect(ok.every((o) => o.id.startsWith('lumen-'))).toBe(true);
    // every non-pixel image is reported exactly once, either as an issue or as OK
    expect(findImageIssues(document).length + ok.length).toBe(4);
  });
});

describe('findLinkIssues', () => {
  it('flags vague and empty links, keeps descriptive ones, and captures context', () => {
    document.body.innerHTML = `
      <p>Our 2026 annual report is out. <a href="/report.pdf">Click here</a>.</p>
      <p><a href="/pricing">See pricing plans</a></p>
      <a href="/x"></a>
      <a href="/home"><img src="/logo.png" alt="Home"></a>
      <a href="/y" aria-label="Download the annual report">read more</a>`;
    const issues = findLinkIssues(document);
    expect(issues.map((i) => i.text)).toEqual(['Click here', '']);
    expect(issues[0].context).toContain('annual report');
  });
});

describe('extractMainText', () => {
  it('prefers <main> and keeps headings and paragraphs', () => {
    document.body.innerHTML = `<nav><p>Menu stuff</p></nav><main><h1>Title</h1><p>First   paragraph.</p><ul><li>Item</li></ul></main>`;
    expect(extractMainText(document)).toBe('Title\nFirst paragraph.\nItem');
  });
});
