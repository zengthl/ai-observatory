// ===== 快照结构 =====

export type SourceName = 'artificial_analysis' | 'lmarena' | 'swebench';

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
}

export type History = Record<string, HistoryModel>;

// ===== 待确认的未知模型名 =====

export interface PendingFile {
  date: string;
  names: string[];
  /** names 被截断时的全量总数；截断上限 100 */
  total?: number;
}
