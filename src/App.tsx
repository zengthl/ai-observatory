import { useCallback, useMemo, useState } from 'react';
import { useBoardData } from './hooks/useBoardData';
import { useFilters } from './hooks/useFilters';
import type { AAIndexEntry, ArenaEloEntry, LatestFile, ModelMeta, SweEntry, TBenchEntry } from './types';
import TopBar from './components/TopBar';
import HeroChampions from './components/HeroChampions';
import BoardTabs from './components/BoardTabs';
import FilterBar from './components/FilterBar';
import RankTable from './components/RankTable';
import ErrorState from './components/ErrorState';

type BoardTab = 'llm' | 'agent';
type LlmSub = 'arena' | 'aa';
type AgentSub = 'swe' | 'tbench';
type SubTab = LlmSub | AgentSub;

const SUB_LABELS: Record<SubTab, string> = {
  arena: 'Arena Elo',
  aa: 'AA 指数',
  swe: 'SWE-bench',
  tbench: 'Terminal-Bench',
};

/** 二级子榜切换（与 BoardTabs 同款样式，小一号） */
function SubTabs({ board, tab, onChange }: { board: BoardTab; tab: SubTab; onChange: (t: SubTab) => void }) {
  const keys: SubTab[] = board === 'llm' ? ['arena', 'aa'] : ['swe', 'tbench'];
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
  const [compareSelection, setCompareSelection] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  void history; // Task 10 时间序列消费

  const modelsById = useMemo(() => {
    const map: Record<string, ModelMeta> = {};
    for (const m of latest?.models ?? []) map[m.model_id] = m;
    return map;
  }, [latest]);

  const onToggleCompare = useCallback((model_id: string) => {
    setCompareSelection((prev) => {
      const next = new Set(prev);
      if (next.has(model_id)) next.delete(model_id);
      else next.add(model_id); // 勾满 2 个的对比行为 Task 11 处理
      return next;
    });
  }, []);

  const onToggleExpand = useCallback((model_id: string) => {
    setExpandedId((prev) => (prev === model_id ? null : model_id));
  }, []);

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
    else entries = latest.agent.terminal_bench;
  }
  const { filtered, orgs, filter, setFilter } = useFilters(entries, modelsById);
  const filteredAny = filtered as Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry>;

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
    </>
  );
}

interface BoardBodyProps {
  latest: LatestFile;
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
      {/* 二级切换：LLM → Arena Elo / AA 指数；Agent → SWE-bench / Terminal-Bench */}
      <SubTabs board={board} tab={sub} onChange={onSubChange} />
      <FilterBar orgs={orgs} filter={filter} setFilter={onFilterChange} count={filtered.length} />
      <RankTable
        key={sub}
        kind={sub}
        entries={filtered}
        models={modelsById}
        compareSelection={compareSelection}
        onToggleCompare={onToggleCompare}
        expandedId={expandedId}
        onToggleExpand={onToggleExpand}
      />
    </>
  );
}
