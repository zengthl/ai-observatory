# AI 排名观测站 · 大规模数据源扩展设计文档

日期：2026-08-27
状态：基于已上线站点的扩展
父设计：`docs/superpowers/specs/2026-08-25-ai-observatory-dashboard-design.md`
增量设计：`docs/superpowers/specs/2026-08-27-subdimension-rankings-design.md`
已上线：https://zengthl.github.io/ai-observatory/

## 1. 目标与范围

当前看板：AA 4 维 + LMArena 3 维（text/code/webdev） + SWE-bench + Terminal-Bench + 散点图 = **7 个核心子榜**。覆盖广度不足，**用户要求"最大强度丰富"权威性**。

本次扩展：把子榜数量从 **7 增加到 ≥20**，覆盖每类模型（旗舰大模型 / 中小开源 / 代码 / Agent）的核心权威基准。

### 扩展目标

| 类别 | 来源 | 新增子榜数 | 优先级 |
|---|---|---|---|
| **AA 深挖** | Artificial Analysis API（已有） | +6 | ★★★ |
| **LiveBench** | HF parquet | +7 | ★★★ |
| **OpenLLM v1** | HF JSON tree | +6 | ★★ |
| **LiveCodeBench** | GitHub Pages HTML | +1 | ★★ |
| **OpenCompass 司南** | 需破解 POST | +3（若破解成功） | ★ |

**预期终态**：25+ 子榜，分 4–5 大类（多维通用 / 代码 / 数学推理 / Agent / 中文），Top 模型覆盖度从 ~50 → 200+。

### 明确不做

- HAL/Terminal-Bench/GAIA：网络不可达
- SuperCLUE：API 不可见
- ScaleAI SEAL：私有
- HLE/GPQA/IFEval 独立榜：无可解析公开端点（继续靠 AA 字段提供）
- 实时会话/榜单：所有数据走日频拉取
- 模型数量爆炸：1000+ 模型全列表对单页 UI 不友好，必须做筛选/虚拟化

## 2. 数据源详细规划

### 2.1 AA 深挖（零外部抓取成本）

AA API 同一响应中 `evaluations` 字段已含至少 16 个基准：

```ts
interface AAEvaluations {
  artificial_analysis_intelligence_index: number;
  artificial_analysis_coding_index: number;
  artificial_analysis_math_index: number;
  mmlu_pro: number;
  gpqa: number;
  hle: number;
  livecodebench: number;
  scicode: number;
  math_500: number | null;
  aime: number | null;
  aime_25: number | null;
  ifbench: number;  // instruction following
  lcr: number;      // long context retrieval
  terminalbench_hard: number;
  terminalbench_v2_1: number;
  tau2: number;     // agent customer support
  tau_banking: number;
}
```

**新暴露子榜**（在现有 AA 总/数学/代码基础上加）：
1. **AA-MMLU-Pro**（mmlu_pro）—— 知识深度黄金标准
2. **AA-GPQA**（gpqa）—— 研究生级科学推理
3. **AA-HLE**（hle）—— Humanity's Last Exam，最难的测试
4. **AA-LiveCodeBench**（livecodebench）—— 实时代码（双源验证）
5. **AA-IFEval**（ifbench）—— 指令遵循
6. **AA-长上下文检索**（lcr）—— 长文档能力

注意：很多模型的 `math_500/aime/aime_25` 在实测中大量为 null（仅 top 模型有），这些不作为独立子榜（被现有 math_index 涵盖）。`scicode` 同理（仅顶模有数据）。

### 2.2 LiveBench（新增完整 source 适配器）

- **数据源**：HuggingFace `huggingface.co/datasets/livebench/model_judgment`
- **关键文件**：`data/leaderboard-00000-of-00001.parquet`（737KB）— 含完整月度榜单
- **子榜**（7 个）：
  1. LiveBench Coding
  2. LiveBench Math
  3. LiveBench Reasoning
  4. LiveBench Language
  5. LiveBench Data Analysis
  6. LiveBench IF（Instruction Following）
  7. LiveBench Web Search
- **解析策略**：
  - 直接 `curl` parquet 落到 fixture（测试用）
  - 运行期 `fetch` parquet → 用 `parquetjs` 或 `parquet-wasm` 解析
  - 备选：HF 提供 `parquet_to_arrow` HTTP 端点更友好

**实施复杂度**：★★（需引入 parquet 解析依赖 + 字段映射）

### 2.3 OpenLLM Leaderboard v1（新增 source 适配器）

