/**
 * 分领域维度配置（Kind × Dimension 双轴抽象）。
 * 核心约定：
 * - 一级 Tab（View）按"使用场景"分组 5 类：general / coding / knowledge / instruction / agent（外加 speed 散点图）
 * - 每个 kind 自己决定 1–N 个 dimension（多 dimension 必含 overall）
 * - 表格主分由 `dimDef.getScore(entry)` 取得；缺失返回 null 时该行不显
 * - 整体维（isOverall=true）有 subBadges（总榜旁的小分项徽标）
 * - 整体维 trendKeys 多线（橙 + 各分项色）；分项维只画单线（蓝/紫罗兰）
 *
 * 阶段 1（massive-s1）：DIMENSIONS 从 5 维扩到 19 维（AA 总 3 + AA 新 6 + Arena 3 + LiveBench 6 + SWE 1 + TB 1 = 19）。
 * 阶段 2（massive-s2）：加 OpenLLM 6 + LiveCodeBench 1 = +7 → 共 26 维。
 * 阶段 3（tabs-ux）：按 ViewId 分组 5 个视图（不含 speed 散点图），每个 dimension 携带 view + shortLabel。
 * 按 `${kind}_${id}` 索引为扁平的 Record<string, DimensionDef>，让 App.tsx 按 view 过滤。
 */
import type {
  AAIndexEntry,
  ArenaEloEntry,
  GenericLLMEntry,
  LiveCodeBenchEntry,
  SweEntry,
  TBenchEntry,
} from '../types';

/** 任意一种榜单条目（按 kind 决定具体窄化） */
export type BoardEntry = ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry | GenericLLMEntry | LiveCodeBenchEntry;

export type Kind = 'arena' | 'aa' | 'livebench' | 'openllm' | 'livecodebench' | 'swe' | 'tbench';

/**
 * 视图（一级 Tab）。按"使用场景"分组，每个 dimension 标 view 后按视图聚合 sub tabs。
 * - general      综合（跨厂商综合对比，含 Arena Elo 总榜 / AA 智能指数 / AA Coding / AA Math）
 * - coding       代码（编程能力：AA LiveCodeBench / LiveBench Coding / LiveCodeBench 独立源）
 * - knowledge    知识（MMLU-Pro / GPQA / HLE / ARC / HellaSwag / BBH）
 * - instruction  指令·长文（IFEval / 指令遵循 / 长上下文检索）
 * - agent        Agent 任务（SWE-bench / Terminal-Bench）
 *
 * 注意：'speed' 是散点图（不是 dimension），不属于 DIMENSIONS 范畴。
 */
export type ViewId = 'general' | 'coding' | 'knowledge' | 'instruction' | 'agent';

/** 视图元数据（标签、排序、默认 sub tab） */
export interface ViewDef {
  id: ViewId;
  label: string;
  /** 该视图默认进入的 sub tab key（用于初次切换视图时定位） */
  defaultSub: string;
  /** 该视图内 sub tab 渲染顺序（DIMENSIONS key 数组） */
  order: string[];
}

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
  /** 一级 Tab 视图分组；调用方按此字段过滤 + 排序 sub tabs */
  view: ViewId;
  /** sub tab 短文案（去冗余后显示用）。若未指定则回退到 label。 */
  shortLabel: string;
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
  shortLabel: '总榜',
  axisLabel: 'ARENA ELO',
  isOverall: true,
  view: 'general',
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
  shortLabel: 'Arena 代码',
  axisLabel: 'ARENA ELO / CODE',
  isOverall: false,
  view: 'coding',
  getScore: (e) => e.categories?.code ?? null,
  getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
  trendKeys: [{ key: 'code', color: 'blue', label: 'code' }],
};
const arenaWebdev: DimensionDef<ArenaEloEntry> = {
  id: 'webdev',
  label: 'Arena WebDev',
  shortLabel: 'Arena WebDev',
  axisLabel: 'ARENA ELO / WEBDEV',
  isOverall: false,
  view: 'coding',
  getScore: (e) => e.categories?.webdev ?? null,
  getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
  trendKeys: [{ key: 'webdev', color: 'violet', label: 'webdev' }],
};

