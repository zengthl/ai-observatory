# AI 排名观测站 · 分领域排名增量设计文档

日期：2026-08-27
状态：已与需求方逐项确认定稿
父设计：`docs/superpowers/specs/2026-08-25-ai-observatory-dashboard-design.md`
对应线上站：https://zengthl.github.io/ai-observatory/

## 1. 目标与范围

已上线的 AI 排名观测站当前**只有总榜**，但权威榜单（Artificial Analysis / LMArena / SWE-bench）的真正价值在于分领域能力。本次增量：

- 在 LLM Tab 二级切换新增**分领域子榜**：Arena Elo 总/代码/WebDev；AA 指数 总/Coding/Math
- 表格中核心分列旁加**分项分数小徽标**（hover 显示全名）
- 趋势图多画**分项曲线**（总橙、Code 蓝、WebDev/Math 紫罗兰）
- Agent 榜（SWE-bench、Terminal-Bench）保持两选项不变——该领域暂无内部分领域数据

### 明确不做

- Agent 榜分领域化（数据源不支持）
- 新增散点图分领域视图（避免 YAGNI；如需后续可单独立项）
- 修改管道（数据已够：50/50 LMArena 有 categories.code/webdev；43/46 AA 有 coding_index/math_index）
- 移动端专属布局调整（沿用现有卡片 + 徽标响应式）

## 2. 数据基础（验证过）

```ts
// latest.json → llm.arena_elo[i]
{ model_id, score, ci95, votes, categories?: { code?, webdev? }, rank_prev, delta_score }
// latest.json → llm.aa_index[i]
{ model_id, index, coding_index?, math_index?, output_speed_tps, price_blin_per_m, ... }
// latest.json → agent.*（无分领域）
```

实测：50/50 arena 全部含 `categories` 字段；43/46 aa 含 `coding_index` 或 `math_index` 任一；缺数据的徽标不显（不占位）。

## 3. 核心抽象：Dimension 维

为避免在「kind」枚举上堆 7 个值（容易失控），引入第二个轴 `dimension`：

```ts
// src/lib/boards.ts（新文件）
export type Kind = 'arena' | 'aa' | 'swe' | 'tbench';

export interface DimensionDef<T> {
  id: 'overall' | 'code' | 'webdev' | 'coding' | 'math'; // 全体
  label: string;          // 用户可见 label "Arena 总榜" / "AA Coding"
  axisLabel: string;      // TickRail 上方小字 "ARENA ELO" / "AA INTELLIGENCE"
  isOverall: boolean;     // 总榜=true（决定 TickRail 主色：橙 vs 灰）
  getScore: (e: T) => number | null;       // 表格主分用
  getCi95?: (e: T) => [number, number] | undefined;
  getRail: () => { min: number; max: number; ticks: number[] };  // TickRail 配置
  subBadges?: Array<{     // 总榜才加的副徽标（分项分数小方角标签）
    label: string;         // "code" / "webdev" / "coding" / "math"
    tooltip: string;       // "Arena Elo 代码 1551"
    getValue: (e: T) => number | null;
  }>;
  trendKeys?: Array<{      // 趋势图要画的分项
    key: 'code' | 'webdev' | 'coding' | 'math' | 'overall';
    color: 'orange' | 'blue' | 'violet';
    label: string;
  }>;
}

export const DIMENSIONS: Record<Kind, DimensionDef<any>[]> = {
  arena: [
    { id: 'overall', label: 'Arena 总榜', axisLabel: 'ARENA ELO',
      isOverall: true, getScore: e => e.score, getCi95: e => e.ci95,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      subBadges: [
        { label: 'code', tooltip: 'Arena Elo 代码', getValue: e => e.categories?.code ?? null },
        { label: 'webdev', tooltip: 'Arena Elo WebDev', getValue: e => e.categories?.webdev ?? null },
      ],
      trendKeys: [
        { key: 'overall', color: 'orange', label: '总榜' },
        { key: 'code', color: 'blue', label: 'code' },
        { key: 'webdev', color: 'violet', label: 'webdev' },
      ] },
    { id: 'code', label: 'Arena 代码', axisLabel: 'ARENA ELO / CODE',
      isOverall: false, getScore: e => e.categories?.code ?? null, getCi95: e => undefined,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      trendKeys: [{ key: 'code', color: 'blue', label: 'code' }] },
    { id: 'webdev', label: 'Arena WebDev', axisLabel: 'ARENA ELO / WEBDEV',
      isOverall: false, getScore: e => e.categories?.webdev ?? null, getCi95: e => undefined,
      getRail: () => ({ min: 1400, max: 1600, ticks: [1400, 1450, 1500, 1550, 1600] }),
      trendKeys: [{ key: 'webdev', color: 'violet', label: 'webdev' }] },
  ],
  aa: [
    { id: 'overall', label: 'AA 总榜', axisLabel: 'AA INTELLIGENCE',
      isOverall: true, getScore: e => e.index,
      getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
      subBadges: [
        { label: 'coding', tooltip: 'AA Coding 指数', getValue: e => e.coding_index ?? null },
        { label: 'math', tooltip: 'AA Math 指数', getValue: e => e.math_index ?? null },
      ],
      trendKeys: [
        { key: 'overall', color: 'orange', label: '总榜' },
        { key: 'coding', color: 'blue', label: 'coding' },
        { key: 'math', color: 'violet', label: 'math' },
      ] },
    { id: 'coding', label: 'AA Coding', axisLabel: 'AA CODING INDEX',
      isOverall: false, getScore: e => e.coding_index ?? null,
      getRail: () => ({ min: 40, max: 85, ticks: [40, 55, 70, 85] }),
      trendKeys: [{ key: 'coding', color: 'blue', label: 'coding' }] },
    { id: 'math', label: 'AA Math', axisLabel: 'AA MATH INDEX',
      isOverall: false, getScore: e => e.math_index ?? null,
      getRail: () => ({ min: 40, max: 100, ticks: [40, 60, 80, 100] }),  // math 有上界溢出
      trendKeys: [{ key: 'math', color: 'violet', label: 'math' }] },
  ],
  swe: [
    { id: 'overall', label: 'SWE-bench', axisLabel: 'SWE-BENCH VERIFIED %',
      isOverall: true, getScore: e => e.resolved_pct,
      getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
      trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }] },
  ],
  tbench: [
    { id: 'overall', label: 'Terminal-Bench', axisLabel: 'TERMINAL-BENCH %',
      isOverall: true, getScore: e => e.score,
      getRail: () => ({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }),
      trendKeys: [{ key: 'overall', color: 'orange', label: '总榜' }] },
  ],
};
```

