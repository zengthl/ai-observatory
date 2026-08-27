import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findDimension, getDimensions, DIMENSIONS, splitDimKey } from '../src/lib/boards';
import type { ArenaEloEntry, AAIndexEntry, SweEntry, TBenchEntry } from '../src/types';
import type { BoardEntryOf } from '../src/lib/boards';
// DIMENSIONS 引用：保证类型注册 + 防止纯 unused-import 警告
void Object.keys(DIMENSIONS).length;

const latest = JSON.parse(readFileSync('public/data/latest.json', 'utf8'));
const sampleArena: ArenaEloEntry = latest.llm.arena_elo[0];
const sampleAA: AAIndexEntry = latest.llm.aa_index[0];

describe('DIMENSIONS structure', () => {
  it('arena has 3 dimensions (overall / code / webdev)', () => {
    expect(getDimensions('arena').length).toBe(3);
    expect(getDimensions('arena').map((d) => d.id)).toEqual(['overall', 'code', 'webdev']);
  });

  it('aa has 9 dimensions (overall / coding / math + 6 new)', () => {
    expect(getDimensions('aa').length).toBe(9);
    expect(getDimensions('aa').slice(0, 3).map((d) => d.id)).toEqual(['overall', 'coding', 'math']);
    // 6 个新子榜
    const ids = getDimensions('aa').map((d) => d.id);
    expect(ids).toContain('mmlu_pro');
    expect(ids).toContain('gpqa');
    expect(ids).toContain('hle');
    expect(ids).toContain('livecodebench');
    expect(ids).toContain('ifeval');
    expect(ids).toContain('lcr');
  });

  it('livebench kind has 6 dimensions (coding/math/reasoning/language/data_analysis/instruction_following)', () => {
    expect(getDimensions('livebench').length).toBe(6);
    expect(getDimensions('livebench').map((d) => d.id)).toEqual([
      'coding',
      'math',
      'reasoning',
      'language',
      'data_analysis',
      'instruction_following',
    ]);
  });

  it('DIMENSIONS flat index has 26 entries (3+9+6+6+1+1)', () => {
    // 3 (arena) + 9 (aa = 3 总 + 6 新) + 6 (livebench) + 6 (openllm) + 1 (livecodebench) + 1 (swe) + 1 (tbench) = 27
    // Wait, 3+9+6+6+1+1+1 = 27 — recount: 3+9=12, +6=18, +6=24, +1=25, +1=26, +1=27
    const keys = Object.keys(DIMENSIONS);
    expect(keys.length).toBe(27);
  });

  it('openllm kind has 6 dimensions (mmlu/arc/hellaswag/truthfulqa/gsm8k/bbh)', () => {
    expect(getDimensions('openllm').length).toBe(6);
    expect(getDimensions('openllm').map((d) => d.id)).toEqual([
      'mmlu',
      'arc',
      'hellaswag',
      'truthfulqa',
      'gsm8k',
      'bbh',
    ]);
  });

  it('livecodebench kind has 1 dimension (overall) with subBadges for easy/medium/hard', () => {
    const dims = getDimensions('livecodebench');
    expect(dims.length).toBe(1);
    expect(dims[0].id).toBe('overall');
    expect(dims[0].isOverall).toBe(true);
    expect(dims[0].subBadges?.length).toBe(3);
    const labels = dims[0].subBadges?.map((b) => b.label);
    expect(labels).toEqual(['easy', 'medium', 'hard']);
  });

  it('aa.hle rail upper bound is 50 (HLE narrower than other AA boards)', () => {
    const d = findDimension('aa', 'hle')!;
    expect(d.getRail().max).toBe(50);
  });

  it('aa.mmlu_pro is not overall (no subBadges)', () => {
    const d = findDimension('aa', 'mmlu_pro')!;
    expect(d.isOverall).toBe(false);
    expect(d.subBadges).toBeUndefined();
  });

  it('livebench coding dimension returns score 0-100 from GenericLLMEntry', () => {
    const d = findDimension('livebench', 'coding')!;
    expect(d.getRail().max).toBe(100);
    const e = { model_id: 'x', score: 65.4, rank_prev: null, delta_score: null };
    expect(d.getScore(e as any)).toBe(65.4);
  });

  it('splitDimKey parses aa_mmlu_pro correctly', () => {
    const sp = splitDimKey('aa_mmlu_pro');
    expect(sp).toEqual({ kind: 'aa', id: 'mmlu_pro' });
  });

  it('swe has 1 dimension (overall only)', () => {
    expect(getDimensions('swe').length).toBe(1);
    expect(getDimensions('swe')[0].id).toBe('overall');
  });

  it('tbench has 1 dimension (overall only)', () => {
    expect(getDimensions('tbench').length).toBe(1);
    expect(getDimensions('tbench')[0].id).toBe('overall');
  });

  it('each kind has exactly one overall dimension', () => {
    for (const k of ['arena', 'aa', 'livecodebench', 'swe', 'tbench'] as const) {
      const dims = getDimensions(k);
      const overalls = dims.filter((d) => d.isOverall);
      expect(overalls.length, `${k} should have one overall`).toBe(1);
    }
  });

  it('openllm and livebench have no overall dimension (all are sub-boards)', () => {
    for (const k of ['openllm', 'livebench'] as const) {
      const dims = getDimensions(k);
      const overalls = dims.filter((d) => d.isOverall);
      expect(overalls.length, `${k} should have no overall`).toBe(0);
    }
  });

  it('subBadges only present on overall dimensions that have sub-data', () => {
    for (const k of ['arena', 'aa', 'livecodebench', 'swe', 'tbench'] as const) {
      const dims = getDimensions(k);
      for (const d of dims) {
        if (!d.isOverall) {
          expect(d.subBadges, `${k}.${d.id} sub should not have subBadges`).toBeUndefined();
        }
        const hasSubs = dims.length > 1;
        if (d.isOverall && hasSubs) {
          expect(d.subBadges, `${k}.${d.id} overall with subs should have subBadges`).toBeDefined();
        }
      }
    }
  });
});