- **数据源**：`huggingface.co/datasets/open-llm-leaderboard/results` — 散列 JSON，每个模型一个 dataset
- **目录列表 API**：`huggingface.co/api/datasets/open-llm-leaderboard/results/tree/main?recursive=true`
- **每模型 JSON 路径模式**：`results/<org>/<model>/results_<timestamp>.json`
- **关键字段**（`results.<task>.acc_norm`）：
  - `mmlu` / `mmlu` 2 维
  - `arc` / `arc_challenge`
  - `hellaswag`
  - `truthfulqa` / `truthfulqa_mc2`
  - `gsm8k`
  - `bbh` (BIG-Bench Hard，多子任务聚合)
- **子榜设计**：6 个独立子榜（MMLU / ARC / HellaSwag / TruthfulQA / GSM8K / BBH）

**实施复杂度**：★★（批量拉取 ~1000 个 JSON，缓存目录索引；单次抓取总流量 ~50MB，可每周全量、日频增量）

**模型覆盖**：开源/中小型为主（Yi-1.5、Llama-3、Mistral、Phi-3、Gemma、Qwen2.5、GLM-4、DeepSeek-V3）

### 2.4 LiveCodeBench（新增 source 适配器）

- **URL**：`https://livecodebench.github.io/leaderboard.html` 静态 HTML
- **关键列**：模型名/ID、日期/版本、Pass@1（多种 date range：Easy/Medium/Hard/All）
- **实施复杂度**：★★（HTML 解析，参考已有 arena.ts 模式）

### 2.5 OpenCompass 司南（条件性）

- **URL**：`https://rank.opencompass.org.cn/`
- **状态**：API 端点存在但需破解 POST 参数
- **实施复杂度**：★★★★（需要逆向工程 + 鉴权 token）
- **建议**：先放弃（成本不匹配收益）。如果用户特别需要中文榜单再议。

### 2.6 数据源汇总（最终）

| 源 | 子榜 | 状态 | 复杂度 |
|---|---|---|---|
| AA 总/代码/数学 | 3 | 已有 | — |
| AA 6 新子榜 | 6 | 新增 | ★（零抓取成本） |
| LiveBench | 7 | 新增 | ★★ |
| OpenLLM v1 | 6 | 新增 | ★★ |
| LiveCodeBench | 1 | 新增 | ★★ |
| LMArena (text/code/webdev) | 3 | 已有 | — |
| SWE-bench / Terminal-Bench | 2 | 已有 | — |
| **合计** | **28** | | |

## 3. 信息架构变化

### 3.1 一级 Tab 分组（不再平铺所有子榜）

```
LLM 通用：AA 智能指数 / AA Coding / AA Math / AA HLE / Arena Elo / LiveBench Coding / LiveBench Math ...
LLM 知识：AA MMLU-Pro / AA GPQA / OpenLLM MMLU / OpenLLM TruthfulQA / OpenLLM HellaSwag / OpenLLM ARC
LLM 代码：AA Coding / AA LiveCodeBench / LiveBench Coding / LiveCodeBench / OpenLLM GSM8K
LLM 指令：AA IFEval / LiveBench IF
LLM 长上下文：AA 长上下文检索
Agent 任务：SWE-bench / Terminal-Bench / Tau2
速度价格：散点图
```

**实现**：新增"视图"概念 `view: 'general' | 'knowledge' | 'coding' | 'instruction' | 'longcontext' | 'agent' | 'speed'`。每个视图包含一组子榜。一级 Tab 是视图，二级 Tab 是视图内的子榜。

**简化决策**：第一版不做视图分组——保留上一轮（subdim 设计）的平铺 9 个 Tab，**只把新增的子榜接续在后面**。这意味着 LLM 二级 Tab 数量会从 9 涨到 21+。可滚动横向 tab 解决；如体验差再迭代视图分组（**不阻塞本任务**）。

### 3.2 模型元数据规模

`models.yaml` 从 62 涨到 150+（OpenLLM 拉来大量开源模型）。**新策略**：
- `models.yaml` 只手维护"重点模型"（约 80 个，旗舰/中文/代表性开源）
- OpenLLM 拉取的 1000+ 模型在快照里以**匿名 model_id**（如 `openllm-7b-001`）入榜，前端不显示具体名字（仅显示解析后名），并在 Hero 副行加 `属 OpenLLM 未识别模型` 提示
- 维护者后续手工补表让更多模型升级为"重点模型"

### 3.3 表格与趋势图

- 表格逻辑不变（基于 boards.ts 抽象），新子榜都是新 entry
- 趋势图：所有新子榜的 history 序列从首日开始累积（依赖 daily-fetch）
- 排名变动：withRanks 已经支持任意 score 字段，无需改

## 4. 视觉约束

- 新增子榜沿用统一 9 令牌（无新色）
- 表格行数膨胀（数百到上千）：保留 Top 100 + 「展开更多」/或虚拟滚动
- 二级 Tab 横向滚动 + 移动端不溢出：CSS overflow-x:auto

