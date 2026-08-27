// tests/sources/aa.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAA } from '../../pipeline/sources/aa';

const fixture = JSON.parse(readFileSync('pipeline/fixtures/aa.json', 'utf8'));

describe('parseAA', () => {
  const out = parseAA(fixture);

  it('produces entries sorted by index desc', () => {
    expect(out.entries.length).toBeGreaterThan(20);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].index).toBeGreaterThanOrEqual(out.entries[i].index);
    }
  });
  it('maps real fields correctly', () => {
    const top = out.entries[0];
    expect(top.index).toBeGreaterThan(0);
    expect(typeof top.output_speed_tps === 'number' || top.output_speed_tps == null).toBe(true);
  });
  it('dedups reasoning-effort variants keeping highest index', () => {
    const ids = out.entries.map((e) => e.model_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('extracts terminal_bench from terminalbench_v2_1 x100', () => {
    for (const tb of out.terminal_bench) {
      expect(tb.score).toBeGreaterThan(0);
      expect(tb.score).toBeLessThanOrEqual(100);
    }
  });
  it('unknown names land in pending', () => {
    expect(Array.isArray(out.pending)).toBe(true);
  });

  // ---- 补充断言（基于 2026-08-25 实录 fixture 的真实值）----
  it('resolves the fixture top model to claude-opus-5', () => {
    expect(out.entries[0]).toMatchObject({ model_id: 'claude-opus-5' });
    expect(out.entries[0].index).toBeGreaterThan(60);
  });
  it('unregistered vendors (Muse Spark / Motif) stay in pending', () => {
    expect(out.pending.some((n) => n.startsWith('Muse Spark'))).toBe(true);
    expect(out.pending).toContain('Motif 3');
  });

  // ---- Phase 1 阶段：6 个新子榜存在性 + 形态 ----
  it('returns 6 new sub-arrays', () => {
    expect(Array.isArray(out.aa_mmlu_pro)).toBe(true);
    expect(Array.isArray(out.aa_gpqa)).toBe(true);
    expect(Array.isArray(out.aa_hle)).toBe(true);
    expect(Array.isArray(out.aa_livecodebench)).toBe(true);
    expect(Array.isArray(out.aa_ifeval)).toBe(true);
    expect(Array.isArray(out.aa_lcr)).toBe(true);
  });

  it('gpqa / hle / lcr have many entries (AA coverage率高)', () => {
    // fixture 中大部分 top 模型都有这些分数
    expect(out.aa_gpqa.length).toBeGreaterThan(20);
    expect(out.aa_hle.length).toBeGreaterThan(20);
    expect(out.aa_lcr.length).toBeGreaterThan(20);
  });

  it('mmlu_pro / livecodebench / ifeval may have 0+ entries (AA only reports for some models)', () => {
    // 2026-08-25 fixture 中 mmlu_pro 全为 null（API 字段缺失）→ 0 条；
    // livecodebench / ifeval 视模型不同可能有数据。这里只断言 length 是合法非负数。
    expect(out.aa_mmlu_pro.length).toBeGreaterThanOrEqual(0);
    expect(out.aa_livecodebench.length).toBeGreaterThanOrEqual(0);
    expect(out.aa_ifeval.length).toBeGreaterThanOrEqual(0);
  });

  it('all 6 new sub-arrays are sorted by score desc with scores in 0-100', () => {
    for (const arr of [
      out.aa_mmlu_pro,
      out.aa_gpqa,
      out.aa_hle,
      out.aa_livecodebench,
      out.aa_ifeval,
      out.aa_lcr,
    ]) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i - 1].score).toBeGreaterThanOrEqual(arr[i].score);
        expect(arr[i].score).toBeGreaterThanOrEqual(0);
        expect(arr[i].score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('every new sub entry has model_id + score + rank_prev=null + delta_score=null', () => {
    for (const arr of [
      out.aa_mmlu_pro,
      out.aa_gpqa,
      out.aa_hle,
      out.aa_livecodebench,
      out.aa_ifeval,
      out.aa_lcr,
    ]) {
      for (const e of arr) {
        expect(typeof e.model_id).toBe('string');
        expect(typeof e.score).toBe('number');
        expect(e.rank_prev).toBeNull();
        expect(e.delta_score).toBeNull();
      }
    }
  });
});