**核心约定**：
- `Kind` 仍 5 个；Dimension 由每个 kind 自由决定数量（1–3 个）
- 表格只显示 `isOverall` 维（即每榜都有一个总览），但总览的 subBadges 提供分项徽标
- 切换到非 overall 维时（如 Arena 代码）只显示该分项

## 4. UI 影响

### 4.1 二级 Tab（BoardBody）

**当前**：LLM Tab 二级选项是 `[Arena Elo] [AA 指数] [速度 × 价格]`（3 个）
**改后**：
- Arena Elo 段被展开为 `[Arena 总榜] [Arena 代码] [Arena WebDev]` 三选项
- AA 指数段展开为 `[AA 总榜] [AA Coding] [AA Math]`
- Agent Tab 段保持 `[SWE-bench] [Terminal-Bench]`

实现：BoardBody 二级 Tab 状态从 `sub: 'arena' | 'aa' | 'scatter' | 'swe' | 'tbench'` 改为 `sub: { kind: Kind; dimension: DimensionId } | 'scatter' | ...`。当 `sub` 选中一个非 overall dimension 时，一级 Tab 文案变成「Arena 代码（仅代码维数据）」之类的语境；也可以在 Tab 文案直接拼接。

**最终 UX 决策**（在 Task 1 落实）：**采用嵌套 Tab 方案**——一级 Tab：LLM / Agent；二级 Tab：按 kind 平铺（agent+swe+tbench+aa*3+arena*3+scatter 共 9 项）。不分「一段属 LLM 一段属 Agent」——所有 kind 平铺更简洁。

### 4.2 表格核心分列（分项徽标）

**当前**：每行核心分列只显示总榜大数字 + TickRail
**改后**：
- 总榜维：核心分列显示「大分（橙色 14-16px mono） + 1–2 个分项徽标（8px mono、灰底、1px 描边）」
- 分项维：核心分列只显示该分项大数字 + TickRail（无徽标）
- 徽标 hover：title 属性显示完整「Arena Elo 代码 1551」

**渲染示意**（AA 总榜，math 缺失）：
```
| 1 | Claude Opus 5 | Anthropic | 63.1                | 55 tok/s | $10 | — |
                                    ┌─ coding 78 ─┐
```

### 4.3 趋势图分项曲线

**当前**：单色橙主线 + top3 参照虚线
**改后**：
- overall 维：主线橙 + 该模型的两个分项虚线（蓝+紫罗兰）作为对比
- 分项维：单色主线（蓝/紫罗兰） + top3 同色参照
- 图例右上：3 行小色块 + 数字

## 5. 视觉令牌新增

```css
/* src/design/tokens.css 追加 */
:root {
  --violet: #7c3aed;       /* Math / WebDev 分项色 */
  --violet-soft: #c4b5fd;  /* 趋势图参照线弱化 */
}
```

## 6. 类型变更

```ts
// src/lib/boards.ts（新文件）— 全部 dimension 配置
// src/types.ts — 字段已够，不变
// src/components/RankTable.tsx — 改 props：删 kind 单参、改 { kind, dimension } 联合
// src/App.tsx — sub 状态类型改 { kind, dimension } | 'scatter'
// src/components/TrendPanel.tsx — props 增 dimensionId；主线颜色按 isOverall 决定
```

## 7. 错误处理

- 某模型在选中 dimension 下无数据（getScore 返回 null）—— 该行展示「—」+ title="无数据"，**不**进 filtered 数组（保持现状行为）
- 趋势图历史序列若 dimension 单独序列无数据—— 单色「暂无该分项历史数据」占位

## 8. 测试

- `tests/boards.test.ts`（新）：DIMENSIONS 配置的完整性（每 kind 至少一个 overall 维；子维度 getScore 路径正确；subBadges 在 overall 维才有）
- `tests/filter.test.ts` 保持：子分维 filter 行为继承主榜，无需新增
- 视觉：Playwright 截图所有 5 kind × overall + 切换分项维前后对比

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| RankTable COLUMNS 抽象变化大，易引入回归 | TDD 覆盖 boards.ts 配置；保留原 kind 单一列回退路径，渐进切换 |
| 趋势图多线在窄屏下重叠 | trendKeys 长度 > 1 时给图例挪到下方；图表自动收缩字号 |
| 紫罗兰色与现有色系冲突 | tokens.css 全局新加 --violet；ECharts 配色从 getChartColors 加 'violet' 字段 |
| history.json 内部分项序列不存在 | 第一日真实数据只有 overall，趋势图分项曲线渲染空点（broken），tooltip 提示「待积累」|

## 10. 部署

无需新 workflow；现有 daily-fetch + deploy 自动覆盖。前端构建产物增量 < 5KB。
