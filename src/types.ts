// ===== 快照结构 =====

export type SourceName = 'artificial_analysis' | 'lmarena' | 'swebench' | 'livebench';

export type SourceStatus = 'ok' | 'unavailable';

export interface SourceInfo {
  status: SourceStatus;
  fetched_at?: string;
  last_ok?: string;
}

export interface ArenaEloEntry {
  model_id: string;
  score: number;
  ci95?: [number, number];
  votes?: number;
  categories?: Record<string, number>;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface AAIndexEntry {
  model_id: string;
  index: number;
  coding_index?: number | null;
  math_index?: number | null;
  output_speed_tps?: number | null;
  ttft_s?: number | null;
  price_blin_per_m?: number | null;
  price_in_per_m?: number | null;
  price_out_per_m?: number | null;
  tbench_v21_pct?: number | null;
  rank_prev: number | null;
  delta_score: number | null;
}

/**
 * 通用 LLM 榜条目：AA 6 个新子榜 + LiveBench 3/6 个子榜都用此形态。
 * 字段约定：
 * - score：归一化到 0–100 区间的"分"。AA 原始评测多为 0–1 比例，解析时 ×100
 * - rank_prev / delta_score：每日重算，由 withRanks 注入
 */
export interface GenericLLMEntry {
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface SweEntry {
  model_id: string;
  resolved_pct: number;
  agent?: string;
  cost_usd_per_instance?: number | null;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface TBenchEntry {
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface Snapshot {
  date: string;
  sources: Record<SourceName, SourceInfo>;
  llm: {
    arena_elo: ArenaEloEntry[];
    aa_index: AAIndexEntry[];
    // AA 深挖 6 子榜（来自 evaluations.* 字段 ×100 归一）
    aa_mmlu_pro: GenericLLMEntry[];
    aa_gpqa: GenericLLMEntry[];
    aa_hle: GenericLLMEntry[];
    aa_livecodebench: GenericLLMEntry[];
    aa_ifeval: GenericLLMEntry[];
    aa_lcr: GenericLLMEntry[];
    // LiveBench 6 个子榜（parquet 现仅含 coding/instruction_following/language；
    //  其余 3 个空数组，schema/UI 都保留，扩展时无需改字段）
    livebench_coding: GenericLLMEntry[];
    livebench_math: GenericLLMEntry[];
    livebench_reasoning: GenericLLMEntry[];
    livebench_language: GenericLLMEntry[];
    livebench_data_analysis: GenericLLMEntry[];
    livebench_instruction_following: GenericLLMEntry[];
  };
  agent: {
    swebench_verified: SweEntry[];
    terminal_bench: TBenchEntry[];
  };
}

// ===== latest.json 顶层结构（含内嵌模型元数据）=====

export interface LatestFile extends Snapshot {
  models: ModelMeta[];
}

// ===== 模型身份 =====

export interface ModelMeta {
  model_id: string;
  display_name: string;
  org: string;
  license: 'closed' | 'open';
  aliases: string[];
}

// ===== 历史序列 =====

export type HistoryPoint = [string, number];

export interface HistoryModel {
  arena_elo?: HistoryPoint[];
  aa_index?: HistoryPoint[];
  swebench_verified?: HistoryPoint[];
  terminal_bench?: HistoryPoint[];
  aa_mmlu_pro?: HistoryPoint[];
  aa_gpqa?: HistoryPoint[];
  aa_hle?: HistoryPoint[];
  aa_livecodebench?: HistoryPoint[];
  aa_ifeval?: HistoryPoint[];
  aa_lcr?: HistoryPoint[];
  livebench_coding?: HistoryPoint[];
  livebench_math?: HistoryPoint[];
  livebench_reasoning?: HistoryPoint[];
  livebench_language?: HistoryPoint[];
  livebench_data_analysis?: HistoryPoint[];
  livebench_instruction_following?: HistoryPoint[];
}

export type History = Record<string, HistoryModel>;

// ===== 待确认的未知模型名 =====

export interface PendingFile {
  date: string;
  names: string[];
  /** names 被截断时的全量总数；截断上限 100 */
  total?: number;
}
