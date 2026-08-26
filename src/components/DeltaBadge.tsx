interface DeltaBadgeProps {
  rankPrev: number | null;
  deltaScore: number | null;
}

/** 分数变化徽标：NEW（蓝）/ ▲ 绿 / ▼ 红 / — 灰持平 */
export default function DeltaBadge({ rankPrev, deltaScore }: DeltaBadgeProps) {
  const style: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    letterSpacing: '0.06em',
    padding: '1px 7px',
    border: '1px solid currentColor',
    borderRadius: 'var(--radius)',
    whiteSpace: 'nowrap',
  };

  if (rankPrev === null) {
    return (
      <span className="delta-badge" style={{ ...style, color: 'var(--blue)' }}>
        NEW
      </span>
    );
  }
  if (deltaScore === null || deltaScore === 0) {
    return (
      <span className="delta-badge" style={{ ...style, color: 'var(--ink-soft)' }}>
        —
      </span>
    );
  }
  if (deltaScore > 0) {
    return (
      <span
        className="delta-badge"
        title={`+${deltaScore.toFixed(1)} vs 上期`}
        style={{ ...style, color: 'var(--up)' }}
      >
        ▲ {Math.abs(deltaScore).toFixed(1)}
      </span>
    );
  }
  return (
    <span
      className="delta-badge"
      title={`${deltaScore.toFixed(1)} vs 上期`}
      style={{ ...style, color: 'var(--down)' }}
    >
      ▼ {Math.abs(deltaScore).toFixed(1)}
    </span>
  );
}
