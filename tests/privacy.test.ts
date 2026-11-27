import { beforeEach, describe, expect, it } from 'vitest';
import { InferenceMode } from 'firebase/ai';
import { checkSensitive, reasonsFromUrl } from '../src/lib/sensitive';
import { modeFor, policySummary, type PolicyInput } from '../src/lib/policy';
import { fitSize, safeHref } from '../src/lib/image';

describe('reasonsFromUrl', () => {
  it.each([
    'https://www.nhs.uk/', 'https://www.healthline.com/nutrition', 'https://my.examplebank.com/', 'https://example.org/login',
    'https://example.org/account/orders', 'https://portal.example.edu/', 'https://mail.google.com/mail/u/0/', 'https://www.gov.example/benefits/legal',
    'https://example.com/sign-in', 'http://192.168.1.20/wiki', 'file:///C:/letters/doctor.html', 'https://www.bbc.com/news/health-12345678',
  ])('treats %s as private', (u) => expect(reasonsFromUrl(u).length).toBeGreaterThan(0));

  it.each([
    'https://www.bbc.com/', 'https://www.theguardian.com/international', 'https://en.wikipedia.org/wiki/Guide_dog', 'https://example.com/football/results',
    'https://example.com/terms-and-conditions', 'https://www.unicef.org/', 'https://example.com/riverbanks', 'http://localhost:8765/demo.html',
  ])('treats %s as ordinary', (u) => expect(reasonsFromUrl(u)).toEqual([]));
});

describe('checkSensitive', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.title = 'Shop'; });
  const check = (html: string) => { document.body.innerHTML = html; return checkSensitive(document, 'https://example.com/'); };

  it('notices password fields, card fields and personal questions, but not hidden ones', () => {
    expect(check('<input type="password">').reasons).toEqual(['it has a password field']);
    expect(check('<input autocomplete="cc-number">').sensitive).toBe(true);
    expect(check('<label for="d">Date of birth</label><input id="d">').reasons).toEqual(['a form asks about "date of birth"']);
    expect(check('<div hidden><input type="password"></div>').sensitive).toBe(false);
  });
  it('notices private topics in the title and main heading', () => {
    expect(check('<h1>Your test results</h1>').reasons).toEqual(['its title or main heading says "test results"']);
    expect(check('<h1>Find your new best friend</h1><p>Search our symptoms page</p>').sensitive).toBe(false);
  });
});

describe('modeFor', () => {
  const base: PolicyInput = { choice: 'auto', sensitive: false, cloudAllowed: false, cloudConfigured: true };
  it('ordinary pages prefer the device, and long text prefers the cloud', () => {
    expect(modeFor(base)).toBe(InferenceMode.PREFER_ON_DEVICE);
    expect(modeFor({ ...base, long: true })).toBe(InferenceMode.PREFER_IN_CLOUD);
  });
  it('private pages never use the cloud, even for long text, until the user allows it', () => {
    expect(modeFor({ ...base, sensitive: true })).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeFor({ ...base, sensitive: true, long: true })).toBe(InferenceMode.ONLY_ON_DEVICE);
    expect(modeFor({ ...base, sensitive: true, cloudAllowed: true })).toBe(InferenceMode.PREFER_ON_DEVICE);
  });
  it('"Only on my device" always wins, and a build with no Firebase project stays on the device', () => {
    for (const sensitive of [true, false]) for (const cloudAllowed of [true, false]) for (const long of [true, false]) {
      expect(modeFor({ choice: 'device-only', sensitive, cloudAllowed, cloudConfigured: true, long })).toBe(InferenceMode.ONLY_ON_DEVICE);
      expect(modeFor({ choice: 'auto', sensitive, cloudAllowed, cloudConfigured: false, long })).toBe(InferenceMode.ONLY_ON_DEVICE);
    }
  });
  it('explains the choice in plain words', () => {
    expect(policySummary({ ...base, sensitive: true }, ['it has a password field'])).toBe('This page looks private: it has a password field. Lumen is using only on-device AI here.');
    expect(policySummary(base, [])).toMatch(/doesn't look private/);
  });
  it('after the user moves to another page, says the summary is for the scanned page', () => {
    expect(policySummary(base, [], true)).toMatch(/^The page you scanned doesn't look private\..* Scan again to check the page that's open now\.$/);
    expect(policySummary({ ...base, sensitive: true }, ['it has a password field'], true)).toBe("The page you scanned looks private: it has a password field. Lumen is using only on-device AI here. Scan again to check the page that's open now.");
    expect(policySummary({ ...base, choice: 'device-only' }, [], true)).toBe(policySummary({ ...base, choice: 'device-only' }, []));
  });
});

describe('image and link preparation', () => {
  it('shrinks large images, keeps small ones, and copes with SVGs that report no size', () => {
    expect(fitSize(4000, 2000)).toEqual({ width: 1024, height: 512 });
    expect(fitSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(fitSize(0, 0)).toEqual({ width: 512, height: 512 });
  });
  it('drops query strings and fragments from link addresses', () => {
    expect(safeHref('https://x.example/reset?token=abc#top')).toBe('https://x.example/reset');
    expect(safeHref('mailto:someone@x.example')).toBe('mailto:');
    expect(safeHref('not a url')).toBe('');
  });
});
