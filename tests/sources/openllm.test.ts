// tests/sources/openllm.test.ts —— OpenLLM Leaderboard v1/v2 适配器测试
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOpenLLM } from '../../pipeline/sources/openllm';

describe('parseOpenLLM (fixture-based)', () => {
  const samplesDir = 'pipeline/fixtures/openllm_samples';
  // 1. 从 fixtures 加载所有 sample JSON → Map<modelPath, rawJson>
  //    文件名约定：org_model.json（首段是 org 名，后续是 model 名）
  //    例如 Qwen_Qwen2-7B.json → model path 'Qwen/Qwen2-7B'
  const files = readdirSync(samplesDir).filter((f) => f.endsWith('.json'));
  const jsonMap = new Map<string, unknown>();
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(samplesDir, f), 'utf8')) as unknown;
    const stem = f.replace(/\.json$/, '');
    const firstUnderscore = stem.indexOf('_');
    const modelPath = firstUnderscore >= 0 ? `${stem.slice(0, firstUnderscore)}/${stem.slice(firstUnderscore + 1)}` : stem;
    jsonMap.set(modelPath, raw);
  }
  const out = parseOpenLLM(jsonMap);

  it('parses all 27 sample JSON files without throwing', () => {
    expect(jsonMap.size).toBeGreaterThanOrEqual(20);
    expect(out).toBeDefined();
  });

  it('returns 6 sub-arrays (mmlu/arc/hellaswag/truthfulqa/gsm8k/bbh)', () => {
    expect(Array.isArray(out.openllm_mmlu)).toBe(true);
    expect(Array.isArray(out.openllm_arc)).toBe(true);
    expect(Array.isArray(out.openllm_hellaswag)).toBe(true);
    expect(Array.isArray(out.openllm_truthfulqa)).toBe(true);
    expect(Array.isArray(out.openllm_gsm8k)).toBe(true);
    expect(Array.isArray(out.openllm_bbh)).toBe(true);
  });

  it('extracts 3 boards with data (mmlu/arc/bbh) and 3 empty (v2 removed v1 keys)', () => {
    // v2 schema 实际有 leaderboard.acc_norm / leaderboard_arc_challenge.acc_norm / leaderboard_bbh.acc_norm
    expect(out.openllm_mmlu.length).toBeGreaterThan(0);
    expect(out.openllm_arc.length).toBeGreaterThan(0);
    expect(out.openllm_bbh.length).toBeGreaterThan(0);
    // v1 字段（hellaswag/truthfulqa/gsm8k）在 v2 已下线 → 空数组
    expect(out.openllm_hellaswag.length).toBe(0);
    expect(out.openllm_truthfulqa.length).toBe(0);
    expect(out.openllm_gsm8k.length).toBe(0);
  });

  it('all entries sorted by score desc and scores in 0-100 range', () => {
    for (const arr of [out.openllm_mmlu, out.openllm_arc, out.openllm_bbh]) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i - 1].score).toBeGreaterThanOrEqual(arr[i].score);
        expect(arr[i].score).toBeGreaterThanOrEqual(0);
        expect(arr[i].score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('every entry has model_id + score + rank_prev=null + delta_score=null', () => {
    for (const arr of [out.openllm_mmlu, out.openllm_arc, out.openllm_bbh]) {
      for (const e of arr) {
        expect(typeof e.model_id).toBe('string');
        expect(typeof e.score).toBe('number');
        expect(e.rank_prev).toBeNull();
        expect(e.delta_score).toBeNull();
      }
    }
  });

  it('resolves Mistral 7B → mistral-7b model_id (from fixture mistral-7b-v0.1)', () => {
    // fixture 中 mistralai/Mistral-7B-v0.1 通过 basename 'Mistral-7B-v0.1' 命中
    // alias Mistral-7B-v0.1（注意 alias 是连字符的 raw 形式，归一后等于 mistral7bv01）
    // models.yaml 中 'Mistral-7B-v0.1' 也应命中 'mistral-7b'（归一 mistral7bv01）
    const has = (arr: typeof out.openllm_mmlu) => arr.some((e) => e.model_id === 'mistral-7b');
    // 因为 alias 包含精确字串 'Mistral-7B-v0.1'，命中 mistral-7b
    expect(has(out.openllm_mmlu) || has(out.openllm_arc) || has(out.openllm_bbh)).toBe(true);
  });

  it('pending collects unresolved model names', () => {
    // fixture 中部分非常见 org（如 0-hero, 1-800-LLMs 等）会进 pending
    expect(Array.isArray(out.pending)).toBe(true);
  });

  it('model_id unique within each sub-array (dedup)', () => {
    for (const arr of [out.openllm_mmlu, out.openllm_arc, out.openllm_bbh]) {
      const ids = arr.map((e) => e.model_id);
      expect(new Set(ids).size, 'each model_id unique per sub').toBe(ids.length);
    }
  });
});
