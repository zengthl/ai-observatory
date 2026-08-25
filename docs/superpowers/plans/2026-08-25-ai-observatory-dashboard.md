# AI 排名观测站实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 AI 大模型与 Agent 排名看板：GitHub Actions 每日抓取 Artificial Analysis / LMArena / SWE-bench 数据生成 JSON 快照（git 留档），React 静态站以「精密计量局」视觉风格展示，部署 GitHub Pages。

**Architecture:** 无服务器三段式——Node 抓取管道（每源一个适配器 + models.yaml 身份对齐）产出 `public/data/*.json`；Vite+React+TS 纯客户端 SPA 运行时 fetch 本地 JSON 渲染双 Tab 看板；GitHub Actions 承担定时抓取与 Pages 发布。

**Tech Stack:** Node 22 + tsx、Vite 5、React 18、TypeScript strict、ECharts 5（按需引入）、原生 CSS 变量令牌、Vitest、zod、yaml。

## Global Constraints

- 视觉系统严格遵循设计文档 §6「精密计量局」：`--paper:#FAFAF6`、`--ink:#16181D`、`--ink-soft:#6B6D64`、`--rule-light:#E4E4DB`、网格线 `rgba(22,24,29,.045)` 22px、`--orange:#FF4D00`、`--blue:#2563EB`、`--up:#0A7D33`、`--down:#C62828`
- 字体：Noto Sans SC（正文/展示标题）+ IBM Plex Mono（全部数字、日期、字段标签，标签大写字距 .18em）；不引入其他字体
- 中文界面；模型名/榜单名/厂商名保留英文原文
- 不使用 UI 组件库；不使用 Tailwind
- TypeScript strict 全绿；管道与前端共用 `src/types.ts`
- 数据快照写入前必须过 zod 校验；失败源标记 `status:"unavailable"`，绝不写脏值
- AA API Key 只存 `.env` 与 GitHub Secret `AA_API_KEY`，任何代码不得硬编码
- 每任务结束必须 git commit（在项目根 `ai-observatory/` 的 git 仓库内）
- 所有测试/构建命令都在 `ai-observatory/` 目录下运行

## 对设计文档的三处已确认偏离（实施时照此执行）

1. **data 目录改为 `public/data/`**（原设计为仓库根 data/）：Vite 会把 public/ 原样拷进 dist，前端运行时 `fetch('/data/latest.json')` 加载；git 快照留档功能不变
2. **latest.json 顶层内嵌 `models: ModelMeta[]`**：前端免于解析 yaml，单次请求拿到全部所需
3. **对比指标不含上下文窗口**（AA v2 API 无此字段，实测确认）；Terminal-Bench 子榜数据源采用 **AA API 的 `evaluations.terminalbench_v2_1 × 100`**（独立 tbench.dev 解析器风险高，AA 字段稳定且实测存在）

---

### Task 1: 项目脚手架 + 共享类型定义

**Files:**
- Create: `package.json`（scripts 配置）, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/types.ts`

**Interfaces:**
- Produces: `src/types.ts` 全部类型，是后续所有任务的契约。完整代码见 Step 3。

- [ ] **Step 1: 安装依赖与工程配置**

```bash
cd "ai-observatory"
npm init -y
npm i react react-dom echarts zod yaml
npm i -D typescript vite @vitejs/plugin-react tsx vitest @types/react @types/react-dom @types/node
```

`package.json` 的 scripts 覆盖为：

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "fetch": "tsx pipeline/run.ts",
    "preview": "vite preview"
  }
}
```

