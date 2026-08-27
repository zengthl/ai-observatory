import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import type { LineSeriesOption } from 'echarts/charts';
import type { History } from '../types';
import { getChartColors } from '../design/chartTheme';
import type { BoardEntry, DimensionDef } from '../lib/boards';

// 按需注册（模块级一次即可，重复 use 幂等）
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export type TrendBoard =
  | 'arena_elo'
  | 'aa_index'
  | 'swebench_verified'
  | 'terminal_bench'
  | 'aa_mmlu_pro'
  | 'aa_gpqa'
  | 'aa_hle'
  | 'aa_livecodebench'
  | 'aa_ifeval'
  | 'aa_lcr'
  | 'livebench_coding'
  | 'livebench_math'
  | 'livebench_reasoning'
  | 'livebench_language'
  | 'livebench_data_analysis'
  | 'livebench_instruction_following';

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
  /** 维度配置；驱动主线颜色与分项曲线。TrendPanel 只读 trendKeys/getScore/getCi95/getRail，
   *  不需要具体 kind 窄化，DimensionDef<BoardEntry> 联合签名已足够 */
  dimension: DimensionDef<BoardEntry>;
}

const WINDOW_DAYS = 90;

/** tooltip 以 innerHTML 渲染，seriesName 来自外部数据，插入前须转义 */
const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);
}

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
  aa_mmlu_pro: 'AA MMLU-Pro',
  aa_gpqa: 'AA GPQA',
  aa_hle: 'AA HLE',
  aa_livecodebench: 'AA LiveCodeBench',
  aa_ifeval: 'AA IFEval',
  aa_lcr: 'AA 长上下文检索',
  livebench_coding: 'LiveBench 代码',
  livebench_math: 'LiveBench 数学',
  livebench_reasoning: 'LiveBench 推理',
  livebench_language: 'LiveBench 语言',
  livebench_data_analysis: 'LiveBench 数据分析',
  livebench_instruction_following: 'LiveBench 指令遵循',
};

/** 单系列 key → 该模型在 history 中的 series 名。
 *
 * 分项 key（code/webdev/coding/math）约定的独立 series 名是 `${board}_${trendKey}`，
 * 例如 aa_index 的 coding 分项 → 'aa_index_coding'。当前 history.json 尚未生成
 * 这些子序列（首日实装），因此 lookup 通常会落空。**绝不**再回退到主 board：
 * 否则多线图三条线都画主 board 数据，全重叠成一条线（用户无法区分分项）。
 *
 * 调用方应通过返回值是否为 null 判断「无分项历史」并相应降级到单线 + 空态提示。
 */
function historySeriesFor(
  board: TrendBoard,
  trendKey: string,
): string | null {
  if (trendKey === 'overall') return board;
  return `${board}_${trendKey}`;
}

/** 按 trendKey color 名取实际色值 */
function colorByName(name: 'orange' | 'blue' | 'violet', c: ReturnType<typeof getChartColors>): string {
  if (name === 'blue') return c.blue;
  if (name === 'violet') return c.violet;
  return c.orange;
}

/**
 * 行展开的 90 天趋势图。
 *
 * 单点序列说明：echarts 折线在只有一个数据点时线宽不可见，
 * 因此 symbolSize 恒开（主模型 5px / 参照 3px），保证首日数据也能看到点。
 */
