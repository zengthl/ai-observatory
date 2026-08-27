import { useCallback, useMemo, useState } from 'react';
import { useBoardData } from './hooks/useBoardData';
import { useFilters } from './hooks/useFilters';
import type {
  AAIndexEntry,
  ArenaEloEntry,
  History,
  LatestFile,
  ModelMeta,
  SweEntry,
  TBenchEntry,
  SourceName,
} from './types';
import { addToFifoSelection } from './lib/compare';
import type { DimensionId, Kind } from './lib/boards';
import { getDimensions } from './lib/boards';
import TopBar from './components/TopBar';
import HeroChampions from './components/HeroChampions';
import BoardTabs from './components/BoardTabs';
import FilterBar from './components/FilterBar';
import RankTable from './components/RankTable';
import ErrorState from './components/ErrorState';
import CompareDrawer from './components/CompareDrawer';
import ScatterView from './components/ScatterView';
import BoardUnavailable from './components/BoardUnavailable';
import Footer from './components/Footer';

type BoardTab = 'llm' | 'agent';

/** 一级 Tab 是 LLM/Agent；二级 sub 内部按 (kind, dimension) 联合或 scatter 单列 */
type SubTab = { kind: Kind; dimension: DimensionId } | 'scatter';

const SUB_SOURCE: Record<Kind, SourceName> = {
  arena: 'lmarena',
  aa: 'artificial_analysis',
  swe: 'swebench',
  tbench: 'artificial_analysis',
};

/** 子榜的 (kind, dimension) 元组；按 UI 平铺顺序固定 */
const SUB_TABS: Array<{ kind: Kind; dimension: DimensionId; label: string }> = [
  ...getDimensions('arena').map((d) => ({ kind: 'arena' as Kind, dimension: d.id, label: d.label })),
  ...getDimensions('aa').map((d) => ({ kind: 'aa' as Kind, dimension: d.id, label: d.label })),
  ...getDimensions('swe').map((d) => ({ kind: 'swe' as Kind, dimension: d.id, label: d.label })),
  ...getDimensions('tbench').map((d) => ({ kind: 'tbench' as Kind, dimension: d.id, label: d.label })),
];

function isBoardTabMatch(sub: SubTab, tab: BoardTab): boolean {
  if (sub === 'scatter') return tab === 'llm';
  if (tab === 'llm') return sub.kind === 'arena' || sub.kind === 'aa';
  return sub.kind === 'swe' || sub.kind === 'tbench';
}

/** 二级子榜切换（与 BoardTabs 同款样式，小一号） */
function SubTabs({
  tab,
  onChange,
}: {
  board?: BoardTab;
  tab: SubTab;
  onChange: (t: SubTab) => void;
}) {
  return (
    <div className="subtabs" role="tablist" aria-label="子榜单切换">
      {SUB_TABS.map((t) => {
        const sub: SubTab = { kind: t.kind, dimension: t.dimension };
        const active = tab !== 'scatter' && tab.kind === t.kind && tab.dimension === t.dimension;
        return (
          <button
            key={`${t.kind}-${t.dimension}`}
            type="button"
            role="tab"
            aria-selected={active}
            className="subtabs__tab"
            data-kind={t.kind}
            data-dimension={t.dimension}
            onClick={() => onChange(sub)}
          >
            {t.label}
          </button>
        );
      })}
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'scatter'}
        className="subtabs__tab"
        onClick={() => onChange('scatter')}
      >
        速度 × 价格
      </button>
    </div>
  );
}

export default function App() {
  const { loading, error, retry, latest, history, pendingCount, pendingTotal } = useBoardData();
  const [board, setBoard] = useState<BoardTab>('llm');
  const [sub, setSub] = useState<SubTab>({ kind: 'arena', dimension: 'overall' });
  // 对比选择（最多 2 个，Set 保序：先勾的在前）
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /**
   * 复选框语义：再点已勾选者取消勾选；勾第三个时 FIFO 替换最早的那个
   * （selection 始终 ≤2 且保插入序）。替换规则在 lib/compare.ts 的
   * addToFifoSelection（纯函数，有单测），此处仅负责取消勾选与数组 → Set 的状态包装。
   */
  const onToggleCompare = useCallback((model_id: string) => {
    setCompareSelection((prev) => {
      if (prev.has(model_id)) {
        const next = new Set(prev);
        next.delete(model_id);
        return next;
      }
      return new Set(addToFifoSelection([...prev], model_id));
    });
  }, []);

  const onToggleExpand = useCallback((model_id: string) => {
    setExpandedId((prev) => (prev === model_id ? null : model_id));
  }, []);

  /** 关闭对比抽屉并清空勾选，让复选框状态与抽屉一致 */
  const closeCompare = useCallback(() => setCompareSelection(new Set()), []);

  // 切子榜时重置 org 筛选（新榜单可能不含当前 org，避免 0 行空白）；query/license 保留
  const changeSub = (s: SubTab) => {
    setFilter((f) => ({ ...f, org: '' }));
    setSub(s);
  };

  const changeBoard = (b: BoardTab) => {
    setBoard(b);
    // 换主榜时把子榜重置到该榜的第一个 dimension
    const fallback: SubTab = b === 'llm'
      ? { kind: 'arena', dimension: 'overall' }
      : { kind: 'swe', dimension: 'overall' };
    setSub(fallback);
    setFilter((f) => ({ ...f, org: '' }));
  };

  // 当前子榜单数据 + useFilters（各榜单独立筛选状态由 key 重挂载保证）
  let entries: Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry> = [];
  if (latest && sub !== 'scatter') {
    if (sub.kind === 'arena') entries = latest.llm.arena_elo;
    else if (sub.kind === 'aa') entries = latest.llm.aa_index;
    else if (sub.kind === 'swe') entries = latest.agent.swebench_verified;
    else if (sub.kind === 'tbench') entries = latest.agent.terminal_bench;
  }
  // model_id 索引全站唯一构建处；useMemo 保持引用稳定，
  // 否则 useFilters/RankTable 内部 useMemo 每次 render 失效 → 趋势图无谓重建
  const models = useMemo(() => modelsById(latest), [latest]);
  const { filtered, orgs, filter, setFilter } = useFilters(entries, models);
  const filteredAny = filtered as Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry>;

  // 勾满两个自动弹出抽屉：left=先勾的，right=后勾的（Set 保插入序）
  const comparePair =
    latest && compareSelection.size === 2 ? [...compareSelection] : null;

  return (
    <>
      <TopBar date={latest?.date ?? ''} />
      <main className="page">
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading || !latest ? (
          <p style={{ padding: 48 }} className="label-caps">
            LOADING…
          </p>
        ) : (
          <BoardBody
            latest={latest}
            history={history}
            board={board}
            sub={sub}
            onBoardChange={changeBoard}
            onSubChange={changeSub}
            filtered={filteredAny}
            orgs={orgs}
            filter={filter}
            onFilterChange={setFilter}
            compareSelection={compareSelection}
            onToggleCompare={onToggleCompare}
            expandedId={expandedId}
            onToggleExpand={onToggleExpand}
            models={models}
          />
        )}
      </main>
      {/* 对比抽屉挂在页面底部，独立于 BoardBody 的加载分支 */}
      {comparePair && (
        <CompareDrawer left={comparePair[0]} right={comparePair[1]} latest={latest!} onClose={closeCompare} />
      )}
      {latest && <Footer latest={latest} pendingCount={pendingCount} pendingTotal={pendingTotal} />}
    </>
  );
}

