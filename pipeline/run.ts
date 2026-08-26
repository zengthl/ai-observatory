// pipeline/run.ts —— 管道编排：抓三源 → 归一化 → zod 校验 → 快照落盘
// 用法：npm run fetch（GitHub Actions 每日定时 + 本地手动）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  History,
  LatestFile,
  PendingFile,
  Snapshot,
  SourceInfo,
  SourceName,
} from '../src/types';
import { historySchema, snapshotSchema } from './schema';
import { buildHistory, loadModels, withRanks } from './normalize';
import { fetchAA } from './sources/aa';
import { fetchArena } from './sources/arena';
import { fetchSwebench } from './sources/swebench';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

// 本地运行时从项目根 .env 读 AA_API_KEY（无 dotenv 依赖，Node ≥20.12 原生支持）
try {
  process.loadEnvFile(path.resolve(DATA_DIR, '..', '..', '.env'));
} catch {
  /* .env 不存在时静默跳过（Actions 用环境变量注入） */
}

/** pending.json names 截断上限（全量约 500+，避免文件膨胀） */
const PENDING_LIMIT = 100;

export function mergePending(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

export function pickBaselineDate(files: string[], target: string): string | null {
  const dates = files
    .map((f) => f.replace(/\.json$/, ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < target)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function readJson<T>(file: string): T | null {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null; // 损坏的历史文件按缺失处理，不让重跑卡死
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(path.join(DATA_DIR, file)), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), `${JSON.stringify(data, null, 1)}\n`);
}

/** 源失败时：若旧 latest 里该源是 ok，则 last_ok 记为旧 latest 的日期 */
function lastOkFrom(latest: Snapshot | null, name: SourceName): string | undefined {
  if (latest?.sources[name]?.status === 'ok') return latest.date;
  return undefined;
}

async function main(): Promise<void> {
  const apiKey = process.env.AA_API_KEY;
  if (!apiKey) {
    console.error('AA_API_KEY missing (.env)');
    process.exit(1);
  }

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const fetchedAt = now.toISOString();

  console.log(`[${date}] fetching sources...`);
  const [aaRes, arenaRes, sweRes] = await Promise.all([
    fetchAA(apiKey),
    fetchArena(),
    fetchSwebench(),
  ]);

  const prevLatest = readJson<Snapshot>('latest.json');
  const sources: Record<SourceName, SourceInfo> = {
    artificial_analysis: aaRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'artificial_analysis') },
    lmarena: arenaRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'lmarena') },
    swebench: sweRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'swebench') },
  };

  if (!aaRes.ok && !arenaRes.ok && !sweRes.ok) {
    console.error('ALL SOURCES FAILED — aborting, no snapshot written');
    console.error(
      `  artificial_analysis: ${'error' in aaRes ? aaRes.error : ''}\n` +
        `  lmarena: ${'error' in arenaRes ? arenaRes.error : ''}\n` +
        `  swebench: ${'error' in sweRes ? sweRes.error : ''}`,
    );
    process.exit(1);
  }
  for (const [name, res] of [
    ['artificial_analysis', aaRes],
    ['lmarena', arenaRes],
    ['swebench', sweRes],
  ] as const) {
    if (!res.ok) console.warn(`[${date}] ${name} unavailable: ${(res as { error: string }).error}`);
  }

  // 昨日基线：snapshots 目录中早于今天的最新一份
  const snapDir = path.join(DATA_DIR, 'snapshots');
  const existing = fs.existsSync(snapDir) ? fs.readdirSync(snapDir) : [];
  const baselineDate = pickBaselineDate(existing, date);
  const baseline: Snapshot | null =
    baselineDate != null
      ? readJson<Snapshot>(path.posix.join('snapshots', `${baselineDate}.json`))
      : null;
  console.log(`[${date}] baseline snapshot: ${baselineDate ?? 'none (first run)'}`);
  const prevHistory = readJson<History>('history.json') ?? {};

  // 组装四榜（失败源产出空数组，快照里标 unavailable）
  const aaEntries = aaRes.ok ? aaRes.parsed.entries : [];
  const tbEntries = aaRes.ok ? aaRes.parsed.terminal_bench : [];
  const arenaEntries = arenaRes.ok ? arenaRes.entries : [];
  const sweEntries = sweRes.ok ? sweRes.parsed.entries : [];

  const snapshot: LatestFile = {
    date,
    sources,
    llm: {
      arena_elo: withRanks(arenaEntries, baseline?.llm.arena_elo),
      aa_index: withRanks(aaEntries, baseline?.llm.aa_index),
    },
    agent: {
      swebench_verified: withRanks(sweEntries, baseline?.agent.swebench_verified),
      terminal_bench: withRanks(tbEntries, baseline?.agent.terminal_bench),
    },
    models: loadModels(),
  };

  const validated = snapshotSchema.parse(snapshot); // 脏数据在此抛出，不落盘
  const history = historySchema.parse(buildHistory(prevHistory, validated as Snapshot));

  const pendingAll = mergePending(
    ...(aaRes.ok ? [aaRes.parsed.pending] : []),
    ...(arenaRes.ok ? [arenaRes.pending] : []),
    ...(sweRes.ok ? [sweRes.parsed.pending] : []),
  );
  const pending: PendingFile =
    pendingAll.length > PENDING_LIMIT
      ? { date, names: pendingAll.slice(0, PENDING_LIMIT), total: pendingAll.length }
      : { date, names: pendingAll };

  writeJson(path.posix.join('snapshots', `${date}.json`), validated);
  writeJson('latest.json', validated);
  writeJson('history.json', history);
  writeJson('pending.json', pending);

  console.log(
    `[${date}] done. arena:${validated.llm.arena_elo.length} aa:${validated.llm.aa_index.length} ` +
      `swe:${validated.agent.swebench_verified.length} tb:${validated.agent.terminal_bench.length} ` +
      `pending:${pending.names.length}${pending.total != null ? `/${pending.total} (truncated)` : ''} ` +
      `history:${Object.keys(history).length} models`,
  );
  const failed = Object.entries(sources).filter(([, s]) => s.status === 'unavailable');
  if (failed.length) console.warn(`degraded sources: ${failed.map(([k]) => k).join(', ')}`);
}

// 仅在直接执行（npm run fetch / node run.ts）时启动管道；
// 被 import（如 vitest 加载本文件测纯函数）时不得有副作用
const isDirectRun =
  process.argv[1] != null && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((err) => {
    console.error('fetch failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
