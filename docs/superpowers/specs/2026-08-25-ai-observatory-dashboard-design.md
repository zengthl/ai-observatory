# AI 排名观测站（AI Benchmark Observatory）设计文档

日期：2026-08-25
状态：已与需求方逐节确认定稿

## 1. 目标与范围

构建一个公开可访问的 AI 大模型与 AI Agent 排名看板：

- 数据来自权威榜单：Artificial Analysis（官方 API）、LMArena（Chatbot Arena）、SWE-bench Verified、Terminal-Bench
- **每日自动更新**，数据**可查证**（每日快照以 git 提交永久留档）
- 中文界面（模型名、榜单名等专有名词保留英文）
- 视觉方向已选定：**「精密计量局」风格**（见 §6），要求精致、复杂、非模板化
- 公网部署，零成本零运维

### 明确不做（YAGNI）

- 不做用户系统、评论、收藏
- 不做自建评分体系——只聚合展示权威榜单原始数据
- 不做双语切换；不做暗色主题（计量局风格为唯一主题）
- 首期不做 API 供第三方调用（JSON 快照本身就是开放数据）

## 2. 总体架构

```
┌────────────────────────────────────────────────────┐
│ GitHub Actions（每日 UTC 22:00 = 北京时间 06:00）      │
│   Node 脚本抓取三个数据源 → 清洗对齐 → 写入 JSON 快照    │
│   → git commit + push                                │
│   失败：单源降级标记 unavailable；全失败则不提交并告警     │
└──────────────┬─────────────────────────────────────┘
               ↓
┌────────────────────────────────────────────────────┐
│ data/*.json（仓库内，即数据库）                        │
│   snapshots/YYYY-MM-DD.json · latest.json · history │
└──────────────┬─────────────────────────────────────┘
               ↓ 构建时打包进静态资源
┌────────────────────────────────────────────────────┐
│ Vite + React 18 + TypeScript 单页应用                │
│ 部署到 GitHub Pages（Actions 自动发布）               │
└────────────────────────────────────────────────────┘
```

选型理由：无服务器、免费、快照天然构成审计链。否决的备选方案：Cloudflare Workers + KV（多一层基础设施，对此项目过度设计）、手动更新（不满足每日更新）。

## 3. 数据管道

### 3.1 数据源与抓取方式

| 源 | 方式 | 内容 | 稳定性 |
|---|---|---|---|
| Artificial Analysis | 官方 REST API（免费 Key，存仓库 Secret `AA_API_KEY`） | 智能指数、输出速度、价格、上下文窗口 | 高（主力源） |
| LMArena | 解析其公开排行榜数据端点 | 文本/代码/WebDev 等分类 Elo、置信区间、票数 | 中（改版风险） |
| SWE-bench Verified / Terminal-Bench | 解析官方 GitHub 仓库公开榜单文件 | agent 任务解决率 | 中（改版风险） |

### 3.2 管道流程

```
run.ts 编排：
1. 并发调用三个 source 适配器（pipeline/sources/{aa,arena,swebench}.ts）
2. 归一化：用 models.yaml 别名表把各源模型名映射到规范 model_id；
   无法映射的名字写入 pending.json 待人工确认，不入正式榜
3. 与前一日快照对比计算名次变动（↑↓—NEW）与分数差
4. 写入：
   - data/snapshots/YYYY-MM-DD.json  当日完整快照
   - data/latest.json                前端读取入口（结构同快照）
   - data/history.json               各模型分数时间序列（趋势图）
5. git commit（[data] YYYY-MM-DD 前缀）+ push
```

### 3.3 关键规则

- **抓取失败不写脏数据**：某源当日失败 → 快照中该源 `status: "unavailable"` 并记录 `last_ok` 日期，前端该子榜显示「今日数据暂缺」占位并保留历史趋势
- **全部源失败 → 不产生新快照、不 commit**，Actions 失败通知
- **模型身份人工把关**：新名字先进 pending 列表；`models.yaml` 由维护者手工扩充后次日生效

### 3.4 数据模型（快照 JSON 结构）

```jsonc
// latest.json / snapshots/YYYY-MM-DD.json
{
  "date": "2026-08-25",
  "sources": {
    "artificial_analysis": { "status": "ok", "fetched_at": "..." },
    "lmarena":             { "status": "unavailable", "last_ok": "2026-08-24" },
    "swebench":            { "status": "ok" }
  },
  "llm": {
    "arena_elo": [
      { "model_id": "gpt-5-pro", "score": 1493, "ci95": [1487, 1499],
        "votes": 18234, "categories": { "text": 1491, "code": 1502, "webdev": 1510 },
        "rank_prev": 1, "delta_score": 2 }
    ],
    "aa_index": [
      { "model_id": "gpt-5-pro", "index": 71.4, "output_speed_tps": 138,
        "price_blin_per_m": 10.0, "context_k": 400, "rank_prev": 1 }
    ]
  },
  "agent": {
    "swebench_verified": [ { "model_id": "claude-opus-4-6", "resolved_pct": 83.4, "rank_prev": 2 } ],
    "terminal_bench":    [ { "model_id": "claude-opus-4-6", "score": 43.2, "rank_prev": 1 } ]
  }
}

// history.json —— 趋势图数据
{ "gpt-5-pro": { "arena_elo": [["2026-05-28", 1478], ...], "aa_index": [...] } }
```

