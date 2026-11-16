export type Text = { en: string } & Record<string, string>;
export type State = Record<string, number | boolean | string>;

export interface Mapping { topic: string; unit?: string; level: string; verified: boolean; source: string | null }
export interface Board { id: string; name: string; hint: string; levels: string[]; rubric: string }

export interface TopicSummary {
  slug: string;
  subject: 'physics' | 'moon';
  unit: Text;
  title: Text;
  summary: Text;
  curricula: Record<string, Mapping | null>;
  reviewed: boolean;
  practical: string | null;
  practicalVariant: string | null;
  template: string;
  cards: number;
  checks: number;
}

export interface Card { title: Text; text: Text; equation: string | null; modelState: State }
export type TopicImage =
  | { type: 'generated'; template?: string; preset?: string; state: State; caption: Text }
  | { type: 'file'; src: string; credit: string; caption: Text };
export type Check =
  | { q: Text; type: 'point'; target: string; modelState?: State }
  | { q: Text; type: 'choice'; options: Text[]; answer: number };

export interface Topic {
  slug: string;
  subject: 'physics' | 'moon';
  unit: Text;
  title: Text;
  curricula: Record<string, Mapping | null>;
  reviewed: boolean;
  summary: Text;
  cards: Card[];
  images: TopicImage[];
  model: { template: string; preset: string; params: State };
  checks: Check[];
  practical: string | null;
  practicalVariant?: string;
  related: string[];
}

export interface ContentIndex {
  boards: Board[];
  defaultBoard: string;
  topics: TopicSummary[];
  practicals: { slug: string; title: Text }[];
}

export interface Column { id: string; label: string; unit: string; source: 'measured' | 'derived'; dp: number }
export interface Practical {
  slug: string;
  model: { template: string; preset: string; params: State };
  title: Text;
  aim: Text;
  apparatus: Text[];
  steps: { id: string; text: Text }[];
  variants: Record<string, { label: Text; params: State; accepted: number }>;
  readings: { target: number };
  oscillations?: number;
  table: { columns: Column[] };
  graph: { x: string; y: string; choices: string[] };
  expected: { relation: Text; symbol: string; unit: string; units: string[] };
  formula: { options: { id: string; tex: string; text: string; correct: boolean; calc: string }[] };
  tolerance: { reading: number; answer: number };
  precautions: { id: string; text: Text; correct: boolean }[];
  conclusions: { text: Text; correct: boolean }[];
  mistakes: string[];
}

export interface Criterion { id: string; label: Text; max: number; score: string[] }
export interface Rubric { name: Text; type: 'percent' | 'marks' | 'competency'; total: number; threshold?: number; criteria: Criterion[] }
export interface RubricFile { issueCodes: string[]; tips: string[]; issueTip: Record<string, string>; rubrics: Record<string, Rubric> }
