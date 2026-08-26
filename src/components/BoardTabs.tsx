export type BoardTab = 'llm' | 'agent';

interface BoardTabsProps {
  tab: BoardTab;
  onChange: (t: BoardTab) => void;
}

export default function BoardTabs({ tab, onChange }: BoardTabsProps) {
  return (
    <div className="tabs" role="tablist" aria-label="榜单切换">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'llm'}
        className="tabs__tab"
        onClick={() => onChange('llm')}
      >
        大模型榜
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'agent'}
        className="tabs__tab"
        onClick={() => onChange('agent')}
      >
        Agent 榜
      </button>
    </div>
  );
}
