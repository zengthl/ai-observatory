/**
 * 分领域维度配置（Kind × Dimension 双轴抽象）。
 * 核心约定：
 * - 一级 Tab（Kind）只控制 sub 可见性：'llm' 只见 aa/arena/livebench；'agent' 只见 swe/tbench
 * - 每个 kind 自己决定 1–N 个 dimension（多 dimension 必含 overall）
 * - 表格主分由 `dimDef.getScore(entry)` 取得；缺失返回 null 时该行不显
 * - 整体维（isOverall=true）有 subBadges（总榜旁的小分项徽标）
 * - 整体维 trendKeys 多线（橙 + 各分项色）；分项维只画单线（蓝/紫罗兰）
 *
 * 阶段 1（massive-s1）：DIMENSIONS 从 5 维扩到 19 维（AA 总 3 + AA 新 6 + Arena 3 + LiveBench 6 + SWE 1 + TB 1 = 19）。
 * 按 `${kind}_${id}` 索引为扁平的 Record<string, DimensionDef>，让 App.tsx 平铺更简单。
 */
import type {
  AAIndexEntry,
  ArenaEloEntry,
  GenericLLMEntry,
  SweEntry,
  TBenchEntry,
} from '../types';

/** 任意一种榜单条目（按 kind 决定具体窄化） */
export type BoardEntry = ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry | GenericLLMEntry;

export type Kind = 'arena' | 'aa' | 'livebench' | 'swe' | 'tbench';

export type DimensionId = string;

export type SubBadge<T = unknown> = {
  label: string;
  tooltip: string;
  getValue: (e: T) => number | null;
};

export type TrendKey = {
  key: string;
  color: 'orange' | 'blue' | 'violet';
  label: string;
};

export interface RailConfig {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * 单个分项维度的配置。T 收敛到该维对应 kind 的条目类型。
 *
 * 多 kind 共享同一 DIMENSIONS 容器时用 DimensionDef<any> 抹平联合；
 * 调用方需自行按 `kind` 字段决定具体窄化（见 findDimension / getDimensions）。
 */
export interface DimensionDef<T extends BoardEntry = BoardEntry> {
  /** 在所属 kind 内唯一；DIMENSIONS 顶层 key 是 `${kind}_${id}` */
  id: DimensionId;
  label: string;
  axisLabel: string;
  isOverall: boolean;
  getScore: (e: T) => number | null;
  getCi95?: (e: T) => [number, number] | undefined;
  getRail: () => RailConfig;
  subBadges?: SubBadge<T>[];
  trendKeys: TrendKey[];
}

// ===== Arena (3 维：overall / code / webdev) =====
const arenaOverall: DimensionDef<ArenaEloEntry> = {
  id: 'overall',
  label: 'Arena 总榜',
  axisLabel: 'ARENA ELO',
  isOverall: true,
  getScore: (e) => e.score,
  getCi95: (e) => e.ci95,
  getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
  subBadges: [
    {
      label: 'code',
      tooltip: 'Arena Elo 代码',
      getValue: (e) => e.categories?.code ?? null,
    },
    {
      label: 'webdev',
      tooltip: 'Arena Elo WebDev',
      getValue: (e) => e.categories?.webdev ?? null,
    },
  ],
  trendKeys: [
    { key: 'overall', color: 'orange', label: '总榜' },
    { key: 'code', color: 'blue', label: 'code' },
    { key: 'webdev', color: 'violet', label: 'webdev' },
  ],
};
const arenaCode: DimensionDef<ArenaEloEntry> = {
  id: 'code',
  label: 'Arena 代码',
  axisLabel: 'ARENA ELO / CODE',
  isOverall: false,
  getScore: (e) => e.categories?.code ?? null,
  getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
  trendKeys: [{ key: 'code', color: 'blue', label: 'code' }],
};
const arenaWebdev: DimensionDef<ArenaEloEntry> = {
  id: 'webdev',
  label: 'Arena WebDev',
  axisLabel: 'ARENA ELO / WEBDEV',
  isOverall: false,
  getScore: (e) => e.categories?.webdev ?? null,
  getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
  trendKeys: [{ key: 'webdev', color: 'violet', label: 'webdev' }],
};

// ===== AA (3 维 + 6 新子榜 = 9 维) =====
// 总榜保留 subBadges 模式；6 个新子榜都是单线
const aaOverall: DimensionDef<AAIndexEntry> = {
  id: 'overall',
  label: 'AA 总榜',
  axisLabel: 'AA INTELLIGENCE',
  isOverall: true,
  getScore: (e) => e.index,
  getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
  subBadges: [
    { label: 'coding', tooltip: 'AA Coding 指数', getValue: (e) => e.coding_index ?? null },
    { label: 'math', tooltip: 'AA Math 指数', getValue: (e) => e.math_index ?? null },
  ],
  trendKeys: [
    { key: 'overall', color: 'orange', label: '总榜' },
    { key: 'coding', color: 'blue', label: 'coding' },
    { key: 'math', color: 'violet', label: 'math' },
  ],
};
const aaCoding: DimensionDef<AAIndexEntry> = {
  id: 'coding',
  label: 'AA Coding',
  axisLabel: 'AA CODING INDEX',
  isOverall: false,
  getScore: (e) => e.coding_index ?? null,
  getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
  trendKeys: [{ key: 'coding', color: 'blue', label: 'coding' }],
};
const aaMath: DimensionDef<AAIndexEntry> = {
  id: 'math',
  label: 'AA Math',
  axisLabel: 'AA MATH INDEX',
  isOverall: false,
  getScore: (e) => e.math_index ?? null,
  getRail: () => ({ min: 40, max: 100, ticks: [40, 60, 80, 100] }),
  trendKeys: [{ key: 'math', color: 'violet', label: 'math' }],
};

/** AA 6 个新子榜的统一 rail 配置（百分制 0–100） */
const aaNewRail = (): RailConfig => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });

