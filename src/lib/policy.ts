/**
 * Where each AI request may run. This is the heart of Lumen's hybrid design:
 * the page and the task choose the Firebase AI Logic mode, not one global switch.
 */
import { InferenceMode } from 'firebase/ai';

export type PrivacyChoice = 'auto' | 'device-only';

export interface PolicyInput {
  choice: PrivacyChoice;
  /** The scanned page looks private (see sensitive.ts). */
  sensitive: boolean;
  /** The user pressed "Allow cloud AI for this page". */
  cloudAllowed: boolean;
  /** This build has a Firebase project, so a cloud model exists. */
  cloudConfigured: boolean;
  /** More text than LONG_TEXT. */
  long?: boolean;
}

/** Longer text than this prefers the cloud on ordinary pages (a 5,600-character page took 68 seconds on the development laptop), and is worked through in parts on the device. */
export const LONG_TEXT = 4000;

export function cloudPermitted(p: PolicyInput): boolean {
  if (!p.cloudConfigured || p.choice === 'device-only') return false;
  return !p.sensitive || p.cloudAllowed;
}

export function modeFor(p: PolicyInput): InferenceMode {
  if (!cloudPermitted(p)) return InferenceMode.ONLY_ON_DEVICE;
  return p.long ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE;
}

/** One plain sentence or two about this page, shown after a scan. */
/** `stale`: the user has moved to another page since the scan; the summary still describes the scanned page, and says so. */
export function policySummary(p: PolicyInput, reasons: string[], stale = false): string {
  const s = pageSummary(p, reasons);
  if (!stale || !p.cloudConfigured || p.choice === 'device-only') return s; // these hold for every page
  return `${s.replace(/^This page/, 'The page you scanned')} Scan again to check the page that's open now.`;
}

function pageSummary(p: PolicyInput, reasons: string[]): string {
  if (!p.cloudConfigured) return 'This copy of Lumen has no cloud AI set up, so AI runs only on this device.';
  if (p.choice === 'device-only') return 'Only on my device is on, so no page content goes to cloud AI.';
  if (!p.sensitive) return "This page doesn't look private. AI runs on this device first, and in the cloud if needed or when the text is long.";
  const why = reasons.slice(0, 2).join(', and ');
  if (p.cloudAllowed) return `This page looks private (${why}), but you allowed cloud AI for it.`;
  return `This page looks private: ${why}. Lumen is using only on-device AI here.`;
}
