import { describe, it, expect } from 'vitest';
import { applyFilters } from '../src/hooks/useFilters';
import type { ModelMeta } from '../src/types';

const models: Record<string, ModelMeta> = {
  m1: { model_id: 'm1', display_name: 'Model One', org: 'OpenAI', license: 'closed', aliases: [] },
  m2: { model_id: 'm2', display_name: 'DeepSeek V4', org: 'DeepSeek', license: 'open', aliases: [] },
};
const entries = [
  { model_id: 'm1', score: 90 },
  { model_id: 'm2', score: 70 },
];

describe('applyFilters', () => {
  it('empty filters keep all', () => {
    expect(applyFilters(entries, models, { query: '', org: '', license: 'all' })).toHaveLength(2);
  });
  it('query matches display name case-insensitively', () => {
    expect(applyFilters(entries, models, { query: 'deepseek', org: '', license: 'all' }).map((e) => e.model_id)).toEqual(['m2']);
  });
  it('query matches org', () => {
    expect(applyFilters(entries, models, { query: 'openai', org: '', license: 'all' }).map((e) => e.model_id)).toEqual(['m1']);
  });
  it('license filter open only', () => {
    expect(applyFilters(entries, models, { query: '', org: '', license: 'open' }).map((e) => e.model_id)).toEqual(['m2']);
  });
  it('combined query + license', () => {
    expect(applyFilters(entries, models, { query: 'model', org: '', license: 'closed' }).map((e) => e.model_id)).toEqual(['m1']);
  });
  it('unknown model_id kept only without query', () => {
    const withUnknown = [...entries, { model_id: 'ghost', score: 50 }];
    expect(applyFilters(withUnknown, models, { query: '', org: '', license: 'all' })).toHaveLength(3);
    expect(applyFilters(withUnknown, models, { query: 'model', org: '', license: 'all' }).map((e) => e.model_id)).toEqual(['m1']);
  });
});
