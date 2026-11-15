// Content pipeline: validates every topic and practical, and builds the small
// index the app ships in its main bundle. Used by vite.config.ts (the build
// fails on invalid content) and runnable on its own: `node scripts/content.ts`.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';

export const TEMPLATES = ['ray-optics', 'circuit-board', 'forces-rig', 'sky-moon'];
export const SUBJECT_DIRS = ['physics', 'moon'];

export interface BuiltContent {
  index: Record<string, unknown>;
  /** dist-relative path -> file body */
  files: Record<string, string>;
  errors: string[];
}

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

export function buildContent(root = process.cwd()): BuiltContent {
  const errors: string[] = [];
  const files: Record<string, string> = {};
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(read(join(root, 'content/schema.json')));
  const curricula = read(join(root, 'content/curricula.json'));
  const boardIds: string[] = curricula.boards.map((b: { id: string }) => b.id);
  const rubric = read(join(root, 'practicals/rubric.json'));

  const practicals: Record<string, any> = {};
  const pdir = join(root, 'practicals');
  for (const f of readdirSync(pdir).filter((f) => f.endsWith('.json') && f !== 'rubric.json')) {
    try {
      const p = read(join(pdir, f));
      if (p.slug !== f.replace(/\.json$/, '')) errors.push(`practicals/${f}: slug "${p.slug}" must match the file name`);
      for (const k of ['title', 'aim', 'apparatus', 'steps', 'table', 'graph', 'expected', 'tolerance', 'precautions', 'conclusions', 'formula']) {
        if (p[k] === undefined) errors.push(`practicals/${f}: missing "${k}"`);
      }
      practicals[p.slug] = p;
      files[`practicals/${f}`] = JSON.stringify(p);
    } catch (e) {
      errors.push(`practicals/${f}: ${(e as Error).message}`);
    }
  }
  for (const b of curricula.boards) {
    if (!rubric.rubrics[b.rubric]) errors.push(`curricula.json: board "${b.id}" uses unknown rubric "${b.rubric}"`);
  }
  files['practicals/rubric.json'] = JSON.stringify(rubric);

  const topics: any[] = [];
  for (const dir of SUBJECT_DIRS) {
    const d = join(root, 'content', dir);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d).filter((f) => f.endsWith('.json')).sort()) {
      const where = `content/${dir}/${f}`;
      let t: any;
      try {
        t = read(join(d, f));
      } catch (e) {
        errors.push(`${where}: ${(e as Error).message}`);
        continue;
      }
      const valid: boolean = validate(t) as boolean;
      if (!valid) {
        for (const e of validate.errors ?? []) errors.push(`${where}: ${e.instancePath || '/'} ${e.message}`);
        continue;
      }
      if (t.slug !== f.replace(/\.json$/, '')) errors.push(`${where}: slug "${t.slug}" must match the file name`);
      if (t.subject !== dir) errors.push(`${where}: subject "${t.subject}" must match folder "${dir}"`);
      for (const b of boardIds) {
        if (!(b in t.curricula)) errors.push(`${where}: curricula is missing board "${b}" (use null if the board does not list it)`);
      }
      for (const b of Object.keys(t.curricula)) {
        if (!boardIds.includes(b)) errors.push(`${where}: unknown board "${b}"`);
      }
      if (t.practical && !practicals[t.practical]) errors.push(`${where}: practical "${t.practical}" does not exist`);
      t.checks.forEach((c: any, i: number) => {
        if (c.type === 'choice' && c.answer >= c.options.length) errors.push(`${where}: checks[${i}].answer is out of range`);
      });
      t.images.forEach((im: any, i: number) => {
        if (im.type === 'file' && !existsSync(join(root, 'public', im.src))) errors.push(`${where}: images[${i}] file ${im.src} not found in public/`);
      });
      topics.push(t);
      files[`content/${dir}/${f}`] = JSON.stringify(t);
    }
  }
  const slugs = new Set(topics.map((t) => t.slug));
  if (slugs.size !== topics.length) errors.push('content: duplicate topic slugs');
  for (const t of topics) for (const r of t.related) if (!slugs.has(r)) errors.push(`content/${t.subject}/${t.slug}.json: related "${r}" does not exist`);

  const index = {
    boards: curricula.boards,
    defaultBoard: curricula.default,
    topics: topics.map((t) => ({
      slug: t.slug,
      subject: t.subject,
      unit: t.unit,
      title: t.title,
      summary: t.summary,
      curricula: t.curricula,
      reviewed: t.reviewed,
      practical: t.practical,
      practicalVariant: t.practicalVariant ?? null,
      template: t.model.template,
      cards: t.cards.length,
      checks: t.checks.length,
    })),
    practicals: Object.values(practicals).map((p: any) => ({ slug: p.slug, title: p.title })),
  };
  return { index, files, errors };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const c = buildContent();
  if (c.errors.length) {
    console.error(`Content is invalid (${c.errors.length}):\n` + c.errors.map((e) => '  - ' + e).join('\n'));
    process.exit(1);
  }
  const n = (c.index.topics as unknown[]).length;
  console.log(`Content OK: ${n} topics, ${(c.index.practicals as unknown[]).length} practicals, ${(c.index.boards as unknown[]).length} boards.`);
}
