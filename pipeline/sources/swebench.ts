// pipeline/sources/swebench.ts —— SWE-bench Verified 适配器（解析官方 leaderboards.json）
import type { SweEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

interface SweRawEntry {
  model_display: string | null;
  model_org: string | null;
  resolved: number | null;
  agent: string | null;
  instance_cost: number | null;
  checked: boolean | null;
}

const SOURCE_URL =
  'https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json';

/** 占位模型名：不是具体模型，不进 entries 也不进 pending */
const PLACEHOLDER = /^(multiple|undisclosed)$/i;

/**
 * 纯函数：吃官方 leaderboards.json（完整结构或单板块切片），吐解析结果。网络层独立可测。
 * - 只取 name === 'Verified' 板块；resolved 已是百分数
 * - 同一模型多个 agent 记录 → 取 resolved 最高（并列时保留先出现者）
 * - 未登记 models.yaml 的名字进 pending，供人工补表
 */
export function parseSwe(
  raw:
    | { leaderboards: { name: string; results: SweRawEntry[] }[] }
    | { name: string; results: SweRawEntry[] },
): { entries: SweEntry[]; pending: string[] } {
  const models = loadModels();
  // 兼容两种输入：完整响应（含 leaderboards[]）与单板块切片（fixture 形态）
  const boards =
    'leaderboards' in raw
      ? raw.leaderboards
      : [raw as { name: string; results: SweRawEntry[] }];
  const verified = boards.find((b) => b.name === 'Verified');
  if (!verified) return { entries: [], pending: [] };

  const pending: string[] = [];
  const byId = new Map<string, SweEntry>();

  for (const r of verified.results) {
    if (r.resolved == null || !r.model_display) continue;
    if (PLACEHOLDER.test(r.model_display)) continue;
    const resolved = resolveModelId(r.model_display, models);
    if (!resolved) {
      pending.push(r.model_display);
      continue;
    }
    const entry: SweEntry = {
      model_id: resolved.id,
      resolved_pct: r.resolved,
      agent: r.agent ?? undefined,
      cost_usd_per_instance: r.instance_cost,
      rank_prev: null,
      delta_score: null,
    };
    // 同一 model_id 的多 agent 记录：保留 resolved 最高者
    const cur = byId.get(resolved.id);
    if (!cur || entry.resolved_pct > cur.resolved_pct) byId.set(resolved.id, entry);
  }

  const entries = [...byId.values()].sort((a, b) => b.resolved_pct - a.resolved_pct);
  return { entries, pending };
}

export async function fetchSwebench(): Promise<
  { ok: true; parsed: ReturnType<typeof parseSwe> } | { ok: false; error: string }
> {
  try {
    const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      return { ok: false, error: `SWE-bench HTTP ${res.status}` };
    }
    const raw: unknown = await res.json();
    return {
      ok: true,
      parsed: parseSwe(
        raw as { leaderboards: { name: string; results: SweRawEntry[] }[] },
      ),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