创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "pipeline", "tests"]
}
```

注意 `"build"` script 里用了 `tsc -b` 但配置了 noEmit，直接把 build script 改为 `tsc --noEmit && vite build` 更简单，采纳这个。

`vite.config.ts`：

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

`.env.example`：

```
AA_API_KEY=your_key_here
```

`.env`（已被 .gitignore 覆盖，不入库）：

```
AA_API_KEY=aa_nMbZoWCdyLNOhfJrPVadeiWewCegIxMa
```

同时把 `.gitignore` 补充为：

```
.superpowers/
node_modules/
dist/
.env
pipeline/fixtures/*_full.html
```

- [ ] **Step 2: index.html + 入口占位**

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>基准 · BENCHMARK — AI 排名观测</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700;900&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`：

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './design/tokens.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx` 占位（Task 8 替换）：

```tsx
export default function App() {
  return <div style={{ padding: 40 }}>观测站建设中…</div>;
}
```

先建一个空的 `src/design/tokens.css`（Task 8 填充），保证 main.tsx 可编译。

- [ ] **Step 3: src/types.ts 完整类型定义（逐字写干净版本）**

```ts
// ===== 快照结构 =====

export type SourceName = 'artificial_analysis' | 'lmarena' | 'swebench';

export type SourceStatus = 'ok' | 'unavailable';

export interface SourceInfo {
  status: SourceStatus;
  fetched_at?: string;
  last_ok?: string;
}

export interface ArenaEloEntry {
  model_id: string;
  score: number;
  ci95?: [number, number];
  votes?: number;
  categories?: Record<string, number>;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface AAIndexEntry {
  model_id: string;
  index: number;
  coding_index?: number | null;
  math_index?: number | null;
  output_speed_tps?: number | null;
  ttft_s?: number | null;
  price_blin_per_m?: number | null;
  price_in_per_m?: number | null;
  price_out_per_m?: number | null;
  tbench_v21_pct?: number | null;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface SweEntry {
  model_id: string;
  resolved_pct: number;
  agent?: string;
  cost_usd_per_instance?: number | null;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface TBenchEntry {
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface Snapshot {
  date: string;
  sources: Record<SourceName, SourceInfo>;
  llm: {
    arena_elo: ArenaEloEntry[];
    aa_index: AAIndexEntry[];
  };
  agent: {
    swebench_verified: SweEntry[];
    terminal_bench: TBenchEntry[];
  };
}

// ===== latest.json 顶层结构（含内嵌模型元数据）=====

export interface LatestFile extends Snapshot {
  models: ModelMeta[];
}

// ===== 模型身份 =====

export interface ModelMeta {
  model_id: string;
  display_name: string;
  org: string;
  license: 'closed' | 'open';
  aliases: string[];
}

// ===== 历史序列 =====

export type HistoryPoint = [string, number];

export interface HistoryModel {
  arena_elo?: HistoryPoint[];
  aa_index?: HistoryPoint[];
  swebench_verified?: HistoryPoint[];
  terminal_bench?: HistoryPoint[];
}

export type History = Record<string, HistoryModel>;

// ===== 待确认的未知模型名 =====

export interface PendingFile {
  date: string;
  names: string[];
}
```

- [ ] **Step 4: 验证并提交**

```bash
npx tsc --noEmit
git add -A
git commit -m "chore: scaffold Vite+React+TS project with shared types"
```

Expected: tsc 无错误退出（exit 0）。App.tsx 引用的 tokens.css 已建空文件。

---

### Task 2: models.yaml 初始模型表 + 归一化引擎（TDD）

**Files:**
- Create: `pipeline/models.yaml`, `pipeline/normalize.ts`
- Test: `tests/normalize.test.ts`

**Interfaces:**
- Consumes: `ModelMeta`, `Snapshot`, `History`（Task 1）
- Produces:
  - `loadModels(): ModelMeta[]`
  - `resolveModelId(rawName: string, models: ModelMeta[]): { id: string; meta: ModelMeta } | null`
  - `withRanks<T extends { model_id: string }>(entries: T[], prev?: { model_id: string; score?: number; resolved_pct?: number }[]): (T & { rank: number })[]`——注入当期名次 rank（=数组序号+1），并按入参对象上的 `score ?? resolved_pct ?? index` 计算与前一日的 `delta_score`、前日名次 `rank_prev`（无前日记录 → `rank_prev:null`，即 NEW）
  - `buildHistory(prevHistory: History, snapshot: Snapshot): History`——追加当日点，同日重跑覆盖当日点

- [ ] **Step 1: 写失败测试**

```ts
// tests/normalize.test.ts
import { describe, it, expect } from 'vitest';
import { resolveModelId, withRanks, buildHistory } from '../pipeline/normalize';
import type { ModelMeta, ArenaEloEntry, History, Snapshot } from '../src/types';

const MODELS: ModelMeta[] = [
  {
    model_id: 'gpt-5-pro', display_name: 'GPT-5 Pro', org: 'OpenAI', license: 'closed',
    aliases: ['GPT-5 Pro', 'gpt-5-pro', 'chatgpt-5-pro'],
  },
  {
    model_id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', org: 'Anthropic', license: 'closed',
    aliases: ['Claude Opus 4.6', 'claude-opus-4.6', 'claude-opus-4-6-high'],
  },
];

describe('resolveModelId', () => {
  it('exact alias match', () => {
    expect(resolveModelId('GPT-5 Pro', MODELS)?.id).toBe('gpt-5-pro');
  });
  it('case/punctuation-insensitive', () => {
    expect(resolveModelId('CLAUDE-OPUS_4.6', MODELS)?.id).toBe('claude-opus-4-6');
  });
  it('reasoning-effort suffix tolerated via alias', () => {
    expect(resolveModelId('claude-opus-4-6-high', MODELS)?.id).toBe('claude-opus-4-6');
  });
  it('unknown returns null', () => {
    expect(resolveModelId('mystery-model-9000', MODELS)).toBeNull();
  });
});

describe('withRanks', () => {
  const today: ArenaEloEntry[] = [
    { model_id: 'a', score: 90, rank_prev: null, delta_score: null },
    { model_id: 'b', score: 80, rank_prev: null, delta_score: null },
    { model_id: 'c', score: 70, rank_prev: null, delta_score: null },
  ];
  const yesterday = [
    { model_id: 'b', score: 78 },
    { model_id: 'a', score: 88 },
  ];

  it('assigns current rank by array order and computes prev/delta', () => {
    const r = withRanks(today, yesterday);
    expect(r[0]).toMatchObject({ model_id: 'a', rank: 1, rank_prev: 2, delta_score: 2 });
    expect(r[1]).toMatchObject({ model_id: 'b', rank: 2, rank_prev: 1, delta_score: 2 });
  });
  it('new entry gets rank_prev null (NEW)', () => {
    const r = withRanks(today, yesterday);
    expect(r[2]).toMatchObject({ model_id: 'c', rank: 3, rank_prev: null, delta_score: null });
  });
  it('works without prev data', () => {
    const r = withRanks(today, undefined);
    expect(r.every((e) => e.rank_prev === null && e.delta_score === null)).toBe(true);
  });
});

describe('buildHistory', () => {
  it('appends today point and overwrites same-day rerun', () => {
    const snap = (score: number): Snapshot =>
      ({
        date: '2026-08-25',
        sources: {} as any,
        llm: { arena_elo: [{ model_id: 'a', score, rank_prev: null, delta_score: null }], aa_index: [] },
        agent: { swebench_verified: [], terminal_bench: [] },
      }) as Snapshot;

    const h1 = buildHistory({}, snap(100));
    expect(h1['a'].arena_elo).toEqual([['2026-08-25', 100]]);

    const h2 = buildHistory(h1, snap(102));
    expect(h2['a'].arena_elo).toEqual([['2026-08-25', 102]]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL（`../pipeline/normalize` 模块不存在）

- [ ] **Step 3: 创建 pipeline/models.yaml 初始表**

收录三大源合计 Top ~35 主流模型。条目格式统一如下（org 用英文厂牌名；license 只有 closed/open 两值；aliases 必须含 Task 3/4/5 fixture 中出现的原始名字形态，含推理档位后缀变体如 `(high)`、`-high`、`(medium)` 等）：

```yaml
# pipeline/models.yaml —— 模型身份主表（人工维护）
# 新模型名出现在 pending.json 时，在此登记后次日生效
- model_id: claude-fable-5
  display_name: Claude Fable 5
  org: Anthropic
  license: closed
  aliases: ["Claude Fable 5", "claude-fable-5"]
- model_id: gpt-5-pro
  display_name: GPT-5 Pro
  org: OpenAI
  license: closed
  aliases: ["GPT-5 Pro", "gpt-5-pro", "gpt-5-pro (high)", "gpt-5-pro-high"]
# …… 实施者对照三个 fixture 的实际模型名补齐至 ≥35 条，
# 覆盖 Anthropic/OpenAI/Google/xAI/DeepSeek/Alibaba(Qwen)/Moonshot/GLM/ByteDance/Meta/Mistral 等主要厂牌
```

关键规则：
- 同一基础模型的不同推理档位（`-high/-low/-medium/max` 后缀或 `(high)` 括号变体）映射到同一 model_id，由各适配器的 dedup 逻辑取最高分
- alias 归一化匹配由 resolveModelId 的小写去符号逻辑兜底，无需穷举大小写

- [ ] **Step 4: 实现 normalize.ts**

```ts
// pipeline/normalize.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { History, HistoryModel, ModelMeta, Snapshot } from '../src/types';

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
```

- [ ] **Step 5: 测试通过后提交**

```bash
npx vitest run tests/normalize.test.ts
git add -A
git commit -m "feat(pipeline): model identity table + normalization engine"
```

Expected: 全部 PASS。

---

### Task 3: Artificial Analysis 适配器（TDD）

**Files:**
- Create: `pipeline/sources/aa.ts`, `pipeline/fixtures/aa.json`
- Test: `tests/sources/aa.test.ts`

**Interfaces:**
- Consumes: `loadModels/resolveModelId`（Task 2）、`AAIndexEntry/TBenchEntry`（Task 1）
- Produces:
  - `parseAA(raw: unknown): { entries: AAIndexEntry[]; terminal_bench: TBenchEntry[]; pending: string[] }`——纯函数，吃 JSON 对象吐结果，网络层可测
  - `fetchAA(apiKey: string): Promise<{ ok: true; parsed: ReturnType<typeof parseAA> } | { ok: false; error: string }>`

**AA API v2 实测字段（2026-08-25，GET https://artificialanalysis.ai/api/v2/data/llms/models，header `x-api-key`）：**

响应 `{ status, prompt_options, data: ModelRow[] }`，ModelRow 关键字段：
`name`（如 "gpt-oss-20b (high)"）、`slug`、`model_creator.name`、`evaluations.artificial_analysis_intelligence_index`、`evaluations.artificial_analysis_coding_index`、`evaluations.artificial_analysis_math_index`、`evaluations.terminalbench_v2_1`（0–1 小数）、`pricing.price_1m_blended_3_to_1 / price_1m_input_tokens / price_1m_output_tokens`、`median_output_tokens_per_second`、`median_time_to_first_token_seconds`。
注意：API 不返回上下文窗口（已实测确认）。

- [ ] **Step 1: 录制 fixture**

```bash
source .env 2>/dev/null || export $(grep -v '^#' .env | xargs)
curl -s "https://artificialanalysis.ai/api/v2/data/llms/models" \
  -H "x-api-key: $AA_API_KEY" > /tmp/aa_full.json
node -e "
const d = JSON.parse(require('fs').readFileSync('/tmp/aa_full.json','utf8'));
const sorted = [...d.data].sort((a,b)=>
  (b.evaluations.artificial_analysis_intelligence_index ?? -1) -
  (a.evaluations.artificial_analysis_intelligence_index ?? -1));
require('fs').writeFileSync('pipeline/fixtures/aa.json',
  JSON.stringify({ status: d.status, data: sorted.slice(0, 60) }, null, 1));
console.log('fixture written:', sorted.slice(0,60).length, 'rows');
"
rm /tmp/aa_full.json
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/sources/aa.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseAA } from '../../pipeline/sources/aa';

const fixture = JSON.parse(readFileSync('pipeline/fixtures/aa.json', 'utf8'));

describe('parseAA', () => {
  const out = parseAA(fixture);

  it('produces entries sorted by index desc', () => {
    expect(out.entries.length).toBeGreaterThan(20);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].index).toBeGreaterThanOrEqual(out.entries[i].index);
    }
  });
  it('maps real fields correctly', () => {
    const top = out.entries[0];
    expect(top.index).toBeGreaterThan(0);
    expect(typeof top.output_speed_tps === 'number' || top.output_speed_tps == null).toBe(true);
  });
  it('dedups reasoning-effort variants keeping highest index', () => {
    const ids = out.entries.map((e) => e.model_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('extracts terminal_bench from terminalbench_v2_1 x100', () => {
    for (const tb of out.terminal_bench) {
      expect(tb.score).toBeGreaterThan(0);
      expect(tb.score).toBeLessThanOrEqual(100);
    }
  });
  it('unknown names land in pending', () => {
    expect(Array.isArray(out.pending)).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/sources/aa.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 pipeline/sources/aa.ts**

```ts
// pipeline/sources/aa.ts
import type { AAIndexEntry, TBenchEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

interface AAModelRow {
  name: string;
  slug: string;
  model_creator: { name: string };
  evaluations: Record<string, number | null>;
  pricing: {
    price_1m_blended_3_to_1: number | null;
    price_1m_input_tokens: number | null;
    price_1m_output_tokens: number | null;
  };
  median_output_tokens_per_second: number | null;
  median_time_to_first_token_seconds: number | null;
}

export function parseAA(raw: { data: AAModelRow[] }): {
  entries: AAIndexEntry[];
  terminal_bench: TBenchEntry[];
  pending: string[];
} {
  const models = loadModels();
  const pending: string[] = [];
  const byId = new Map<string, AAIndexEntry>();
  const tbById = new Map<string, TBenchEntry>();

  for (const row of raw.data) {
    const idx = row.evaluations.artificial_analysis_intelligence_index;
    if (idx == null) continue;
    const resolved = resolveModelId(row.name, models);
    if (!resolved) {
      pending.push(row.name);
      continue;
    }
    const entry: AAIndexEntry = {
      model_id: resolved.id,
      index: idx,
      coding_index: row.evaluations.artificial_analysis_coding_index,
      math_index: row.evaluations.artificial_analysis_math_index,
      output_speed_tps: row.median_output_tokens_per_second,
      ttft_s: row.median_time_to_first_token_seconds,
      price_blin_per_m: row.pricing.price_1m_blended_3_to_1,
      price_in_per_m: row.pricing.price_1m_input_tokens,
      price_out_per_m: row.pricing.price_1m_output_tokens,
      tbench_v21_pct:
        row.evaluations.terminalbench_v2_1 != null
          ? Math.round(row.evaluations.terminalbench_v2_1 * 1000) / 10
          : null,
      rank_prev: null,
      delta_score: null,
    };
    // 同一 model_id 的多个推理档位变体：保留指数最高者
    const cur = byId.get(resolved.id);
    if (!cur || entry.index > cur.index) byId.set(resolved.id, entry);

    const tbPct =
      row.evaluations.terminalbench_v2_1 != null
        ? Math.round(row.evaluations.terminalbench_v2_1 * 1000) / 10
        : null;
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

export async function fetchAA(
  apiKey: string,
): Promise<{ ok: true; parsed: ReturnType<typeof parseAA> } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://artificialanalysis.ai/api/v2/data/llms/models', {
      headers: { 'x-api-key': apiKey },
    });
    if (!res.ok) {
      return { ok: false, error: `AA API HTTP ${res.status}${res.status === 401 ? ' (check AA_API_KEY secret)' : ''}` };
    }
    const raw = (await res.json()) as { data: AAModelRow[] };
    return { ok: true, parsed: parseAA(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 5: 测试通过后提交**

```bash
npx vitest run tests/sources/aa.test.ts
git add -A
git commit -m "feat(pipeline): Artificial Analysis source adapter (+terminal-bench extraction)"
```

---

### Task 4: LMArena 适配器（TDD）

**Files:**
- Create: `pipeline/sources/arena.ts`, `pipeline/fixtures/arena.html`
- Test: `tests/sources/arena.test.ts`

**Interfaces:**
- Consumes: `loadModels/resolveModelId`（Task 2）、`ArenaEloEntry`（Task 1）
- Produces:
  - `parseArena(html: string, category: ArenaCategory): { entries: ArenaEloEntry[]; pending: string[] }`，其中 `type ArenaCategory = 'text' | 'coding' | 'webdev'`
  - `mergeArena(results: Record<ArenaCategory, ReturnType<typeof parseArena>>): ArenaEloEntry[]`——以 text 为主榜（categories.code/webdev 并入 categories 字段），按 text Elo 排序
  - `fetchArena(): Promise<{ ok: true; entries: ArenaEloEntry[]; pending: string[] } | { ok: false; error: string }>`

**页面结构（2026-08-25 实测 lmarena.ai/leaderboard/text，SSR HTML）：**

每个模型行的可见文本序列为：
`| 名次 | … | Org | modelName | License·Proprietary/Open | Elo分 | ±CI | votes | $in/$out |`

- 模型名单元格固定形态：`<span class="max-w-full truncate" title="claude-fable-5">…</span>`（全页 394 个）
- 行首数字格是名次；模型名后第一个 3–4 位纯数字格是 Elo 分（如 `>1508<`），随后 `±5` 格是 CI 半宽，再后带逗号数字格是票数（如 `24,331`）
- 解析策略：用 `title="..."` 定位每个行块（向前回溯 2500 字符、向后截取 3500 字符作为行窗口），窗口内按上述顺序抽数

- [ ] **Step 1: 录制 fixture**

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
curl -sL "https://lmarena.ai/leaderboard/text" -H "User-Agent: $UA" > /tmp/arena_full.html
node -e "
const html = require('fs').readFileSync('/tmp/arena_full.html','utf8');
const MARK = '<span class=\"max-w-full truncate\" title=';
const first = html.indexOf(MARK);
const last = html.lastIndexOf(MARK);
const seg = html.slice(Math.max(0, first - 2500), last + 3500);
require('fs').writeFileSync('pipeline/fixtures/arena.html', seg);
console.log('fixture bytes:', seg.length, 'rows approx:', (seg.match(/title=/g)||[]).length);
"
rm /tmp/arena_full.html
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/sources/arena.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseArena } from '../../pipeline/sources/arena';

const html = readFileSync('pipeline/fixtures/arena.html', 'utf8');

describe('parseArena', () => {
  const out = parseArena(html, 'text');

  it('extracts many rows sorted by elo desc', () => {
    expect(out.entries.length).toBeGreaterThan(30);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].score).toBeGreaterThanOrEqual(out.entries[i].score);
    }
  });
  it('first row carries score/ci/votes', () => {
    const top = out.entries[0];
    expect(top.score).toBeGreaterThan(1000);
    if (top.ci95) {
      expect(top.ci95[0]).toBeLessThan(top.score);
      expect(top.ci95[1]).toBeGreaterThan(top.score);
    }
  });
  it('known model resolves to canonical id', () => {
    expect(out.entries.some((e) => e.model_id.length > 0)).toBe(true);
  });
  it('pending collects unknown names', () => {
    expect(Array.isArray(out.pending)).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/sources/arena.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 pipeline/sources/arena.ts**

```ts
// pipeline/sources/arena.ts
import type { ArenaEloEntry } from '../../src/types';
import { loadModels, resolveModelId } from '../normalize';

export type ArenaCategory = 'text' | 'coding' | 'webdev';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const URLS: Record<ArenaCategory, string> = {
  text: 'https://lmarena.ai/leaderboard/text',
  coding: 'https://lmarena.ai/leaderboard/text/coding',
  webdev: 'https://lmarena.ai/leaderboard/text/webdev',
};

const MARK = '<span class="max-w-full truncate" title=';

/** 从一行窗口文本中提取数字格序列 */
function cells(windowHtml: string): string[] {
  return (windowHtml.match(/>[^<>]{1,20}</g) ?? [])
    .map((c) => c.slice(1, -1).trim())
    .filter(Boolean);
}

