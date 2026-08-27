import { useCallback, useMemo, useState } from 'react';
import { useBoardData } from './hooks/useBoardData';
import { useFilters } from './hooks/useFilters';
import type {
  AAIndexEntry,
  ArenaEloEntry,
  GenericLLMEntry,
  History,
  LatestFile,
  ModelMeta,
  SweEntry,
  TBenchEntry,
  SourceName,
} from './types';
import { addToFifoSelection } from './lib/compare';
import { DIMENSIONS, VIEW_BY_ID, splitDimKey, getDimensionsForView } from './lib/boards';
import type { Kind, ViewId } from './lib/boards';
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

/** Sub tab 由扁平化的 DIMENSIONS key 表达，附 'scatter' 哨兵（仅 general 视图） */
type SubTab = string | 'scatter';

const SUB_SOURCE: Record<Kind, SourceName> = {
  arena: 'lmarena',
  aa: 'artificial_analysis',
  livebench: 'livebench',
  openllm: 'openllm',
  livecodebench: 'livecodebench',
  swe: 'swebench',
  tbench: 'artificial_analysis',
};

/** 'scatter' 哨兵仅在 general 视图下可见 */
function subTabsForView(view: ViewId): SubTab[] {
  const dims = getDimensionsForView(view);
  const out: SubTab[] = dims.map((d) => {
    // 反查 key（同一 kind+id 唯一）
    const key = Object.entries(DIMENSIONS).find(
      ([, v]) => v === d,
    )?.[0];
    return key ?? '';
  }).filter(Boolean) as string[];
  if (view === 'general') out.push('scatter');
  return out;
}

/** 当前 sub 是否属于当前视图（决定能不能渲染表格/散点） */
function isSubVisibleInView(sub: SubTab, view: ViewId): boolean {
  if (sub === 'scatter') return view === 'general';
  const dims = getDimensionsForView(view);
  return dims.some((d) => {
    const key = Object.entries(DIMENSIONS).find(([, v]) => v === d)?.[0];
    return key === sub;
  });
}

/** 把 SubTab 拆出 (kind, dimension)；'scatter' 返回 null */
function subToPair(sub: SubTab): { kind: Kind; dimension: string } | null {
  if (sub === 'scatter') return null;
  const sp = splitDimKey(sub);
  if (!sp) return null;
  return { kind: sp.kind, dimension: sp.id };
}

