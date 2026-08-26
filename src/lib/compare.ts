/**
 * 对比功能纯逻辑（从 App.tsx 的 useCallback 与 ScatterView / CompareDrawer 内联实现中提取，
 * 便于单元测试；全部为无副作用纯函数——不修改入参）。
 */

/** 对比选择容量上限 */
export const COMPARE_MAX = 2;

/** 对比抽屉的左右侧标识 */
export type CompareSide = 'l' | 'r';

/**
 * FIFO 对比选择：向当前选择中追加一个模型并保持 ≤ COMPARE_MAX。
 * - 已包含则原样返回（引用不变，调用方可据此跳过重渲染）
 * - 未满则追加
 * - 已满则移除最早勾选者（数组头部）后再追加
 * 永远不修改传入数组。
 */
export function addToFifoSelection(current: string[], modelId: string): string[] {
  if (current.includes(modelId)) return current;
  const base =
    current.length >= COMPARE_MAX ? current.slice(current.length - COMPARE_MAX + 1) : [...current];
  return [...base, modelId];
}

/**
 * AA 智能指数 → 散点气泡直径（px）：在 [min, max] 上线性映射到 8–28 并取整；
 * 全场同值（max <= min）时取中档 18。
 */
export function bubbleSize(index: number, min: number, max: number): number {
  if (max <= min) return 18;
  const t = (index - min) / (max - min);
  return Math.round(8 + t * (28 - 8));
}

/**
 * 领先侧判定：higherBetter 时值大者领先，否则值小者领先；平局返回 null。
 * 入参应为两侧均非空的数值（空值由调用方先行排除）。
 */
export function leadSide(v1: number, v2: number, higherBetter: boolean): CompareSide | null {
  if (v1 === v2) return null;
  const lWins = higherBetter ? v1 > v2 : v1 < v2;
  return lWins ? 'l' : 'r';
}

/**
 * 价格显示格式化：≥10 保留 1 位小数、<10 保留 2 位小数，
 * 避免浮点直接 String 化出现的超长小数串。
 */
export function formatPrice(v: number): string {
  return v >= 10 ? v.toFixed(1) : v.toFixed(2);
}
