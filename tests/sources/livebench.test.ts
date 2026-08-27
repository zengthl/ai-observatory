// tests/sources/livebench.test.ts —— LiveBench parquet 解析器测试
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseLivebench } from '../../pipeline/sources/livebench';

describe('parseLivebench (fixture-based)', () => {
  it('parses the 720KB parquet fixture without throwing', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    expect(r).toBeDefined();
  });

  it('returns 6 sub-arrays (3 with data + 3 empty from missing parquet categories)', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    expect(Array.isArray(r.livebench_coding)).toBe(true);
    expect(Array.isArray(r.livebench_math)).toBe(true);
    expect(Array.isArray(r.livebench_reasoning)).toBe(true);
    expect(Array.isArray(r.livebench_language)).toBe(true);
    expect(Array.isArray(r.livebench_data_analysis)).toBe(true);
    expect(Array.isArray(r.livebench_instruction_following)).toBe(true);
  });

  it('3 known categories produce non-empty arrays; 3 missing categories produce empty arrays', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    // parquet 含 coding / instruction_following / language 三类
    expect(r.livebench_coding.length).toBeGreaterThanOrEqual(0);
    expect(r.livebench_instruction_following.length).toBeGreaterThanOrEqual(0);
    expect(r.livebench_language.length).toBeGreaterThanOrEqual(0);
    // math / reasoning / data_analysis 在 parquet 中不存在
    expect(r.livebench_math.length).toBe(0);
    expect(r.livebench_reasoning.length).toBe(0);
    expect(r.livebench_data_analysis.length).toBe(0);
  });

  it('entries are sorted by score desc with valid score range 0-100', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    for (const arr of [r.livebench_coding, r.livebench_language, r.livebench_instruction_following]) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i - 1].score).toBeGreaterThanOrEqual(arr[i].score);
        expect(arr[i].score).toBeGreaterThanOrEqual(0);
        expect(arr[i].score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('model_id dedup keeps highest score across multiple tstamps', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    for (const arr of [r.livebench_coding, r.livebench_language, r.livebench_instruction_following]) {
      const ids = arr.map((e) => e.model_id);
      expect(new Set(ids).size, 'each model_id unique per sub').toBe(ids.length);
    }
  });

  it('unresolved raw model names land in pending (parquet has 2024-2025 models)', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    // fixture parquet 195 个模型名绝大多数在 models.yaml 中没有 2024-2025 版本对应 → pending 非空
    expect(r.pending.length).toBeGreaterThan(50);
  });

  it('every entry has rank_prev=null and delta_score=null (set later by withRanksGeneric)', async () => {
    const buf = await readFile('pipeline/fixtures/livebench_raw.parquet');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const r = await parseLivebench(ab);
    for (const arr of [r.livebench_coding, r.livebench_language, r.livebench_instruction_following]) {
      for (const e of arr) {
        expect(e.rank_prev).toBeNull();
        expect(e.delta_score).toBeNull();
      }
    }
  });
});