### 3.5 models.yaml（模型身份主表）

```yaml
- model_id: claude-opus-4-6
  display_name: Claude Opus 4.6
  org: Anthropic
  license: closed          # closed | open
  aliases: ["Claude Opus 4.6", "claude-opus-4.6", "anthropic/claude-opus-4.6"]
```

## 4. 信息架构

```
顶栏：站名 LOGO · 数据更新日期 · 「数据来源与方法」 · 「查看数据快照」（链到 GitHub data/ 目录）
HERO：「今日校准」双冠军区 —— LLM 第一名 与 Agent 第一名 并排，含守擂天数/变动状态
主 Tab：[大模型榜] [Agent 榜]

大模型榜 Tab 内子榜单切换：
  · Arena Elo（分类切换：综合/文本/代码/WebDev）
  · AA 综合指数（智能指数 + 速度 + 价格 + 上下文列）
  · 速度 × 价格散点图（双轴，性价比一图看清）

Agent 榜 Tab 内子榜单：
  · SWE-bench Verified
  · Terminal-Bench

每个榜单 = 排名表（名次变动标记）+ 工具栏 + 行展开趋势图
对比模式：表格行首勾选两个模型 → 底部浮出对比抽屉
```

- 名次变动：较前一日快照 ↑绿 / ↓红 / —持平 / NEW 新上榜；名次不变但分数变化时显示小字分数差
- 「可查」落地：页面上所有日期可点回当日 GitHub 快照文件；顶栏有数据来源与方法说明区

## 5. 交互功能细节

### 5.1 工具栏（各榜单通用）

```
[🔍 搜索模型名…]  [厂商 ▾]  [开源/闭源 ▾]  [上下文长度 ▾(仅AA指数)]     共 N 个模型
```

客户端即时过滤（数据全量在本地 JSON）。搜索支持中文名、英文名、厂商名模糊匹配。

### 5.2 趋势查看

点击表格行展开 → 行下滑出 ECharts 折线：该模型近 90 天分数走势，叠加同榜当前前三名作参照线；再点收起。

### 5.3 对比抽屉

1. 行首复选框勾选两个模型 → 底部滑出对比抽屉
2. 两列并排，每指标一根水平刻度条（计量局刻度尺样式），领先侧国际橙高亮
3. 指标取两榜并集；缺数据显示「—」加 tooltip「无数据」

### 5.4 移动端适配

- 表格降级为卡片列表（名次大数字 + 模型名 + 核心分 + 变动标记）
- 对比抽屉改为全屏覆盖层
- 子榜单切换横向滑动

### 5.5 无障碍底线

键盘焦点可见（工程图纸风格的方角焦点框）；尊重 `prefers-reduced-motion`（关闭抽屉/趋势展开动画）；表格语义化 `<table>` + 表头关联。

## 6. 视觉设计系统 ——「精密计量局」

> 用户已从三个渲染 mockup（深空观测站/精密计量局/AI行情交易所）中选定此方向。
> 设计原则遵循 frontend-design skill：有观点、非模板、把大胆花在一处（签名元素），其余克制。

### 6.1 设计概念

整站像一份精密仪器的校准报告：暖白图纸底 + 隐约工程网格，墨黑细线分层，国际橙只做「校准标记」，钢蓝标注开源与上升项。每个分数下方带真实刻度尺，传达「这是测量出来的」。气质：严谨、克制、可信。

### 6.2 色彩令牌

```css
--paper:        #FAFAF6;  /* 图纸底 */
--ink:          #16181D;  /* 主墨色：正文、粗分隔线 */
--ink-soft:     #6B6D64;  /* 次级文字 */
--rule-light:   #E4E4DB;  /* 浅分隔线 */
--grid-line:    rgba(22,24,29,.045);  /* 工程网格 */
--orange:       #FF4D00;  /* 国际橙：名次数字、角标、领先高亮（唯一强调色） */
--blue:         #2563EB;  /* 钢蓝：开源标签、NEW 标记 */
--up:           #0A7D33;  /* 上升 */
--down:         #C62828;  /* 下降 */
--chart-series: [#FF4D00, #2563EB, #0A7D33, #6B6D64, #C62828]; /* 图表序列色 */
```

### 6.3 字体令牌

| 角色 | 字体 | 用法 |
|---|---|---|
| 展示标题 | Noto Sans SC 900 | HERO 冠军名、区块标题 |
| 正文 | Noto Sans SC 400/500/700 | 表格模型名、说明文字 |
| 数据/标签 | IBM Plex Mono 400–600 | 一切数字、日期、字段标签（大写字距 +0.18em）|

