// POST /api/partner: structured context in, typed feedback out. Framework-free
// so the same handler runs on Vercel (api/partner.ts) and on the Node server.
import { chat, llmConfigured, type LlmEnv } from './llm.ts';
import { SYSTEM_PROMPT, parseModelJson, sanitizeContext, userPrompt, validateSay } from '../src/partner/schema.ts';

export interface PartnerResult { status: number; body: Record<string, unknown> }

export async function handlePartner(raw: unknown, env: LlmEnv): Promise<PartnerResult> {
  const ctx = sanitizeContext(raw);
  if (!ctx) return { status: 400, body: { error: 'bad_request' } };
  if (!llmConfigured(env)) return { status: 501, body: { error: 'no_llm' } }; // client falls back to rules
  try {
    const text = await chat([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(ctx) }], env);
    const say = validateSay(parseModelJson(text), ctx);
    if (!say) return { status: 502, body: { error: 'invalid_model_output' } };
    return { status: 200, body: { ...say } };
  } catch (e) {
    return { status: 504, body: { error: 'llm_unavailable', detail: (e as Error).name } };
  }
}
