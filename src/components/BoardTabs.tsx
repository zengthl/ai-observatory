import { VIEWS } from '../lib/boards';
import type { ViewId } from '../lib/boards';

export type BoardTab = ViewId;

interface BoardTabsProps {
  tab: ViewId;
  onChange: (t: ViewId) => void;
}

export default function BoardTabs({ tab, onChange }: BoardTabsProps) {
  return (
    <div className="tabs" role="tablist" aria-label="视图切换">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={tab === v.id}
          className="tabs__tab"
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