export default function App() {
  const { loading, error, retry, latest, history, pendingCount, pendingTotal } = useBoardData();
  // 默认进入「综合」视图（用户最常用）
  const [view, setView] = useState<ViewId>('general');
  const [sub, setSub] = useState<SubTab>(VIEW_BY_ID.general.defaultSub);
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

  const changeView = (v: ViewId) => {
    setView(v);
    // 换视图时把 sub 重置到该视图的第一个 dimension（不含 scatter）
    const fallback = VIEW_BY_ID[v].defaultSub;
    setSub(fallback);
    setFilter((f) => ({ ...f, org: '' }));
  };

  // 当前子榜单数据 + useFilters（各榜单独立筛选状态由 key 重挂载保证）
  let entries: Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry | GenericLLMEntry> = [];
  if (latest && sub !== 'scatter') {
    const pair = subToPair(sub);
    if (pair) {
      if (pair.kind === 'arena') entries = latest.llm.arena_elo;
      else if (pair.kind === 'aa') {
        // AA 总/coding/math 用 AAIndexEntry（主榜 entries），6 个新子榜用 GenericLLMEntry
        const AA_OVERALL_IDS = new Set(['overall', 'coding', 'math']);
        if (AA_OVERALL_IDS.has(pair.dimension)) {
          entries = latest.llm.aa_index;
        } else {
          const k = `aa_${pair.dimension}` as keyof LatestFile['llm'];
          entries = ((latest.llm as Record<string, unknown>)[k] as GenericLLMEntry[] | undefined) ?? [];
        }
      }
      else if (pair.kind === 'livebench') {
        const k = `livebench_${pair.dimension}` as keyof LatestFile['llm'];
        entries = ((latest.llm as Record<string, unknown>)[k] as GenericLLMEntry[] | undefined) ?? [];
      }
      else if (pair.kind === 'openllm') {
        const k = `openllm_${pair.dimension}` as keyof LatestFile['llm'];
        entries = ((latest.llm as Record<string, unknown>)[k] as GenericLLMEntry[] | undefined) ?? [];
      }
      else if (pair.kind === 'livecodebench') {
        entries = latest.llm.livecodebench;
      }
      else if (pair.kind === 'swe') entries = latest.agent.swebench_verified;
      else if (pair.kind === 'tbench') entries = latest.agent.terminal_bench;
    }
  }
  // model_id 索引全站唯一构建处；useMemo 保持引用稳定，
  // 否则 useFilters/RankTable 内部 useMemo 每次 render 失效 → 趋势图无谓重建
  const models = useMemo(() => modelsById(latest), [latest]);
  const { filtered, orgs, filter, setFilter } = useFilters(entries, models);
  const filteredAny = filtered as Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry | GenericLLMEntry>;

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
            view={view}
            sub={sub}
            onViewChange={changeView}
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
  view: ViewId;
  sub: SubTab;
  onViewChange: (v: ViewId) => void;
  onSubChange: (s: SubTab) => void;
  filtered: Array<ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry | GenericLLMEntry>;
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
  view,
  sub,
  onViewChange,
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
  const pair = subToPair(sub);
  const subKind: Kind | null = pair ? pair.kind : null;
  const unavailable =
    subKind !== null ? latest.sources[SUB_SOURCE[subKind]]?.status === 'unavailable' : false;
  const isSubMatch = isSubVisibleInView(sub, view);

  const subLabel =
    sub === 'scatter'
      ? '速度 × 价格'
      : pair
        ? DIMENSIONS[sub]?.shortLabel ?? DIMENSIONS[sub]?.label ?? sub
        : sub;

  return (
    <>
      <HeroChampions latest={latest} />
      <BoardTabs tab={view} onChange={onViewChange} />
      <SubTabs view={view} sub={sub} onChange={onSubChange} />
      {sub !== 'scatter' && !unavailable && isSubMatch && pair && (
        <>
          <FilterBar orgs={orgs} filter={filter} setFilter={onFilterChange} count={filtered.length} />
          <RankTable
            key={sub}
            kind={pair.kind}
            dimension={pair.dimension}
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
      {sub !== 'scatter' && !isSubMatch && (
        <p className="label-caps" style={{ padding: 32 }}>
          该子榜不在当前视图，请切换视图
        </p>
      )}
      {sub !== 'scatter' && unavailable && isSubMatch && subKind && (
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

/** Sub tab 渲染：去冗余 shortLabel + CSS Grid 多行布局避免横向滚动 */
function SubTabs({
  view,
  sub,
  onChange,
}: {
  view: ViewId;
  sub: SubTab;
  onChange: (t: SubTab) => void;
}) {
  const visible = subTabsForView(view);
  return (
    <div className="subtabs" role="tablist" aria-label="子榜单切换">
      {visible.map((k) => {
        if (k === 'scatter') {
          const active = sub === 'scatter';
          return (
            <button
              key="scatter"
              type="button"
              role="tab"
              aria-selected={active}
              className="subtabs__tab"
              onClick={() => onChange('scatter')}
            >
              速度 × 价格
            </button>
          );
        }
        const def = DIMENSIONS[k];
        if (!def) return null;
        const active = sub === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active}
            className="subtabs__tab"
            data-view={def.view}
            data-kind={splitDimKey(k)?.kind}
            data-dimension={def.id}
            onClick={() => onChange(k)}
          >
            {def.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
