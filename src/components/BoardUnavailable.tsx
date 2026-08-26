interface BoardUnavailableProps {
  /** 子榜显示名（如「Arena Elo」） */
  name: string;
  /** 该数据源最近一次成功抓取的快照日期（YYYY-MM-DD）；缺失时不显示该行 */
  lastOk?: string;
}

/**
 * 数据源当日抓取失败（sources[name].status === 'unavailable'）时的子榜占位卡。
 * 虚线边框区分于正常榜单卡；last_ok 让访客知道数据并非永远缺失。
 */
export default function BoardUnavailable({ name, lastOk }: BoardUnavailableProps) {
  return (
    <section className="board-unavailable" role="status">
      <span className="label-caps">{name}</span>
      <p className="board-unavailable__title">今日数据暂缺</p>
      {lastOk && <span className="board-unavailable__date mono">最近成功 {lastOk}</span>}
    </section>
  );
}
