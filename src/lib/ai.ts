/**
 * All of Lumen's AI goes through Firebase AI Logic. The mode for each request
 * comes from policy.ts.
 */
import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel, type GenerativeModel, type InferenceSource, type Part } from 'firebase/ai';
import { getFirebaseApp, isConfigured } from './firebase';
import { base64 } from './audio';

export interface AIResult {
  text: string;
  source: InferenceSource | 'unknown';
  ms: number;
}

export interface AIOptions { mode: InferenceMode; cloudModel: string; withImages?: boolean }

const models = new Map<string, GenerativeModel>();

function model({ mode, cloudModel, withImages = false }: AIOptions): GenerativeModel {
  if (!isConfigured && mode !== InferenceMode.ONLY_ON_DEVICE) {
    throw new Error('This copy of Lumen has no cloud AI set up. See "Try it" in the README.');
  }
  const key = `${mode}:${withImages}:${cloudModel}`;
  const cached = models.get(key);
  if (cached) return cached;
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const m = getGenerativeModel(ai, {
    mode,
    onDeviceParams: {
      createOptions: {
        expectedInputs: withImages ? [{ type: 'text', languages: ['en'] }, { type: 'image' }] : [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      },
    },
    inCloudParams: { model: cloudModel },
  });
  models.set(key, m);
  return m;
}

/** A failure the user can act on: the page is kept on the device, but the device has no model. */
export class OnDeviceUnavailable extends Error {}

function explain(err: unknown, mode: InferenceMode): Error {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = (err as { code?: string } | null)?.code ?? '';
  if (mode === InferenceMode.ONLY_ON_DEVICE && /api-not-enabled|unsupported/.test(code)) {
    return new OnDeviceUnavailable("On-device AI isn't available in this browser, so Lumen stopped. Nothing was sent to cloud AI.");
  }
  if (/QuotaExceeded|too (long|large)/i.test(`${e.name} ${e.message}`)) {
    return new Error('That is more than the on-device model can read at once.');
  }
  return e;
}

// The SDK keeps one on-device session per model and closes it when the next request
// starts, so two requests at once would cut each other off. They wait their turn here.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

export function generate(parts: Array<string | Part>, opts: AIOptions): Promise<AIResult> {
  return inTurn(async () => {
    const t0 = performance.now();
    try {
      const res = await model(opts).generateContent(parts);
      return { text: res.response.text().trim(), source: res.response.inferenceSource ?? 'unknown', ms: Math.round(performance.now() - t0) };
    } catch (err) { throw explain(err, opts.mode); }
  });
}

/**
 * Streaming version: calls onText with the text so far as it arrives, so long
 * answers (plain-language rewrites) show progress instead of a long wait.
 * Return false from onText to stop early.
 */
export function generateStream(
  parts: Array<string | Part>,
  opts: AIOptions,
  onText: (textSoFar: string) => boolean | void,
): Promise<AIResult> {
  return inTurn(async () => {
    const t0 = performance.now();
    try {
      const res = await model(opts).generateContentStream(parts);
      let text = '';
      for await (const chunk of res.stream) {
        text += chunk.text();
        if (onText(text) === false) return { text: text.trim(), source: chunk.inferenceSource ?? 'unknown', ms: Math.round(performance.now() - t0) };
      }
      const final = await res.response;
      return { text: text.trim(), source: final.inferenceSource ?? 'unknown', ms: Math.round(performance.now() - t0) };
    } catch (err) { throw explain(err, opts.mode); }
  });
}

/** Downloads Chrome's on-device model through Firebase AI Logic. Only called when the user asks for it. */
export async function downloadDeviceModel(cloudModel: string, onProgress: (fraction: number) => void): Promise<void> {
  await model({ mode: InferenceMode.ONLY_ON_DEVICE, cloudModel, withImages: true }).initializeDeviceModel(onProgress);
}

const TRANSCRIBE_PROMPT =
  'Transcribe this spoken question exactly, in the language it is spoken. Reply with the question text only, no quotes, no extra words.';

/**
 * Speech to text for voice questions. Firebase AI Logic's on-device path does not
 * take audio, so this is always the cloud. The side panel only offers it where
 * the policy allows the cloud.
 */
export async function transcribe(wav: Blob, cloudModel: string): Promise<AIResult> {
  const data = base64(new Uint8Array(await wav.arrayBuffer()));
  return generate([TRANSCRIBE_PROMPT, { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data } }], { mode: InferenceMode.ONLY_IN_CLOUD, cloudModel });
}
