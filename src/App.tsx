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
} from './types';
import { addToFifoSelection } from './lib/compare';
import TopBar from './components/TopBar';
import HeroChampions from './components/HeroChampions';
import BoardTabs from './components/BoardTabs';
import FilterBar from './components/FilterBar';
import RankTable from './components/RankTable';
import ErrorState from './components/ErrorState';
import CompareDrawer from './components/CompareDrawer';
import ScatterView from './components/ScatterView';

type BoardTab = 'llm' | 'agent';
type LlmSub = 'arena' | 'aa' | 'scatter';
type AgentSub = 'swe' | 'tbench';
type SubTab = LlmSub | AgentSub;

const SUB_LABELS: Record<SubTab, string> = {
  arena: 'Arena Elo',
  aa: 'AA 指数',
  scatter: '速度 × 价格',
  swe: 'SWE-bench',
  tbench: 'Terminal-Bench',
};

/** 二级子榜切换（与 BoardTabs 同款样式，小一号） */
function SubTabs({ board, tab, onChange }: { board: BoardTab; tab: SubTab; onChange: (t: SubTab) => void }) {
  const keys: SubTab[] = board === 'llm' ? ['arena', 'aa', 'scatter'] : ['swe', 'tbench'];
  return (
    <div className="subtabs" role="tablist" aria-label="子榜单切换">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          className="subtabs__tab"
          onClick={() => onChange(k)}
        >
          {SUB_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const { loading, error, retry, latest, history } = useBoardData();
  const [board, setBoard] = useState<BoardTab>('llm');
  const [sub, setSub] = useState<SubTab>('arena');
  // 对比选择（最多 2 个，Set 保序：先勾的在前）
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modelsById = useMemo(() => {
    const map: Record<string, ModelMeta> = {};
    for (const m of latest?.models ?? []) map[m.model_id] = m;
    return map;
  }, [latest]);

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
    changeSub(b === 'llm' ? 'arena' : 'swe'); // 换主榜同样换子榜，org 一并重置
  };

  // 当前子榜单数据 + useFilters（各榜单独立筛选状态由 key 重挂载保证）
  let entries: Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry> = [];
  if (latest) {
    if (sub === 'arena') entries = latest.llm.arena_elo;
    else if (sub === 'aa') entries = latest.llm.aa_index;
    else if (sub === 'swe') entries = latest.agent.swebench_verified;
    else if (sub === 'tbench') entries = latest.agent.terminal_bench;
    // sub === 'scatter' 时 entries 为空数组（FilterBar 隐藏、RankTable 不渲染）
  }
  const { filtered, orgs, filter, setFilter } = useFilters(entries, modelsById);
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
          />
        )}
      </main>
      {/* 对比抽屉挂在页面底部，独立于 BoardBody 的加载分支 */}
      {comparePair && (
        <CompareDrawer left={comparePair[0]} right={comparePair[1]} latest={latest!} onClose={closeCompare} />
      )}
    </>
  );
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
}: BoardBodyProps) {
  const modelsById = useMemo(() => {
    const map: Record<string, ModelMeta> = {};
    for (const m of latest.models) map[m.model_id] = m;
    return map;
  }, [latest]);

  return (
    <>
      <HeroChampions latest={latest} />
      <BoardTabs tab={board} onChange={onBoardChange} />
      {/* 二级切换：LLM → Arena Elo / AA 指数 / 速度×价格散点；Agent → SWE-bench / Terminal-Bench */}
      <SubTabs board={board} tab={sub} onChange={onSubChange} />
      {sub !== 'scatter' && (
        <>
          <FilterBar orgs={orgs} filter={filter} setFilter={onFilterChange} count={filtered.length} />
          <RankTable
            key={sub}
            kind={sub as 'arena' | 'aa' | 'swe' | 'tbench'}
            entries={filtered}
            models={modelsById}
            history={history}
            compareSelection={compareSelection}
            onToggleCompare={onToggleCompare}
            expandedId={expandedId}
            onToggleExpand={onToggleExpand}
          />
        </>
      )}
      {sub === 'scatter' && (
        <ScatterView aaEntries={latest.llm.aa_index} models={modelsById} onSelect={() => {}} />
      )}
    </>
  );
}
