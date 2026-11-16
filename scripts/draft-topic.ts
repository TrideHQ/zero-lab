// Draft a new topic with the LLM, for a human to review.
//   node scripts/draft-topic.ts <slug> "<Title>" [--template=ray-optics] [--preset=glass-block] [--force]
// Needs LLM_API_KEY (and optionally LLM_BASE_URL, LLM_MODEL) in the environment.
// The draft is always saved with reviewed:false and every curriculum mapping
// verified:false. This script never marks anything as reviewed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { chat } from '../api/llm.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const [slug, title] = args.filter((a) => !a.startsWith('--'));
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !title) {
  console.error('Usage: node scripts/draft-topic.ts <slug> "<Title>" [--template=ray-optics] [--preset=glass-block] [--force]');
  process.exit(2);
}
const root = process.cwd();
const out = join(root, 'content/physics', `${slug}.json`);
if (existsSync(out) && !args.includes('--force')) {
  console.error(`${out} already exists. Use --force to replace it.`);
  process.exit(2);
}
const schema = JSON.parse(readFileSync(join(root, 'content/schema.json'), 'utf8'));
const boards: { id: string; name: string; levels: string[] }[] = JSON.parse(readFileSync(join(root, 'content/curricula.json'), 'utf8')).boards;
const example = readFileSync(join(root, 'content/physics/refraction.json'), 'utf8');
const template = flag('template') ?? 'ray-optics';
const preset = flag('preset') ?? 'glass-block';

const system = `You draft secondary-school physics topics for a 3D learning app. Reply with ONE JSON object only.
Rules:
- Follow the JSON schema exactly. Text fields are objects like {"en": "..."}.
- Write everything in your own words. Do NOT copy textbooks, exam papers, past questions or websites.
- 3 to 5 cards, each 2 to 4 short sentences a 14-year-old can follow. "equation" is KaTeX or null.
- 2 or 3 checks: "choice" (2 to 4 options, "answer" is the index) or "point" (target names a part of the model).
- images: only {"type":"generated", "state": {...}, "caption": {...}} entries. Never invent file images.
- "curricula": one entry per board id. Use the board's own published topic name only if you are sure of it,
  otherwise null. Every entry has "verified": false. Levels must come from the board's level list.
- "reviewed" must be false. "practical" must be null. "related" must be [].
- "model" must be {"template":"${template}","preset":"${preset}","params":{}} and each card's modelState may only
  use state keys that the example topic uses for that template.`;
const user = `Slug: ${slug}\nTitle: ${title}\nBoards: ${JSON.stringify(boards.map((b) => ({ id: b.id, name: b.name, levels: b.levels })))}\n\nJSON schema:\n${JSON.stringify(schema)}\n\nExample of a finished topic:\n${example}`;

const text = await chat([{ role: 'system', content: system }, { role: 'user', content: user }], process.env, 90_000, 6000);
const s = text.indexOf('{'), e = text.lastIndexOf('}');
let draft: any;
try {
  draft = JSON.parse(text.slice(s, e + 1));
} catch {
  console.error('The model did not return JSON. Nothing was saved.');
  process.exit(1);
}
// never trust the model with review status or verification
draft.slug = slug;
draft.subject = 'physics';
draft.reviewed = false;
draft.practical = null;
draft.related = [];
draft.model = { template, preset, params: draft.model?.params ?? {} };
draft.curricula ??= {};
for (const b of boards) {
  const m = draft.curricula[b.id];
  draft.curricula[b.id] = m && typeof m === 'object' ? { ...m, verified: false, source: m.source ?? null } : null;
}
draft.images = (draft.images ?? []).filter((i: any) => i?.type === 'generated');

const validate = new Ajv({ allErrors: true, allowUnionTypes: true }).compile(schema);
if (!validate(draft)) {
  const bad = out.replace(/\.json$/, '.draft-invalid.json');
  writeFileSync(bad, JSON.stringify(draft, null, 2));
  console.error(`Draft does not match the schema; saved for inspection at ${bad}:`);
  for (const er of validate.errors ?? []) console.error(`  ${er.instancePath || '/'} ${er.message}`);
  process.exit(1);
}
writeFileSync(out, JSON.stringify(draft, null, 2) + '\n');
console.log(`Draft saved to ${out} with reviewed:false. A teacher must check it before "reviewed" is set to true by hand.`);
