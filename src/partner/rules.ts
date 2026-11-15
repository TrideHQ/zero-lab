// Rule-based lab partner: used whenever the AI call fails, times out, or
// returns anything that does not pass validation. Works with no API key.
import { ISSUE_TIP, type PartnerContext, type PartnerSay } from './schema.ts';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const READING_ISSUES = ['switch_open', 'miscount', 'late_start', 'parallax', 'pins_too_close', 'misread_scale', 'large_angle', 'duplicate_reading', 'outlier'];
const ANALYSIS_ISSUES = ['wrong_axis', 'wrong_formula', 'unit_missing', 'outlier', 'narrow_range', 'too_few_readings'];

/** Which single issue to talk about for this event, most important first. */
export function pickIssue(event: PartnerContext['event'], rowIssues: string[], globalIssues: string[]): string {
  if (event === 'reading') return READING_ISSUES.find((i) => rowIssues.includes(i)) ?? (globalIssues.includes('narrow_range') ? 'narrow_range' : 'none');
  if (event === 'analysis' || event === 'final') return ANALYSIS_ISSUES.find((i) => globalIssues.includes(i)) ?? 'none';
  return 'none';
}

export function ruleSay(ctx: PartnerContext, t: Translate): PartnerSay {
  const highlight = ctx.reading > 0 && ctx.reading <= ctx.n ? `reading_${ctx.reading}` : null;
  const tip = ISSUE_TIP[ctx.issue] ?? 'none';
  if (ctx.event === 'hello') return { say: t('partner.hello'), highlight: null, tip: 'none', mark: null };
  if (ctx.issue !== 'none') return { say: t(`partner.issue.${ctx.issue}`), highlight, tip, mark: null };
  if (ctx.event === 'reading') {
    return { say: ctx.n >= ctx.target ? t('partner.ready') : t('partner.progress', { n: ctx.n, m: ctx.target }), highlight: null, tip: 'keep_going', mark: null };
  }
  if (ctx.event === 'final') {
    const good = ctx.stats.pctError !== null && ctx.stats.pctError <= 5;
    return { say: t(good ? 'partner.final_good' : 'partner.final_ok'), highlight: null, tip: 'none', mark: null };
  }
  return { say: t('partner.issue.none'), highlight: null, tip: 'keep_going', mark: null };
}
