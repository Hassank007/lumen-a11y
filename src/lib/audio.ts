/**
 * Audio helpers for voice questions. Chrome records WebM/Opus, which cloud Gemini
 * doesn't accept, so recordings are decoded and re-encoded as 16 kHz mono WAV.
 */

/** Mixes channels down to mono and resamples linearly to the target rate. */
export function toMono16k(channels: Float32Array[], sampleRate: number, target = 16000): Float32Array {
  const len = channels[0]?.length ?? 0;
  const mono = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) mono[i] += ch[i] / channels.length;
  if (sampleRate === target) return mono;
  const outLen = Math.floor((len * target) / sampleRate);
  const out = new Float32Array(outLen);
  const step = sampleRate / target;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const j = Math.floor(pos);
    const frac = pos - j;
    out[i] = (mono[j] ?? 0) * (1 - frac) + (mono[j + 1] ?? mono[j] ?? 0) * frac;
  }
  return out;
}

/** 16-bit PCM WAV file bytes. */
export function encodeWav(samples: Float32Array, sampleRate = 16000): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

export function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Decodes a recorded blob (any format Chrome can play) into a 16 kHz WAV blob. */
export async function recordingToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    const wav = encodeWav(toMono16k(channels, audio.sampleRate));
    return new Blob([wav], { type: 'audio/wav' });
  } finally { void ctx.close(); }
}
