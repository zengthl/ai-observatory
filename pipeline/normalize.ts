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

function entryScore(e: { score?: number; resolved_pct?: number }): number | undefined {
  return e.score ?? e.resolved_pct;
}

export function withRanks<T extends { model_id: string }>(
  entries: T[],
  prev?: { model_id: string; score?: number; resolved_pct?: number }[],
): (T & { rank: number; rank_prev: number | null; delta_score: number | null })[] {
  return entries.map((e, i) => {
    const prevIdx = prev ? prev.findIndex((p) => p.model_id === e.model_id) : -1;
    const prevScore =
      prevIdx >= 0 && prev ? entryScore(prev[prevIdx]) : undefined;
    const curScore = entryScore(e as { score?: number; resolved_pct?: number });
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

  snapshot.llm.arena_elo.forEach((e) =>
    add(e.model_id, 'arena_elo', [snapshot.date, e.score]),
  );
  snapshot.llm.aa_index.forEach((e) =>
    add(e.model_id, 'aa_index', [snapshot.date, e.index]),
  );
  snapshot.agent.swebench_verified.forEach((e) =>
    add(e.model_id, 'swebench_verified', [snapshot.date, e.resolved_pct]),
  );
  snapshot.agent.terminal_bench.forEach((e) =>
    add(e.model_id, 'terminal_bench', [snapshot.date, e.score]),
  );
  return next;
}
