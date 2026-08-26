// tests/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { resolveModelId, withRanks, buildHistory } from '../pipeline/normalize';
import type { ModelMeta, ArenaEloEntry, History, Snapshot } from '../src/types';

const MODELS: ModelMeta[] = [
  {
    model_id: 'gpt-5-pro', display_name: 'GPT-5 Pro', org: 'OpenAI', license: 'closed',
    aliases: ['GPT-5 Pro', 'gpt-5-pro', 'chatgpt-5-pro'],
  },
  {
    model_id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', org: 'Anthropic', license: 'closed',
    aliases: ['Claude Opus 4.6', 'claude-opus-4.6', 'claude-opus-4-6-high'],
  },
];

describe('resolveModelId', () => {
  it('exact alias match', () => {
    expect(resolveModelId('GPT-5 Pro', MODELS)?.id).toBe('gpt-5-pro');
  });
  it('case/punctuation-insensitive', () => {
    expect(resolveModelId('CLAUDE-OPUS_4.6', MODELS)?.id).toBe('claude-opus-4-6');
  });
  it('reasoning-effort suffix tolerated via alias', () => {
    expect(resolveModelId('claude-opus-4-6-high', MODELS)?.id).toBe('claude-opus-4-6');
  });
  it('unknown returns null', () => {
    expect(resolveModelId('mystery-model-9000', MODELS)).toBeNull();
  });
});

describe('withRanks', () => {
  const today: ArenaEloEntry[] = [
    { model_id: 'a', score: 90, rank_prev: null, delta_score: null },
    { model_id: 'b', score: 80, rank_prev: null, delta_score: null },
    { model_id: 'c', score: 70, rank_prev: null, delta_score: null },
  ];
  const yesterday = [
    { model_id: 'b', score: 78 },
    { model_id: 'a', score: 88 },
  ];

  it('assigns current rank by array order and computes prev/delta', () => {
    const r = withRanks(today, yesterday);
    expect(r[0]).toMatchObject({ model_id: 'a', rank: 1, rank_prev: 2, delta_score: 2 });
    expect(r[1]).toMatchObject({ model_id: 'b', rank: 2, rank_prev: 1, delta_score: 2 });
  });
  it('new entry gets rank_prev null (NEW)', () => {
    const r = withRanks(today, yesterday);
    expect(r[2]).toMatchObject({ model_id: 'c', rank: 3, rank_prev: null, delta_score: null });
  });
  it('works without prev data', () => {
    const r = withRanks(today, undefined);
    expect(r.every((e) => e.rank_prev === null && e.delta_score === null)).toBe(true);
  });
  it('aa_index shape falls back to index field for score/delta', () => {
    // aa_index 板块主分数字段是 index 而非 score（Task 2 审查移交）
    const todayAA = [
      { model_id: 'x', index: 71.2, rank_prev: null, delta_score: null },
      { model_id: 'y', index: 68.5, rank_prev: null, delta_score: null },
    ];
    const yesterdayAA = [{ model_id: 'x', index: 70.0 }];
    const r = withRanks(todayAA, yesterdayAA);
    expect(r[0]).toMatchObject({ model_id: 'x', rank: 1, rank_prev: 1, delta_score: 1.2 });
    expect(r[1]).toMatchObject({ model_id: 'y', rank: 2, rank_prev: null, delta_score: null });
  });
});

describe('buildHistory', () => {
  it('appends today point and overwrites same-day rerun', () => {
    const snap = (score: number): Snapshot =>
      ({
        date: '2026-08-25',
        sources: {} as any,
        llm: { arena_elo: [{ model_id: 'a', score, rank_prev: null, delta_score: null }], aa_index: [] },
        agent: { swebench_verified: [], terminal_bench: [] },
      }) as Snapshot;

    const h1: History = buildHistory({}, snap(100));
    expect(h1['a'].arena_elo).toEqual([['2026-08-25', 100]]);

    const h2 = buildHistory(h1, snap(102));
    expect(h2['a'].arena_elo).toEqual([['2026-08-25', 102]]);
  });
});
