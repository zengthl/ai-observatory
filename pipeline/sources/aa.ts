// pipeline/sources/aa.ts —— Artificial Analysis API v2 适配器
// 同时承担：
//  - 智能指数总榜（entries）
//  - Terminal-Bench（evaluations.terminalbench_v2_1 ×100）
//  - 6 个新子榜（mmlu_pro / gpqa / hle / livecodebench / ifbench / lcr）
//    全部从 evaluations.* 字段 ×100 转百分制（fixture 原始是 0–1 比例）
import type { AAIndexEntry, GenericLLMEntry, TBenchEntry } from '../../src/types';
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

/** AA 6 个新子榜 → evaluations 字段名（原始 0–1 比例，解析时 ×100 转百分制） */
const SUB_FIELDS = {
  mmlu_pro: 'mmlu_pro',
  gpqa: 'gpqa',
  hle: 'hle',
  livecodebench: 'livecodebench',
  ifeval: 'ifbench',
  lcr: 'lcr',
} as const;

type SubField = (typeof SUB_FIELDS)[keyof typeof SUB_FIELDS];

/** 0–1 比例 → 百分制（保留 1 位小数）；null/undefined 透传 null */
function pct(v: number | null | undefined): number | null {
  if (v == null) return null;
  return Math.round(v * 1000) / 10;
}

/** 纯函数：吃 AA API 响应 JSON，吐解析结果。网络层独立可测。 */
export function parseAA(raw: unknown): {
  entries: AAIndexEntry[];
  terminal_bench: TBenchEntry[];
  aa_mmlu_pro: GenericLLMEntry[];
  aa_gpqa: GenericLLMEntry[];
  aa_hle: GenericLLMEntry[];
  aa_livecodebench: GenericLLMEntry[];
  aa_ifeval: GenericLLMEntry[];
  aa_lcr: GenericLLMEntry[];
  pending: string[];
} {
  const rows = extractRows(raw);
  const models = loadModels();
  const pending: string[] = [];
  const byId = new Map<string, AAIndexEntry>();
  const tbById = new Map<string, TBenchEntry>();

  // 6 个子榜各自 byId，model_id → 最高分（一次遍历多榜同时累计）
  type SubKey = keyof typeof SUB_FIELDS;
  const subById: Record<SubKey, Map<string, GenericLLMEntry>> = {
    mmlu_pro: new Map(),
    gpqa: new Map(),
    hle: new Map(),
    livecodebench: new Map(),
    ifeval: new Map(),
    lcr: new Map(),
  };

  for (const row of rows) {
    const idx = row.evaluations?.artificial_analysis_intelligence_index;
    if (idx == null) continue;
    const resolved = resolveModelId(row.name, models);
    if (!resolved) {
      pending.push(row.name);
      continue;
    }
    // terminalbench_v2_1 是 0–1 小数 → 转百分制（保留 1 位小数）
    const tbPct = pct(row.evaluations?.terminalbench_v2_1);

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

    // 6 个子榜：按 field 名拉值，×100 累计到 byId；同 model_id 多次出现时取最高
    for (const subKey of Object.keys(SUB_FIELDS) as SubKey[]) {
      const field = SUB_FIELDS[subKey] as SubField;
      const s = pct(row.evaluations?.[field]);
      if (s == null) continue;
      const m = subById[subKey];
      const cur2 = m.get(resolved.id);
      if (!cur2 || s > cur2.score) m.set(resolved.id, { model_id: resolved.id, score: s, rank_prev: null, delta_score: null });
    }
  }

  const entries = [...byId.values()].sort((a, b) => b.index - a.index);
  const terminal_bench = [...tbById.values()].sort((a, b) => b.score - a.score);
  const sortSub = (m: Map<string, GenericLLMEntry>): GenericLLMEntry[] =>
    [...m.values()].sort((a, b) => b.score - a.score);

  return {
    entries,
    terminal_bench,
    aa_mmlu_pro: sortSub(subById.mmlu_pro),
    aa_gpqa: sortSub(subById.gpqa),
    aa_hle: sortSub(subById.hle),
    aa_livecodebench: sortSub(subById.livecodebench),
    aa_ifeval: sortSub(subById.ifeval),
    aa_lcr: sortSub(subById.lcr),
    pending,
  };
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
