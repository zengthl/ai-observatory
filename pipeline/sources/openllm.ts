// pipeline/sources/openllm.ts —— Open LLM Leaderboard (HF open-llm-leaderboard/results)
// 数据源：https://huggingface.co/datasets/open-llm-leaderboard/results
// 关键路径：tree API 拉目录索引 → 每个 model dir 下取最新 results_<ts>.json
// 每个 JSON 形如：{ results: { leaderboard: { acc_norm,none: 0.5 }, leaderboard_arc_challenge: {...}, ... } }
//
// 注意（与 spec 差异说明）：
// HF 公开的 `open-llm-leaderboard/results` 数据集**实际上是 v2 leaderboard**，
// v1 的 mmlu/hellaswag/truthfulqa/gsm8k 单项任务在 2024-07 v2 切换后下线。
// v2 schema 实际可用 key：
//   - leaderboard_arc_challenge.acc_norm  → arc
//   - leaderboard_bbh.acc_norm            → bbh
//   - leaderboard_mmlu_pro.acc            → mmlu_pro（也归 mmlu 槽）
//   - leaderboard_gpqa.acc_norm           → gpqa（已通过 AA 覆盖，此处不重出）
// v1 时期数据中的 mmlu/arc/hellaswag/truthfulqa/gsm8k 命名不再存在。
// 因此 openllm_hellaswag/truthfulqa/gsm8k 输出空数组（参照 livebench.ts
// 已有的"按实际映射"先例），schema/UI 仍保留 6 个 dimension。

