const DATA_REPO_URL: string = import.meta.env.VITE_DATA_REPO_URL ?? '#';

export default function TopBar({ date }: { date: string }) {
  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="topbar__logo">
          基准<span className="topbar__logo-dot">·</span>BENCHMARK
          <span className="topbar__subtitle">AI 排名观测</span>
        </div>
        <div className="topbar__right">
          <span className="topbar__date">DATA {date}</span>
          <a
            className="topbar__link"
            href={DATA_REPO_URL}
            target="_blank"
            rel="noreferrer"
          >
            查看数据快照
          </a>
          <a className="topbar__link topbar__link--methodology" href="#methodology">
            数据来源与方法
          </a>
        </div>
      </div>
    </header>
  );
}