// ===== AA (3 维 + 6 新子榜 = 9 维) =====
// 总榜保留 subBadges 模式；6 个新子榜都是单线
const aaOverall: DimensionDef<AAIndexEntry> = {
  id: 'overall',
  label: 'AA 总榜',
  shortLabel: '智能指数',
  axisLabel: 'AA INTELLIGENCE',
  isOverall: true,
  view: 'general',
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
  shortLabel: 'AA Coding',
  axisLabel: 'AA CODING INDEX',
  isOverall: false,
  view: 'general',
  getScore: (e) => e.coding_index ?? null,
  getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
  trendKeys: [{ key: 'coding', color: 'blue', label: 'coding' }],
};
const aaMath: DimensionDef<AAIndexEntry> = {
  id: 'math',
  label: 'AA Math',
  shortLabel: 'AA Math',
  axisLabel: 'AA MATH INDEX',
  isOverall: false,
  view: 'general',
  getScore: (e) => e.math_index ?? null,
  getRail: () => ({ min: 40, max: 100, ticks: [40, 60, 80, 100] }),
  trendKeys: [{ key: 'math', color: 'violet', label: 'math' }],
};

/** AA 6 个新子榜的统一 rail 配置（百分制 0–100） */
const aaNewRail = (): RailConfig => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });

const aaMmluPro: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'mmlu_pro',
  label: 'AA MMLU-Pro',
  shortLabel: 'MMLU-Pro',
  axisLabel: 'AA MMLU-PRO',
  isOverall: false,
  view: 'knowledge',
  // 兼容 AAIndexEntry（无字段 → null）和 GenericLLMEntry（score 字段）
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'mmlu_pro' }],
};
const aaGpqa: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'gpqa',
  label: 'AA GPQA',
  shortLabel: 'GPQA',
  axisLabel: 'AA GPQA',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'gpqa' }],
};
const aaHle: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'hle',
  label: 'AA HLE',
  shortLabel: 'HLE',
  axisLabel: 'AA HLE',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => ('score' in e ? e.score : null),
  // HLE 是已知最难基准，top 模型 ~50；单独给窄区间让对比更清楚
  getRail: () => ({ min: 0, max: 50, ticks: [0, 15, 30, 45] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'hle' }],
};
const aaLivecodebench: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'livecodebench',
  label: 'AA LiveCodeBench',
  shortLabel: 'AA LiveCodeBench',
  axisLabel: 'AA LIVECODEBENCH',
  isOverall: false,
  view: 'coding',
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'livecodebench' }],
};
const aaIfeval: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'ifeval',
  label: 'AA IFEval',
  shortLabel: 'AA IFEval',
  axisLabel: 'AA IFEVAL',
  isOverall: false,
  view: 'instruction',
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'ifeval' }],
};
const aaLcr: DimensionDef<AAIndexEntry | GenericLLMEntry> = {
  id: 'lcr',
  label: 'AA 长上下文检索',
  shortLabel: 'AA 长上下文',
  axisLabel: 'AA LCR',
  isOverall: false,
  view: 'instruction',
  getScore: (e) => ('score' in e ? e.score : null),
  getRail: aaNewRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'lcr' }],
};

// ===== LiveBench (6 维，全部 GenericLLMEntry 形态) =====
const livebenchRail = (): RailConfig => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });

const lbCoding: DimensionDef<GenericLLMEntry> = {
  id: 'coding',
  label: 'LiveBench 代码',
  shortLabel: 'LiveBench Coding',
  axisLabel: 'LIVEBENCH CODING',
  isOverall: false,
  view: 'coding',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'coding' }],
};
const lbMath: DimensionDef<GenericLLMEntry> = {
  id: 'math',
  label: 'LiveBench 数学',
  shortLabel: 'LiveBench Math',
  axisLabel: 'LIVEBENCH MATH',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'math' }],
};
const lbReasoning: DimensionDef<GenericLLMEntry> = {
  id: 'reasoning',
  label: 'LiveBench 推理',
  shortLabel: 'LiveBench 推理',
  axisLabel: 'LIVEBENCH REASONING',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'reasoning' }],
};
const lbLanguage: DimensionDef<GenericLLMEntry> = {
  id: 'language',
  label: 'LiveBench 语言',
  shortLabel: 'LiveBench 语言',
  axisLabel: 'LIVEBENCH LANGUAGE',
  isOverall: false,
  view: 'instruction',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'language' }],
};
const lbDataAnalysis: DimensionDef<GenericLLMEntry> = {
  id: 'data_analysis',
  label: 'LiveBench 数据分析',
  shortLabel: 'LiveBench 数据',
  axisLabel: 'LIVEBENCH DATA',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'data_analysis' }],
};
const lbInstructionFollowing: DimensionDef<GenericLLMEntry> = {
  id: 'instruction_following',
  label: 'LiveBench 指令遵循',
  shortLabel: 'LiveBench 指令遵循',
  axisLabel: 'LIVEBENCH IF',
  isOverall: false,
  view: 'instruction',
  getScore: (e) => e.score,
  getRail: livebenchRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'instruction_following' }],
};