import type { GenericLLMEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

const HF_BASE = 'https://huggingface.co/api/datasets/open-llm-leaderboard/results/tree/main';
const HF_RESOLVE = 'https://huggingface.co/datasets/open-llm-leaderboard/results/resolve/main';

/** HF tree 响应：仅 type='directory' 是模型目录 */
interface OpenLLMTreeEntry {
  type: 'directory' | 'file';
  oid: string;
  size: number;
  path: string;
}

/** v2 JSON 中 results 各项的形状（实际只用到几个字段） */
type ResultsMap = Record<string, Record<string, number | string | undefined>>;

/**
 * 解析单个 model 的 JSON；返回 6 个子榜的分数（无数据返回 null）。
 * v2 leaderboard key 映射：
 *   mmlu         → "leaderboard".acc_norm   (注：v2 leaderboard 是综合分，~30-60%)
 *   arc          → "leaderboard_arc_challenge".acc_norm
 *   bbh          → "leaderboard_bbh".acc_norm
 *   hellaswag    → null (v1 字段，v2 不存在)
 *   truthful_qa  → null (v1 字段，v2 不存在)
 *   gsm8k        → null (v1 字段，v2 不存在)
 */
function extractScores(json: unknown): {
  mmlu: number | null;
  arc: number | null;
  hellaswag: number | null;
  truthfulqa: number | null;
  gsm8k: number | null;
  bbh: number | null;
} {
  const r = (json as { results?: ResultsMap } | null)?.results ?? {};
  // v2 实际 key 后缀是 `,none`（lm-eval-harness 约定），不是 `acc_norm`
  const get = (key: string, field: string): number | null => {
    const v = r[key]?.[field];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return {
    // v2 leaderboard 综合分也用 acc_norm 字段（不是 v1 mmlu，但 6 槽里就 mmlu 最对应）
    mmlu: get('leaderboard', 'acc_norm,none'),
    arc: get('leaderboard_arc_challenge', 'acc_norm,none'),
    hellaswag: null, // v2 不存在
    truthfulqa: null, // v2 不存在
    gsm8k: null, // v2 不存在
    bbh: get('leaderboard_bbh', 'acc_norm,none'),
  };
}

/** 0–1 比例 → 百分制（保留 1 位小数） */
function pct(v: number | null): number | null {
  if (v == null) return null;
  return Math.round(v * 1000) / 10;
}

export interface ParseOpenLLMResult {
  openllm_mmlu: GenericLLMEntry[];
  openllm_arc: GenericLLMEntry[];
  openllm_hellaswag: GenericLLMEntry[];
  openllm_truthfulqa: GenericLLMEntry[];
  openllm_gsm8k: GenericLLMEntry[];
  openllm_bbh: GenericLLMEntry[];
  pending: string[];
}

/**
 * 纯函数：吃 Map<modelPath, rawJson>，吐 6 维解析结果。
 * 未解析的 model 名进入 pending。同一 model_id 多个变体保留最高分。
 */
export function parseOpenLLM(jsonMap: Map<string, unknown>): ParseOpenLLMResult {
  const models = loadModels();
  const pending: string[] = [];
  const byId = {
    mmlu: new Map<string, GenericLLMEntry>(),
    arc: new Map<string, GenericLLMEntry>(),
    hellaswag: new Map<string, GenericLLMEntry>(),
    truthfulqa: new Map<string, GenericLLMEntry>(),
    gsm8k: new Map<string, GenericLLMEntry>(),
    bbh: new Map<string, GenericLLMEntry>(),
  };

  for (const [modelPath, json] of jsonMap) {
    const scores = extractScores(json);
    // 从 path 末段（org/model）取可读 model 名
    const displayName = modelPath.includes('/') ? modelPath.split('/').pop()! : modelPath;
    const resolved = resolveModelId(displayName, models);
    if (!resolved) {
      pending.push(displayName);
      continue;
    }
    for (const sub of [
      'mmlu',
      'arc',
      'hellaswag',
      'truthfulqa',
      'gsm8k',
      'bbh',
    ] as const) {
      const s = pct(scores[sub]);
      if (s == null) continue;
      const m = byId[sub];
      const cur = m.get(resolved.id);
      if (!cur || s > cur.score) {
        m.set(resolved.id, { model_id: resolved.id, score: s, rank_prev: null, delta_score: null });
      }
    }
  }

  const sortDesc = (m: Map<string, GenericLLMEntry>): GenericLLMEntry[] =>
    [...m.values()].sort((a, b) => b.score - a.score);

  return {
    openllm_mmlu: sortDesc(byId.mmlu),
    openllm_arc: sortDesc(byId.arc),
    openllm_hellaswag: sortDesc(byId.hellaswag),
    openllm_truthfulqa: sortDesc(byId.truthfulqa),
    openllm_gsm8k: sortDesc(byId.gsm8k),
    openllm_bbh: sortDesc(byId.bbh),
    pending,
  };
}

/**
 * 拉取所有 model dir 下最新一份 JSON（按字典序取最后）。
 * 通过目录列表 API 翻页（cursor），按 5 并发抓 JSON。
 * 整个流程限时 5 分钟；单 JSON 失败计入 skip 列表但不污染 pending。
 */
export async function fetchOpenLLM(opts?: {
  /** 限制抓取的最大 JSON 数（CI smoke test 友好）；不传则全量 */
  limit?: number;
  /** 20 并发（实测 ~16 req/s 安全），4500 个 dir 在 5-6 min 内跑完 */
  concurrency?: number;
  /** 整体超时 ms（默认 8 分钟——CI/本地两档兼容） */
  timeoutMs?: number;
}): Promise<
  | {
      ok: true;
      parsed: ParseOpenLLMResult;
      fetched: number;
      skipped: number;
      total: number;
    }
  | { ok: false; error: string }
> {
  const limit = opts?.limit ?? Infinity;
  const concurrency = opts?.concurrency ?? 20;
  const timeoutMs = opts?.timeoutMs ?? 8 * 60_000;
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // 1. 拉所有 model dir
    const modelDirs: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = cursor
        ? `${HF_BASE}?recursive=true&cursor=${encodeURIComponent(cursor)}`
        : `${HF_BASE}?recursive=true`;
      const res: Response = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return { ok: false, error: `OpenLLM tree HTTP ${res.status}` };
      const data = (await res.json()) as OpenLLMTreeEntry[];
      if (!Array.isArray(data)) return { ok: false, error: 'OpenLLM tree: non-array response' };
      for (const entry of data) {
        if (entry.type === 'directory' && entry.path.includes('/')) {
          // 顶层目录（如 "01-ai"）不算模型；只保留形如 org/model 的 2 段路径
          const parts = entry.path.split('/');
          if (parts.length === 2) modelDirs.push(entry.path);
        }
      }
      // Link header 翻页
      const link: string | null = res.headers.get('Link');
      const next: RegExpMatchArray | null = link ? link.match(/cursor=([^&>]+)/) : null;
      cursor = next ? next[1] : null;
    } while (cursor);
    if (modelDirs.length === 0) return { ok: false, error: 'OpenLLM: no model dirs found' };

    // 2. 对每个 dir 抓最新 JSON（按"key 数量最多"挑，而不是最新 timestamp——
    //    实测发现 2025-02 补跑文件比 2024-10 文件少几个 key，按时间倒序会挑错），
    //    按并发限速
    const targets = modelDirs.slice(0, limit);
    const jsonMap = new Map<string, unknown>();
    let skipped = 0;
    let cursor2 = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor2 < targets.length) {
        const idx = cursor2++;
        if (idx >= targets.length) break;
        const dir = targets[idx];
        try {
          const listRes = await fetch(`${HF_BASE}/${encodeURI(dir)}`, {
            signal: ctrl.signal,
            headers: { Accept: 'application/json' },
          });
          if (!listRes.ok) {
            skipped++;
            continue;
          }
          const list = (await listRes.json()) as OpenLLMTreeEntry[];
          const allFiles = list
            .filter((e) => e.type === 'file' && (e.path.split('/').pop() ?? '').startsWith('results_'))
            .map((e) => e.path);
          if (allFiles.length === 0) {
            skipped++;
            continue;
          }
          // 多数情况最新版（按 path 字典序倒序）就是最完整；只在最新失败/keys 少时
          // 才 fallback 到第 2 个。实测 5min 全量必须控制到 ~1 个请求/dir。
          const candidates = [...allFiles].sort().reverse().slice(0, 2);
          let best: { path: string; json: unknown } | null = null;
          for (const f of candidates) {
            try {
              const fileRes = await fetch(`${HF_RESOLVE}/${f}`, { signal: ctrl.signal });
              if (!fileRes.ok) continue;
              const json = (await fileRes.json()) as { results?: Record<string, unknown> };
              const keyCount = Object.keys(json.results ?? {}).length;
              if (keyCount > 0) {
                // 第一个非空就直接采用，避免重复请求
                best = { path: f, json };
                break;
              }
              if (!best) {
                best = { path: f, json };
              }
            } catch {
              /* skip this file */
            }
          }
          if (best) jsonMap.set(dir, best.json);
          else skipped++;
        } catch (err) {
          if (ctrl.signal.aborted) throw err;
          skipped++;
        }
      }
    });
    await Promise.all(workers);

    const parsed = parseOpenLLM(jsonMap);
    return {
      ok: true,
      parsed,
      fetched: jsonMap.size,
      skipped,
      total: modelDirs.length,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeoutId);
  }
}
