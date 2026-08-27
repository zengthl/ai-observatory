// pipeline/normalize.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { History, HistoryModel, HistoryPoint, ModelMeta, Snapshot } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let cache: ModelMeta[] | null = null;

export function loadModels(): ModelMeta[] {
  if (!cache) {
    const raw = fs.readFileSync(path.join(__dirname, 'models.yaml'), 'utf8');
    cache = YAML.parse(raw) as ModelMeta[];
  }
  return cache;
}

export function resolveModelId(
  raw: string,
  models: ModelMeta[],
): { id: string; meta: ModelMeta } | null {
  const key = norm(raw);
  for (const m of models) {
    if (norm(m.display_name) === key || norm(m.model_id) === key) {
      return { id: m.model_id, meta: m };
    }
    for (const a of m.aliases) {
      if (norm(a) === key) return { id: m.model_id, meta: m };
    }
  }
  return null;
}

/** 主分字段：多数条目用 score；swe 用 resolved_pct；aa 用 index */
function entryScore(e: { score?: number; resolved_pct?: number; index?: number }): number | undefined {
  return e.score ?? e.resolved_pct ?? e.index;
}

/** GenericLLMEntry 主分是 score（兼容 aa_index 用 index） */
function genericEntryScore(e: { score?: number; index?: number }): number | undefined {
  return e.score ?? e.index;
}

export function withRanks<T extends { model_id: string }>(
  entries: T[],
  prev?: { model_id: string; score?: number; resolved_pct?: number; index?: number }[],
): (T & { rank: number; rank_prev: number | null; delta_score: number | null })[] {
  return entries.map((e, i) => {
    const prevIdx = prev ? prev.findIndex((p) => p.model_id === e.model_id) : -1;
    const prevScore =
      prevIdx >= 0 && prev ? entryScore(prev[prevIdx]) : undefined;
    const curScore = entryScore(e as { score?: number; resolved_pct?: number; index?: number });
    return {
      ...e,
      rank: i + 1,
      rank_prev: prevIdx >= 0 ? prevIdx + 1 : null,
      delta_score:
        prevScore != null && curScore != null
          ? Math.round((curScore - prevScore) * 10) / 10
          : null,
    };
  });
}

/** 通用 LLM 榜的 withRanks：主分一律是 score，AA 智能指数用 index */
export function withRanksGeneric<T extends { model_id: string; score: number }>(
  entries: T[],
  prev?: { model_id: string; score?: number }[],
): (T & { rank: number; rank_prev: number | null; delta_score: number | null })[] {
  return entries.map((e, i) => {
    const prevIdx = prev ? prev.findIndex((p) => p.model_id === e.model_id) : -1;
    const prevScore = prevIdx >= 0 && prev ? genericEntryScore(prev[prevIdx]) : undefined;
    return {
      ...e,
      rank: i + 1,
      rank_prev: prevIdx >= 0 ? prevIdx + 1 : null,
      delta_score:
        prevScore != null ? Math.round((e.score - prevScore) * 10) / 10 : null,
    };
  });
}

/** Snapshot 中每个 (boardKey, historyKey) 的元组；用于 buildHistory 通用化 */
type BoardKeys = {
  snapshotPath: keyof Snapshot['llm'] | keyof Snapshot['agent'];
  historyKey: keyof HistoryModel;
  /** 提取当日 score（llm.* → score/resolved_pct/index，agent.* → 各自主分） */
  getScore: (e: { score?: number; resolved_pct?: number; index?: number }) => number | undefined;
}[];

const BOARD_KEYS: BoardKeys = [
  { snapshotPath: 'arena_elo', historyKey: 'arena_elo', getScore: (e) => e.score },
  { snapshotPath: 'aa_index', historyKey: 'aa_index', getScore: (e) => e.index },
  { snapshotPath: 'aa_mmlu_pro', historyKey: 'aa_mmlu_pro', getScore: (e) => e.score },
  { snapshotPath: 'aa_gpqa', historyKey: 'aa_gpqa', getScore: (e) => e.score },
  { snapshotPath: 'aa_hle', historyKey: 'aa_hle', getScore: (e) => e.score },
  { snapshotPath: 'aa_livecodebench', historyKey: 'aa_livecodebench', getScore: (e) => e.score },
  { snapshotPath: 'aa_ifeval', historyKey: 'aa_ifeval', getScore: (e) => e.score },
  { snapshotPath: 'aa_lcr', historyKey: 'aa_lcr', getScore: (e) => e.score },
  { snapshotPath: 'livebench_coding', historyKey: 'livebench_coding', getScore: (e) => e.score },
  { snapshotPath: 'livebench_math', historyKey: 'livebench_math', getScore: (e) => e.score },
  { snapshotPath: 'livebench_reasoning', historyKey: 'livebench_reasoning', getScore: (e) => e.score },
  { snapshotPath: 'livebench_language', historyKey: 'livebench_language', getScore: (e) => e.score },
  { snapshotPath: 'livebench_data_analysis', historyKey: 'livebench_data_analysis', getScore: (e) => e.score },
  { snapshotPath: 'livebench_instruction_following', historyKey: 'livebench_instruction_following', getScore: (e) => e.score },
  { snapshotPath: 'openllm_mmlu', historyKey: 'openllm_mmlu', getScore: (e) => e.score },
  { snapshotPath: 'openllm_arc', historyKey: 'openllm_arc', getScore: (e) => e.score },
  { snapshotPath: 'openllm_hellaswag', historyKey: 'openllm_hellaswag', getScore: (e) => e.score },
  { snapshotPath: 'openllm_truthfulqa', historyKey: 'openllm_truthfulqa', getScore: (e) => e.score },
  { snapshotPath: 'openllm_gsm8k', historyKey: 'openllm_gsm8k', getScore: (e) => e.score },
  { snapshotPath: 'openllm_bbh', historyKey: 'openllm_bbh', getScore: (e) => e.score },
  { snapshotPath: 'livecodebench', historyKey: 'livecodebench', getScore: (e) => e.score },
];

export function buildHistory(prevHistory: History, snapshot: Snapshot): History {
  const next: History = structuredClone(prevHistory);
  const add = (
    modelId: string,
    board: keyof HistoryModel,
    point: HistoryPoint,
  ) => {
    if (!next[modelId]) next[modelId] = {};
    const series = next[modelId][board] ?? [];
    // 同日重跑：覆盖当日点
    if (series.length > 0 && series[series.length - 1][0] === point[0]) {
      series[series.length - 1] = point;
    } else {
      series.push(point);
    }
    next[modelId][board] = series.slice(-365); // 最多留一年
  };

  for (const bk of BOARD_KEYS) {
    const list = (snapshot.llm as Record<string, unknown>)[bk.snapshotPath as string] as
      | Array<{ model_id: string; score?: number; resolved_pct?: number; index?: number }>
      | undefined;
    if (!list) continue;
    for (const e of list) {
      const s = bk.getScore(e);
      if (s == null) continue;
      add(e.model_id, bk.historyKey, [snapshot.date, s]);
    }
  }
  // agent.*（swebench_verified / terminal_bench）走 agent.* 而非 BOARD_KEYS
  for (const e of snapshot.agent.swebench_verified) {
    add(e.model_id, 'swebench_verified', [snapshot.date, e.resolved_pct]);
  }
  for (const e of snapshot.agent.terminal_bench) {
    add(e.model_id, 'terminal_bench', [snapshot.date, e.score]);
  }

  return next;
}
