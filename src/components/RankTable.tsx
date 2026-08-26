import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { AAIndexEntry, ArenaEloEntry, ModelMeta, SweEntry, TBenchEntry } from '../types';
import DeltaBadge from './DeltaBadge';
import TickRail from './TickRail';

export type RankKind = 'arena' | 'aa' | 'swe' | 'tbench';

type AnyEntries =
  | ArenaEloEntry[]
  | AAIndexEntry[]
  | SweEntry[]
  | TBenchEntry[]
  | Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry>;

export interface RankTableProps {
  kind: RankKind;
  entries: AnyEntries;
  models: Record<string, ModelMeta>;
  compareSelection: Set<string>;
  onToggleCompare: (model_id: string) => void;
  expandedId: string | null;
  onToggleExpand: (model_id: string) => void;
}

/** 归一化行视图模型：四种榜单条目 → 统一字段供列渲染 */
interface RowModel {
  model_id: string;
  rank: number;
  name: string;
  org: string;
  oss: boolean;
  /** 主分数文本 */
  scoreText: string;
  /** arena 置信区间半宽（±n） */
  ciHalf?: number;
  /** arena 分类 Elo（code/webdev…），有才显 */
  cats?: Record<string, number>;
  /** 刻度尺配置（aa/swe/tbench 主分数） */
  rail?: { value: number; min: number; max: number; ticks: readonly number[] };
  speedTps?: number | null;
  priceBlin?: number | null;
  agent?: string;
  costUsd?: number | null;
  rankPrev: number | null;
  deltaScore: number | null;
}

const AA_RAIL = { min: 40, max: 85, ticks: [40, 55, 70, 85] } as const;
const PCT_RAIL = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } as const;

const fmt1 = (n: number): string => n.toFixed(1);

function normalizeRows(kind: RankKind, entries: AnyEntries, models: Record<string, ModelMeta>): RowModel[] {
  const raw = entries as unknown as ReadonlyArray<Record<string, unknown>>;
  return raw.map((e, i) => {
    const model_id = e.model_id as string;
    const m = models[model_id];
    const base = {
      model_id,
      rank: i + 1,
      name: m?.display_name ?? model_id,
      org: m?.org ?? '—',
      oss: m?.license === 'open',
      rankPrev: e.rank_prev as number | null,
      deltaScore: e.delta_score as number | null,
    };
    if (kind === 'arena') {
      const a = e as unknown as ArenaEloEntry;
      const ciHalf = a.ci95 ? Math.round((a.ci95[1] - a.ci95[0]) / 2) : undefined;
      return { ...base, scoreText: String(a.score), ciHalf, cats: a.categories };
    }
    if (kind === 'aa') {
      const a = e as unknown as AAIndexEntry;
      return {
        ...base,
        scoreText: fmt1(a.index),
        rail: { value: a.index, ...AA_RAIL },
        speedTps: a.output_speed_tps ?? null,
        priceBlin: a.price_blin_per_m ?? null,
      };
    }
    if (kind === 'swe') {
      const s = e as unknown as SweEntry;
      return {
        ...base,
        scoreText: `${fmt1(s.resolved_pct)}%`,
        rail: { value: s.resolved_pct, ...PCT_RAIL },
        agent: s.agent ?? '—',
        costUsd: s.cost_usd_per_instance ?? null,
      };
    }
    const t = e as unknown as TBenchEntry;
    return { ...base, scoreText: `${fmt1(t.score)}%`, rail: { value: t.score, ...PCT_RAIL } };
  });
}

// ===== 列定义（集中式配置）=====

interface ColDef {
  header: string;
  width?: number;
  variant?: 'default' | 'num';
  render: (row: RowModel) => ReactNode;
}

const CAT_LABELS: Record<string, string> = { text: 'TEXT', code: 'CODE', webdev: 'WEBDEV' };

function NameCell({ row }: { row: RowModel }) {
  return (
    <span className="rt__name">
      <span>{row.name}</span>
      {row.oss && (
        <span className="oss-badge" title="开源权重">
          OSS
        </span>
      )}
    </span>
  );
}