describe('findDimension', () => {
  it('finds arena.code by id', () => {
    const d = findDimension('arena', 'code');
    expect(d).toBeDefined();
    expect(d!.label).toBe('Arena 代码');
  });

  it('finds aa.math and verifies its rail upper bound', () => {
    const d = findDimension('aa', 'math');
    expect(d).toBeDefined();
    expect(d!.getRail().max).toBe(100);
    // 100 必须出现在 ticks 中
    expect(d!.getRail().ticks).toContain(100);
  });

  it('returns undefined for unknown id', () => {
    expect(findDimension('arena', 'coding')).toBeUndefined();
  });
});

describe('getScore with real fixture data', () => {
  it('arena.overall.getScore returns primary score', () => {
    const d = findDimension('arena', 'overall')!;
    const v = d.getScore(sampleArena);
    expect(typeof v).toBe('number');
    expect(v).toBe(sampleArena.score);
  });

  it('arena.code.getScore reads categories.code', () => {
    const d = findDimension('arena', 'code')!;
    const v = d.getScore(sampleArena);
    expect(v).toBe(sampleArena.categories?.code);
  });

  it('arena.webdev.getScore reads categories.webdev', () => {
    const d = findDimension('arena', 'webdev')!;
    const v = d.getScore(sampleArena);
    expect(v).toBe(sampleArena.categories?.webdev);
  });

  it('aa.overall.getScore returns index', () => {
    const d = findDimension('aa', 'overall')!;
    expect(d.getScore(sampleAA)).toBe(sampleAA.index);
  });

  it('aa.coding.getScore returns coding_index or null', () => {
    const d = findDimension('aa', 'coding')!;
    const v = d.getScore(sampleAA);
    // sampleAA.coding_index 在 fixture 中存在则为数值，否则 null
    expect(v === null || typeof v === 'number').toBe(true);
  });

  it('aa.math.getScore returns math_index or null (fixture top model has null)', () => {
    const d = findDimension('aa', 'math')!;
    const v = d.getScore(sampleAA);
    // 已知 fixture：claude-opus-5 的 math_index = null
    expect(v).toBeNull();
  });
});

