# 基准 · BENCHMARK — AI 排名观测站

每日聚合 Artificial Analysis、LMArena、SWE-bench Verified、Terminal-Bench 四个公开榜单的 AI 模型排名看板：双榜（大模型 / Agent）四子榜 + 速度×价格散点 + 90 天趋势 + 双模型对比，每一天的数据快照永久存档、随时可查证。

> 截图占位（部署后补）

## 架构

```
┌─────────────────────────────────────────────────────────┐
│ 数据管道  npm run fetch（本地 / GitHub Actions 每日定时） │
│                                                           │
│  AA API ──┐                                               │
│  LMArena ─┼→ 抓取 → 归一化(models.yaml 对照) → zod 校验    │
│  SWE-bench┘        → 快照落盘 public/data/                │
│                      latest.json · history.json           │
│                      snapshots/YYYY-MM-DD.json (永久存档) │
│                      pending.json   (未登记的新模型名)     │
├─────────────────────────────────────────────────────────┤
│ 前端  React 19 + Vite + ECharts（GitHub Pages 静态托管）  │
│                                                           │
│  TopBar ─ Hero 双冠军 ─ Tab(大模型|Agent) ─ 子榜切换       │
│  RankTable(筛选/展开趋势/勾选对比) · ScatterView · Footer │
├─────────────────────────────────────────────────────────┤
│ 存档  GitHub 仓库即数据库：data 提交进 main 分支，        │
│       任何一天的历史数据可在 snapshots/ 目录查证            │
└─────────────────────────────────────────────────────────┘
```

## 本地开发

要求 Node ≥ 20.12。

```bash
npm install

# 在项目根创建 .env（参考 .env.example）：
#   AA_API_KEY=<你的 key>
cp .env.example .env

npm run dev      # 本地预览 http://localhost:5173
npm run fetch    # 抓一次数据，更新 public/data/
npm test         # vitest 全量测试
npm run build    # tsc 类型检查 + vite 构建到 dist/
```

## 获取 Artificial Analysis API Key

数据管道依赖 AA 官方 Data API（免费档即可覆盖本站用到的模型级指标）：

1. 打开 <https://artificialanalysis.ai>，点右上角登录（<https://artificialanalysis.ai/login>），用 Google / Microsoft / 邮箱任一方式注册并登录 Insights 平台账户；
2. 进入 API 密钥管理页（Data API 文档 <https://artificialanalysis.ai/data-api/docs> 的 Quick start 第一步「Create a key」有直达入口；未登录时会先引导登录再跳回密钥页）；
3. 创建并复制 API Key；
4. 写入项目根 `.env` 的 `AA_API_KEY=` 后即可 `npm run fetch`。

Key 属于组织（organisation），请勿提交到仓库或暴露在前端代码中——本站仅在 Node 管道与 GitHub Actions Secrets 中使用它。

LMArena 与 SWE-bench 两个源无需任何 Key。

## 部署清单（GitHub Pages）

1. 将仓库推到 GitHub（main 分支）；
2. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**；
3. **Settings → Secrets and variables → Actions** 添加 Secret `AA_API_KEY`；
4. push 即触发部署工作流（`.github/workflows/deploy.yml`）；每日北京时间 06:00（cron `0 22 * * *` UTC）的 `daily-fetch` 工作流抓取新数据并以 `[data]` 提交自动推送，推送后再自动触发重新部署。

## 数据可查证

- `public/data/snapshots/YYYY-MM-DD.json`：每天一份完整快照，永久保留——顶栏「查看数据快照」直达该目录；
- `public/data/history.json`：全部模型的逐日分数序列（近一年），驱动行展开的 90 天趋势图；
- `public/data/pending.json`：上游出现但尚未登记进模型对照表的名字，页面底部会透明展示计数；
- 所有榜单分数均为当日从上游原样抓取，本站不做二次加工；源失败时对应子榜显示「今日数据暂缺」占位并在快照中标注 `unavailable` 与最近成功日期。

## License

[MIT](LICENSE)
