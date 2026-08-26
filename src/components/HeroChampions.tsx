import type { LatestFile } from '../types';

/** rank_prev 状态徽标：NEW / 守擂 / ↑N / ↓N */
function RankBadge({ rankPrev }: { rankPrev: number | null }) {
  if (rankPrev === null) {
    return <span className="badge-rank badge-rank--new">NEW</span>;
  }
  if (rankPrev === 1) {
    return <span className="badge-rank badge-rank--hold">守擂 · 持平</span>;
  }
  // rank_prev 是上一期名次；本期为第 1 名。rank_prev > 1 表示上升。
  const moved = rankPrev - 1;
  if (moved > 0) {
    return (
      <span className="badge-rank badge-rank--up">
        ↑{moved} 上期 #{rankPrev}
      </span>
    );
  }
  return (
    <span className="badge-rank badge-rank--down">
      ↓{-moved} 上期 #{rankPrev}
    </span>
  );
}

interface ChampionSlot {
  label: string;
  name: string | null;
  score: string | null;
  scoreUnit: string;
  rankPrev: number | null;
}

function Slot({ champion }: { champion: ChampionSlot }) {
  return (
    <div className="hero__slot">
      <div className="label-caps">{champion.label}</div>
      {champion.name ? (
        <>
          <div className="hero__champion-name">{champion.name}</div>
          <div className="hero__score-row">
            <span className="hero__score">{champion.score}</span>
            <span className="label-caps">{champion.scoreUnit}</span>
            <RankBadge rankPrev={champion.rankPrev} />
          </div>
        </>
      ) : (
        <div className="hero__champion-name" style={{ color: 'var(--ink-soft)' }}>
          暂缺
        </div>
      )}
    </div>
  );
}

export default function HeroChampions({ latest }: { latest: LatestFile }) {
  const modelNames = new Map(latest.models.map((m) => [m.model_id, m.display_name]));

  const llm = latest.llm.arena_elo[0] ?? null;
  const agent = latest.agent.swebench_verified[0] ?? null;

  return (
    <section className="hero" aria-label="双冠军">
      <span className="hero__corner hero__corner--tl" aria-hidden="true" />
      <span className="hero__corner hero__corner--tr" aria-hidden="true" />
      <span className="hero__corner hero__corner--bl" aria-hidden="true" />
      <span className="hero__corner hero__corner--br" aria-hidden="true" />

      <Slot
        champion={{
          label: 'LLM / ARENA ELO',
          name: llm ? (modelNames.get(llm.model_id) ?? llm.model_id) : null,
          score: llm ? String(llm.score) : null,
          scoreUnit: 'ELO',
          rankPrev: llm?.rank_prev ?? null,
        }}
      />

      <div className="hero__divider" aria-hidden="true" />

      <Slot
        champion={{
          label: 'AGENT / SWE-BENCH VERIFIED',
          name: agent ? (modelNames.get(agent.model_id) ?? agent.model_id) : null,
          score: agent ? `${agent.resolved_pct.toFixed(1)}%` : null,
          scoreUnit: 'RESOLVED',
          rankPrev: agent?.rank_prev ?? null,
        }}
      />
    </section>
  );
}
