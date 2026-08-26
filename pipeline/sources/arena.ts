// pipeline/sources/arena.ts —— LMArena 适配器（解析 SSR HTML 排行榜）
import type { ArenaEloEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

export type ArenaCategory = 'text' | 'coding' | 'webdev';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// 2026-08-26 实测：lmarena.ai 已 301 到 arena.ai；WebDev 榜挂在 code 分类下
const URLS: Record<ArenaCategory, string> = {
  text: 'https://lmarena.ai/leaderboard/text',
  coding: 'https://lmarena.ai/leaderboard/text/coding',
  webdev: 'https://lmarena.ai/leaderboard/code/webdev',
};

// 每个模型行的固定形态：<span class="max-w-full truncate" title="模型名">
const MARK = '<span class="max-w-full truncate" title=';

/** 从窗口 HTML 中抽取可见文本格（标签间 1–20 字符的纯文本） */
function cells(windowHtml: string): string[] {
  return (windowHtml.match(/>[^<>]{1,20}</g) ?? [])
    .map((c) => c.slice(1, -1).trim())
    .filter(Boolean);
}

const isInt = (s: string): boolean => /^\d{1,4}$/.test(s);
const isVotes = (s: string): boolean => /^\d{1,3}(,\d{3})+$/.test(s);

/**
 * 纯函数：吃 SSR HTML，吐解析结果。网络层独立可测。
 * 行结构（2026-08 实测）：| 名次 | ±变化 | … | Org | 模型名(title=) | License·类型 | Elo | ±CI | votes | $in/$out |
 * 注意：部分行的名次格前嵌有数 KB 的 org logo SVG，固定字符窗口不可靠，
 * 故名次一律从最近的 <tr 行边界向后找第一个整数格。
 */
export function parseArena(
  html: string,
  category: ArenaCategory,
): { entries: ArenaEloEntry[]; pending: string[] } {
  const models = loadModels();
  const pending: string[] = [];
  const byId = new Map<string, ArenaEloEntry>();

  let markAt = html.indexOf(MARK);
  while (markAt !== -1) {
    // MARK 自身含引号（class="…"），须跳到 title=" 之后才是模型名
    const titleEq = html.indexOf('title="', markAt);
    if (titleEq === -1) break;
    const nameStart = titleEq + 'title="'.length;
    const nameEnd = html.indexOf('"', nameStart);
    if (nameEnd === -1) break;
    const rawName = html.slice(nameStart, nameEnd);

    // 名次：本行 <tr 边界之后第一个 1–3 位整数格
    const trAt = html.lastIndexOf('<tr', markAt);
    let rankNum: number | null = null;
    if (trAt !== -1 && markAt - trAt < 30000) {
      for (const c of cells(html.slice(trAt, markAt))) {
        if (/^\d{1,3}$/.test(c)) {
          rankNum = parseInt(c, 10);
          break;
        }
      }
    }

    // Elo / CI / votes：模型名后方依序出现的数字格
    // Elo 合理区间 ≥100 且 ≤2000；±N 紧随其后；带逗号数字是票数
    const after = html.slice(nameEnd, nameEnd + 3500);
    const afterCells = cells(after);
    let elo: number | null = null;
    let ciHalf: number | null = null;
    let votes: number | null = null;
    for (let i = 0; i < afterCells.length && i <= 14 && elo === null; i++) {
      const s = afterCells[i];
      if (isInt(s) && parseInt(s, 10) >= 100 && parseInt(s, 10) <= 2000) {
        elo = parseInt(s, 10);
        // 相邻 CI 格：text/coding 榜是 ±N，webdev 榜是 +N/-N
        const pm =
          afterCells[i + 1]?.match(/^±(\d+)$/) ??
          afterCells[i + 1]?.match(/^\+(\d+)\/-(\d+)$/);
        if (pm) ciHalf = parseInt(pm[1], 10);
        for (let j = i + 1; j < Math.min(i + 5, afterCells.length); j++) {
          if (isVotes(afterCells[j])) {
            votes = parseInt(afterCells[j].replace(/,/g, ''), 10);
            break;
          }
        }
      }
    }

    if (elo !== null && rankNum !== null) {
      const resolved = resolveModelId(rawName, models);
      if (resolved) {
        const entry: ArenaEloEntry = {
          model_id: resolved.id,
          score: elo,
          ci95: ciHalf != null ? [elo - ciHalf, elo + ciHalf] : undefined,
          votes: votes ?? undefined,
          categories: category === 'text' ? undefined : { [category === 'coding' ? 'code' : 'webdev']: elo },
          rank_prev: null,
          delta_score: null,
        };
        // 同一 model_id 的多个推理档位变体：保留分数最高者
        const cur = byId.get(resolved.id);
        if (!cur || entry.score > cur.score) byId.set(resolved.id, entry);
      } else {
        pending.push(rawName);
      }
    }
    markAt = html.indexOf(MARK, nameEnd);
  }

  const entries = [...byId.values()].sort((a, b) => b.score - a.score);
  return { entries, pending };
}

export async function fetchArena(): Promise<
  { ok: true; entries: ArenaEloEntry[]; pending: string[] } | { ok: false; error: string }
> {
  try {
    const cats: ArenaCategory[] = ['text', 'coding', 'webdev'];
    const results = await Promise.all(
      cats.map(async (c) => {
        const res = await fetch(URLS[c], { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`LMArena ${c} HTTP ${res.status}`);
        return parseArena(await res.text(), c);
      }),
    );
    const [text, coding, webdev] = results;
    // 合并：text 为主榜，coding/webdev 分数并入 categories.{code,webdev}
    const catByKey = new Map<string, Record<string, number>>();
    for (const r of coding.entries)
      catByKey.set(r.model_id, { ...catByKey.get(r.model_id), code: r.score });
    for (const r of webdev.entries)
      catByKey.set(r.model_id, { ...catByKey.get(r.model_id), webdev: r.score });
    const entries = text.entries.map((r) => {
      const cats2 = catByKey.get(r.model_id);
      return cats2 ? { ...r, categories: cats2 } : r;
    });
    const pending = [...new Set([...text.pending, ...coding.pending, ...webdev.pending])];
    return { ok: true, entries, pending };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
