import type { LatestFile } from '../types';

export interface FooterProps {
  latest: LatestFile;
  /** pending.json 里待收录的新模型名数量（names.length；加载失败时为 0 不显示提示） */
  pendingCount: number;
  /** pending 被截断时的全量总数（>pendingCount 时提示文案用 total） */
  pendingTotal?: number;
}

const AA_SITE = 'https://artificialanalysis.ai';
const ARENA_SITE = 'https://lmarena.ai';
const SWEBENCH_SITE = 'https://www.swebench.com';

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="footer__link">
      {children}
    </a>
  );
}

/**
 * 页脚「数据来源与方法」——TopBar 锚点链接 #methodology 的目标。
 * 三段：数据来源口径 / 快照存档与可查证 / 待收录透明提示。
 */
export default function Footer({ latest, pendingCount, pendingTotal }: FooterProps) {
  // 待收录计数：names 截断时用 total 表达真实规模，否则用 names.length
  const pendingShown = pendingTotal != null && pendingTotal > pendingCount ? pendingTotal : pendingCount;

  return (
    <footer id="methodology" className="footer">
      <div className="footer__inner">
        <h2 className="label-caps footer__heading">数据来源与方法</h2>

        <p className="footer__text">
          本站每日聚合四个公开榜单：{' '}
          <ExtLink href={AA_SITE}>Artificial Analysis</ExtLink>
          {' '}官方 API 的智能指数、输出速度与混合价格（闭源/开源模型统一口径的独立评测）；
          <ExtLink href={ARENA_SITE}>LMArena</ExtLink>
          {' '}匿名对战产生的 Arena Elo（Text / Coding / WebDev 分类，附 95% 置信区间）；
          以及 SWE-bench Verified 官方排行榜的真实 GitHub issue 解决率
          （<ExtLink href={SWEBENCH_SITE}>swebench.com</ExtLink>）。Terminal-Bench v2.1
          得分取自 Artificial Analysis 同一 API 响应中的对应字段。所有分数当日抓取后原样存档，本站不做任何二次加工或主观调整。
        </p>

        <p className="footer__text">
          每日北京时间 06:00 自动更新；每一天的数据快照永久存档于 GitHub{' '}
          <code className="mono">public/data/snapshots/</code>
          ，点击顶栏『查看数据快照』可查证任何一天的历史数据。
        </p>

        {pendingShown > 0 && (
          <p className="footer__text footer__pending">
            另有 {pendingShown} 个新模型名待收录确认——它们已出现在上游榜单但尚未登记到本站的模型对照表，
            确认后将进入下一期榜单。
          </p>
        )}

        <p className="label-caps footer__meta">
          数据截至 {latest.date} · AA {latest.llm.aa_index.length} · LMArena{' '}
          {latest.llm.arena_elo.length} · SWE-bench {latest.agent.swebench_verified.length} ·
          Terminal-Bench {latest.agent.terminal_bench.length}
        </p>
      </div>
    </footer>
  );
}
