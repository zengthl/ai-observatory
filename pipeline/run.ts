// pipeline/run.ts —— 管道编排：抓四源 → 归一化 → zod 校验 → 快照落盘
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
import { buildHistory, loadModels, withRanks, withRanksGeneric } from './normalize';
import { fetchAA } from './sources/aa';
import { fetchArena } from './sources/arena';
import { fetchSwebench } from './sources/swebench';
import { fetchLivebench } from './sources/livebench';
import { fetchOpenLLM } from './sources/openllm';
import { fetchLiveCodeBench } from './sources/livecodebench';

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
  const [aaRes, arenaRes, sweRes, lbRes, openllmRes, lcbRes] = await Promise.all([
    fetchAA(apiKey),
    fetchArena(),
    fetchSwebench(),
    fetchLivebench(),
    fetchOpenLLM(),
    fetchLiveCodeBench(),
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
    livebench: lbRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'livebench') },
    openllm: openllmRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'openllm') },
    livecodebench: lcbRes.ok
      ? { status: 'ok', fetched_at: fetchedAt }
      : { status: 'unavailable', fetched_at: fetchedAt, last_ok: lastOkFrom(prevLatest, 'livecodebench') },
  };

  if (!aaRes.ok && !arenaRes.ok && !sweRes.ok && !lbRes.ok && !openllmRes.ok && !lcbRes.ok) {
    console.error('ALL SOURCES FAILED — aborting, no snapshot written');
    console.error(
      `  artificial_analysis: ${'error' in aaRes ? aaRes.error : ''}\n` +
        `  lmarena: ${'error' in arenaRes ? arenaRes.error : ''}\n` +
        `  swebench: ${'error' in sweRes ? sweRes.error : ''}\n` +
        `  livebench: ${'error' in lbRes ? lbRes.error : ''}\n` +
        `  openllm: ${'error' in openllmRes ? openllmRes.error : ''}\n` +
        `  livecodebench: ${'error' in lcbRes ? lcbRes.error : ''}`,
    );
    process.exit(1);
  }
  for (const [name, res] of [
    ['artificial_analysis', aaRes],
    ['lmarena', arenaRes],
    ['swebench', sweRes],
    ['livebench', lbRes],
    ['openllm', openllmRes],
    ['livecodebench', lcbRes],
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

  // 组装各榜（失败源产出空数组，快照里标 unavailable）
  const aaEntries = aaRes.ok ? aaRes.parsed.entries : [];
  const tbEntries = aaRes.ok ? aaRes.parsed.terminal_bench : [];
  const arenaEntries = arenaRes.ok ? arenaRes.entries : [];
  const sweEntries = sweRes.ok ? sweRes.parsed.entries : [];

  // AA 6 子榜：失败/无数据时落空数组
  const aaP = aaRes.ok ? aaRes.parsed : null;
  const lbP = lbRes.ok ? lbRes.parsed : null;
  const ollmP = openllmRes.ok ? openllmRes.parsed : null;
  const lcbP = lcbRes.ok ? lcbRes.parsed : null;
  const prevLlm = baseline?.llm;

  const snapshot: LatestFile = {
    date,
    sources,
    llm: {
      arena_elo: withRanks(arenaEntries, prevLlm?.arena_elo),
      aa_index: withRanks(aaEntries, prevLlm?.aa_index),
      aa_mmlu_pro: withRanksGeneric(aaP?.aa_mmlu_pro ?? [], prevLlm?.aa_mmlu_pro),
      aa_gpqa: withRanksGeneric(aaP?.aa_gpqa ?? [], prevLlm?.aa_gpqa),
      aa_hle: withRanksGeneric(aaP?.aa_hle ?? [], prevLlm?.aa_hle),
      aa_livecodebench: withRanksGeneric(aaP?.aa_livecodebench ?? [], prevLlm?.aa_livecodebench),
      aa_ifeval: withRanksGeneric(aaP?.aa_ifeval ?? [], prevLlm?.aa_ifeval),
      aa_lcr: withRanksGeneric(aaP?.aa_lcr ?? [], prevLlm?.aa_lcr),
      livebench_coding: withRanksGeneric(lbP?.livebench_coding ?? [], prevLlm?.livebench_coding),
      livebench_math: withRanksGeneric(lbP?.livebench_math ?? [], prevLlm?.livebench_math),
      livebench_reasoning: withRanksGeneric(lbP?.livebench_reasoning ?? [], prevLlm?.livebench_reasoning),
      livebench_language: withRanksGeneric(lbP?.livebench_language ?? [], prevLlm?.livebench_language),
      livebench_data_analysis: withRanksGeneric(lbP?.livebench_data_analysis ?? [], prevLlm?.livebench_data_analysis),
      livebench_instruction_following: withRanksGeneric(
        lbP?.livebench_instruction_following ?? [],
        prevLlm?.livebench_instruction_following,
      ),
      openllm_mmlu: withRanksGeneric(ollmP?.openllm_mmlu ?? [], prevLlm?.openllm_mmlu),
      openllm_arc: withRanksGeneric(ollmP?.openllm_arc ?? [], prevLlm?.openllm_arc),
      openllm_hellaswag: withRanksGeneric(ollmP?.openllm_hellaswag ?? [], prevLlm?.openllm_hellaswag),
      openllm_truthfulqa: withRanksGeneric(ollmP?.openllm_truthfulqa ?? [], prevLlm?.openllm_truthfulqa),
      openllm_gsm8k: withRanksGeneric(ollmP?.openllm_gsm8k ?? [], prevLlm?.openllm_gsm8k),
      openllm_bbh: withRanksGeneric(ollmP?.openllm_bbh ?? [], prevLlm?.openllm_bbh),
      livecodebench: withRanksGeneric(lcbP?.livecodebench ?? [], prevLlm?.livecodebench),
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
    ...(lbRes.ok ? [lbRes.parsed.pending] : []),
    ...(openllmRes.ok ? [openllmRes.parsed.pending] : []),
    ...(lcbRes.ok ? [lcbRes.parsed.pending] : []),
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
      `aa_mmlu:${validated.llm.aa_mmlu_pro.length} aa_gpqa:${validated.llm.aa_gpqa.length} ` +
      `aa_hle:${validated.llm.aa_hle.length} aa_lcb:${validated.llm.aa_livecodebench.length} ` +
      `aa_if:${validated.llm.aa_ifeval.length} aa_lcr:${validated.llm.aa_lcr.length} ` +
      `lb_cod:${validated.llm.livebench_coding.length} lb_math:${validated.llm.livebench_math.length} ` +
      `lb_rea:${validated.llm.livebench_reasoning.length} lb_lang:${validated.llm.livebench_language.length} ` +
      `lb_data:${validated.llm.livebench_data_analysis.length} lb_if:${validated.llm.livebench_instruction_following.length} ` +
      `ollm_mmlu:${validated.llm.openllm_mmlu.length} ollm_arc:${validated.llm.openllm_arc.length} ` +
      `ollm_hella:${validated.llm.openllm_hellaswag.length} ollm_tqa:${validated.llm.openllm_truthfulqa.length} ` +
      `ollm_gsm:${validated.llm.openllm_gsm8k.length} ollm_bbh:${validated.llm.openllm_bbh.length} ` +
      `lcb:${validated.llm.livecodebench.length} ` +
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