const aaMmluPro: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'mmlu_pro',
  label: 'AA MMLU-Pro',
  axisLabel: 'AA MMLU-PRO',
  isOverall: false,
  // 兼容 AAIndexEntry（无字段 → null）和 GenericLLMEntry（score 字段）
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'mmlu_pro' }],
};
const aaGpqa: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'gpqa',
  label: 'AA GPQA',
  axisLabel: 'AA GPQA',
  isOverall: false,
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'gpqa' }],
};
const aaHle: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'hle',
  label: 'AA HLE',
  axisLabel: 'AA HLE',
  isOverall: false,
  getScore: (e) => ('score' in e ? e.score : null),
  // HLE 是已知最难基准，top 模型 ~50；单独给窄区间让对比更清楚
  getRail: () => ({ min: 0, max: 50, ticks: [0, 15, 30, 45] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'hle' }],
};
const aaLivecodebench: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'livecodebench',
  label: 'AA LiveCodeBench',
  axisLabel: 'AA LIVECODEBENCH',
  isOverall: false,
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'livecodebench' }],
};
const aaIfeval: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'ifeval',
  label: 'AA IFEval',
  axisLabel: 'AA IFEVAL',
  isOverall: false,
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'ifeval' }],
};
const aaLcr: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'lcr',
  label: 'AA 长上下文检索',
  axisLabel: 'AA LCR',
  isOverall: false,
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'lcr' }],
};

// ===== LiveBench (6 维，全部 GenericLLMEntry 形态) =====
const livebenchRail = (): RailConfig => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });

