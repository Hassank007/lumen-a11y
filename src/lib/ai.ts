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
