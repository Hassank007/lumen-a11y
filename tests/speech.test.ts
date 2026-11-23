import { describe, expect, it } from 'vitest';
import { pickLocalVoice, sourceLabel } from '../src/lib/speech';

describe('pickLocalVoice', () => {
  const remote = { localService: false, lang: 'en-US' };
  const localEn = { localService: true, lang: 'en-GB' };
  const localDe = { localService: true, lang: 'de-DE' };
  it('prefers an installed English voice, then any installed voice', () => {
    expect(pickLocalVoice([remote, localDe, localEn])).toBe(localEn);
    expect(pickLocalVoice([remote, localDe])).toBe(localDe);
  });
  it('never picks an online voice', () => {
    expect(pickLocalVoice([remote])).toBeNull();
    expect(pickLocalVoice([])).toBeNull();
  });
});

describe('sourceLabel', () => {
  it('names the device or cloud, and admits when the source is unknown', () => {
    expect(sourceLabel('on_device')).toBe('On device');
    expect(sourceLabel('in_cloud')).toBe('Cloud');
    expect(sourceLabel('unknown')).toBe('Source not reported');
  });
});
