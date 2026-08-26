interface TickRailProps {
  value: number;
  min: number;
  max: number;
  ticks: number[];
  accent?: 'ink' | 'blue';
}

/** 签名刻度尺：轨道按 (value-min)/(max-min) 填充，下方 mono 刻度值 */
export default function TickRail({ value, min, max, ticks, accent = 'ink' }: TickRailProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div style={{ minWidth: 140 }} className="tick-rail">
      <div style={{ height: 6, background: 'var(--rule-light)' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: accent === 'blue' ? 'var(--blue)' : 'var(--ink)',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--ink-soft)',
          marginTop: 2,
        }}
      >
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}