describe('subBadges content', () => {
  it('arena.overall has code + webdev badges with correct values', () => {
    const d = findDimension('arena', 'overall')!;
    expect(d.subBadges!.length).toBe(2);
    const codeBadge = d.subBadges!.find((b) => b.label === 'code')!;
    const webdevBadge = d.subBadges!.find((b) => b.label === 'webdev')!;
    expect(codeBadge.getValue(sampleArena)).toBe(sampleArena.categories?.code);
    expect(webdevBadge.getValue(sampleArena)).toBe(sampleArena.categories?.webdev);
  });

  it('aa.overall has coding + math badges (math returns null for fixture top)', () => {
    const d = findDimension('aa', 'overall')!;
    expect(d.subBadges!.length).toBe(2);
    const mathBadge = d.subBadges!.find((b) => b.label === 'math')!;
    expect(mathBadge.getValue(sampleAA)).toBeNull();
  });
});

describe('trendKeys', () => {
  it('arena.overall trendKeys = [overall, code, webdev]', () => {
    const d = findDimension('arena', 'overall')!;
    expect(d.trendKeys.map((k) => k.key)).toEqual(['overall', 'code', 'webdev']);
    expect(d.trendKeys.map((k) => k.color)).toEqual(['orange', 'blue', 'violet']);
  });

  it('arena.code has only one trendKey (single line)', () => {
    const d = findDimension('arena', 'code')!;
    expect(d.trendKeys.length).toBe(1);
    expect(d.trendKeys[0].color).toBe('blue');
  });

  it('arena.webdev has only one trendKey (violet)', () => {
    const d = findDimension('arena', 'webdev')!;
    expect(d.trendKeys.length).toBe(1);
    expect(d.trendKeys[0].color).toBe('violet');
  });

  it('aa.math trendKey is violet (the new color)', () => {
    const d = findDimension('aa', 'math')!;
    expect(d.trendKeys[0].color).toBe('violet');
  });
});

describe('kind-typed findDimension / getDimensions (Round 1 type safety fix)', () => {
  it('findDimension(arena, ...) returns ArenaEloEntry-typed def', () => {
    const d = findDimension('arena', 'overall')!;
    // 编译期断言：getScore 的 e 参数必须是 ArenaEloEntry
    const v: number | null = d.getScore(sampleArena);
    expect(typeof v).toBe('number');
    // ci95 也在 arena 上
    const ci = d.getCi95?.(sampleArena);
    expect(ci === undefined || Array.isArray(ci)).toBe(true);
  });

  it('findDimension(aa, ...) returns AAIndexEntry-typed def', () => {
    const d = findDimension('aa', 'overall')!;
    const v: number | null = d.getScore(sampleAA);
    expect(typeof v).toBe('number');
  });

  it('findDimension(swe, ...) and findDimension(tbench, ...) return their respective entry types', () => {
    // 编译期断言：swe 维拿到的 sample 是 SweEntry 形状
    const sd = findDimension('swe', 'overall')!;
    const swSample: SweEntry = latest.agent.swebench_verified[0];
    expect(sd.getScore(swSample)).toBe(swSample.resolved_pct);
    const td = findDimension('tbench', 'overall')!;
    const tbSample: TBenchEntry = latest.agent.terminal_bench[0];
    expect(td.getScore(tbSample)).toBe(tbSample.score);
  });

  it('getDimensions(arena) is DimensionDef<ArenaEloEntry>[]', () => {
    const dims = getDimensions('arena');
    expect(dims.length).toBe(3);
    // 编译期断言：entries 必须是 ArenaEloEntry
    const _typecheck: ReadonlyArray<{ score: number }> = dims.map((d) => ({
      score: d.getScore(sampleArena) ?? 0,
    }));
    expect(_typecheck.length).toBe(3);
  });

  it('BoardEntryOf maps each Kind to its concrete entry type (compile-time check)', () => {
    const _arena: BoardEntryOf<'arena'> = sampleArena;
    const _aa: BoardEntryOf<'aa'> = sampleAA;
    const _swe: BoardEntryOf<'swe'> = latest.agent.swebench_verified[0];
    const _tb: BoardEntryOf<'tbench'> = latest.agent.terminal_bench[0];
    expect(_arena.model_id).toBeDefined();
    expect(_aa.model_id).toBeDefined();
    expect(_swe.model_id).toBeDefined();
    expect(_tb.model_id).toBeDefined();
  });
});
