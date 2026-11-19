import { describe, expect, it } from 'vitest';
import { barrierSummary, ownerMessage, summarizeAxe } from '../src/lib/audit';
import { encodeWav, toMono16k } from '../src/lib/audio';
import { findContactEmail } from '../src/lib/scan';

const before = summarizeAxe([
  { id: 'image-alt', help: 'Images must have alternative text', impact: 'critical', nodes: [1, 2] },
  { id: 'link-name', help: 'Links must have discernible text', impact: 'serious', nodes: [1, 2, 3] },
  { id: 'color-contrast', help: 'Elements must meet minimum color contrast ratio thresholds', impact: 'serious', nodes: [1] },
]);

describe('barrierSummary (what the user reads)', () => {
  it('says what Lumen can fix and what needs the site owner, in plain words', () => {
    expect(barrierSummary(before, null)).toBe('This page has 6 barriers. Lumen can fix 5 of them for you below; 1 needs the site owner.');
  });
  it('reports progress after fixes', () => {
    const now = summarizeAxe([{ id: 'color-contrast', help: 'x', impact: 'serious', nodes: [1] }]);
    expect(barrierSummary(before, now)).toBe('Lumen fixed 5 barriers on this page. 1 needs the site owner.');
    const partial = summarizeAxe([{ id: 'link-name', help: 'x', impact: 'serious', nodes: [1, 2] }, { id: 'color-contrast', help: 'y', impact: 'serious', nodes: [1] }]);
    expect(barrierSummary(before, partial)).toBe('Lumen fixed 3 barriers on this page. 2 more can be fixed below. 1 needs the site owner.');
    expect(barrierSummary(before, summarizeAxe([]))).toBe('Lumen fixed all 6 barriers on this page for you.');
  });
  it('is honest when nothing was found', () => {
    expect(barrierSummary(summarizeAxe([]), null)).toMatch(/can't catch everything/);
  });
});

describe('ownerMessage', () => {
  it('lists every problem found, with counts, and names the page', () => {
    const m = ownerMessage({ title: 'Shelter', url: 'https://x.example/' }, before);
    expect(m).toContain('"Shelter" (https://x.example/)');
    expect(m).toContain('- Links must have discernible text (3 places)');
    expect(m).toContain('(1 place)');
  });
});

describe('findContactEmail', () => {
  it('prefers a mailto link, else an address in the text', () => {
    document.body.innerHTML = '<p>Write to <a href="mailto:a@b.example?subject=hi">us</a>.</p>';
    expect(findContactEmail(document)).toBe('a@b.example');
    document.body.innerHTML = '<p>Email hello@riverside-shelter.example.</p>';
    expect(findContactEmail(document)).toBe('hello@riverside-shelter.example');
    document.body.innerHTML = '<p>No email here</p>';
    expect(findContactEmail(document)).toBeNull();
  });
});

describe('audio', () => {
  it('mixes to mono and resamples 48 kHz to 16 kHz', () => {
    const a = new Float32Array(48000).fill(0.5);
    const b = new Float32Array(48000).fill(-0.5);
    const out = toMono16k([a, a], 48000);
    expect(out.length).toBe(16000);
    expect(out[100]).toBeCloseTo(0.5);
    expect(toMono16k([a, b], 48000)[10]).toBeCloseTo(0);
  });
  it('writes a valid 16-bit PCM WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(40, true)).toBe(6);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
});
