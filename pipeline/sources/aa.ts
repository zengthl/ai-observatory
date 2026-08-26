// pipeline/sources/aa.ts —— Artificial Analysis API v2 适配器
import type { AAIndexEntry, TBenchEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

interface AAModelRow {
  name: string;
  slug?: string;
  model_creator?: { name: string };
  evaluations?: Record<string, number | null>;
  pricing?: {
    price_1m_blended_3_to_1: number | null;
    price_1m_input_tokens: number | null;
    price_1m_output_tokens: number | null;
  };
  median_output_tokens_per_second?: number | null;
  median_time_to_first_token_seconds?: number | null;
}

/** 纯函数：吃 AA API 响应 JSON，吐解析结果。网络层独立可测。 */
export function parseAA(raw: unknown): {
  entries: AAIndexEntry[];
  terminal_bench: TBenchEntry[];
  pending: string[];
} {
  const rows = extractRows(raw);
  const models = loadModels();
  const pending: string[] = [];
  const byId = new Map<string, AAIndexEntry>();
  const tbById = new Map<string, TBenchEntry>();

  for (const row of rows) {
    const idx = row.evaluations?.artificial_analysis_intelligence_index;
    if (idx == null) continue;
    const resolved = resolveModelId(row.name, models);
    if (!resolved) {
      pending.push(row.name);
      continue;
    }
    // terminalbench_v2_1 是 0–1 小数 → 转百分制（保留 1 位小数）
    const tbPct =
      row.evaluations?.terminalbench_v2_1 != null
        ? Math.round((row.evaluations.terminalbench_v2_1 as number) * 1000) / 10
        : null;

    const entry: AAIndexEntry = {
      model_id: resolved.id,
      index: idx,
      coding_index: row.evaluations?.artificial_analysis_coding_index ?? null,
      math_index: row.evaluations?.artificial_analysis_math_index ?? null,
      output_speed_tps: row.median_output_tokens_per_second ?? null,
      ttft_s: row.median_time_to_first_token_seconds ?? null,
      price_blin_per_m: row.pricing?.price_1m_blended_3_to_1 ?? null,
      price_in_per_m: row.pricing?.price_1m_input_tokens ?? null,
      price_out_per_m: row.pricing?.price_1m_output_tokens ?? null,
      tbench_v21_pct: tbPct,
      rank_prev: null,
      delta_score: null,
    };
    // 同一 model_id 的多个推理档位变体：保留指数最高者
    const cur = byId.get(resolved.id);
    if (!cur || entry.index > cur.index) byId.set(resolved.id, entry);

    if (tbPct != null) {
      const curTb = tbById.get(resolved.id);
      if (!curTb || tbPct > curTb.score) {
        tbById.set(resolved.id, { model_id: resolved.id, score: tbPct, rank_prev: null, delta_score: null });
      }
    }
  }

  const entries = [...byId.values()].sort((a, b) => b.index - a.index);
  const terminal_bench = [...tbById.values()].sort((a, b) => b.score - a.score);
  return { entries, terminal_bench, pending };
}

function extractRows(raw: unknown): AAModelRow[] {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { data?: unknown }).data)
  ) {
    return (raw as { data: AAModelRow[] }).data;
  }
  throw new Error('AA API response missing data[] array');
}

const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';

export async function fetchAA(
  apiKey: string,
): Promise<{ ok: true; parsed: ReturnType<typeof parseAA> } | { ok: false; error: string }> {
  try {
    const res = await fetch(AA_URL, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `AA API HTTP ${res.status}${res.status === 401 ? ' (check AA_API_KEY secret)' : ''}`,
      };
    }
    const raw: unknown = await res.json();
    return { ok: true, parsed: parseAA(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
