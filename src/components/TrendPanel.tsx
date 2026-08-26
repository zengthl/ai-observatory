import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import type { LineSeriesOption } from 'echarts/charts';
import type { History } from '../types';
import { getChartColors } from '../design/chartTheme';

// 按需注册（模块级一次即可，重复 use 幂等）
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export type TrendBoard = 'arena_elo' | 'aa_index' | 'swebench_verified' | 'terminal_bench';

export interface Top3Ref {
  modelId: string;
  score: number;
}

interface TrendPanelProps {
  modelId: string;
  board: TrendBoard;
  history: History;
  /** 当前榜前三参照（已排除主模型自己） */
  top3Refs: Top3Ref[];
}

const WINDOW_DAYS = 90;

/** 近 90 天子序列：以序列最后一个日期为终点向前取窗口 */
function sliceWindow(points: Array<[string, number]>): Array<[string, number]> {
  if (points.length === 0) return [];
  const last = new Date(points[points.length - 1][0] + 'T00:00:00Z').getTime();
  const cutoff = last - (WINDOW_DAYS - 1) * 86400000;
  let start = points.length;
  while (start > 0) {
    const t = new Date(points[start - 1][0] + 'T00:00:00Z').getTime();
    if (t < cutoff) break;
    start -= 1;
  }
  return points.slice(start);
}

const BOARD_LABELS: Record<TrendBoard, string> = {
  arena_elo: 'Arena Elo',
  aa_index: 'AA 指数',
  swebench_verified: 'SWE-bench 解决率',
  terminal_bench: 'Terminal-Bench 得分',
};

/**
 * 行展开的 90 天趋势图。
 *
 * 单点序列说明：echarts 折线在只有一个数据点时线宽不可见，
 * 因此 symbolSize 恒开（主模型 5px / 参照 3px），保证首日数据也能看到点。
 */
export default function TrendPanel({ modelId, board, history, top3Refs }: TrendPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  // 参照线数据：排除主模型自己
  const refSeries = useMemo(
    () =>
      top3Refs
        .filter((r) => r.modelId !== modelId)
        .map((r) => ({ ...r, points: sliceWindow(history[r.modelId]?.[board] ?? []) }))
        .filter((r) => r.points.length > 0),
    [top3Refs, history, board, modelId],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientWidth === 0 || el.clientHeight === 0) return; // 容器折叠中，跳过初始化

    const colors = getChartColors();
    const mainPoints = sliceWindow(history[modelId]?.[board] ?? []);
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // X 轴类目：所有序列日期并集排序（缺失处 null 断开，不伪造连线）
    const dateSet = new Set<string>();
    for (const [d] of mainPoints) dateSet.add(d);
    for (const r of refSeries) for (const [d] of r.points) dateSet.add(d);
    const dates = [...dateSet].sort();
    const at = (pts: Array<[string, number]>, d: string): number | null => {
      for (const [pd, pv] of pts) if (pd === d) return pv;
      return null;
    };

    const toData = (pts: Array<[string, number]>): Array<number | null> =>
      dates.map((d) => at(pts, d));

    const series: LineSeriesOption[] = [
      {
        name: BOARD_LABELS[board],
        type: 'line',
        data: toData(mainPoints),
        lineStyle: { color: colors.orange, width: 2, type: 'solid' },
        itemStyle: { color: colors.orange },
        symbol: 'circle',
        symbolSize: 5,
        connectNulls: false,
        emphasis: { disabled: true },
        z: 3,
      },
      ...refSeries.map<LineSeriesOption>((r, i) => ({
        name: `#${i + 1} ${r.modelId}`,
        type: 'line',
        data: toData(r.points),
        lineStyle: { color: colors.soft, width: 1, type: 'dashed', opacity: 0.75 },
        itemStyle: { color: colors.soft },
        symbol: 'circle',
        symbolSize: 3,
        connectNulls: false,
        emphasis: { disabled: true },
        z: 2,
      })),
    ];

    const option: EChartsCoreOption = {
      animation: !reduceMotion,
      grid: { left: 44, right: 12, top: 12, bottom: 22, containLabel: false },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#E4E4DB' } },
        axisTick: { show: false },
        axisLabel: {
          show: true,
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 10,
          color: colors.soft,
          formatter: (value: string) => value.slice(5), // MM-DD
          interval: dates.length > 6 ? Math.ceil(dates.length / 6) : 0,
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitLine: { lineStyle: { color: 'rgba(22,24,29,0.08)' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 10,
          color: colors.soft,
        },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: '#FFFFFF',
        borderColor: '#E4E4DB',
        borderWidth: 1,
        padding: [6, 10],
        textStyle: {
          color: colors.ink,
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 11,
        },
        formatter: (params: unknown): string => {
          const list = params as Array<{ axisValue: string; seriesName: string; value: number | null; marker: string }>;
          const rows = list
            .filter((p) => p.value != null)
            .map((p) => `<div>${p.marker} ${p.seriesName}&nbsp;&nbsp;<b>${p.value}</b></div>`)
            .join('');
          return [`<div style="color:${colors.soft}">${list[0]?.axisValue ?? ''}</div>`, rows].join('');
        },
      },
      series,
    };

    chartRef.current?.dispose();
    const chart = echarts.init(el);
    chart.setOption(option);
    chartRef.current = chart;

    // 容器从折叠到展开（或窗口缩放）时自适应；首次拿到非零尺寸才初始化
    const ro = new ResizeObserver(() => {
      if (!chartRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
        const c = echarts.init(el);
        c.setOption(option);
        chartRef.current = c;
      } else if (chartRef.current) {
        chartRef.current.resize();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, [modelId, board, history, refSeries]);

  return (
    <div className="trend-panel">
      <div className="label-caps trend-panel__caption">
        <span>{BOARD_LABELS[board]} · 近 90 天</span>
        {refSeries.length > 0 && <span>虚线为当前榜前三参照</span>}
      </div>
      {history[modelId]?.[board]?.length ? (
        <div ref={containerRef} style={{ height: 240 }} />
      ) : (
        <p className="trend-panel__empty">暂无历史数据</p>
      )}
    </div>
  );
}