/** models 列表 → model_id 索引（全站唯一构建处） */
function modelsById(latest: LatestFile | null): Record<string, ModelMeta> {
  const map: Record<string, ModelMeta> = {};
  for (const m of latest?.models ?? []) map[m.model_id] = m;
  return map;
}

interface BoardBodyProps {
  latest: LatestFile;
  history: History | null;
  board: BoardTab;
  sub: SubTab;
  onBoardChange: (b: BoardTab) => void;
  onSubChange: (s: SubTab) => void;
  filtered: Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry>;
  orgs: string[];
  filter: ReturnType<typeof useFilters>['filter'];
  onFilterChange: ReturnType<typeof useFilters>['setFilter'];
  compareSelection: Set<string>;
  onToggleCompare: (model_id: string) => void;
  expandedId: string | null;
  onToggleExpand: (model_id: string) => void;
  models: Record<string, ModelMeta>;
}

function BoardBody({
  latest,
  history,
  board,
  sub,
  onBoardChange,
  onSubChange,
  filtered,
  orgs,
  filter,
  onFilterChange,
  compareSelection,
  onToggleCompare,
  expandedId,
  onToggleExpand,
  models,
}: BoardBodyProps) {
  const subKind: Kind | null = sub === 'scatter' ? null : sub.kind;
  const unavailable =
    subKind !== null ? latest.sources[SUB_SOURCE[subKind]]?.status === 'unavailable' : false;
  const isBoardMatch = isBoardTabMatch(sub, board);

  const subLabel =
    sub === 'scatter'
      ? '速度 × 价格'
      : sub.dimension === 'overall'
        ? (sub.kind === 'arena' ? 'Arena Elo' : sub.kind === 'aa' ? 'AA 指数' : sub.kind === 'swe' ? 'SWE-bench' : 'Terminal-Bench')
        : `${sub.kind === 'arena' ? 'Arena' : sub.kind === 'aa' ? 'AA' : sub.kind === 'swe' ? 'SWE' : 'TBench'} · ${sub.dimension}`;

  return (
    <>
      <HeroChampions latest={latest} />
      <BoardTabs tab={board} onChange={onBoardChange} />
      {/* 二级切换：8 个 kind×dimension Tab + 散点（单列最右） */}
      <SubTabs tab={sub} onChange={onSubChange} />
      {sub !== 'scatter' && !unavailable && isBoardMatch && (
        <>
          <FilterBar orgs={orgs} filter={filter} setFilter={onFilterChange} count={filtered.length} />
          <RankTable
            key={`${sub.kind}-${sub.dimension}`}
            kind={sub.kind}
            dimension={sub.dimension}
            entries={filtered}
            models={models}
            history={history}
            compareSelection={compareSelection}
            onToggleCompare={onToggleCompare}
            expandedId={expandedId}
            onToggleExpand={onToggleExpand}
          />
        </>
      )}
      {sub !== 'scatter' && !isBoardMatch && (
        <p className="label-caps" style={{ padding: 32 }}>
          请在 {board === 'llm' ? '大模型榜' : 'Agent 榜'}下查看该子榜
        </p>
      )}
      {sub !== 'scatter' && unavailable && isBoardMatch && subKind && (
        <BoardUnavailable
          name={subLabel}
          lastOk={latest.sources[SUB_SOURCE[subKind]]?.last_ok}
        />
      )}
      {sub === 'scatter' &&
        (latest.sources.artificial_analysis.status === 'unavailable' ? (
          <BoardUnavailable name="速度 × 价格" lastOk={latest.sources.artificial_analysis.last_ok} />
        ) : (
          <ScatterView aaEntries={latest.llm.aa_index} models={models} onSelect={() => {}} />
        ))}
    </>
  );
}
