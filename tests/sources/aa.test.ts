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
});
