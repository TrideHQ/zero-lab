// Minimal OpenAI-compatible chat call. The key stays on the server:
//   LLM_BASE_URL (default https://api.cerebras.ai/v1), LLM_MODEL (default gpt-oss-120b), LLM_API_KEY
export interface LlmEnv { LLM_BASE_URL?: string; LLM_MODEL?: string; LLM_API_KEY?: string }
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export const llmConfigured = (env: LlmEnv) => !!env.LLM_API_KEY;

export async function chat(messages: ChatMessage[], env: LlmEnv, timeoutMs = 2200, maxTokens = 260): Promise<string> {
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY is not set');
  const base = (env.LLM_BASE_URL ?? 'https://api.cerebras.ai/v1').replace(/\/$/, '');
  const model = env.LLM_MODEL ?? 'gpt-oss-120b';
  const call = async (extra: Record<string, unknown>) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.LLM_API_KEY}` },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_completion_tokens: maxTokens, ...extra }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };
  let r = await call({ reasoning_effort: 'low' });
  if (r.status === 400 || r.status === 422) r = await call({}); // provider does not know reasoning_effort
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}
