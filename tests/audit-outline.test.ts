import { describe, expect, it } from 'vitest';
import { issueCount, summarizeAxe } from '../src/lib/audit';
import { extractOutline, nameOf } from '../src/lib/scan';
import { DEFAULT_PROMPTS, fill } from '../src/lib/prompts';

describe('summarizeAxe', () => {
  it('counts element instances, sorts by impact and marks rules Lumen fixes', () => {
    const s = summarizeAxe([
      { id: 'color-contrast', help: 'Contrast', impact: 'serious', nodes: [1, 2, 3] },
      { id: 'image-alt', help: 'Images need alt', impact: 'critical', nodes: [1, 2] },
      { id: 'region', help: 'Landmarks', impact: 'moderate', nodes: [1] },
    ]);
    expect(s.issues).toBe(6);
    expect(s.rules.map((r) => r.id)).toEqual(['image-alt', 'color-contrast', 'region']);
    expect(s.rules[0].fixable).toBe(2);
    expect(s.rules[1].fixable).toBe(0);
  });

  it('handles a clean page', () => {
    expect(summarizeAxe([])).toEqual({ issues: 0, rules: [] });
    expect(issueCount(1)).toBe('1 issue');
    expect(issueCount(0)).toBe('0 issues');
  });
});

describe('extractOutline', () => {
  it('lists headings with levels and controls by accessible name, skipping hidden ones', () => {
    document.body.innerHTML = `
      <h1>Shop</h1><h2>Checkout</h2><div hidden><h2>Secret</h2></div>
      <a href="/cart" aria-label="Your cart">🛒</a>
      <button>Pay now</button>
      <label for="e">Email</label><input id="e" type="email">
      <input type="search" placeholder="Search products">
      <input type="hidden" name="t">
      <a href="/x"><img src="a.png" alt="Home"></a>`;
    const o = extractOutline(document);
    expect(o.headings).toEqual(['h1: Shop', 'h2: Checkout']);
    expect(o.controls).toEqual(['link: Your cart', 'button: Pay now', 'field: Email', 'field: Search products', 'link: Home']);
  });

  it('uses aria-labelledby for names', () => {
    document.body.innerHTML = '<span id="l">Close menu</span><button aria-labelledby="l">×</button>';
    expect(nameOf(document.querySelector('button')!)).toBe('Close menu');
  });
});

describe('ask prompt', () => {
  it('fills every placeholder', () => {
    const p = fill(DEFAULT_PROMPTS.ask, { question: 'Q?', title: 'T', headings: 'H', controls: 'C', text: 'X' });
    expect(p).toContain('Question: Q?');
    expect(p).not.toMatch(/\{\w+\}/);
  });
});
