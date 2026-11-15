// Ask the lab partner. The reply is typed and validated; on any failure or
// after 2.5 s the rule-based partner answers instead, so the bench never stalls.
import { t } from '../i18n/index.ts';
import { ruleSay } from './rules.ts';
import { validateSay, type PartnerContext, type PartnerSay } from './schema.ts';

export interface PartnerReply extends PartnerSay { source: 'ai' | 'rules' }
export const PARTNER_TIMEOUT_MS = 2500;
let offline = false;

export async function askPartner(ctx: PartnerContext): Promise<PartnerReply> {
  const fallback = (): PartnerReply => ({ ...ruleSay(ctx, t), source: 'rules' });
  // Routine progress lines ("that's 3 of 5") need no AI: the rules say them, which keeps the small
  // upstream quota for the moments that matter, a reading that looks off and the final comment.
  const routine = ctx.event === 'hello' || (ctx.event === 'reading' && ctx.issue === 'none');
  if (routine || offline || new URLSearchParams(location.search).get('partner') === 'rules') return fallback();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PARTNER_TIMEOUT_MS);
  try {
    const r = await fetch('/api/partner', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ctx), signal: ac.signal });
    if (r.status === 404 || r.status === 501) offline = true; // no backend in this deployment: stop asking
    if (!r.ok) return fallback();
    const say = validateSay(await r.json(), ctx);
    return say ? { ...say, source: 'ai' } : fallback();
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
