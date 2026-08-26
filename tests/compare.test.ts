import { describe, it, expect } from 'vitest';
import {
  addToFifoSelection,
  bubbleSize,
  leadSide,
  formatPrice,
} from '../src/lib/compare';

describe('addToFifoSelection', () => {
  it('appends when below capacity', () => {
    expect(addToFifoSelection([], 'a')).toEqual(['a']);
    expect(addToFifoSelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('does not duplicate an already-selected model', () => {
    const current = ['a', 'b'];
    expect(addToFifoSelection(current, 'a')).toBe(current); // 引用不变
    expect(addToFifoSelection(current, 'b')).toBe(current);
  });

  it('evicts the earliest entry when full (FIFO)', () => {
    expect(addToFifoSelection(['a', 'b'], 'c')).toEqual(['b', 'c']);
    // 连续替换：最早的持续被弹出
    expect(addToFifoSelection(addToFifoSelection(['a', 'b'], 'c'), 'd')).toEqual(['c', 'd']);
  });

  it('never mutates the input array', () => {
    const current = ['a', 'b'];
    const frozen = Object.freeze([...current]) as string[];
    addToFifoSelection(frozen, 'c');
    expect(frozen).toEqual(['a', 'b']);
  });
});

describe('bubbleSize', () => {
  it('maps min to 8 and max to 28 linearly', () => {
    expect(bubbleSize(0, 0, 100)).toBe(8);
    expect(bubbleSize(100, 0, 100)).toBe(28);
    expect(bubbleSize(50, 0, 100)).toBe(Math.round(8 + 0.5 * 20)); // 中点 = 18
  });

  it('returns mid size 18 when all values equal (max <= min)', () => {
    expect(bubbleSize(42, 42, 42)).toBe(18);
    expect(bubbleSize(10, 50, 40)).toBe(18);
  });

  it('rounds to integer pixels and stays within 8-28', () => {
    for (const idx of [12.3, 37.9, 55.55, 61.2]) {
      const s = bubbleSize(idx, 12.3, 61.2);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(8);
      expect(s).toBeLessThanOrEqual(28);
    }
  });
});

describe('leadSide', () => {
  it('higher-better metrics: larger value leads', () => {
    expect(leadSide(1508, 1490, true)).toBe('l');
    expect(leadSide(1490, 1508, true)).toBe('r');
  });

  it('lower-better metrics: smaller value leads (price)', () => {
    expect(leadSide(20, 1.5, false)).toBe('r');
    expect(leadSide(1.5, 20, false)).toBe('l');
  });

  it('tie returns null (neither side highlighted)', () => {
    expect(leadSide(1482, 1482, true)).toBeNull();
    expect(leadSide(3, 3, false)).toBeNull();
  });
});

describe('formatPrice', () => {
  it('keeps 1 decimal for values >= 10', () => {
    expect(formatPrice(20)).toBe('20.0');
    expect(formatPrice(120)).toBe('120.0');
  });

  it('keeps 2 decimals for values < 10', () => {
    expect(formatPrice(1.5)).toBe('1.50');
    expect(formatPrice(4.5)).toBe('4.50');
  });

  it('avoids long floating-point tails', () => {
    expect(formatPrice(0.1 + 0.2)).toBe('0.30');
    expect(String(formatPrice(19.999999))).not.toContain('19.999999');
  });
});
