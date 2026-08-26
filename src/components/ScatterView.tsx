import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import type { ScatterSeriesOption } from 'echarts/charts';
import type { AAIndexEntry, ModelMeta } from '../types';
import { getChartColors } from '../design/chartTheme';
import { bubbleSize } from '../lib/compare';

// 按需注册（模块级一次即可，重复 use 幂等）
echarts.use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export interface ScatterViewProps {
  aaEntries: AAIndexEntry[];
  models: Record<string, ModelMeta>;
  /** 点点击回调（本期 console + aria 反馈） */
  onSelect?: (modelId: string) => void;
}

const CLOSED_NAME = '闭源';
const OPEN_NAME = '开源';

/** 散点数据点（挂在 series data 上，点击回调据此取 modelId） */
interface ScatterPoint {
  value: [number, number]; // [price $/M, speed tok/s]
  name: string; // tooltip / aria 用 display_name（缺失时回退 model_id）
  modelId: string;
  index: number; // AA 智能指数（tooltip 用）
}

/** 指数 → 气泡大小 8–28px 线性映射（实现见 lib/compare.ts，有单测） */

/** tooltip 以 innerHTML 渲染，模型名来自外部数据，插入前须转义 */
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

/**
 * LLM Tab 第三子视图：速度 × 价格 散点（性价比象限）。
 * X = price_blin_per_m（log 轴），Y = output_speed_tps；
 * 过滤 price/speed 缺失或 ≤0 的条目；闭源橙 / 开源蓝两系列；气泡按指数映射 8–28px。
 *
 * 生命周期沿用 Task 10 的 RO-first 惰性 init：RO 恒注册、隐藏副本不建图、
 * 实例统一走 chartRef，cleanup dispose + ro.disconnect。
 */