中英混排规则：中文 Noto Sans SC 打底，英文专名与全部数值走 IBM Plex Mono，形成「仪器读数」质感。

### 6.4 版式与签名元素

- 背景：`--paper` 上叠加 22px 工程网格（`--grid-line`）
- 分层：主要分区用墨黑实线 1px，次要信息用虚线；圆角仅 2–8px（工程感）
- **签名元素①：校准刻度条**——每个分数下方一条带真实刻度值的黑色标尺（40/55/70/85…），开源模型的标尺为钢蓝色
- **签名元素②：角部定位标**——HERO 区四角的国际橙 L 形定位角，呼应图纸装订标记
- 页头导航 Tab：墨黑描边分段控件，选中项反色（墨黑底纸白字）

## 7. 技术栈

| 层 | 选择 | 说明 |
|---|---|---|
| 构建 | Vite 5 + TypeScript | strict 模式 |
| UI | React 18，不用组件库 | 自定义设计系统 |
| 图表 | ECharts 5（按需引入 LineChart/ScatterChart） | 趋势线与散点 |
| 样式 | 原生 CSS + CSS 变量令牌 | 无 Tailwind，保证设计精确控制 |
| 管道脚本 | Node 22 + tsx | 与前端共享类型定义 |
| 测试 | Vitest | 见 §9 |
| 路由 | hash 路由（自实现，~50 行） | 支持分享链接如 `#/llm/arena`，无需引入 react-router |

### 项目结构

```
ai-observatory/
├── data/                          ← 管道产物（git 留档）
│   ├── snapshots/YYYY-MM-DD.json
│   ├── latest.json
│   ├── history.json
│   └── pending.json               ← 待人工确认的未知模型名
├── pipeline/
│   ├── sources/{aa,arena,swebench}.ts
│   ├── normalize.ts               ← 别名对齐 + 排名差计算
│   ├── models.yaml
│   └── run.ts
├── src/
│   ├── design/tokens.css
│   ├── types.ts                   ← 快照类型（管道与前端共用）
│   ├── components/
│   │   ├── TopBar.tsx  HeroChampions.tsx  BoardTabs.tsx
│   │   ├── RankTable.tsx  FilterBar.tsx  TrendPanel.tsx
│   │   ├── CompareDrawer.tsx  ScatterView.tsx  DeltaBadge.tsx
│   │   └── TickRail.tsx           ← 校准刻度条（签名组件）
│   ├── hooks/{useBoardData,useFilters}.ts
│   └── App.tsx
└── .github/workflows/daily-fetch.yml
```

## 8. 错误处理

| 场景 | 行为 |
|---|---|
| 单源抓取失败 | 该源 `status:"unavailable"`，保留其余数据正常出快照；前端对应子榜显示「今日数据暂缺，最近成功：YYYY-MM-DD」 |
| 全部源失败 | 不写快照不提交；Actions 标红并通知维护者 |
| AA API 配额/鉴权错误 | 同单源失败处理；Actions 日志打印明确原因（401→检查 Secret） |
| 前端 JSON 加载失败 | 整页错误态 + 重试按钮 |
| 快照内某子榜缺失 | 该子榜占位而非报错 |
| 未知模型名 | 进 `pending.json`，不出现在任何榜上 |

## 9. 测试策略

- **管道（重点）**：每个 source 适配器用录制的真实响应 fixture 做单测——解析器最怕静默回归；别名归一化与排名差计算的纯函数全覆盖（Vitest）
- **快照 schema 校验**：写入前用 zod 校验，防脏数据入库
- **前端**：筛选、排序、对比取并集等纯逻辑单测；UI 视觉以人工验收为主（开发期截图自查）

## 10. 部署与运维

- GitHub Pages：Actions 构建 Vite（base 路径按仓库名配置）→ 发布 gh-pages
- 每日抓取 workflow：cron `0 22 * * *`（UTC）；支持 `workflow_dispatch` 手动触发补数
- 维护者唯一操作：注册 Artificial Analysis 免费 API Key → 配置仓库 Secret `AA_API_KEY`
- `.superpowers/` 加入 `.gitignore`

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| LMArena/SWE-bench 页面改版导致解析失效 | 适配器与源解耦；fixture 单测快速定位；失败降级不污染数据；Actions 通知及时修 |
| 各榜模型名不一致且持续出现新名 | models.yaml 别名表 + pending 人工审核队列 |
| AA API 未来收费/限流 | 免费额度对日频抓取余量极大；真失效时该源降级，站点仍有其他三源 |

## 12. 后续可选增强（不在本期）

- HLE（Humanity's Last Exam）、LiveBench 等更多榜单接入
- 中英双语切换、暗色主题
- 开放 JSON API 与订阅推送（如钉钉/Telegram 每日播报）
