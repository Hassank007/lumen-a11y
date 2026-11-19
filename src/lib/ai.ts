import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type GenerativeModel, type InferenceSource, type Part } from 'firebase/ai';
import { getFirebaseApp, isConfigured } from './firebase';

export type Privacy = 'hybrid' | 'device-only';

export interface AIResult {
  text: string;
  source: InferenceSource | 'unknown';
  ms: number;
}

const models = new Map<string, GenerativeModel>();

/**
 * Hybrid model via Firebase AI Logic: Gemini Nano on the device first
 * (private, offline, free), Gemini in the cloud as a fallback.
 * "device-only" never sends page content off the machine.
 */
function model(privacy: Privacy, withImages: boolean, cloudModel: string): GenerativeModel {
  const key = `${privacy}:${withImages}:${cloudModel}`;
  const cached = models.get(key);
  if (cached) return cached;
  if (!isConfigured) throw new Error('Firebase is not configured. Copy .env.example to .env.local and fill it in.');
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const m = getGenerativeModel(ai, {
    mode: privacy === 'device-only' ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: withImages ? { createOptions: { expectedInputs: [{ type: 'image' }] } } : undefined,
    inCloudParams: { model: cloudModel },
  });
  models.set(key, m);
  return m;
}

export async function generate(
  parts: Array<string | Part>,
  opts: { privacy: Privacy; cloudModel: string; withImages?: boolean },
): Promise<AIResult> {
  const t0 = performance.now();
  const res = await model(opts.privacy, Boolean(opts.withImages), opts.cloudModel).generateContent(parts);
  return {
    text: res.response.text().trim(),
    source: res.response.inferenceSource ?? 'unknown',
    ms: Math.round(performance.now() - t0),
  };
}

/**
 * Streaming version: calls onText with the text so far as it arrives, so long
 * answers (plain-language rewrites) show progress instead of a long wait.
 */
export async function generateStream(
  parts: Array<string | Part>,
  opts: { privacy: Privacy; cloudModel: string },
  onText: (textSoFar: string) => void,
): Promise<AIResult> {
  const t0 = performance.now();
  const res = await model(opts.privacy, false, opts.cloudModel).generateContentStream(parts);
  let text = '';
  for await (const chunk of res.stream) {
    text += chunk.text();
    onText(text);
  }
  const final = await res.response;
  return {
    text: text.trim(),
    source: final.inferenceSource ?? 'unknown',
    ms: Math.round(performance.now() - t0),
  };
}

/** Fetch an image the page shows and turn it into an inline part the model can read. */
export async function imagePart(src: string): Promise<Part> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status})`);
  const blob = await resp.blob();
  const mimeType = blob.type || 'image/png';
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return { type: 'inlineData', inlineData: { mimeType, data } };
}

const TRANSCRIBE_PROMPT =
  'Transcribe this spoken question exactly, in the language it is spoken. Reply with the question text only, no quotes, no extra words.';

interface ChromeLanguageModel {
  availability(o?: unknown): Promise<string>;
  create(o?: unknown): Promise<{ prompt(input: unknown): Promise<string>; destroy(): void }>;
}

const AUDIO_IN = { expectedInputs: [{ type: 'audio' }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

function chromeLM(): ChromeLanguageModel | undefined {
  return (globalThis as unknown as { LanguageModel?: ChromeLanguageModel }).LanguageModel;
}

/** "available", "downloadable", "downloading" or "unavailable": can Gemini Nano hear audio on this device? */
export async function voiceAvailability(): Promise<string> {
  const lm = chromeLM();
  if (!lm) return 'unavailable';
  return lm.availability(AUDIO_IN).catch(() => 'unavailable');
}

/**
 * Speech to text for voice questions. Firebase AI Logic's on-device path accepts
 * only images, so on the device this calls Chrome's built-in Gemini Nano directly
 * (Prompt API, audio input). The first time, Chrome may need to download audio
 * support for Nano; Lumen does that (the click counts as the user's go-ahead) and
 * reports progress. If Nano can't hear audio here at all, hybrid mode falls back
 * to Gemini in the cloud through Firebase AI Logic; device-only mode never does.
 */
export async function transcribe(
  wav: Blob,
  opts: { privacy: Privacy; cloudModel: string; onDownload?: (fraction: number) => void },
): Promise<AIResult> {
  const t0 = performance.now();
  const lm = chromeLM();
  const avail = await voiceAvailability();
  if (lm && avail !== 'unavailable') {
    try {
      const session = await lm.create({
        ...AUDIO_IN,
        monitor(m: EventTarget) {
          m.addEventListener('downloadprogress', (e) => opts.onDownload?.((e as Event & { loaded: number }).loaded));
        },
      });
      try {
        const text = await session.prompt([{ role: 'user', content: [{ type: 'text', value: TRANSCRIBE_PROMPT }, { type: 'audio', value: wav }] }]);
        return { text: text.trim(), source: 'on_device', ms: Math.round(performance.now() - t0) };
      } finally { session.destroy(); }
    } catch (err) {
      if (opts.privacy === 'device-only') throw err;
      console.warn('Lumen: on-device voice failed, using the cloud', err);
    }
  }
  if (opts.privacy === 'device-only') {
    throw new Error('Voice questions need Gemini Nano with audio on this device. Type your question, or allow the cloud in Privacy.');
  }
  if (!isConfigured) throw new Error('Firebase is not configured.');
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: opts.cloudModel } });
  const { base64 } = await import('./audio');
  const data = base64(new Uint8Array(await wav.arrayBuffer()));
  const res = await cloud.generateContent([TRANSCRIBE_PROMPT, { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data } }]);
  return { text: res.response.text().trim(), source: res.response.inferenceSource ?? 'in_cloud', ms: Math.round(performance.now() - t0) };
}
