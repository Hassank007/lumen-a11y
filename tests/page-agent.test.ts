import { beforeEach, describe, expect, it } from 'vitest';
import { applyAlt, applyLink, isListed, undo } from '../src/lib/page-agent';
import { summarizeAxe } from '../src/lib/audit';
import { extractOutline, extractPageBlocks, findImageIssues, findLinkIssues, nameOf } from '../src/lib/scan';
import { pickRelevant, splitText } from '../src/lib/relevance';

beforeEach(() => { document.body.innerHTML = ''; });

function sized(selector: string) {
  document.querySelectorAll<HTMLImageElement>(selector).forEach((img) => {
    Object.defineProperty(img, 'naturalWidth', { value: 300 });
    Object.defineProperty(img, 'naturalHeight', { value: 200 });
  });
}

describe('names that screen readers use', () => {
  it('does not flag images named by aria-label, aria-labelledby or title, or hidden by an ancestor', () => {
    document.body.innerHTML = `<span id="n">Harbour at dawn</span>
      <img src="a.webp" aria-label="A red bicycle"><img src="b.webp" aria-labelledby="n"><img src="c.webp" title="Map">
      <div aria-hidden="true"><img src="d.webp"></div><img src="e.webp">`;
    sized('img');
    expect(findImageIssues(document).map((i) => i.src.slice(-6))).toEqual(['e.webp']);
  });
  it('does not flag links whose aria-labelledby already says where they go', () => {
    document.body.innerHTML = `<h2 id="h">Annual report 2026</h2><a id="l" href="/r" aria-labelledby="h l">Read more</a><a href="/s" aria-labelledby="gone">Read more</a>`;
    expect(findLinkIssues(document).map((l) => l.href.slice(-2))).toEqual(['/s']);
  });
  it('ignores hidden text, styles and decorative parts inside a link', () => {
    document.body.innerHTML = '<a href="/x"><style>.a{}</style><span aria-hidden="true">★</span><svg><title>Star</title></svg> here</a>';
    expect(nameOf(document.querySelector('a')!)).toBe('Star here');
  });
  it('lists an image link once, as an image', () => {
    document.body.innerHTML = '<a href="/home"><img src="logo.png"></a>';
    sized('img');
    expect(findImageIssues(document)).toHaveLength(1);
    expect(findLinkIssues(document)).toHaveLength(0);
  });
});

describe('applying and undoing fixes', () => {
  it('makes the fix the spoken name even when the page used aria-labelledby, and undo restores the page', () => {
    document.body.innerHTML = '<span id="n">here</span><a href="/r" aria-labelledby="n">Read more</a>';
    const before = document.querySelector('a')!.outerHTML;
    const [issue] = findLinkIssues(document);
    expect(applyLink(document, issue.id, 'Annual report')).toBe(true);
    expect(nameOf(document.querySelector('a')!)).toBe('Annual report');
    expect(applyLink(document, issue.id, 'Annual report 2026')).toBe(true);
    expect(undo(document, issue.id)).toBe(true);
    const a = document.querySelector('a')!;
    a.removeAttribute('data-lumen-id');
    expect(a.outerHTML).toBe(before);
    expect(undo(document, issue.id)).toBe(false);
  });
  it('keeps visible words in the name when a link holds other elements', () => {
    document.body.innerHTML = '<a href="/r"><b>More</b></a>';
    const [issue] = findLinkIssues(document);
    applyLink(document, issue.id, 'about adoption');
    expect(nameOf(document.querySelector('a')!)).toBe('More: about adoption');
  });
  it('sets, clears and restores alt text', () => {
    document.body.innerHTML = '<img src="a.png">';
    sized('img');
    const img = document.querySelector('img')!;
    const [issue] = findImageIssues(document);
    applyAlt(document, issue.id, 'A red bicycle');
    expect(img.getAttribute('alt')).toBe('A red bicycle');
    applyAlt(document, issue.id, 'DECORATIVE');
    expect(img.getAttribute('alt')).toBe('');
    undo(document, issue.id);
    expect(img.hasAttribute('alt')).toBe(false);
  });
  it('refuses ids it did not make', () => {
    expect(applyAlt(document, '"] , body', 'x')).toBe(false);
  });
});

describe('what Lumen says it can fix', () => {
  it('counts only elements it lists', () => {
    document.body.innerHTML = '<img id="a" src="a.png"><svg id="s" role="img"></svg><map><area id="m" href="/x"></map><a id="l" href="/h"><img id="b" src="b.png"></a>';
    sized('img');
    const listed = new Set([...findImageIssues(document), ...findLinkIssues(document)].map((i) => i.id));
    const can = (t: unknown[]) => isListed(document, { target: t }, listed);
    expect(can(['#a'])).toBe(true);
    expect(can(['#l'])).toBe(true); // its image is listed
    expect(can(['#s'])).toBe(false);
    expect(can(['#frame', '#a'])).toBe(false); // inside a frame
    const s = summarizeAxe([
      { id: 'image-alt', help: 'i', impact: 'critical', nodes: [{ target: ['#a'] }, { target: ['#frame', 'img'] }] },
      { id: 'role-img-alt', help: 'r', impact: 'serious', nodes: [{ target: ['#s'] }] },
      { id: 'area-alt', help: 'm', impact: 'critical', nodes: [{ target: ['#m'] }] },
    ], (n) => isListed(document, n, listed));
    expect(s.rules.map((r) => [r.id, r.fixable])).toEqual([['image-alt', 1], ['area-alt', 0], ['role-img-alt', 0]]);
  });
});

describe('answering from the whole page', () => {
  it('finds footers and table rows, main content first', () => {
    document.body.innerHTML = `<header><nav>${Array.from({ length: 300 }, (_, i) => `<a href="/p${i}">Menu item ${i}</a> `).join('')}</nav></header>
      <main><h1>Clinic</h1><p>Welcome.</p><table><tr><th>Monday</th><td>9 am to 5 pm</td></tr></table><div>Walk-ins until noon.</div></main>
      <footer><p>Call 01632 960123</p><a href="/contact">Contact us</a></footer>`;
    const blocks = extractPageBlocks(document);
    expect(blocks.slice(0, 4)).toEqual(['Clinic', 'Welcome.', 'Monday | 9 am to 5 pm', 'Walk-ins until noon.']);
    expect(pickRelevant(blocks, 'How do I contact them?', 400, 100)).toContain('Call 01632 960123');
    const controls = pickRelevant(extractOutline(document).controls, 'How do I contact them?', 500);
    expect(controls).toContain('link: Contact us');
    expect(controls.join('\n').length).toBeLessThan(500);
  });
  it('keeps the opening text, stays in budget and in page order', () => {
    const items = ['Title', 'Intro text here', ...Array.from({ length: 50 }, (_, i) => `Filler paragraph number ${i}`), 'Opening hours: Monday 9 to 5'];
    const picked = pickRelevant(items, 'When are they open?', 200, 60);
    expect(picked[0]).toBe('Title');
    expect(picked).toContain('Opening hours: Monday 9 to 5');
    expect(picked.join('\n').length).toBeLessThanOrEqual(200);
    expect(picked).toEqual(items.filter((i) => picked.includes(i)));
  });
});

describe('splitText', () => {
  it('keeps every character of the content and respects the limit', () => {
    const text = [...Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${'word '.repeat(30)}`), 'x'.repeat(9000), `${'A long sentence. '.repeat(400)}`].join('\n');
    const parts = splitText(text, 3500);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(3500);
    expect(parts.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''));
  });
});
