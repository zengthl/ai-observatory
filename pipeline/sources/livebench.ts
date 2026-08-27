// pipeline/sources/livebench.ts —— LiveBench model_judgment parquet 适配器
// 数据源：https://huggingface.co/datasets/livebench/model_judgment
// 关键文件：data/leaderboard-00000-of-00001.parquet（~720KB，60372 行）
//
// parquet 每行 = (question_id, task, model, score, turn, tstamp, category)
// 一道问题对一个模型的一次评估。子榜 = 同一 category 下按 model 聚合平均分。
//
// 子榜覆盖：parquet 当前只含 3 个 category（coding / instruction_following / language）；
// 其余 3 个（math / reasoning / data_analysis）在公开 parquet 中不存在，
// 按 spec 要求"按实际映射，报告差异"——输出空数组但不报错。预留扩展位。

import type { GenericLLMEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';
import { parquetReadObjects } from 'hyparquet';

/** LiveBench 子榜 ID → parquet 中 category 字段值 */
const SUB_CATEGORIES = {
  coding: 'coding',
  instruction_following: 'instruction_following',
  language: 'language',
  // 当前 parquet 不含：math / reasoning / data_analysis → 落空数组
  math: 'math',
  reasoning: 'reasoning',
  data_analysis: 'data_analysis',
} as const;

type SubKey = keyof typeof SUB_CATEGORIES;

interface LivebenchRow {
  question_id: string;
  task: string;
  model: string;
  score: number;
  turn: number | string;
  tstamp: number;
  category: string;
}

export interface ParseLivebenchResult {
  livebench_coding: GenericLLMEntry[];
  livebench_math: GenericLLMEntry[];
  livebench_reasoning: GenericLLMEntry[];
  livebench_language: GenericLLMEntry[];
  livebench_data_analysis: GenericLLMEntry[];
  livebench_instruction_following: GenericLLMEntry[];
  pending: string[];
}

/**
 * 纯函数：吃 parquet 字节，吐解析结果。网络层独立可测。
 * 同一 model_id 在同一 category 内多次评估：取最新 tstamp 的那批评估的平均分。
 * 这样可以避免旧模型复测被新模型分数"污染"——以最新一次完整评测为准。
 */
export async function parseLivebench(raw: ArrayBuffer): Promise<ParseLivebenchResult> {
  const models = loadModels();
  const pending: string[] = [];
  // 顶层：category → model → { latestTstamp, sumScore, count }
  const byCat = new Map<string, Map<string, { latestTstamp: number; sumScore: number; count: number }>>();

  const rows = (await parquetReadObjects({ file: raw })) as unknown as LivebenchRow[];

  for (const r of rows) {
    const cat = r.category;
    if (!cat) continue;
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    const m = byCat.get(cat)!;
    const prev = m.get(r.model);
    if (!prev) {
      m.set(r.model, { latestTstamp: r.tstamp, sumScore: r.score, count: 1 });
    } else if (r.tstamp > prev.latestTstamp) {
      // 出现更新的 tstamp：覆盖（抛弃旧批次）
      m.set(r.model, { latestTstamp: r.tstamp, sumScore: r.score, count: 1 });
    } else if (r.tstamp === prev.latestTstamp) {
      // 同一批次：累加平均
      prev.sumScore += r.score;
      prev.count += 1;
    }
    // r.tstamp < prev.latestTstamp → 忽略（更老的评估）
  }

  // 6 个子榜 out（无数据则空数组）
  const out: ParseLivebenchResult = {
    livebench_coding: [],
    livebench_math: [],
    livebench_reasoning: [],
    livebench_language: [],
    livebench_data_analysis: [],
    livebench_instruction_following: [],
    pending,
  };

  for (const subKey of Object.keys(SUB_CATEGORIES) as SubKey[]) {
    const cat = SUB_CATEGORIES[subKey];
    const m = byCat.get(cat);
    if (!m) continue;
    const byId = new Map<string, GenericLLMEntry>();
    for (const [rawName, agg] of m) {
      const avgPct = (agg.sumScore / agg.count) * 100;
      const score = Math.round(avgPct * 10) / 10;
      const resolved = resolveModelId(rawName, models);
      if (!resolved) {
        pending.push(rawName);
        continue;
      }
      const cur = byId.get(resolved.id);
      if (!cur || score > cur.score) {
        byId.set(resolved.id, { model_id: resolved.id, score, rank_prev: null, delta_score: null });
      }
    }
    out[`livebench_${subKey}`] = [...byId.values()].sort((a, b) => b.score - a.score);
  }

  return out;
}

const LIVEBENCH_URL =
  'https://huggingface.co/datasets/livebench/model_judgment/resolve/main/data/leaderboard-00000-of-00001.parquet';

export async function fetchLivebench(): Promise<
  { ok: true; parsed: ParseLivebenchResult } | { ok: false; error: string }
> {
  try {
    const res = await fetch(LIVEBENCH_URL, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return { ok: false, error: `LiveBench HTTP ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    return { ok: true, parsed: await parseLivebench(buf) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
