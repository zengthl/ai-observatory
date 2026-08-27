/**
 * 分领域维度配置（Kind × Dimension 双轴抽象）。
 * 核心约定：
 * - Kind 仍 5 个；每个 kind 自己决定 1–3 个 dimension（必含 overall）
 * - 表格主分由 `dimDef.getScore(entry)` 取得；缺失返回 null 时该行不显
 * - 整体维（isOverall=true）有 subBadges（总榜旁的小分项徽标）
 * - 整体维 trendKeys 多线（橙 + 各分项色）；分项维只画单线（蓝/紫罗兰）
 */
import type {
  AAIndexEntry,
  ArenaEloEntry,
  SweEntry,
  TBenchEntry,
} from '../types';

/** 任意一种榜单条目（按 kind 决定具体窄化） */
export type BoardEntry = ArenaEloEntry | AAIndexEntry | SweEntry | TBenchEntry;

export type Kind = 'arena' | 'aa' | 'swe' | 'tbench';

export type DimensionId = 'overall' | 'code' | 'webdev' | 'coding' | 'math';

export type SubBadge<T = unknown> = {
  label: string;
  tooltip: string;
  getValue: (e: T) => number | null;
};

export type TrendKey = {
  key: 'overall' | 'code' | 'webdev' | 'coding' | 'math';
  color: 'orange' | 'blue' | 'violet';
  label: string;
};

export interface RailConfig {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * 单个分项维度的配置。T 收敛到该维对应 kind 的条目类型，
 * 让 getScore / getCi95 / subBadges.getValue 在编译期得到正确窄化。
 *
 * 多 kind 共享同一 DIMENSIONS 容器时用 DimensionDef<any> 抹平联合；
 * 调用方需自行按 `kind` 字段决定具体窄化（见 findDimension / getDimensions）。
 */
export interface DimensionDef<T extends BoardEntry = BoardEntry> {
  id: DimensionId;
  label: string;
  axisLabel: string;
  isOverall: boolean;
  getScore: (e: T) => number | null;
  getCi95?: (e: T) => [number, number] | undefined;
  getRail: () => RailConfig;
  subBadges?: SubBadge<T>[];
  trendKeys: TrendKey[];
}export const DIMENSIONS: Record<Kind, DimensionDef<any>[]> = {
  arena: [
    {
      id: 'overall',
      label: 'Arena 总榜',
      axisLabel: 'ARENA ELO',
      isOverall: true,
      getScore: (e: ArenaEloEntry) => e.score,
      getCi95: (e: ArenaEloEntry) => e.ci95,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      subBadges: [
        {
          label: 'code',
          tooltip: 'Arena Elo 代码',
          getValue: (e: ArenaEloEntry) => e.categories?.code ?? null,
        },
        {
          label: 'webdev',
          tooltip: 'Arena Elo WebDev',
          getValue: (e: ArenaEloEntry) => e.categories?.webdev ?? null,
        },
      ],
      trendKeys: [
        { key: 'overall', color: 'orange', label: '总榜' },
        { key: 'code', color: 'blue', label: 'code' },
        { key: 'webdev', color: 'violet', label: 'webdev' },
      ],
    },
    {
      id: 'code',
      label: 'Arena 代码',
      axisLabel: 'ARENA ELO / CODE',
      isOverall: false,
      getScore: (e: ArenaEloEntry) => e.categories?.code ?? null,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      trendKeys: [{ key: 'code', color: 'blue', label: 'code' }],
    },
    {
      id: 'webdev',
      label: 'Arena WebDev',
      axisLabel: 'ARENA ELO / WEBDEV',
      isOverall: false,
      getScore: (e: ArenaEloEntry) => e.categories?.webdev ?? null,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      trendKeys: [{ key: 'webdev', color: 'violet', label: 'webdev' }],
    },
  ],
  aa: [
    {
      id: 'overall',
      label: 'AA 总榜',
      axisLabel: 'AA INTELLIGENCE',
      isOverall: true,
      getScore: (e: AAIndexEntry) => e.index,
      getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
      subBadges: [
        {
          label: 'coding',
          tooltip: 'AA Coding 指数',
          getValue: (e: AAIndexEntry) => e.coding_index ?? null,
        },
        {
          label: 'math',
          tooltip: 'AA Math 指数',
          getValue: (e: AAIndexEntry) => e.math_index ?? null,
        },
      ],
      trendKeys: [
        { key: 'overall', color: 'orange', label: '总榜' },
        { key: 'coding', color: 'blue', label: 'coding' },
        { key: 'math', color: 'violet', label: 'math' },
      ],
    },
    {
      id: 'coding',
      label: 'AA Coding',
      axisLabel: 'AA CODING INDEX',
      isOverall: false,
      getScore: (e: AAIndexEntry) => e.coding_index ?? null,
      getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
      trendKeys: [{ key: 'coding', color: 'blue', label: 'coding' }],
    },
    {
      id: 'math',
      label: 'AA Math',
      axisLabel: 'AA MATH INDEX',
      isOverall: false,
      getScore: (e: AAIndexEntry) => e.math_index ?? null,
      // math 有上界溢出（个别模型 >85），单独扩到 100
      getRail: () => ({ min: 40, max: 100, ticks: [40, 60, 80, 100] }),
      trendKeys: [{ key: 'math', color: 'violet', label: 'math' }],
    },
  ],
  swe: [
    {
      id: 'overall',
      label: 'SWE-bench',
      axisLabel: 'SWE-BENCH VERIFIED %',
      isOverall: true,
      getScore: (e: SweEntry) => e.resolved_pct,
      getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
      trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
    },
  ],
  tbench: [
    {
      id: 'overall',
      label: 'Terminal-Bench',
      axisLabel: 'TERMINAL-BENCH %',
      isOverall: true,
      getScore: (e: TBenchEntry) => e.score,
      getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
      trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }],
    },
  ],
};

/** 取得某 kind 全部 dimension 定义（按声明顺序）。返回类型按 kind 收窄。 */
export function getDimensions<K extends Kind>(kind: K): DimensionDef<BoardEntryOf<K>>[] {
  return DIMENSIONS[kind] as DimensionDef<BoardEntryOf<K>>[];
}

/** 按 (kind, dimension) 查找 dimension 定义；找不到返回 undefined。返回类型按 kind 收窄。 */
export function findDimension<K extends Kind>(
  kind: K,
  id: DimensionId,
): DimensionDef<BoardEntryOf<K>> | undefined {
  return DIMENSIONS[kind].find((d) => d.id === id) as
    | DimensionDef<BoardEntryOf<K>>
    | undefined;
}

/** Kind → 对应 BoardEntry 子类型映射（用于 DimensionDef 类型参数推断） */
export type BoardEntryOf<K extends Kind> = K extends 'arena'
  ? ArenaEloEntry
  : K extends 'aa'
    ? AAIndexEntry
    : K extends 'swe'
      ? SweEntry
      : TBenchEntry;