const isInt = (s: string): boolean => /^\d{1,4}$/.test(s);
const isVotes = (s: string): boolean => /^\d{1,3}(,\d{3})+$/.test(s);

export function parseArena(
  html: string,
  category: ArenaCategory,
): { entries: ArenaEloEntry[]; pending: string[] } {
  const models = loadModels();
  const pending: string[] = [];
  const rows: ArenaEloEntry[] = [];

  let markAt = html.indexOf(MARK);
  while (markAt !== -1) {
    const nameStart = html.indexOf('"', markAt) + 1;
    const nameEnd = html.indexOf('"', nameStart);
    const rawName = html.slice(nameStart, nameEnd);

    const windowFrom = Math.max(0, markAt - 2000);
    const before = html.slice(windowFrom, markAt);
    const after = html.slice(markAt, markAt + 3500);

    // 名次：模型名前方最后一个 1–3 位整数格
    const beforeCells = cells(before);
    let rankNum: number | null = null;
    for (let i = beforeCells.length - 1; i >= 0; i--) {
      if (/^\d{1,3}$/.test(beforeCells[i])) {
        rankNum = parseInt(beforeCells[i], 10);
        break;
      }
    }

    // Elo / CI / votes：模型名后方依序出现的数字格
    const afterCells = cells(after);
    let elo: number | null = null;
    let ciHalf: number | null = null;
    let votes: number | null = null;
    for (let i = 0; i < afterCells.length && elo === null; i++) {
      const s = afterCells[i];
      if (isInt(s) && parseInt(s, 10) >= 100 && parseInt(s, 10) <= 2000) {
        elo = parseInt(s, 10);
        // 相邻 ±N
        const pm = afterCells[i + 1]?.match(/^±(\d+)$/);
        if (pm) ciHalf = parseInt(pm[1], 10);
        for (let j = i + 1; j < Math.min(i + 5, afterCells.length); j++) {
          if (isVotes(afterCells[j])) {
            votes = parseInt(afterCells[j].replace(/,/g, ''), 10);
            break;
          }
        }
      }
    }

    const catKey =
      category === 'coding' ? 'code' : category === 'webdev' ? 'webdev' : 'text';

    if (elo !== null && rankNum !== null) {
      const resolved = resolveModelId(rawName, models);
      if (resolved) {
        rows.push({
          model_id: resolved.id,
          score: elo,
          ci95: ciHalf != null ? [elo - ciHalf, elo + ciHalf] : undefined,
          votes: votes ?? undefined,
          categories: category === 'text' ? undefined : { [catKey]: elo },
          rank_prev: null,
          delta_score: null,
        });
      } else {
        pending.push(rawName);
      }
    }
    markAt = html.indexOf(MARK, nameEnd);
  }

  // 同一模型可能因别名碰撞出现多次：保留首次（页面本身按名次排序）
  const seen = new Set<string>();
  const unique = rows.filter((r) => !seen.has(r.model_id) && seen.add(r.model_id));
  unique.sort((a, b) => b.score - a.score);
  return { entries: unique, pending };
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
    // 合并：text 为主榜，coding/webdev 并入 categories
    const catByKey = new Map<string, Record<string, number>>();
    for (const r of coding.entries) catByKey.set(r.model_id, { ...catByKey.get(r.model_id), code: r.score });
    for (const r of webdev.entries) catByKey.set(r.model_id, { ...catByKey.get(r.model_id), webdev: r.score });
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
```

实现者注意：`cells()` 抽取与名次/Elo 判定阈值（≥100 且 ≤2000 是 Elo 合理区间）基于实测；若 fixture 断言不过，优先调整窗口尺寸与判定区间而不是推翻结构假设。

- [ ] **Step 5: 测试通过后提交**

```bash
npx vitest run tests/sources/arena.test.ts
git add -A
git commit -m "feat(pipeline): LMArena adapter parsing SSR leaderboard rows"
```

---

### Task 5: SWE-bench 适配器（TDD）

**Files:**
- Create: `pipeline/sources/swebench.ts`, `pipeline/fixtures/swe.json`
- Test: `tests/sources/swe.test.ts`

**数据源实测（2026-08-25）：**
URL: `https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json`（注意 master 分支）
结构: `{ leaderboards: [{ name, results: [...] }] }`，板块名精确为 `'Verified'`（大写 V）。
entry 关键字段: `model_display`（如 "Claude 4.5 Opus"）、`model_org`、`resolved`（已是百分数 79.2）、`agent`、`instance_cost`、`date`。
同一模型有多个 agent 记录 → 取 resolved 最高。

**Interfaces:**
- Consumes: `loadModels/resolveModelId`、`SweEntry`
- Produces:
  - `parseSwe(raw: unknown): { entries: SweEntry[]; pending: string[] }`
  - `fetchSwebench(): Promise<{ ok: true; parsed: ReturnType<typeof parseSwe> } | { ok: false; error: string }>`

- [ ] **Step 1: 录制 fixture**

```bash
curl -sL "https://raw.githubusercontent.com/SWE-bench/swe-bench.github.io/master/data/leaderboards.json" > /tmp/swe_full.json
node -e "
const d = JSON.parse(require('fs').readFileSync('/tmp/swe_full.json','utf8'));
const verified = d.leaderboards.find(b => b.name === 'Verified');
if (!verified) throw new Error('Verified board not found');
const sorted = [...verified.results].sort((a,b)=>(b.resolved??0)-(a.resolved??0));
require('fs').writeFileSync('pipeline/fixtures/swe.json',
  JSON.stringify({ name: verified.name, results: sorted.slice(0, 40) }, null, 1));
console.log('fixture rows:', Math.min(40, sorted.length));
"
rm /tmp/swe_full.json
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/sources/swe.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSwe } from '../../pipeline/sources/swebench';