// ===== Agent 维度（SWE / TB 各自 1 维 overall）=====
const sweOverall: DimensionDef<SweEntry> = {
  id: 'overall',
  label: 'SWE-bench',
  shortLabel: 'SWE-bench',
  axisLabel: 'SWE-BENCH VERIFIED %',
  isOverall: true,
  view: 'agent',
  getScore: (e) => e.resolved_pct,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
};
const tbenchOverall: DimensionDef<TBenchEntry> = {
  id: 'overall',
  label: 'Terminal-Bench',
  shortLabel: 'Terminal-Bench',
  axisLabel: 'TERMINAL-BENCH %',
  isOverall: true,
  view: 'agent',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
};

// ===== OpenLLM Leaderboard (6 维) =====
// v2 schema 实际可用的 key：
//   mmlu         → leaderboard.acc_norm (综合分，~30-60%)
//   arc          → leaderboard_arc_challenge.acc_norm
//   bbh          → leaderboard_bbh.acc_norm
//   hellaswag/truthfulqa/gsm8k → null (v1 字段，v2 不存在；保留维度但 entries 为空)
const openllmRail = (): RailConfig => ({ min: 0, max: 80, ticks: [0, 30, 50, 65, 80] });

const ollmMmlu: DimensionDef<GenericLLMEntry> = {
  id: 'mmlu',
  label: 'OpenLLM MMLU',
  shortLabel: 'OpenLLM MMLU',
  axisLabel: 'OPENLLM MMLU',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: openllmRail,
  trendKeys: [{ key: 'overall', color: 'orange', label: 'mmlu' }],
};
const ollmArc: DimensionDef<GenericLLMEntry> = {
  id: 'arc',
  label: 'OpenLLM ARC',
  shortLabel: 'OpenLLM ARC',
  axisLabel: 'OPENLLM ARC',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 40, 60, 80, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'arc' }],
};
const ollmHellaswag: DimensionDef<GenericLLMEntry> = {
  id: 'hellaswag',
  label: 'OpenLLM HellaSwag',
  shortLabel: 'OpenLLM HellaSwag',
  axisLabel: 'OPENLLM HELLASWAG',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 40, 60, 80, 100] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'hellaswag' }],
};
const ollmTruthfulqa: DimensionDef<GenericLLMEntry> = {
  id: 'truthfulqa',
  label: 'OpenLLM TruthfulQA',
  shortLabel: 'OpenLLM TruthfulQA',
  axisLabel: 'OPENLLM TRUTHFULQA',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 80, ticks: [0, 30, 50, 65] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'truthfulqa' }],
};
const ollmGsm8k: DimensionDef<GenericLLMEntry> = {
  id: 'gsm8k',
  label: 'OpenLLM GSM8K',
  shortLabel: 'OpenLLM GSM8K',
  axisLabel: 'OPENLLM GSM8K',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 90, ticks: [0, 30, 60, 90] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'gsm8k' }],
};
const ollmBbh: DimensionDef<GenericLLMEntry> = {
  id: 'bbh',
  label: 'OpenLLM BBH',
  shortLabel: 'OpenLLM BBH',
  axisLabel: 'OPENLLM BBH',
  isOverall: false,
  view: 'knowledge',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 80, ticks: [0, 40, 60, 80] }),
  trendKeys: [{ key: 'overall', color: 'orange', label: 'bbh' }],
};

