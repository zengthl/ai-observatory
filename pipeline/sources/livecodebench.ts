// pipeline/sources/livecodebench.ts —— LiveCodeBench 适配器
// 数据源：https://livecodebench.github.io/leaderboard.html
// 实际数据：页面 fetch 的是 performances_generation.json（~5MB）
// JSON 结构：{ performances: [{ question_id, model, date, difficulty, 'pass@1', platform }],
//               models: [{ model_name, model_repr, model_style, release_date, link }],
//               date_marks: [...] }
//
// 聚合策略：每个 model 的各档（easy/medium/hard/all）平均 pass@1。
// 主分用 "All" 档；同时存 easy/medium/hard 三档分供前端 sub-badge。

import type { LiveCodeBenchEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

const LCB_DATA_URL = 'https://livecodebench.github.io/performances_generation.json';

interface LCBPerformance {
  question_id: string;
  model: string; // model_repr
  date: number; // ms epoch
  difficulty: 'easy' | 'medium' | 'hard' | string;
  'pass@1': number;
  platform: string;
}

interface LCBModel {
  model_name: string;
  model_repr: string; // 显示名
  model_style: string;
  release_date: number;
  link?: string;
}

interface LCBData {
  performances: LCBPerformance[];
  models: LCBModel[];
  date_marks?: unknown[];
}

export interface ParseLiveCodeBenchResult {
  livecodebench: LiveCodeBenchEntry[];
  pending: string[];
}

/**
 * 纯函数：吃 LCB JSON，吐主分 + 三档分项的解析结果。
 * 聚合方式：
 *   - 按 model_repr 分组，对所有 perf 求 pass@1 平均（每题一次）
 *   - 同样按 difficulty 分桶（easy/medium/hard）单独平均
 *   - "All" = 三档合并（不过滤 difficulty）的平均
 */
export function parseLiveCodeBench(raw: LCBData): ParseLiveCodeBenchResult {
  const models = loadModels();
  const pending: string[] = [];
  // model_repr → { total:{sum,count}, easy:{sum,count}, medium:..., hard:... }
  const agg = new Map<
    string,
    {
      total: { sum: number; count: number };
      easy: { sum: number; count: number };
      medium: { sum: number; count: number };
      hard: { sum: number; count: number };
    }
  >();

  for (const p of raw.performances ?? []) {
    if (typeof p['pass@1'] !== 'number') continue;
    const repr = p.model;
    if (!repr) continue;
    if (!agg.has(repr)) {
      agg.set(repr, {
        total: { sum: 0, count: 0 },
        easy: { sum: 0, count: 0 },
        medium: { sum: 0, count: 0 },
        hard: { sum: 0, count: 0 },
      });
    }
    const a = agg.get(repr)!;
    const score = p['pass@1'];
    a.total.sum += score;
    a.total.count += 1;
    const bucket = a[p.difficulty as 'easy' | 'medium' | 'hard'];
    if (bucket) {
      bucket.sum += score;
      bucket.count += 1;
    }
  }

  const byId = new Map<string, LiveCodeBenchEntry>();
  for (const [repr, a] of agg) {
    const all = a.total.count > 0 ? a.total.sum / a.total.count : null;
    if (all == null) continue;
    const resolved = resolveModelId(repr, models);
    if (!resolved) {
      pending.push(repr);
      continue;
    }
    const easy = a.easy.count > 0 ? a.easy.sum / a.easy.count : 0;
    const medium = a.medium.count > 0 ? a.medium.sum / a.medium.count : 0;
    const hard = a.hard.count > 0 ? a.hard.sum / a.hard.count : 0;
    const round = (v: number) => Math.round(v * 10) / 10;
    const entry: LiveCodeBenchEntry = {
      model_id: resolved.id,
      score: round(all),
      pass_easy: round(easy),
      pass_medium: round(medium),
      pass_hard: round(hard),
      rank_prev: null,
      delta_score: null,
    };
    // 同一 model_id 多个 model_repr（如 o3-mini low/med/high）→ 保留主分最高者
    const cur = byId.get(resolved.id);
    if (!cur || entry.score > cur.score) byId.set(resolved.id, entry);
  }

  return {
    livecodebench: [...byId.values()].sort((a, b) => b.score - a.score),
    pending,
  };
}

export async function fetchLiveCodeBench(): Promise<
  { ok: true; parsed: ParseLiveCodeBenchResult } | { ok: false; error: string }
> {
  try {
    const res = await fetch(LCB_DATA_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return { ok: false, error: `LiveCodeBench HTTP ${res.status}` };
    const raw = (await res.json()) as LCBData;
    return { ok: true, parsed: parseLiveCodeBench(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
