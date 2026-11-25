/**
 * Turns an axe-core result into a small summary for the side panel:
 * how many problems (element instances) and which rules, marking the rules
 * Lumen itself can fix. Pure, so it is unit-tested without a browser.
 */

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** axe rules that Lumen's fixes can resolve. Only the places Lumen really lists are counted (see page-agent.ts). */
export const LUMEN_FIXABLE = new Set(['image-alt', 'link-name']);

export interface AuditRule {
  id: string;
  help: string;
  impact: string;
  count: number;
  /** How many of those places Lumen lists with a fix. */
  fixable: number;
}

export interface AuditSummary {
  issues: number;   // element instances across all violated rules
  rules: AuditRule[];
}

export interface AxeLikeViolation { id: string; help: string; impact?: string | null; nodes: unknown[] }

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/** canFix says whether Lumen offers a fix for this exact element. */
export function summarizeAxe(violations: AxeLikeViolation[], canFix: (node: unknown) => boolean = () => true): AuditSummary {
  const rules = violations
    .map((v) => ({ id: v.id, help: v.help, impact: v.impact ?? 'minor', count: v.nodes.length, fixable: LUMEN_FIXABLE.has(v.id) ? v.nodes.filter(canFix).length : 0 }))
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9) || b.count - a.count);
  return { issues: rules.reduce((n, r) => n + r.count, 0), rules };
}

/** "14 issues" / "1 issue" */
export function issueCount(n: number): string {
  return `${n} issue${n === 1 ? '' : 's'}`;
}

/** "6 barriers" / "1 barrier" */
export function barrierCount(n: number): string {
  return `${n} barrier${n === 1 ? '' : 's'}`;
}

/** What the user reads first: plain words, no scores. */
export function barrierSummary(before: AuditSummary, now: AuditSummary | null): string {
  if (before.issues === 0) return "The automatic check found no barriers on this page. It can't catch everything, so you can still ask Lumen about the page.";
  if (!now) {
    const fixable = before.rules.reduce((n, r) => n + r.fixable, 0);
    const owner = before.issues - fixable;
    if (fixable === 0) return `This page has ${barrierCount(before.issues)} Lumen can't fix. You can tell the site owner.`;
    return `This page has ${barrierCount(before.issues)}. Lumen can fix ${fixable} of them for you below${owner ? `; ${owner} need${owner === 1 ? 's' : ''} the site owner` : ''}.`;
  }
  const fixed = Math.max(0, before.issues - now.issues);
  if (fixed === 0) return barrierSummary(now, null);
  if (now.issues === 0) return `Lumen fixed all ${barrierCount(fixed)} on this page for you.`;
  const canFix = now.rules.reduce((n, r) => n + r.fixable, 0);
  const owner = now.issues - canFix;
  const parts = [`Lumen fixed ${barrierCount(fixed)} on this page.`];
  if (canFix) parts.push(`${canFix} more can be fixed below.`);
  if (owner) parts.push(`${owner} need${owner === 1 ? 's' : ''} the site owner.`);
  return parts.join(' ');
}

/** A short, polite message a visitor can send to the site owner. Lumen's fixes are only in this browser, so it lists everything found. */
export function ownerMessage(page: { title: string; url: string }, before: AuditSummary): string {
  const lines = before.rules.map((r) => `- ${r.help} (${r.count} ${r.count === 1 ? 'place' : 'places'})`);
  return [
    'Hello,',
    '',
    `I had trouble using your page "${page.title}" (${page.url}). An automatic accessibility check (axe-core, WCAG 2.2) found these problems:`,
    '',
    ...lines,
    '',
    'Fixing them would help disabled visitors, including people who use screen readers, use your site. Thank you!',
  ].join('\n');
}
