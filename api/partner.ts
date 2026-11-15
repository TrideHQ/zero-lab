// Vercel serverless wrapper around the shared handler.
import { handlePartner } from './partner-core.ts';

export default async function handler(req: { method?: string; body?: unknown }, res: { status(code: number): { json(body: unknown): void } }) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  const out = await handlePartner(body, process.env as Record<string, string>);
  res.status(out.status).json(out.body);
}