function ScoreCell({ row }: { row: RowModel }) {
  return (
    <span className="rt__score">
      <span className="mono rt__score-num">{row.scoreText}</span>
      {row.ciHalf !== undefined && <span className="rt__ci">±{row.ciHalf}</span>}
      {row.rail && (
        <TickRail
          value={row.rail.value}
          min={row.rail.min}
          max={row.rail.max}
          ticks={[...row.rail.ticks]}
          accent={row.oss ? 'blue' : 'ink'}
        />
      )}
    </span>
  );
}

function CatsCell({ row }: { row: RowModel }) {
  const cats = Object.entries(row.cats ?? {});
  if (cats.length === 0) return <span style={{ color: 'var(--ink-soft)' }}>—</span>;
  return (
    <span className="rt__cats">
      {cats.map(([k, v]) => (
        <span className="rt__cat" key={k}>
          <span className="rt__cat-label">{CAT_LABELS[k] ?? k.toUpperCase()}</span>
          <span className="mono rt__cat-val">{v}</span>
        </span>
      ))}
    </span>
  );
}

const dash = <span style={{ color: 'var(--ink-soft)' }}>—</span>;

const rankCell = (r: RowModel): ReactNode => <span className="rt__rank mono">{r.rank}</span>;

const COLUMNS: Record<RankKind, ColDef[]> = {
  arena: [
    { header: '#', width: 48, render: rankCell },
    { header: '模型', render: (r) => <NameCell row={r} /> },
    { header: '厂商', render: (r) => r.org },
    { header: 'ELO', width: 150, variant: 'num', render: (r) => <ScoreCell row={r} /> },
    { header: '分类 ELO', render: (r) => <CatsCell row={r} /> },
    { header: 'Δ', width: 96, render: (r) => <DeltaBadge rankPrev={r.rankPrev} deltaScore={r.deltaScore} /> },
  ],
  aa: [
    { header: '#', width: 48, render: rankCell },
    { header: '模型', render: (r) => <NameCell row={r} /> },
    { header: '厂商', render: (r) => r.org },
    { header: '智能指数', width: 210, render: (r) => <ScoreCell row={r} /> },
    { header: '速度 TOK/S', width: 96, variant: 'num', render: (r) => (r.speedTps != null ? <span className="mono">{fmt1(r.speedTps)}</span> : dash) },
    { header: '价格 $/M', width: 84, variant: 'num', render: (r) => (r.priceBlin != null ? <span className="mono">${r.priceBlin}</span> : dash) },
    { header: 'Δ', width: 96, render: (r) => <DeltaBadge rankPrev={r.rankPrev} deltaScore={r.deltaScore} /> },
  ],
  swe: [
    { header: '#', width: 48, render: rankCell },
    { header: '模型', render: (r) => <NameCell row={r} /> },
    { header: '厂商', render: (r) => r.org },
    { header: '解决率 %', width: 210, render: (r) => <ScoreCell row={r} /> },
    { header: 'AGENT', render: (r) => <span className="mono rt__agent">{r.agent}</span> },
    { header: '单例成本', width: 92, variant: 'num', render: (r) => (r.costUsd != null ? <span className="mono">${fmt1(r.costUsd)}</span> : dash) },
    { header: 'Δ', width: 96, render: (r) => <DeltaBadge rankPrev={r.rankPrev} deltaScore={r.deltaScore} /> },
  ],
  tbench: [
    { header: '#', width: 48, render: rankCell },
    { header: '模型', render: (r) => <NameCell row={r} /> },
    { header: '厂商', render: (r) => r.org },
    { header: '得分 %', width: 210, render: (r) => <ScoreCell row={r} /> },
    { header: 'Δ', width: 96, render: (r) => <DeltaBadge rankPrev={r.rankPrev} deltaScore={r.deltaScore} /> },
  ],
};

// ===== 组件 =====

