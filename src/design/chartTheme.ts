// 图表配色：从 CSS 变量读取，保证与设计令牌一致；缺失时给安全兜底值。
// 注意：Canvas 内不能使用 var()，必须取解析后的具体颜色字符串。
export interface ChartColors {
  ink: string;
  orange: string;
  blue: string;
  violet: string;
  violetSoft: string;
  up: string;
  down: string;
  soft: string;
}

export function getChartColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#16181D'),
    orange: v('--orange', '#FF4D00'),
    blue: v('--blue', '#2563EB'),
    violet: v('--violet', '#7C3AED'),
    violetSoft: v('--violet-soft', '#C4B5FD'),
    up: v('--up', '#0A7D33'),
    down: v('--down', '#C62828'),
    soft: v('--ink-soft', '#6B6D64'),
  };
}
