// tests/sources/livecodebench.test.ts —— LiveCodeBench 适配器测试
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLiveCodeBench } from '../../pipeline/sources/livecodebench';

describe('parseLiveCodeBench (fixture-based)', () => {
  const raw = JSON.parse(readFileSync('pipeline/fixtures/livecodebench.json', 'utf8'));
  const out = parseLiveCodeBench(raw);

  it('parses the ~5MB JSON fixture without throwing', () => {
    expect(out).toBeDefined();
  });

  it('returns livecodebench array + pending', () => {
    expect(Array.isArray(out.livecodebench)).toBe(true);
    expect(Array.isArray(out.pending)).toBe(true);
  });

  it('extracts ≥10 model entries (fixture has 28 models)', () => {
    // 部分 model_repr 不在 models.yaml → 进 pending
    // 期望至少 10 个 model_id 命中
    expect(out.livecodebench.length).toBeGreaterThanOrEqual(10);
  });

  it('entries sorted by score desc and scores in 0-100 range', () => {
    for (let i = 1; i < out.livecodebench.length; i++) {
      expect(out.livecodebench[i - 1].score).toBeGreaterThanOrEqual(out.livecodebench[i].score);
      expect(out.livecodebench[i].score).toBeGreaterThanOrEqual(0);
      expect(out.livecodebench[i].score).toBeLessThanOrEqual(100);
    }
  });

  it('every entry carries 4 scores (All / easy / medium / hard) + rank_prev=null + delta_score=null', () => {
    for (const e of out.livecodebench) {
      expect(typeof e.model_id).toBe('string');
      expect(typeof e.score).toBe('number');
      expect(typeof e.pass_easy).toBe('number');
      expect(typeof e.pass_medium).toBe('number');
      expect(typeof e.pass_hard).toBe('number');
      expect(e.rank_prev).toBeNull();
      expect(e.delta_score).toBeNull();
    }
  });

  it('model_id unique within livecodebench (dedup across model_repr variants)', () => {
    const ids = out.livecodebench.map((e) => e.model_id);
    expect(new Set(ids).size, 'each model_id unique').toBe(ids.length);
  });

  it('known fixture top model resolves to canonical id (DeepSeek-V3 → deepseek-v4 or close)', () => {
    // 实际 fixture top model: 'DeepSeek-V3' 通过 resolveModelId
    // → 实际匹配哪个 model_id 取决于 models.yaml，宽松断言至少有一个 deepseek 命中
    const deepseekEntries = out.livecodebench.filter((e) => e.model_id.startsWith('deepseek-'));
    expect(deepseekEntries.length).toBeGreaterThan(0);
  });

  it('pending contains unresolved model names', () => {
    // 28 models 中至少有几个非 deepseek/claude/gemini 等（O3/o4/Grok/EXAONE/XBai 等不在 models.yaml 中）
    expect(out.pending.length).toBeGreaterThan(0);
  });
});