export default function TrendPanel({ modelId, board, history, top3Refs, dimension }: TrendPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  const trendKeys = dimension.trendKeys;
  const isMultiLine = trendKeys.length > 1;

  // 主模型各分项序列（按 dimDef.trendKeys 顺序）。
  // 分项 key 找不到独立历史时记空点（points=[]），绝不回退到主 board 序列，
  // 否则多线图三条线全画主 board 数据 → 完全重叠。
  const mainSeries = useMemo(
    () =>
      trendKeys.map((tk) => {
        const key = historySeriesFor(board, tk.key);
        const hm = history[modelId] ?? {};
        const pts =
          key == null
            ? []
            : (hm as Record<string, Array<[string, number]> | undefined>)[key] ?? [];
        return { ...tk, points: sliceWindow(pts), hasData: pts.length > 0 };
      }),
    [trendKeys, history, board, modelId],
  );

  // 多线场景下：所有分项 key 都无独立历史 → 仅画主线 + 「分项曲线待积累」提示
  const mainHasData = mainSeries.find((s) => s.key === 'overall')?.hasData ?? false;
  const anySubHasData = mainSeries.some((s) => s.key !== 'overall' && s.hasData);
  const allSubEmpty = isMultiLine && mainHasData && !anySubHasData;

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

    const colors = getChartColors();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** 组装 option（惰性：首次建图时才计算，避免隐藏副本白算一遍） */
    let option: EChartsCoreOption | null = null;
    const buildOption = (): EChartsCoreOption => {
      if (option) return option;

      // X 轴类目：所有序列日期并集排序（缺失处 null 断开，不伪造连线）
      const dateSet = new Set<string>();
      for (const s of mainSeries) for (const [d] of s.points) dateSet.add(d);
      for (const r of refSeries) for (const [d] of r.points) dateSet.add(d);
      const dates = [...dateSet].sort();
      const at = (pts: Array<[string, number]>, d: string): number | null => {
        for (const [pd, pv] of pts) if (pd === d) return pv;
        return null;
      };

      const toData = (pts: Array<[string, number]>): Array<number | null> =>
        dates.map((d) => at(pts, d));

      // 主线序列：分项维单线（蓝色/紫罗兰），整体维多线（橙主 + 蓝/紫虚线）。
      // 多线场景但所有分项序列都无独立历史时（首日实装阶段），仅画主线
      // 并在 ECharts option 里加 graphic 文字提示「分项曲线待积累」，
      // 避免三条线全部重叠到主序列上造成的视觉假象。
      const mainLineSeries: LineSeriesOption[] = mainSeries
        .filter((s) => !allSubEmpty || s.key === 'overall')
        .map((s) => {
          const isMain = s.key === 'overall';
          const c = colorByName(s.color, colors);
          return {
            name: s.label,
            type: 'line',
            data: toData(s.points),
            lineStyle: {
              color: c,
              width: isMain ? 2 : 1.5,
              type: isMain ? 'solid' : 'dashed',
              opacity: isMain ? 1 : 0.85,
            },
            itemStyle: { color: c },
            symbol: 'circle',
            symbolSize: isMain ? 5 : 3,
            connectNulls: false,
            emphasis: { disabled: true },
            z: 3,
          };
        });

      // 参照线：与主色一致；整体维时参照线为浅色，分项维保持同色
      const refColor = isMultiLine ? colors.soft : colorByName(trendKeys[0].color, colors);
      const refLineSeries: LineSeriesOption[] = refSeries.map<LineSeriesOption>((r, i) => ({
        name: `#${i + 1} ${r.modelId}`,
        type: 'line',
        data: toData(r.points),
        lineStyle: { color: refColor, width: 1, type: 'dashed', opacity: 0.55 },
        itemStyle: { color: refColor },
        symbol: 'circle',
        symbolSize: 3,
        connectNulls: false,
        emphasis: { disabled: true },
        z: 2,
      }));

      const series: LineSeriesOption[] = [...mainLineSeries, ...refLineSeries];

      // 分项曲线待积累提示（多线场景下分项历史都为空时）
      const emptyHintGraphic = allSubEmpty
        ? [
            {
              type: 'group' as const,
              left: 'center',
              top: 'middle',
              children: [
                {
                  type: 'text' as const,
                  style: {
                    text: '分项曲线待积累',
                    fill: colors.soft,
                    font: "11px 'IBM Plex Mono', ui-monospace, monospace",
                  },
                },
              ],
            },
          ]
        : undefined;

      option = {
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
              .map((p) => `<div>${p.marker} ${escapeHtml(p.seriesName)}&nbsp;&nbsp;<b>${p.value}</b></div>`)
              .join('');
            return [`<div style="color:${colors.soft}">${list[0]?.axisValue ?? ''}</div>`, rows].join('');
          },
        },
        ...(emptyHintGraphic ? { graphic: emptyHintGraphic } : {}),
        series,
      };
      return option;
    };

    /**
     * RO-first 惰性 init：
     * - 移动/桌面双视图常驻 DOM（media query 切 display），隐藏时 clientWidth 为 0，
     *   早退会永久错过尺寸变化 → 跨断点后空白。因此 RO 在 effect 内恒注册，
     *   由回调判断「有实例则 resize / 无实例且可见才首次建图」。
     * - 实例统一走 chartRef，cleanup 只认 chartRef（RO 回调里建的实例也能被 dispose）。
     */
    const ro = new ResizeObserver(() => {
      if (!chartRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
        const c = echarts.init(el);
        c.setOption(buildOption());
        chartRef.current = c;
      } else if (chartRef.current) {
        // 零尺寸时 resize 会告警/产生 1px 画布，仅在容器可见时同步
        if (el.clientWidth > 0 && el.clientHeight > 0) chartRef.current.resize();
      }
    });
    ro.observe(el);

    // 立即尝试一次：容器已可见（桌面展开等场景）无需等 RO 首帧
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      const chart = echarts.init(el);
      chart.setOption(buildOption());
      chartRef.current = chart;
    }

    return () => {
      ro.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [modelId, board, history, refSeries, mainSeries, isMultiLine, allSubEmpty, trendKeys]);

  // 多线图例：主色块 + label；trendKeys 长度 > 1 时显。
  // allSubEmpty 时仅主线有意义，legend 也只显示主线色块，
  // 避免出现「分项曲线待积累」但图例假装有多分项的违和感。
  const renderLegend = (): React.ReactNode => {
    if (!isMultiLine) return null;
    const c = getChartColors();
    const visibleTrendKeys = allSubEmpty ? trendKeys.filter((tk) => tk.key === 'overall') : trendKeys;
    return (
      <div className="trend-panel__legend">
        {visibleTrendKeys.map((tk) => {
          const color = tk.color === 'blue' ? c.blue : tk.color === 'violet' ? c.violet : c.orange;
          return (
            <span className="trend-panel__legend-item" key={tk.key}>
              <span className="trend-panel__legend-swatch" style={{ background: color }} />
              <span className="trend-panel__legend-label">{tk.label}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="trend-panel">
      <div className="label-caps trend-panel__caption">
        <span>
          {BOARD_LABELS[board]} · 近 90 天
          {dimension.axisLabel && ` · ${dimension.axisLabel}`}
        </span>
        {refSeries.length > 0 && <span>虚线为当前榜前三参照</span>}
      </div>
      {history[modelId]?.[board]?.length ? (
        <>
          <div ref={containerRef} style={{ height: 240 }} />
          {/* 多线时把图例挪到图表下方，避免压住窄屏曲线 */}
          {isMultiLine && renderLegend()}
        </>
      ) : (
        <p className="trend-panel__empty">暂无历史数据</p>
      )}
    </div>
  );
}
