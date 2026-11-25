import type { Part } from 'firebase/ai';

/** Firebase AI Logic's on-device path accepts only these. Many sites now serve WebP or AVIF, so everything else is converted. */
export const ON_DEVICE_TYPES = ['image/jpeg', 'image/png'];
/** Longest side sent to the model. Bigger images cost time and memory without better alt text. */
export const MAX_SIDE = 1024;

/** Size that fits in MAX_SIDE, keeping the shape. SVGs may report no size, so they get a sensible one. */
export function fitSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  if (!w || !h) return { width: 512, height: 512 };
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

async function decode(blob: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; done(): void }> {
  if (!blob.type.startsWith('image/svg')) {
    try {
      const bmp = await createImageBitmap(blob);
      return { image: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch { /* fall through to <img>, which copes with more formats */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Lumen couldn't read this image's format.");
  }
}

async function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Any image a browser can show, as a JPEG or PNG of a sensible size. The conversion happens on this computer. */
export async function toModelImage(blob: Blob): Promise<Blob> {
  const d = await decode(blob);
  try {
    const size = fitSize(d.width, d.height);
    if (ON_DEVICE_TYPES.includes(blob.type) && size.width === d.width && size.height === d.height) return blob;
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Lumen couldn't prepare this image.");
    // Transparent images get a white background, as on most pages.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(d.image, 0, 0, size.width, size.height);
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!out) throw new Error("Lumen couldn't prepare this image.");
    return out;
  } finally { d.done(); }
}

/** Fetch an image the page shows and turn it into an inline part the model can read. */
export async function imagePart(src: string): Promise<Part> {
  const resp = await fetch(src);
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status})`);
  const blob = await toModelImage(await resp.blob());
  return { type: 'inlineData', inlineData: { mimeType: blob.type, data: await toBase64(blob) } };
}

/** A link address without its query string or fragment, which can hold private tokens. */
export function safeHref(href: string): string {
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname}` : u.protocol;
  } catch { return ''; }
}
