/** Read-aloud and badge helpers. Pure, so they are unit-tested without a browser. */

interface VoiceLike { localService: boolean; lang: string }

/**
 * A voice installed on this computer, English first. Returns null if there is none:
 * some Chrome voices send the text to an online service, so Lumen must not fall
 * back to the browser's default voice.
 */
export function pickLocalVoice<T extends VoiceLike>(voices: T[]): T | null {
  return voices.find((v) => v.localService && v.lang.startsWith('en')) ?? voices.find((v) => v.localService) ?? null;
}

/** Badge text for where an answer ran. Says so plainly when the source is not reported. */
export function sourceLabel(source: string): string {
  return source === 'on_device' ? 'On device' : source === 'in_cloud' ? 'Cloud' : 'Source not reported';
}
