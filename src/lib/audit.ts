/**
 * Turns an axe-core result into a small summary for the side panel:
 * how many problems (element instances) and which rules, marking the rules
 * Lumen itself can fix. Pure, so it is unit-tested without a browser.
 */

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** axe rules that Lumen's fixes resolve (alt text, empty or vague link names). */
export const LUMEN_FIXABLE = new Set(['image-alt', 'role-img-alt', 'input-image-alt', 'link-name', 'area-alt']);

export interface AuditRule {
  id: string;
  help: string;
  impact: string;
  count: number;
  lumenFixes: boolean;
}

export interface AuditSummary {
  issues: number;   // element instances across all violated rules
  rules: AuditRule[];
}

interface AxeLikeViolation { id: string; help: string; impact?: string | null; nodes: unknown[] }

const IMPACT_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

export function summarizeAxe(violations: AxeLikeViolation[]): AuditSummary {
  const rules = violations
    .map((v) => ({ id: v.id, help: v.help, impact: v.impact ?? 'minor', count: v.nodes.length, lumenFixes: LUMEN_FIXABLE.has(v.id) }))
    .sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9) || b.count - a.count);
  return { issues: rules.reduce((n, r) => n + r.count, 0), rules };
}

/** "14 issues" / "1 issue" */
export function issueCount(n: number): string {
  return `${n} issue${n === 1 ? '' : 's'}`;
}
