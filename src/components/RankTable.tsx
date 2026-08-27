import { Fragment, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  AAIndexEntry,
  ArenaEloEntry,
  GenericLLMEntry,
  History,
  ModelMeta,
  SweEntry,
  TBenchEntry,
} from '../types';
import DeltaBadge from './DeltaBadge';
import TickRail from './TickRail';
import TrendPanel from './TrendPanel';
import type { Top3Ref, TrendBoard } from './TrendPanel';
import type { BoardEntryOf, DimensionDef, DimensionId, Kind } from '../lib/boards';
import { findDimension } from '../lib/boards';

export type RankKind = Kind;

/** 榜单 kind → history 序列键。AA 6 新子榜用对应 board，LiveBench 6 个用对应 board。 */
const BOARD_OF: Record<RankKind, TrendBoard> = {
  arena: 'arena_elo',
  aa: 'aa_index',
  livebench: 'livebench_coding', // 实际由 dimension 决定（见 LiveBench BOARD_OF_BY_DIM）
  swe: 'swebench_verified',
  tbench: 'terminal_bench',
};

/** LiveBench 不同 dimension 映射不同 TrendBoard */
const LIVEBENCH_BOARD_BY_DIM: Record<string, TrendBoard> = {
  coding: 'livebench_coding',
  math: 'livebench_math',
  reasoning: 'livebench_reasoning',
  language: 'livebench_language',
  data_analysis: 'livebench_data_analysis',
  instruction_following: 'livebench_instruction_following',
};

const AA_BOARD_BY_DIM: Record<string, TrendBoard> = {
  overall: 'aa_index',
  coding: 'aa_index', // 暂用主榜占位（数学用主榜）
  math: 'aa_index',
  mmlu_pro: 'aa_mmlu_pro',
  gpqa: 'aa_gpqa',
  hle: 'aa_hle',
  livecodebench: 'aa_livecodebench',
  ifeval: 'aa_ifeval',
  lcr: 'aa_lcr',
};

type AnyEntries =
  | ArenaEloEntry[]
  | AAIndexEntry[]
  | GenericLLMEntry[]
  | SweEntry[]
  | TBenchEntry[]
  | Array<ArenaEloEntry | AAIndexEntry | GenericLLMEntry | SweEntry | TBenchEntry>;

export interface RankTableProps {
  kind: RankKind;
  dimension: DimensionId;
  entries: AnyEntries;
  models: Record<string, ModelMeta>;
  history: History | null;
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
  /** 主分数文本（基于 dimDef.getScore 的输出） */
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
  /** 分项徽标展示数据（isOverall 时填充） */
  subBadges?: Array<{ label: string; value: number; tooltip: string }>;
}

const fmt1 = (n: number): string => n.toFixed(1);

function fmtScore(n: number, kind: RankKind): string {
  if (kind === 'aa') return fmt1(n);
  if (kind === 'swe' || kind === 'tbench') return `${fmt1(n)}%`;
  if (kind === 'livebench') return `${fmt1(n)}%`; // 百分制
  return String(n);
}