const lbCoding: DimensionDef<GenericLLMEntry> = {
  id: 'coding',
  label: 'LiveBench 代码',
  axisLabel: 'LIVEBENCH CODING',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'coding' }],
};
const lbMath: DimensionDef<GenericLLMEntry> = {
  id: 'math',
  label: 'LiveBench 数学',
  axisLabel: 'LIVEBENCH MATH',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'math' }],
};
const lbReasoning: DimensionDef<GenericLLMEntry> = {
  id: 'reasoning',
  label: 'LiveBench 推理',
  axisLabel: 'LIVEBENCH REASONING',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'reasoning' }],
};
const lbLanguage: DimensionDef<GenericLLMEntry> = {
  id: 'language',
  label: 'LiveBench 语言',
  axisLabel: 'LIVEBENCH LANGUAGE',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'language' }],
};
const lbDataAnalysis: DimensionDef<GenericLLMEntry> = {
  id: 'data_analysis',
  label: 'LiveBench 数据分析',
  axisLabel: 'LIVEBENCH DATA',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'data_analysis' }],
};
const lbInstructionFollowing: DimensionDef<GenericLLMEntry> = {
  id: 'instruction_following',
  label: 'LiveBench 指令遵循',
  axisLabel: 'LIVEBENCH IF',
  isOverall: false,
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'instruction_following' }],
};

// ===== Agent 维度（SWE / TB 各自 1 维 overall）=====
const sweOverall: DimensionDef<SweEntry> = {
  id: 'overall',
  label: 'SWE-bench',
  axisLabel: 'SWE-BENCH VERIFIED %',
  isOverall: true,
  getScore: (e) => e.resolved_pct,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
};
const tbenchOverall: DimensionDef<TBenchEntry> = {
  id: 'overall',
  label: 'Terminal-Bench',
  axisLabel: 'TERMINAL-BENCH %',
  isOverall: true,
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
};

/**
 * 扁平化索引：key = `${kind}_${id}`。让 App.tsx 平铺生成 sub tabs 时按前缀过滤。
 * 调用方仍可通过 (kind, id) 拿到具体 DimensionDef。
 */
export const DIMENSIONS: Record<string, DimensionDef<any>> = {
  arena_overall: arenaOverall,
  arena_code: arenaCode,
  arena_webdev: arenaWebdev,
  aa_overall: aaOverall,
  aa_coding: aaCoding,
  aa_math: aaMath,
  aa_mmlu_pro: aaMmluPro,
  aa_gpqa: aaGpqa,
  aa_hle: aaHle,
  aa_livecodebench: aaLivecodebench,
  aa_ifeval: aaIfeval,
  aa_lcr: aaLcr,
  livebench_coding: lbCoding,
  livebench_math: lbMath,
  livebench_reasoning: lbReasoning,
  livebench_language: lbLanguage,
  livebench_data_analysis: lbDataAnalysis,
  livebench_instruction_following: lbInstructionFollowing,
  swe_overall: sweOverall,
  tbench_overall: tbenchOverall,
};

/** 由 key 拆分 (kind, id)；非法 key 返回 null */
export function splitDimKey(key: string): { kind: Kind; id: string } | null {
  const idx = key.indexOf('_');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as Kind;
  if (!['arena', 'aa', 'livebench', 'swe', 'tbench'].includes(kind)) return null;
  return { kind, id: key.slice(idx + 1) };
}

/** 取得某 kind 全部 dimension 定义（按声明顺序） */
export function getDimensions<K extends Kind>(kind: K): DimensionDef<BoardEntryOf<K>>[] {
  return Object.entries(DIMENSIONS)
    .filter(([k]) => k.startsWith(`${kind}_`))
    .map(([, v]) => v) as DimensionDef<BoardEntryOf<K>>[];
}

/** 按 (kind, dimension) 查找 dimension 定义；找不到返回 undefined。返回类型按 kind 收窄。 */
export function findDimension<K extends Kind>(
  kind: K,
  id: DimensionId,
): DimensionDef<BoardEntryOf<K>> | undefined {
  return DIMENSIONS[`${kind}_${id}`] as DimensionDef<BoardEntryOf<K>> | undefined;
}

/** Kind → 对应 BoardEntry 子类型映射（用于 DimensionDef 类型参数推断） */
export type BoardEntryOf<K extends Kind> = K extends 'arena'
  ? ArenaEloEntry
  : K extends 'aa'
    ? AAIndexEntry
    : K extends 'livebench'
      ? GenericLLMEntry
      : K extends 'swe'
        ? SweEntry
        : TBenchEntry;