## 5. 类型与契约变更

```ts
// src/types.ts — 新增子榜
export interface LCREntry {  // AA 长上下文检索
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface LiveBenchEntry {
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
  // 子榜 7 个：coding/math/reasoning/language/data_analysis/instruction_following/web_search
}

export interface OpenLLMEntry {
  model_id: string;
  score: number;
  rank_prev: number | null;
  delta_score: number | null;
}

export interface LiveCodeBenchEntry {
  model_id: string;
  score: number;
  pass_easy: number;
  pass_medium: number;
  pass_hard: number;
  rank_prev: number | null;
  delta_score: number | null;
}

// Snapshot 扩展
sources: {
  artificial_analysis: ...
  lmarena: ...
  swebench: ...
  livebench: ...  // 新增
  openllm: ...    // 新增
  livecodebench: ... // 新增
};
llm: {
  arena_elo: ...
  aa_intelligence: ...
  aa_coding: ...
  aa_math: ...
  aa_mmlu_pro: ...      // 新
  aa_gpqa: ...          // 新
  aa_hle: ...           // 新
  aa_livecodebench: ... // 新
  aa_ifeval: ...        // 新
  aa_lcr: ...           // 新
  livebench_coding: ...
  livebench_math: ...
  livebench_reasoning: ...
  livebench_language: ...
  livebench_data_analysis: ...
  livebench_instruction_following: ...
  livebench_web_search: ...
  openllm_mmlu: ...
  openllm_arc: ...
  openllm_hellaswag: ...
  openllm_truthfulqa: ...
  openllm_gsm8k: ...
  openllm_bbh: ...
  livecodebench: ...
};
agent: { swebench_verified: ..., terminal_bench: ..., tau2: ... }; // 加 tau2
```

总计 21 个 LLM 榜 + 3 个 agent 榜 = 24 个数据点。

### boards.ts 更新

`DIMENSIONS` 从 5 维扩到 ~20 维。`Kind` 枚举需要细化（每榜一个 kind，或保留 kind 复用 + 新 sub-id）。

**简化决策**：保留现有 `Kind` 5 个（arena/aa/swe/tbench/scatter），用 dimension 区分所有变体；当前 boards.ts 已经支持 this pattern。`SubBadges` 模式可以复用以表示子维分数（但这次它们变成独立 sub 切换而非徽标）——需要重新设计 dimension interface。

**重构方向**：将 `DimensionDef` 中的 `getScore`/`subBadges` 概念统一为"子序列"：每个 dimension 暴露 `entries: any[]` + `getScore` + `getRail` + `trendKeys`。`subBadges` 移除（不再需要——每个 sub 维都是独立 Tab）。

## 6. 错误处理

- LiveBench parquet 解析失败 → 该源标 unavailable
- OpenLLM 单个 JSON 拉取失败 → skip + 记入 pending；不让 1/1000 失败污染整个榜
- 模型元数据命中率（resolveModelId 命中 / 总数）< 50% → 警告 + 继续（不阻塞）
- 单个新增榜 entries 长度 0 → 整榜标 unavailable 但其余继续

## 7. 测试

- 每个新 source 适配器 TDD 单独测试文件
- boards.test.ts 扩展覆盖新 dimension
- fixtures：每个新源录制真实响应样本
- Playwright 视觉验证 ≥20 Tab 横向滚动无异常

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| OpenLLM 1000+ 模型导致页面卡顿 | 表格仅渲染前 100 + 「查看更多」展开；榜单内不虚拟滚动（用分页） |
| LiveBench parquet 解析依赖大（几 MB） | 客户端解析，缓存到 public/data/livebench.json（管道侧预解析存 JSON） |
| 20+ 个榜 daily-fetch 超 60s | 拆 workflow：daily-fetch 并行 3 组（AA/LMArena/各新源），每组独立 step |
| models.yaml 维护成本爆炸 | 引入「openllm-XXX」匿名 id 机制；维护者按需手工升级为重点模型 |
| withRanks 性能（数千条） | 无需优化——单测跑过 22 元素 0.5ms，2000 元素 < 50ms |

## 9. 部署

- 改造后的 `npm run fetch` 必须能在 60s 内完成（Actions 6h 上限够用）
- 单次 fetch 流量：LiveBench ~700KB、OpenLLM ~50MB、LiveCodeBench ~200KB
- 如网络慢，可配置为仅 AA + LMArena 必跑，OpenLLM 周更

## 10. 成功标准

- LLM Tab 二级 Tab 总数 ≥ 20
- 模型覆盖：重点模型 80+ + OpenLLM 1000+
- 前端首屏 < 5s（移动端）
- 全量数据首次抓取完成 < 60s
- 每日增量 < 5s