export default function RankTable({
  kind,
  entries,
  models,
  compareSelection,
  onToggleCompare,
  expandedId,
  onToggleExpand,
}: RankTableProps) {
  const cols = COLUMNS[kind];
  const rows = normalizeRows(kind, entries, models);

  const checkboxStyle: CSSProperties = {
    accentColor: 'var(--orange)',
    width: 15,
    height: 15,
    cursor: 'pointer',
    margin: 0,
  };

  const checkbox = (row: RowModel): ReactNode => (
    <input
      type="checkbox"
      aria-label={`将 ${row.name} 加入对比`}
      checked={compareSelection.has(row.model_id)}
      onChange={() => onToggleCompare(row.model_id)}
      onClick={(ev) => ev.stopPropagation()}
      style={checkboxStyle}
    />
  );

  const expandRow = (row: RowModel): ReactNode => (
    <tr className={`rt__expand${expandedId === row.model_id ? ' rt__expand--open' : ''}`} aria-hidden={expandedId !== row.model_id}>
      <td colSpan={cols.length + 1}>
        {/* Task 10 在此挂 TrendPanel；先渲染 max-height 过渡空占位 */}
        <div className="rt__expand-inner">
          <div className="rt__expand-content" />
        </div>
      </td>
    </tr>
  );

  if (rows.length === 0) {
    return (
      <div className="rt">
        <p className="label-caps rt__empty">无匹配模型</p>
      </div>
    );
  }

  return (
    <div className="rt">
      {/* 桌面表格（<768px 隐藏） */}
      <div className="rt__tablewrap">
        <table className="rt-table">
          <thead>
            <tr>
              <th className="rt-th rt-th--check" scope="col">
                <span className="visually-hidden">对比</span>
              </th>
              {cols.map((c) => (
                <th
                  key={c.header}
                  className={`rt-th${c.variant === 'num' ? ' rt-th--num' : ''}`}
                  style={c.width ? { width: c.width } : undefined}
                  scope="col"
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.model_id}>
                <tr
                  className="rt-tr"
                  onClick={() => onToggleExpand(row.model_id)}
                  onKeyDown={(ev) => {
                    if (ev.target !== ev.currentTarget) return; // 行内控件（复选框）按键不触发行展开
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onToggleExpand(row.model_id);
                    }
                  }}
                  tabIndex={0}
                  aria-expanded={expandedId === row.model_id}
                >
                  <td className="rt-td rt-td--check" onClick={(ev) => ev.stopPropagation()}>
                    {checkbox(row)}
                  </td>
                  {cols.map((c) => (
                    <td key={c.header} className={`rt-td${c.variant === 'num' ? ' rt-td--num' : ''}`}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
                {expandRow(row)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* 移动端卡片列表（≥768px 隐藏）；同一份 rows 数据驱动 */}
      <div className="rt__cards">
        {rows.map((row) => (
          <div
            key={row.model_id}
            className="rt-card"
            onClick={() => onToggleExpand(row.model_id)}
            onKeyDown={(ev) => {
              if (ev.target !== ev.currentTarget) return; // 行内控件（复选框）按键不触发卡片展开
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onToggleExpand(row.model_id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-expanded={expandedId === row.model_id}
          >
            <div className="rt-card__rank mono">{row.rank}</div>
            <div className="rt-card__body">
              <div className="rt-card__title">
                <NameCell row={row} />
              </div>
              <div className="rt-card__org label-caps">{row.org}</div>
              <div className="rt-card__score-row">
                <span className="rt-card__score mono">{row.scoreText}</span>
                {row.rail && (
                  <TickRail
                    value={row.rail.value}
                    min={row.rail.min}
                    max={row.rail.max}
                    ticks={[...row.rail.ticks]}
                    accent={row.oss ? 'blue' : 'ink'}
                  />
                )}
                <DeltaBadge rankPrev={row.rankPrev} deltaScore={row.deltaScore} />
              </div>
            </div>
            {/* 复选框独立于卡片点击展开 */}
            <label className="rt-card__check" onClick={(ev) => ev.stopPropagation()}>
              {checkbox(row)}
            </label>
            <div className="rt-card__expand">
              {/* Task 10 在此挂 TrendPanel 占位 */}
              <div className="rt-card__expand-content" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