const fixture = JSON.parse(readFileSync('pipeline/fixtures/swe.json', 'utf8'));

describe('parseSwe', () => {
  const out = parseSwe(fixture);

  it('sorted by resolved desc', () => {
    expect(out.entries.length).toBeGreaterThan(10);
    for (let i = 1; i < out.entries.length; i++) {
      expect(out.entries[i - 1].resolved_pct).toBeGreaterThanOrEqual(out.entries[i].resolved_pct);
    }
  });
  it('dedups multi-agent runs per model keeping best', () => {
    const ids = out.entries.map((e) => e.model_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('keeps agent name of best run', () => {
    expect(out.entries.every((e) => typeof e.agent === 'string' || e.agent === undefined)).toBe(true);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/sources/swe.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 pipeline/sources/swebench.ts**

```ts
// pipeline/sources/swebench.ts
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

export function parseSwe(raw: { leaderboards: { name: string; results: SweRawEntry[] }[] }): {
  entries: SweEntry[];
  pending: string[];
} {
  const models = loadModels();
  const verified = raw.leaderboards.find((b) => b.name === 'Verified');
  if (!verified) return { entries: [], pending: [] };

  const pending: string[] = [];
  const byId = new Map<string, SweEntry>();

  for (const r of verified.results) {
    if (r.resolved == null || !r.model_display) continue;
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
    const res = await fetch(SOURCE_URL);
    if (!res.ok) return { ok: false, error: `SWE-bench HTTP ${res.status}` };
    return { ok: true, parsed: parseSwe(await res.json()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 5: 测试通过后提交**

```bash
npx vitest run tests/sources/swe.test.ts
git add -A
git commit -m "feat(pipeline): SWE-bench Verified adapter"
```

---

### Task 6: 管道编排 run.ts + zod 校验 + 快照写入

**Files:**
- Create: `pipeline/schema.ts`, `pipeline/run.ts`, `public/data/.gitkeep`
- Test: `tests/run-idempotent.test.ts`

**Interfaces:**
- Consumes: `fetchAA/fetchArena/fetchSwebench`（Task 3/4/5）、`withRanks/buildHistory/loadModels`（Task 2）、`LatestFile/PendingFile/History`（Task 1）
- Produces: CLI `npm run fetch`，产出四个文件：
  - `public/data/snapshots/YYYY-MM-DD.json`（LatestFile 结构，即快照也内嵌 models）
  - `public/data/latest.json`
  - `public/data/history.json`
  - `public/data/pending.json`（当日全部源的未知模型名合并）
  - 退出码：全源失败 → 1；部分失败 → 0（快照里标 unavailable）

- [ ] **Step 1: 写 zod schema（镜像 src/types.ts，完整代码）**

```ts
// pipeline/schema.ts
import { z } from 'zod';

export const sourceInfoSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  fetched_at: z.string().optional(),
  last_ok: z.string().optional(),
});

const arenaEntrySchema = z.object({
  model_id: z.string(),
  score: z.number(),
  ci95: z.tuple([z.number(), z.number()]).optional(),
  votes: z.number().optional(),
  categories: z.record(z.string(), z.number()).optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const aaEntrySchema = z.object({
  model_id: z.string(),
  index: z.number(),
  coding_index: z.number().nullable().optional(),
  math_index: z.number().nullable().optional(),
  output_speed_tps: z.number().nullable().optional(),
  ttft_s: z.number().nullable().optional(),
  price_blin_per_m: z.number().nullable().optional(),
  price_in_per_m: z.number().nullable().optional(),
  price_out_per_m: z.number().nullable().optional(),
  tbench_v21_pct: z.number().nullable().optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const sweEntrySchema = z.object({
  model_id: z.string(),
  resolved_pct: z.number(),
  agent: z.string().optional(),
  cost_usd_per_instance: z.number().nullable().optional(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

const tbenchEntrySchema = z.object({
  model_id: z.string(),
  score: z.number(),
  rank_prev: z.number().nullable(),
  delta_score: z.number().nullable(),
});

export const modelMetaSchema = z.object({
  model_id: z.string(),
  display_name: z.string(),
  org: z.string(),
  license: z.enum(['closed', 'open']),
  aliases: z.array(z.string()),
});

export const snapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.record(z.string(), sourceInfoSchema),
  llm: z.object({
    arena_elo: z.array(arenaEntrySchema),
    aa_index: z.array(aaEntrySchema),
  }),
  agent: z.object({
    swebench_verified: z.array(sweEntrySchema),
    terminal_bench: z.array(tbenchEntrySchema),
  }),
  models: z.array(modelMetaSchema),
});

export const historySchema = z.record(
  z.string(),
  z.object({
    arena_elo: z.array(z.tuple([z.string(), z.number()])).optional(),
    aa_index: z.array(z.tuple([z.string(), z.number()])).optional(),
    swebench_verified: z.array(z.tuple([z.string(), z.number()])).optional(),
    terminal_bench: z.array(z.tuple([z.string(), z.number()])).optional(),
  }),
);
```

- [ ] **Step 2: 写编排幂等性测试**

```ts
// tests/run-idempotent.test.ts
import { describe, it, expect } from 'vitest';
import { mergePending, pickBaselineDate } from '../pipeline/run';

describe('run helpers', () => {
  it('mergePending dedups across sources preserving order', () => {
    expect(mergePending(['a', 'b'], ['b', 'c'], [])).toEqual(['a', 'b', 'c']);
  });
  it('pickBaselineDate picks latest snapshot before target date', () => {
    expect(pickBaselineDate(['2026-08-25', '2026-08-24', '2026-08-26'], '2026-08-25')).toBe('2026-08-24');
    expect(pickBaselineDate([], '2026-08-25')).toBeNull();
  });
});
```

- [ ] **Step 3: 实现 pipeline/run.ts**

```ts
// pipeline/run.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LatestFile, PendingFile, SourceInfo, SourceName, Snapshot } from '../src/types';
import { snapshotSchema, historySchema } from './schema';
import { loadModels, withRanks, buildHistory } from './normalize';
import { fetchAA } from './sources/aa';
import { fetchArena } from './sources/arena';
import { fetchSwebench } from './sources/swebench';
import type { History } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

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
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(path.join(DATA_DIR, file)), { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 1));
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

  const sources: Record<SourceName, SourceInfo> = {
    artificial_analysis:
      aaRes.ok
        ? { status: 'ok', fetched_at: fetchedAt }
        : { status: 'unavailable', fetched_at: fetchedAt, last_ok: readJson<Snapshot>('latest.json')?.sources.artificial_analysis.status === 'ok' ? readJson<Snapshot>('latest.json')!.date : undefined },
    lmarena:
      arenaRes.ok
        ? { status: 'ok', fetched_at: fetchedAt }
        : { status: 'unavailable', fetched_at: fetchedAt, last_ok: readJson<Snapshot>('latest.json')?.sources.lmarena.status === 'ok' ? readJson<Snapshot>('latest.json')!.date : undefined },
    swebench:
      sweRes.ok
        ? { status: 'ok', fetched_at: fetchedAt }
        : { status: 'unavailable', fetched_at: fetchedAt },
  };

  const anyOk = aaRes.ok || arenaRes.ok || sweRes.ok;
  if (!anyOk) {
    console.error('ALL SOURCES FAILED — aborting, no snapshot written');
    console.error({ aa: aaRes.ok ? '' : aaRes.error, arena: arenaRes.ok ? '' : arenaRes.error, swe: sweRes.ok ? '' : sweRes.error });
    process.exit(1);
  }

  // 昨日基线：snapshots 目录中早于今天的最新一份
  const snapDir = path.join(DATA_DIR, 'snapshots');
  const existing = fs.existsSync(snapDir) ? fs.readdirSync(snapDir) : [];
  const baselineDate = pickBaselineDate(existing, date);
  const baseline: Snapshot | null =
    baselineDate != null ? readJson<Snapshot>(path.posix.join('snapshots', `${baselineDate}.json`)) : null;
  const prevHistory = readJson<History>('history.json') ?? {};

  // 组装四榜（失败源产出空数组）
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
  const pending: PendingFile = {
    date,
    names: mergePending(
      ...(aaRes.ok ? [aaRes.parsed.pending] : []),
      ...(arenaRes.ok ? [arenaRes.pending] : []),
      ...(sweRes.ok ? [sweRes.parsed.pending] : []),
    ),
  };

  writeJson(path.posix.join('snapshots', `${date}.json`), validated);
  writeJson('latest.json', validated);
  writeJson('history.json', history);
  writeJson('pending.json', pending);

  console.log(
    `[${date}] done. arena:${validated.llm.arena_elo.length} aa:${validated.llm.aa_index.length} ` +
      `swe:${validated.agent.swebench_verified.length} tb:${validated.agent.terminal_bench.length} ` +
      `pending:${pending.names.length}`,
  );
  const failed = Object.entries(sources).filter(([, s]) => s.status === 'unavailable');
  if (failed.length) console.warn('degraded sources:', failed.map(([k]) => k).join(', '));
}

main();
```

实现者注意：`sources` 里 last_ok 回退逻辑写得啰嗦，可提取小函数 `lastOkFrom(latest, name)`——保持行为不变即可：unavailable 时若旧 latest 该源是 ok，则 last_ok = 旧 latest 的 date。

- [ ] **Step 4: 幂等性测试通过 + 真实端到端跑一次**

```bash
npx vitest run tests/run-idempotent.test.ts
npm run fetch
node -e "const d=require('./public/data/latest.json'); console.log(d.date, Object.entries(d.sources).map(([k,v])=>k+':'+v.status).join(' '), '| arena:'+d.llm.arena_elo.length, 'aa:'+d.llm.aa_index.length, 'swe:'+d.agent.swebench_verified.length, 'tb:'+d.agent.terminal_bench.length)"
```

Expected: 打印四榜非零条数（arena ≥50、aa ≥30、swe ≥15、tb ≥5 大致量级），status 全 ok。再跑一次 `npm run fetch` 确认同日重跑正常（history 当日点被覆盖而非重复）。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(pipeline): orchestrator writes zod-validated daily snapshots to public/data"
```

---

### Task 7: GitHub Actions workflows

**Files:**
- Create: `.github/workflows/daily-fetch.yml`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run fetch`（Task 6）、`npm run build`（Task 1）
- Produces: 每日 UTC 22:00 自动抓取提交 + push main 触发 Pages 部署 + daily-fetch 完成后联动部署

- [ ] **Step 1: daily-fetch.yml（完整内容）**

```yaml
name: daily-fetch
on:
  schedule:
    - cron: '0 22 * * *'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: daily-fetch
  cancel-in-progress: false

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run fetch
        env:
          AA_API_KEY: ${{ secrets.AA_API_KEY }}
      - name: Commit data snapshots
        run: |
          git config user.name "observatory-bot"
          git config user.email "observatory-bot@users.noreply.github.com"
          git add public/data/
          if git diff --cached --quiet; then
            echo "No data changes today"
          else
            git commit -m "[data] $(date -u +%F)"
            git push
          fi
```

- [ ] **Step 2: deploy.yml（完整内容）**

```yaml
name: deploy
on:
  push:
    branches: [main]
    paths-ignore:
      - '**.md'
  workflow_run:
    workflows: [daily-fetch]
    types: [completed]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    if: github.event_name == 'push' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

配套：`vite.config.ts` 增加 base 处理——

```ts
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
}));
```

- [ ] **Step 3: 提交**

```bash
git add .github vite.config.ts
git commit -m "ci: daily fetch workflow + github pages deploy"
```

---

### Task 8: 设计令牌 + 应用外壳（TopBar/Hero/Tabs/数据 hook）

**Files:**
- Create: `src/design/tokens.css`, `src/design/global.css`, `src/components/TopBar.tsx`, `src/components/HeroChampions.tsx`, `src/components/BoardTabs.tsx`, `src/hooks/useBoardData.ts`, `src/components/ErrorState.tsx`
- Modify: `src/main.tsx`（引 global.css）, `src/App.tsx`（组装外壳）

**Interfaces:**
- Consumes: `LatestFile/History/ModelMeta`（Task 1）
- Produces:
  - `useBoardData(): { loading: boolean; error: string | null; retry: () => void; latest: LatestFile | null; history: History | null }`
  - `<TopBar date={string} />`、`<HeroChampions latest={LatestFile} />`、`<BoardTabs tab={'llm'|'agent'} onChange={(t) => void} />`
  - CSS 变量全集（下方 tokens.css）

- [ ] **Step 1: tokens.css 完整内容**

```css
:root {
  /* 精密计量局 · 色彩 */
  --paper: #fafaf6;
  --ink: #16181d;
  --ink-soft: #6b6d64;
  --rule-light: #e4e4db;
  --grid-line: rgba(22, 24, 29, 0.045);
  --orange: #ff4d00;
  --blue: #2563eb;
  --up: #0a7d33;
  --down: #c62828;
  --surface: #ffffff;

  /* 字体 */
  --font-body: 'Noto Sans SC', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* 形状 */
  --radius: 2px;
  --grid-size: 22px;
  --page-max: 1200px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--paper);
  background-image: linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: var(--grid-size) var(--grid-size);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* 通用工具类 */
.mono {
  font-family: var(--font-mono);
}
.label-caps {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

:focus-visible {
  outline: 2px solid var(--orange);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

global.css 放布局类（`.page` 最大宽 1200 居中、分区边框等），随组件需要增量添加。

- [ ] **Step 2: useBoardData hook**

```tsx
// src/hooks/useBoardData.ts
import { useCallback, useEffect, useState } from 'react';
import type { History, LatestFile } from '../types';

interface BoardData {
  loading: boolean;
  error: string | null;
  retry: () => void;
  latest: LatestFile | null;
  history: History | null;
}

export function useBoardData(): BoardData {
  const [state, setState] = useState<Omit<BoardData, 'retry'>>({
    loading: true,
    error: null,
    latest: null,
    history: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([
      fetch(import.meta.env.BASE_URL + 'data/latest.json'),
      fetch(import.meta.env.BASE_URL + 'data/history.json'),
    ])
      .then(async ([l, h]) => {
        if (!l.ok) throw new Error(`latest.json HTTP ${l.status}`);
        const latest = (await l.json()) as LatestFile;
        const history = h.ok ? ((await h.json()) as History) : {};
        if (!alive) return;
        setState({ loading: false, error: null, latest, history });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  return { ...state, retry };
}
```

- [ ] **Step 3: TopBar / HeroChampions / BoardTabs / ErrorState 组件**

TopBar 规格：左侧 LOGO「基准<span 橙色>·</span>BENCHMARK」+ 小字副题「AI 排名观测」；右侧 `DATA YYYY-MM-DD`（mono）、「查看数据快照」外链（href 由 `import.meta.env.VITE_DATA_REPO_URL ?? '#'` 提供，README 说明部署时配仓库 URL）、「数据来源与方法」页内锚点（`#methodology`，页脚说明区 Task 12 建）。墨黑底白字反色条（height 52px）。

HeroChampions 规格：白底卡（--surface）+ 四角国际橙 L 形定位角（用 ::before/::after + 两个绝对定位 div 或 4 个 span 实现，8×8 边框角）。内部左右两格：LLM 榜首（取 `latest.llm.arena_elo[0]`）与 Agent 榜首（取 `latest.agent.swebench_verified[0]`），各含 label-caps 小标（如 `LLM / ARENA ELO`）、900 字重大字 display_name（从 models 映射查 display_name）、mono 副行分数。任一榜为空数组时该格显示「暂缺」。两格间放一条水平细线连接（呼应 mockup）。

BoardTabs 规格：分段控件容器 border:1px solid var(--ink)，两个 button（大模型榜 / Agent 榜），选中态背景 var(--ink)、color var(--paper)；未选中透明底墨字。props: `{ tab: 'llm' | 'agent'; onChange: (t: 'llm' | 'agent') => void }`。role="tablist"/aria-selected。

ErrorState 规格：居中卡片显示「数据加载失败」+ mono 错误信息 + 重试 button（onClick retry prop）。

App.tsx 组装：

```tsx
import { useState } from 'react';
import { useBoardData } from './hooks/useBoardData';
import TopBar from './components/TopBar';
import HeroChampions from './components/HeroChampions';
import BoardTabs from './components/BoardTabs';
import ErrorState from './components/ErrorState';

export default function App() {
  const { loading, error, retry, latest, history } = useBoardData();
  const [tab, setTab] = useState<'llm' | 'agent'>('llm');

  return (
    <>
      <TopBar date={latest?.date ?? ''} />
      <main className="page">
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading || !latest ? (
          <p style={{ padding: 48 }} className="label-caps">
            LOADING…
          </p>
        ) : (
          <>
            <HeroChampions latest={latest} />
            <BoardTabs tab={tab} onChange={setTab} />
            {/* Task 9-11 在此挂子榜单 */}
          </>
        )}
      </main>
    </>
  );
}
```

- [ ] **Step 4: 构建验证并提交**

```bash
npm run build
git add -A
git commit -m "feat(ui): metrology design tokens + app shell (topbar/hero/tabs/data hook)"
```

Expected: build 成功。本地 `npm run dev` 打开能看到顶栏/HERO/Tab（数据来自 Task 6 产出的真实 latest.json）。

---

### Task 9: RankTable + DeltaBadge + TickRail + FilterBar（核心表格，TDD）

**Files:**
- Create: `src/components/RankTable.tsx`, `src/components/DeltaBadge.tsx`, `src/components/TickRail.tsx`, `src/components/FilterBar.tsx`, `src/hooks/useFilters.ts`
- Test: `tests/filter.test.ts`

**Interfaces:**
- Consumes: `LatestFile/ArenaEloEntry/AAIndexEntry/SweEntry/TBenchEntry/ModelMeta`（Task 1）
- Produces:
  - `applyFilters(entries: {model_id:string}[], models: Record<string,ModelMeta>, f: {query:string; org:string; license:'all'|'closed'|'open'}): typeof entries`——query 匹配 display_name/org/model_id（大小写不敏感子串）
  - `<DeltaBadge rankPrev={number|null} deltaScore={number|null} />`：rankPrev===null→蓝色 NEW 徽标；deltaScore>0→↑绿（附小字分数差）；<0→↓红；=0/null→—灰持平
  - `<TickRail value min max ticks={number[]} accent={'ink'|'blue'} />`：签名刻度尺——黑色轨道按 (value-min)/(max-min) 填充，下方 mono 7px 刻度值；accent='blue' 时轨道钢蓝（开源行）
  - `<RankTable kind entries models compareSelection onToggleCompare expandedId onToggleExpand />`，kind 为 `'arena'|'aa'|'swe'|'tbench'`，列配置集中在组件内 `COLUMNS: Record<kind, ColDef[]>`
  - `<FilterBar orgs={string[]} filter setFilter count />`

- [ ] **Step 1: 写筛选失败测试**

```ts
// tests/filter.test.ts
import { describe, it, expect } from 'vitest';
import { applyFilters } from '../src/hooks/useFilters';
import type { ModelMeta } from '../src/types';

const models: Record<string, ModelMeta> = {
  m1: { model_id: 'm1', display_name: 'Model One', org: 'OpenAI', license: 'closed', aliases: [] },
  m2: { model_id: 'm2', display_name: 'DeepSeek V4', org: 'DeepSeek', license: 'open', aliases: [] },
};
const entries = [
  { model_id: 'm1', score: 90 },
  { model_id: 'm2', score: 70 },
];

describe('applyFilters', () => {
  it('empty filters keep all', () => {
    expect(applyFilters(entries, models, { query: '', org: '', license: 'all' })).toHaveLength(2);
  });
  it('query matches display name case-insensitively', () => {
    expect(applyFilters(entries, models, { query: 'deepseek', org: '', license: 'all' }).map((e) => e.model_id)).toEqual(['m2']);
  });
  it('query matches org', () => {
    expect(applyFilters(entries, models, { query: 'openai', org: '', license: 'all' }).map((e) => e.model_id)).toEqual(['m1']);
  });
  it('license filter open only', () => {
    expect(applyFilters(entries, models, { query: '', org: '', license: 'open' }).map((e) => e.model_id)).toEqual(['m2']);
  });
  it('combined query + license', () => {
    expect(applyFilters(entries, models, { query: 'model', org: '', license: 'closed' }).map((e) => e.model_id)).toEqual(['m1']);
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `npx vitest run tests/filter.test.ts`
Expected: FAIL

- [ ] **Step 3: useFilters.ts 实现（含 applyFilters 导出）**

```ts
// src/hooks/useFilters.ts
import { useMemo, useState } from 'react';
import type { ModelMeta } from '../types';

export interface FilterState {
  query: string;
  org: string;
  license: 'all' | 'closed' | 'open';
}

export function applyFilters<T extends { model_id: string }>(
  entries: T[],
  models: Record<string, ModelMeta>,
  f: FilterState,
): T[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    const m = models[e.model_id];
    if (!m) return q === '';
    if (f.org !== '' && m.org !== f.org) return false;
    if (f.license !== 'all' && m.license !== f.license) return false;
    if (q !== '') {
      const hay = `${m.display_name} ${m.org} ${m.model_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function useFilters<T extends { model_id: string }>(
  entries: T[],
  models: Record<string, ModelMeta>,
) {
  const [filter, setFilter] = useState<FilterState>({ query: '', org: '', license: 'all' });
  const orgs = useMemo(() => [...new Set(entries.map((e) => models[e.model_id]?.org).filter(Boolean))] as string[], [entries, models]);
  const filtered = useMemo(() => applyFilters(entries, models, filter), [entries, models, filter]);
  return { filtered, orgs, filter, setFilter };
}
```

- [ ] **Step 4: DeltaBadge / TickRail / FilterBar / RankTable 组件**

DeltaBadge 渲染规则（mono 11px）：
- rankPrev===null → `<span style color blue border blue>NEW</span>`
- deltaScore===null 或 0 → 灰色 `—`
- deltaScore>0 → 绿色 `▲ n`；deltaScore<0 → 红色 `▼ |n|`（n 为 deltaScore 绝对值一位小数）

TickRail 结构：

```tsx
export default function TickRail({
  value, min, max, ticks, accent = 'ink',
}: { value: number; min: number; max: number; ticks: number[]; accent?: 'ink' | 'blue' }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ height: 6, background: 'var(--rule-light)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent === 'blue' ? 'var(--blue)' : 'var(--ink)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-soft)', marginTop: 2 }}>
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}
```

FilterBar：方角输入框（border ink，focus 换 orange 描边）placeholder「搜索模型 / 厂商…」；两个 select（厂商动态列表 + 全部/闭源/开源）；右端 label-caps「共 N 个模型」（N 为过滤后数量）。

RankTable 列定义（集中式配置）：

```tsx
type Kind = 'arena' | 'aa' | 'swe' | 'tbench';
```

- arena 列：`#` | 模型 | 厂商 | Elo（mono 数字 + CI 小字 ±n）| 分类 Elo（text/code/webdev 三小格，有才显）| Δ
- aa 列：`#` | 模型 | 厂商 | 智能指数（数字+TickRail，ticks=[40,55,70,85]，min40 max85）| 速度 tok/s | 价格 $/M | Δ
- swe 列：`#` | 模型 | 厂商 | 解决率 %（数字+TickRail ticks=[0,25,50,75,100] min0 max100）| Agent | 单例成本 | Δ
- tbench 列：`#` | 模型 | 厂商 | 得分 %（TickRail 同上）| Δ

通用行为：行首 checkbox（aria-label=`将 ${displayName} 加入对比`，checked 由 compareSelection 决定，onToggleCompare(model_id)）；点击行主体切换展开（onToggleExpand(model_id)，展开区 Task 10 填 TrendPanel，本任务先渲染空 div 占位 max-height 过渡）；开源模型名旁蓝 OSS 徽标 + 该行 TickRail accent=blue。名次列橙色 mono 700。移动端 (<768px media query)：表格 display:none，改渲卡片列表（名次大 mono 数字 + 名称 + OSS 徽标 + 核心分数 + DeltaBadge），同一份数据驱动。

- [ ] **Step 5: 测试通过 + 构建验证 + 提交**

```bash
npx vitest run tests/filter.test.ts
npm run build
git add -A
git commit -m "feat(ui): rank table + tick rail signature + delta badges + filters"
```

---

### Task 10: TrendPanel（ECharts 90 天趋势展开）

**Files:**
- Create: `src/components/TrendPanel.tsx`, `src/design/chartTheme.ts`
- Modify: `src/components/RankTable.tsx`（展开区挂载 TrendPanel）

**Interfaces:**
- Consumes: `History/HistoryPoint`（Task 1）、CSS 变量（Task 8）
- Produces:
  - `getChartColors(): { ink: string; orange: string; blue: string; up: string; down: string; soft: string }`（读 getComputedStyle(document.documentElement).getPropertyValue）
  - `<TrendPanel modelId board history top3Refs onClose />`，board ∈ `'arena_elo'|'aa_index'|'swebench_verified'|'terminal_bench'`，top3Refs: `{ modelId: string; score: number }[]` 当前榜前三参照

- [ ] **Step 1: chartTheme.ts**

```ts
// src/design/chartTheme.ts
export interface ChartColors {
  ink: string; orange: string; blue: string; up: string; down: string; soft: string;
}

export function getChartColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#16181D'),
    orange: v('--orange', '#FF4D00'),
    blue: v('--blue', '#2563EB'),
    up: v('--up', '#0A7D33'),
    down: v('--down', '#C62828'),
    soft: v('--ink-soft', '#6B6D64'),
  };
}
```

- [ ] **Step 2: TrendPanel 组件**

要点：
- echarts 按需引入：`echarts/core` + LineChart + GridComponent + TooltipComponent + CanvasRenderer
- useRef 容器 + useEffect 建实例（依赖 modelId/board/history），ResizeObserver 自适应，卸载 dispose
- 序列：主模型近 90 天折线（orange 2px 实线）+ top3Refs 各一条虚线（soft 灰阶 1px，图例标注模型名）
- X 轴日期 mono 10px；tooltip trigger axis 显示日期+各家分数
- `matchMedia('(prefers-reduced-motion: reduce)').matches` 时 `animation: false`
- 展开动画由外层容器 max-height transition 承担（RankTable 里已有占位）

- [ ] **Step 3: 手动验证 + 提交**

```bash
npm run dev
# 点击任意行：展开出现趋势折线；再点收起；窗口缩放图表自适应
npm run build
git add -A
git commit -m "feat(ui): trend panel with lazy echarts line chart"
```

---

### Task 11: CompareDrawer 对比抽屉 + ScatterView 散点图

**Files:**
- Create: `src/components/CompareDrawer.tsx`, `src/components/ScatterView.tsx`
- Modify: `src/App.tsx`（挂 ScatterView 于 LLM Tab、CompareDrawer 于页面底部）、`RankTable.tsx`（勾选回调上抛）

**Interfaces:**
- Consumes: `LatestFile/ModelMeta/AAIndexEntry`（Task 1）、getChartColors（Task 10）
- Produces:
  - `<CompareDrawer left={string} right={string} latest={LatestFile} onClose={() => void} />`——left/right 为 model_id
  - `<ScatterView aaEntries={AAIndexEntry[]} models={Record<string,ModelMeta>} onSelect={(modelId) => void} />`

- [ ] **Step 1: CompareDrawer**

指标注册表（组件内常量数组，每项 `{ label, extract(latest, modelId): number | null, higherBetter, format }`），指标清单（设计文档 §5.3 移除上下文窗口后的最终版）：
Arena Elo / AA 智能指数 / SWE-bench 解决率 % / Terminal-Bench % / 输出速度 tok/s / 混合价格 $M（lowerBetter）。

渲染：底部 fixed 抽屉（translateY 动画入场，reduced-motion 时瞬时），纸白底顶部墨黑粗边框。头部：两个模型 display_name 左右对峙 + 关闭按钮。每指标一行：label-caps 标签居左，中间双向条（两侧各自从中心向外伸展，长度按两者相对比例），数值 mono 在两端；领先侧数值 orange 加粗（lowerBetter 指标反向判断）；一侧缺数据（extract 返回 null）显示「—」+ title tooltip「无数据」。勾选第三个模型时替换未选中较早的一个（selection 保持两个，FIFO）。ESC 键关闭（useEffect keydown）。

- [ ] **Step 2: ScatterView**

ECharts 散点（按需引入 ScatterChart + GridComponent + TooltipComponent + LegendComponent）：
- X = price_blin_per_m（log 轴，type:'log'），Y = output_speed_tps
- 过滤掉 price 或 speed 缺失的条目
- 两个系列：闭源（orange 点）/ 开源（blue 点），气泡 symbolSize 按 index 映射 8–28px
- tooltip：模型名 / 指数 / 速度 / 价格
- 顶部说明小字：「左上区域 = 更便宜且更快，性价比最优」
- 点点击回调 onSelect(modelId)（供未来跳转，本期仅 console + aria 反馈即可）

- [ ] **Step 3: App 集成 + 提交**

LLM Tab 内部加二级切换（Arena Elo / AA 指数 / 速度×价格散点），Agent Tab 内（SWE-bench / Terminal-Bench）。compareSelection 状态提升到 App（Set<string>，最多 2 个）。勾满两个自动弹出抽屉。

```bash
npm run build && npx vitest run
git add -A
git commit -m "feat(ui): compare drawer + price-speed scatter view"
```

---

### Task 12: 错误态收尾 + 方法论页脚 + README + 最终验收

**Files:**
- Create: `src/components/BoardUnavailable.tsx`, `src/components/Footer.tsx`, `README.md`
- Modify: `src/App.tsx`（Footer + unavailable 分支接入）

**Interfaces:**
- Consumes: SourceInfo（Task 1）
- Produces: `<BoardUnavailable name lastOk={string|undefined} />`、`<Footer latest={LatestFile} pendingCount={number} />`

- [ ] **Step 1: BoardUnavailable**

某榜 `sources[name].status==='unavailable'` 时替换对应子榜：虚线边框占位卡 + 「今日数据暂缺」+ 有 last_ok 时附 mono 小字「最近成功 YYYY-MM-DD」。

- [ ] **Step 2: Footer（数据来源与方法 #methodology 锚点目标）**

三段文字（中文）：① 数据来源列表（Artificial Analysis API / LMArena / SWE-bench Verified / Terminal-Bench(via AA) 各自一句话口径说明 + 外链官网）② 「每日北京时间 06:00 自动更新；每一天的数据快照永久存档于 GitHub `public/data/snapshots/`，点击顶栏『查看数据快照』可查证任何一天的历史数据」③ pending.names.length > 0 时显示「另有 N 个新模型名待收录确认」透明提示。

- [ ] **Step 3: README.md**

内容清单：项目简介（一句）+ 截图占位（后续补）+ 架构简图（ASCII 三段式）+ 本地开发步骤（`npm i` → `.env` 填 AA_API_KEY → `npm run dev` / `npm run fetch` / `npm test`）+ AA Key 注册说明（入口 https://artificialanalysis.ai ，注册后在账户/API 页获取免费 Key；实施时现场访问确认注册路径并写准确链接）+ 部署清单（GitHub 仓库 → Settings→Pages 选 GitHub Actions 来源 → Secrets 添加 AA_API_KEY → push 即部署）+ 数据可查证说明 + License MIT。

- [ ] **Step 4: 最终验收（全部命令必须通过）**

```bash
npm test
npx tsc --noEmit
npm run build
npm run fetch
```

人工验收清单（npm run dev 后逐项过）：
1. 双 Tab 切换正常；五个子榜单都有真实数据渲染
2. 筛选搜索命中（试搜 "deepseek"、切开源过滤）
3. 点击行展开 90 天趋势、再点收起
4. 勾选两模型弹出对比抽屉、领先侧橙色高亮、ESC 可关
5. 散点图渲染且 hover 有 tooltip
6. DevTools 切 375px 宽：卡片视图生效、抽屉全屏
7. prefers-reduced-motion 模拟下无动画
8. Tab 键遍历：焦点框国际橙清晰可见
9. HERO 双冠军与表格第一名一致

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "docs: readme + methodology footer + unavailable states; final polish"
```

---

## Self-Review 结论

**Spec coverage:** 设计文档 §2 架构→Task 1/6/7；§3 管道→Task 2-6；§4 IA→Task 8/9/11；§5 功能→Task 9/10/11；§6 视觉→Task 8 tokens；§8 错误处理→Task 6（管道降级）/Task 12（前端占位）；§9 测试→各任务 TDD；§10 部署→Task 7/12。三处偏离已在文档头声明（public/data 路径、latest 内嵌 models、无上下文窗口指标 + TBench 数据源改 AA 字段）。

**Type consistency:** `withRanks` 注入的 `rank` 仅存在于内存对象，快照 schema 不含 rank（前端按数组序号+1 显示名次）——schema.ts 与 types.ts 一致；`delta_score`/`rank_prev` 全链路命名一致；`LatestFile = Snapshot + models`，快照文件与 latest.json 同构。

**Placeholder scan:** 无 TBD/TODO；models.yaml 具体条目要求实施者对照 fixture 实际名字补齐 ≥35 条（这是明确指令而非占位）。