function normalizeRows<K extends RankKind>(
  kind: K,
  dimDef: DimensionDef<BoardEntryOf<K>>,
  entries: AnyEntries,
  models: Record<string, ModelMeta>,
): RowModel[] {
  const raw = entries as unknown as ReadonlyArray<Record<string, unknown>>;
  const out: RowModel[] = [];
  raw.forEach((e, i) => {
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

    // 主分（由 dimDef.getScore 取得；null 则整行过滤）
    const score = dimDef.getScore(e as unknown as BoardEntryOf<K>);
    if (score == null) return;

    const scoreText = fmtScore(score, kind);
    const subBadges: Array<{ label: string; value: number; tooltip: string }> = [];
    if (dimDef.isOverall && dimDef.subBadges) {
      for (const sb of dimDef.subBadges) {
        const v = sb.getValue(e as unknown as BoardEntryOf<K>);
        if (v != null) {
          subBadges.push({ label: sb.label, value: v, tooltip: `${sb.tooltip} ${v}` });
        }
      }
    }

    const railBase = dimDef.getRail();

    if (kind === 'arena') {
      const a = e as unknown as ArenaEloEntry;
      // kind 已被 === 分支窄化，dimDef 跟着窄到具体类型避免联合签名传递
      const arenaDim = dimDef as DimensionDef<ArenaEloEntry>;
      const ci = arenaDim.getCi95?.(a);
      const ciHalf = ci ? Math.round((ci[1] - ci[0]) / 2) : undefined;
      out.push({
        ...base,
        scoreText,
        ciHalf,
        cats: a.categories,
        subBadges: subBadges.length > 0 ? subBadges : undefined,
        rail: { value: score, ...railBase },
      });
      return;
    }
    if (kind === 'aa') {
      const a = e as unknown as AAIndexEntry;
      out.push({
        ...base,
        scoreText,
        rail: { value: score, ...railBase },
        speedTps: a.output_speed_tps ?? null,
        priceBlin: a.price_blin_per_m ?? null,
        subBadges: subBadges.length > 0 ? subBadges : undefined,
      });
      return;
    }
    if (kind === 'swe') {
      const s = e as unknown as SweEntry;
      out.push({
        ...base,
        scoreText,
        rail: { value: score, ...railBase },
        agent: s.agent ?? '—',
        costUsd: s.cost_usd_per_instance ?? null,
      });
      return;
    }
    if (kind === 'livebench') {
      // GenericLLMEntry：单分项，无附加列
      out.push({
        ...base,
        scoreText,
        rail: { value: score, ...railBase },
      });
      return;
    }
    out.push({
      ...base,
      scoreText,
      rail: { value: score, ...railBase },
    });
  });
  return out;
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
      <span className="rt__score-main">
        <span className="mono rt__score-num">{row.scoreText}</span>
        {row.ciHalf !== undefined && <span className="rt__ci">±{row.ciHalf}</span>}
      </span>
      {row.subBadges && row.subBadges.length > 0 && (
        <span className="rt__subbadges">
          {row.subBadges.map((b) => (
            <span className="sub-badge" key={b.label} title={b.tooltip}>
              {b.label} {b.value}
            </span>
          ))}
        </span>
      )}
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

function SubBadgesCardRow({ row }: { row: RowModel }) {
  if (!row.subBadges || row.subBadges.length === 0) return null;
  return (
    <div className="rt-card__subbadges" style={{ width: '100%', flexBasis: '100%' }}>
      {row.subBadges.map((b) => (
        <span className="sub-badge" key={b.label} title={b.tooltip}>
          {b.label} {b.value}
        </span>
      ))}
    </div>
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
    // 智能指数列 header 由组件内运行时基于 dimension 动态覆盖（COLUMNS 仅保留壳）
    { header: '__SCORE__', width: 210, render: (r) => <ScoreCell row={r} /> },
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
  livebench: [
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
  dimension,
  entries,
  models,
  history,
  compareSelection,
  onToggleCompare,
  expandedId,
  onToggleExpand,
}: RankTableProps) {
  const dimDef = findDimension(kind, dimension);
  if (!dimDef) {
    return (
      <div className="rt">
        <p className="label-caps rt__empty">维度 {dimension} 不存在</p>
      </div>
    );
  }
  const cols = COLUMNS[kind];
  // rows 引用稳定化：normalizeRows 每 render 裸调用会产生新数组，
  // 使 top3Refs useMemo 每次失效 → TrendPanel effect 重跑（图表整体销毁重建）。
  // 勾选对比复选框等无关 state 变更不应触发图表重建。
  const rows = useMemo(
    () => normalizeRows(kind, dimDef, entries, models),
    [kind, dimDef, entries, models],
  );

  // 展开趋势图的前三参照（当前榜前 3 名；TrendPanel 内部再排除主模型自己）
  const top3Refs = useMemo<Top3Ref[]>(
    () =>
      rows.slice(0, 3).map((r) => ({
        modelId: r.model_id,
        score: Number(r.scoreText.replace(/[%±].*/g, '')) || 0,
      })),
    [rows],
  );
  // 不同 kind / dimension 映射到对应的历史序列：
  // - arena/aa_overall/aa_coding/aa_math：主榜
  // - AA 6 新子榜：各自独立序列
  // - LiveBench 6 个：各自独立序列
  const board: TrendBoard =
    kind === 'aa'
      ? (AA_BOARD_BY_DIM[dimension] ?? 'aa_index')
      : kind === 'livebench'
        ? (LIVEBENCH_BOARD_BY_DIM[dimension] ?? 'livebench_coding')
        : BOARD_OF[kind];

  // AA 维度的"主分列"header：基于 dimDef.label 动态取名
  //   overall/coding/math → "智能指数 / Coding 指数 / Math 指数"（保持原命名习惯）
  //   6 个新子榜 → "{LABEL}"（如 HLE 50 区间）
  const aaScoreHeader =
    kind === 'aa'
      ? (dimension === 'overall' ? '智能指数' : dimension === 'coding' ? 'Coding 指数' : dimension === 'math' ? 'Math 指数' : dimDef.label)
      : null;

  /** 展开内容：仅展开的行真正挂载 TrendPanel（避免 50 行同时建 echarts 实例） */
  const expandContent = (row: RowModel): ReactNode => {
    if (expandedId !== row.model_id) return null;
    return history ? (
      <TrendPanel
        modelId={row.model_id}
        board={board}
        history={history}
        top3Refs={top3Refs}
        dimension={dimDef}
      />
    ) : (
      <p className="trend-panel__empty">暂无历史数据</p>
    );
  };

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
        <div className="rt__expand-inner">
          <div className="rt__expand-content">{expandContent(row)}</div>
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
              {cols.map((c) => {
                const display = c.header === '__SCORE__' ? (aaScoreHeader ?? '分数') : c.header;
                return (
                  <th
                    key={display}
                    className={`rt-th${c.variant === 'num' ? ' rt-th--num' : ''}`}
                    style={c.width ? { width: c.width } : undefined}
                    scope="col"
                  >
                    {display}
                  </th>
                );
              })}
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
              <SubBadgesCardRow row={row} />
            </div>
            {/* 复选框独立于卡片点击展开 */}
            <label className="rt-card__check" onClick={(ev) => ev.stopPropagation()}>
              {checkbox(row)}
            </label>
            <div className="rt-card__expand">
              {/* 常规文档流展开：推开后续卡片（max-height 过渡） */}
              <div className="rt-card__expand-content">{expandContent(row)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
