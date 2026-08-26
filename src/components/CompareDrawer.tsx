import { useEffect, useMemo } from 'react';
import type { LatestFile } from '../types';
import { formatPrice, leadSide } from '../lib/compare';
import type { CompareSide } from '../lib/compare';

export interface CompareDrawerProps {
  /** 左侧模型 model_id（先勾选者） */
  left: string;
  /** 右侧模型 model_id（后勾选者） */
  right: string;
  latest: LatestFile;
  onClose: () => void;
}

/** 单项指标定义：从 latest 各榜提取数值，缺失返回 null */
interface MetricDef {
  label: string;
  extract: (latest: LatestFile, modelId: string) => number | null;
  higherBetter: boolean;
  format: (v: number) => string;
}

/** 六项对比指标（设计文档 §5.3 移除上下文窗口后的最终版） */
const METRICS: MetricDef[] = [
  {
    label: 'Arena Elo',
    extract: (l, id) => l.llm.arena_elo.find((e) => e.model_id === id)?.score ?? null,
    higherBetter: true,
    format: (v) => String(Math.round(v)),
  },
  {
    label: 'AA 智能指数',
    extract: (l, id) => l.llm.aa_index.find((e) => e.model_id === id)?.index ?? null,
    higherBetter: true,
    format: (v) => v.toFixed(1),
  },
  {
    label: 'SWE-bench 解决率 %',
    extract: (l, id) => l.agent.swebench_verified.find((e) => e.model_id === id)?.resolved_pct ?? null,
    higherBetter: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: 'Terminal-Bench %',
    extract: (l, id) => l.agent.terminal_bench.find((e) => e.model_id === id)?.score ?? null,
    higherBetter: true,
    format: (v) => `${v.toFixed(1)}%`,
  },
  {
    label: '输出速度 tok/s',
    extract: (l, id) => l.llm.aa_index.find((e) => e.model_id === id)?.output_speed_tps ?? null,
    higherBetter: true,
    format: (v) => v.toFixed(1),
  },
  {
    label: '混合价格 $/M',
    extract: (l, id) => l.llm.aa_index.find((e) => e.model_id === id)?.price_blin_per_m ?? null,
    higherBetter: false,
    format: (v) => `$${formatPrice(v)}`,
  },
];

/** 单指标行：label 居左，mono 数值在两端，中间双向条按 v1/(v1+v2) 相对比例伸展。
 * 领先侧（higherBetter 取大者 / lowerBetter 取小者）橙色加粗；任一侧缺数据不画条。
 * 领先判定在 lib/compare.ts 的 leadSide（纯函数，有单测）。 */
function MetricRow({ def, v1, v2 }: { def: MetricDef; v1: number | null; v2: number | null }) {
  let lead: CompareSide | null = null;
  if (v1 != null && v2 != null) {
    lead = leadSide(v1, v2, def.higherBetter);
  }
  // 双向条宽度：v1/(v1+v2)；除零（全零）或任一侧缺数据时整行不渲染条
  const total = v1 != null && v2 != null ? v1 + v2 : 0;
  const pctL = total > 0 ? (v1! / total) * 100 : null;

  const val = (v: number | null, side: 'l' | 'r') =>
    v == null ? (
      <span className={`cmp-row__val cmp-row__val--${side} mono`} title="无数据">
        —
      </span>
    ) : (
      <span
        className={`cmp-row__val cmp-row__val--${side} mono${lead === side ? ' cmp-row__val--lead' : ''}`}
      >
        {def.format(v)}
      </span>
    );

  return (
    <div className="cmp-row">
      <span className="label-caps cmp-row__label">{def.label}</span>
      {val(v1, 'l')}
      <div className="cmp-bar" aria-hidden="true">
        {pctL != null && (
          <>
            <span className="cmp-bar__half cmp-bar__half--l">
              <span
                className={`cmp-bar__seg${lead === 'l' ? ' cmp-bar__seg--lead' : ''}`}
                style={{ width: `${pctL}%` }}
              />
            </span>
            <span className="cmp-bar__half">
              <span
                className={`cmp-bar__seg${lead === 'r' ? ' cmp-bar__seg--lead' : ''}`}
                style={{ width: `${100 - pctL}%` }}
              />
            </span>
          </>
        )}
      </div>
      {val(v2, 'r')}
    </div>
  );
}

/** 底部对比抽屉：纸白底、顶部墨黑粗边、translateY 入场（reduced-motion 由全局规则瞬时化） */
export default function CompareDrawer({ left, right, latest, onClose }: CompareDrawerProps) {
  // ESC 关闭
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = useMemo(() => {
    const map = new Map(latest.models.map((m) => [m.model_id, m.display_name]));
    return (id: string) => map.get(id) ?? id;
  }, [latest.models]);

  return (
    <section className="cmp-drawer" role="dialog" aria-label="模型对比">
      <div className="cmp-drawer__inner">
        <header className="cmp-drawer__head">
          <div className="cmp-drawer__side">
            <span className="label-caps">A</span>
            <span className="cmp-drawer__name">{nameOf(left)}</span>
          </div>
          <span className="cmp-drawer__vs mono" aria-hidden="true">
            VS
          </span>
          <div className="cmp-drawer__side cmp-drawer__side--r">
            <span className="label-caps">B</span>
            <span className="cmp-drawer__name">{nameOf(right)}</span>
          </div>
          <button
            type="button"
            className="cmp-drawer__close"
            onClick={onClose}
            aria-label="关闭对比抽屉"
          >
            ×
          </button>
        </header>

        <div className="cmp-drawer__rows">
          {METRICS.map((def) => (
            <MetricRow
              key={def.label}
              def={def}
              v1={def.extract(latest, left)}
              v2={def.extract(latest, right)}
            />
          ))}
        </div>

        <p className="label-caps cmp-drawer__hint">橙粗体 = 领先 · 「—」= 无数据 · ESC 关闭</p>
      </div>
    </section>
  );
}