export default function ScatterView({ aaEntries, models, onSelect }: ScatterViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  // onSelect 经 ref 透传，回调身份变化不触发图表重建
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  // 点点击后的 aria 反馈（live region 文本）；state 变更不会重建图表（effect 只依赖 seriesData）
  const [lastSelected, setLastSelected] = useState('');

  // 参与绘图的数据（过滤 + 分系列 + 尺寸映射），useMemo 保持引用稳定。
  // models 里查不到 license 的条目跳过不画（无法可靠归入闭源/开源任一系列），
  // 计数 caption 与图例口径一致。
  const seriesData = useMemo(() => {
    const valid = aaEntries.filter(
      (e) =>
        e.price_blin_per_m != null &&
        e.price_blin_per_m > 0 &&
        e.output_speed_tps != null &&
        e.output_speed_tps > 0 &&
        models[e.model_id] != null,
    );
    const idxMin = Math.min(...valid.map((e) => e.index));
    const idxMax = Math.max(...valid.map((e) => e.index));
    const toPoint = (e: AAIndexEntry): ScatterPoint & { symbolSize: number } => ({
      value: [e.price_blin_per_m!, e.output_speed_tps!],
      modelId: e.model_id,
      index: e.index,
      name: models[e.model_id]?.display_name ?? e.model_id,
      symbolSize: bubbleSize(e.index, idxMin, idxMax),
    });
    return {
      closed: valid.filter((e) => models[e.model_id].license !== 'open').map(toPoint),
      open: valid.filter((e) => models[e.model_id].license === 'open').map(toPoint),
      count: valid.length,
    };
  }, [aaEntries, models]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const colors = getChartColors();
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let option: EChartsCoreOption | null = null;
    const buildOption = (): EChartsCoreOption => {
      if (option) return option;

      const mkSeries = (
        name: string,
        color: string,
        data: Array<ScatterPoint & { symbolSize: number }>,
      ): ScatterSeriesOption => ({
        name,
        type: 'scatter',
        data,
        itemStyle: { color, opacity: 0.85 },
        emphasis: { scale: 1.15 },
      });

      option = {
        animation: !reduceMotion,
        animationDuration: 300,
        legend: {
          top: 0,
          right: 0,
          icon: 'circle',
          itemWidth: 10,
          itemHeight: 10,
          textStyle: {
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontSize: 11,
            color: colors.ink,
          },
        },
        grid: { left: 48, right: 16, top: 30, bottom: 34, containLabel: false },
        xAxis: {
          type: 'log',
          name: '$/M',
          nameLocation: 'middle',
          nameGap: 24,
          nameTextStyle: {
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontSize: 10,
            color: colors.soft,
          },
          axisLine: { lineStyle: { color: colors.soft } },
          splitLine: { show: false },
          axisLabel: {
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontSize: 10,
            color: colors.soft,
            formatter: (v: number) => (v >= 1 ? `$${v}` : `$${v.toFixed(2)}`),
          },
        },
        yAxis: {
          type: 'value',
          name: 'tok/s',
          nameTextStyle: {
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontSize: 10,
            color: colors.soft,
            align: 'left',
          },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(22,24,29,0.08)' } },
          axisLabel: {
            fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
            fontSize: 10,
            color: colors.soft,
          },
        },
        tooltip: {
          trigger: 'item',
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
          formatter: (params: unknown) => {
            const p = params as { data: ScatterPoint };
            const d = p.data;
            return [
              `<div style="font-weight:700">${escapeHtml(d.name)}</div>`,
              `<div>指数 <b>${d.index}</b></div>`,
              `<div>速度 <b>${d.value[1].toFixed(1)}</b> tok/s</div>`,
              `<div>价格 <b>$${d.value[0]}</b>/M</div>`,
            ].join('');
          },
        },
        series: [
          mkSeries(CLOSED_NAME, colors.orange, seriesData.closed),
          mkSeries(OPEN_NAME, colors.blue, seriesData.open),
        ],
      };
      return option;
    };

    /**
     * RO-first 惰性 init（同 TrendPanel）：
     * - RO 在 effect 内恒注册；无实例且可见才首次建图，已有实例且可见才 resize；
     * - 实例统一走 chartRef，cleanup 只认 chartRef（RO 回调里建的实例也能被 dispose）。
     */
    const ro = new ResizeObserver(() => {
      if (!chartRef.current && el.clientWidth > 0 && el.clientHeight > 0) {
        const c = echarts.init(el);
        c.setOption(buildOption());
        c.on('click', onPointClick);
        chartRef.current = c;
      } else if (chartRef.current) {
        if (el.clientWidth > 0 && el.clientHeight > 0) chartRef.current.resize();
      }
    });
    ro.observe(el);

    /** 点点击 → onSelect(modelId) + aria 反馈 */
    const onPointClick = (params: unknown) => {
      const p = params as { componentType?: string; data?: ScatterPoint };
      if (p.componentType === 'series' && p.data?.modelId) {
        console.info('[scatter] select', p.data.modelId); // 本期反馈约定：console + aria
        setLastSelected(`已选中 ${p.data.name}`);
        onSelectRef.current?.(p.data.modelId);
      }
    };

    // 立即尝试一次：容器已可见无需等 RO 首帧
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      const chart = echarts.init(el);
      chart.setOption(buildOption());
      chart.on('click', onPointClick);
      chartRef.current = chart;
    }

    return () => {
      ro.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [seriesData]);

  return (
    <div className="scatter">
      <div className="scatter__caption label-caps">
        <span>速度 × 价格 · 共 {seriesData.count} 个模型</span>
        <span className="scatter__tip">左上区域 = 更便宜且更快，性价比最优</span>
      </div>
      <div
        ref={containerRef}
        className="scatter__chart"
        role="img"
        aria-label={`速度价格散点图，${seriesData.count} 个模型`}
      />
      {/* 点点击 aria 反馈（屏幕阅读器播报） */}
      <p className="visually-hidden" role="status">
        {lastSelected}
      </p>
    </div>
  );
}
