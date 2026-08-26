// tests/run-idempotent.test.ts —— 编排纯函数（不触网、不动盘）
import { describe, it, expect } from 'vitest';
import { mergePending, pickBaselineDate } from '../pipeline/run';

describe('run helpers', () => {
  it('mergePending dedups across sources preserving order', () => {
    expect(mergePending(['a', 'b'], ['b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });
  it('pickBaselineDate picks latest snapshot before target date', () => {
    expect(pickBaselineDate(['2026-08-25.json', '2026-08-24.json', '2026-08-26.json'], '2026-08-25')).toBe('2026-08-24');
    expect(pickBaselineDate([], '2026-08-25')).toBeNull();
  });
  it('pickBaselineDate ignores non-date files and future snapshots', () => {
    expect(pickBaselineDate(['latest.txt', 'garbage.json', '2099-01-01.json'], '2026-08-25')).toBeNull();
  });
  it('mergePending returns empty for no input lists', () => {
    expect(mergePending()).toEqual([]);
  });
});