// ===== LiveCodeBench (1 维：All 档主分 + 三档 sub badge) =====
const lcbOverall: DimensionDef<LiveCodeBenchEntry> = {
  id: 'overall',
  label: 'LiveCodeBench',
  shortLabel: 'LiveCodeBench',
  axisLabel: 'LCB PASS@1 ALL',
  isOverall: true,
  view: 'coding',
  getScore: (e) => e.score,
  getRail: () => ({ min: 0, max: 100, ticks: [0, 30, 60, 90] }),
  subBadges: [
    { label: 'easy', tooltip: 'Easy 档 Pass@1', getValue: (e) => e.pass_easy },
    { label: 'medium', tooltip: 'Medium 档 Pass@1', getValue: (e) => e.pass_medium },
    { label: 'hard', tooltip: 'Hard 档 Pass@1', getValue: (e) => e.pass_hard },
  ],
  trendKeys: [
    { key: 'overall', color: 'orange', label: '总榜' },
    { key: 'easy', color: 'blue', label: 'easy' },
    { key: 'medium', color: 'violet', label: 'medium' },
  ],
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
  openllm_mmlu: ollmMmlu,
  openllm_arc: ollmArc,
  openllm_hellaswag: ollmHellaswag,
  openllm_truthfulqa: ollmTruthfulqa,
  openllm_gsm8k: ollmGsm8k,
  openllm_bbh: ollmBbh,
  livecodebench_overall: lcbOverall,
  swe_overall: sweOverall,
  tbench_overall: tbenchOverall,
};

/** 由 key 拆分 (kind, id)；非法 key 返回 null */
export function splitDimKey(key: string): { kind: Kind; id: string } | null {
  const idx = key.indexOf('_');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as Kind;
  if (!['arena', 'aa', 'livebench', 'openllm', 'livecodebench', 'swe', 'tbench'].includes(kind)) return null;
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
      : K extends 'openllm'
        ? GenericLLMEntry
        : K extends 'livecodebench'
          ? LiveCodeBenchEntry
          : K extends 'swe'
            ? SweEntry
            : TBenchEntry;

/**
 * 视图元数据（一级 Tab 渲染顺序、标签、默认 sub tab）。
 *
 * 子榜渲染顺序按"权威性"降序：跨厂商综合 > 单一基准权威源 > 同基准多源。
 *  - 综合：AA 智能指数（跨厂商综合）→ Arena Elo（用户投票综合）→ AA Coding / AA Math
 *  - 代码：AA LiveCodeBench（最近 3-6 月）→ LiveCodeBench 独立源（全期）→ LiveBench Coding
 *  - 知识：HLE（公认最难）→ MMLU-Pro → GPQA → OpenLLM BBH / ARC / HellaSwag / TruthfulQA / GSM8K
 *  - 指令·长文：AA IFEval → LiveBench 指令遵循 / 语言 → AA 长上下文
 *  - Agent：SWE-bench → Terminal-Bench
 *
 * 注：'general' 视图额外暴露「速度 × 价格」散点图（不是 dimension，handler 单独走）。
 */
export const VIEWS: ViewDef[] = [
  {
    id: 'general',
    label: '综合',
    defaultSub: 'aa_overall',
    order: [
      'aa_overall',
      'arena_overall',
      'aa_coding',
      'aa_math',
    ],
  },
  {
    id: 'coding',
    label: '代码',
    defaultSub: 'aa_livecodebench',
    order: [
      'aa_livecodebench',
      'livecodebench_overall',
      'livebench_coding',
      'arena_code',
      'arena_webdev',
    ],
  },
  {
    id: 'knowledge',
    label: '知识',
    defaultSub: 'aa_hle',
    order: [
      'aa_hle',
      'aa_mmlu_pro',
      'aa_gpqa',
      'openllm_bbh',
      'openllm_arc',
      'openllm_hellaswag',
      'openllm_truthfulqa',
      'openllm_gsm8k',
      'openllm_mmlu',
      'livebench_reasoning',
      'livebench_math',
      'livebench_data_analysis',
    ],
  },
  {
    id: 'instruction',
    label: '指令·长文',
    defaultSub: 'aa_ifeval',
    order: [
      'aa_ifeval',
      'livebench_instruction_following',
      'livebench_language',
      'aa_lcr',
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    defaultSub: 'swe_overall',
    order: [
      'swe_overall',
      'tbench_overall',
    ],
  },
];

/** 视图元数据按 id 索引（App.tsx 渲染一级 Tab 用） */
export const VIEW_BY_ID: Record<ViewId, ViewDef> = VIEWS.reduce(
  (acc, v) => {
    acc[v.id] = v;
    return acc;
  },
  {} as Record<ViewId, ViewDef>,
);

/** 取视图下所有 dimension 定义（按权威性顺序）；未知视图返回空数组 */
export function getDimensionsForView(view: ViewId): DimensionDef<any>[] {
  const def = VIEW_BY_ID[view];
  if (!def) return [];
  const out: DimensionDef<any>[] = [];
  for (const k of def.order) {
    const d = DIMENSIONS[k];
    if (d) out.push(d);
  }
  return out;
}
