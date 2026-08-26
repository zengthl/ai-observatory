// tests/sources/arena.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseArena } from '../../pipeline/sources/arena';

const html = readFileSync('pipeline/fixtures/arena.html', 'utf8');

describe('parseArena', () => {
  const out = parseArena(html, 'text');

  it('extracts many rows sorted by elo desc', () => {
    expect(out.entries.length).toBeGreaterThan(30);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].score).toBeGreaterThanOrEqual(out.entries[i].score);
    }
  });
  it('first row carries score/ci/votes', () => {
    const top = out.entries[0];
    expect(top.score).toBeGreaterThan(1000);
    if (top.ci95) {
      expect(top.ci95[0]).toBeLessThan(top.score);
      expect(top.ci95[1]).toBeGreaterThan(top.score);
    }
  });
  it('known model resolves to canonical id', () => {
    expect(out.entries.some((e) => e.model_id.length > 0)).toBe(true);
  });
  it('pending collects unknown names', () => {
    expect(Array.isArray(out.pending)).toBe(true);
  });

  // ---- 补充断言（基于 2026-08-26 实录 fixture 的真实值）----
  it('fixture top model is claude-fable-5 @1508 ±5 with 24,331 votes', () => {
    const top = out.entries[0];
    expect(top.model_id).toBe('claude-fable-5');
    expect(top.score).toBe(1508);
    expect(top.ci95).toEqual([1503, 1513]);
    expect(top.votes).toBe(24331);
  });
  it('text-board entries carry no categories field', () => {
    expect(out.entries.every((e) => e.categories === undefined)).toBe(true);
  });
  it('all scores fall in plausible Elo range', () => {
    for (const e of out.entries) {
      expect(e.score).toBeGreaterThanOrEqual(100);
      expect(e.score).toBeLessThanOrEqual(2000);
    }
  });
});
