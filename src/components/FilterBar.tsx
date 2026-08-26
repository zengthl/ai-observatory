import type { FilterState } from '../hooks/useFilters';

interface FilterBarProps {
  orgs: string[];
  filter: FilterState;
  setFilter: (f: FilterState) => void;
  count: number;
}

/** 榜单筛选栏：搜索框 + 厂商/许可证下拉 + 计数 */
export default function FilterBar({ orgs, filter, setFilter, count }: FilterBarProps) {
  const inputStyle: React.CSSProperties = {
    appearance: 'none',
    border: '1px solid var(--ink)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface)',
    color: 'var(--ink)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    padding: '6px 10px',
  };

  return (
    <div className="filterbar" role="search" aria-label="榜单筛选">
      <input
        type="search"
        value={filter.query}
        onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        placeholder="搜索模型 / 厂商…"
        aria-label="搜索模型或厂商"
        style={{ ...inputStyle, width: 220 }}
      />
      <select
        value={filter.org}
        onChange={(e) => setFilter({ ...filter, org: e.target.value })}
        aria-label="按厂商筛选"
        style={{ ...inputStyle, cursor: 'pointer', maxWidth: 160 }}
      >
        <option value="">全部厂商</option>
        {orgs.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select
        value={filter.license}
        onChange={(e) => setFilter({ ...filter, license: e.target.value as FilterState['license'] })}
        aria-label="按许可证筛选"
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="all">全部</option>
        <option value="closed">闭源</option>
        <option value="open">开源</option>
      </select>
      <span className="label-caps filterbar__count" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
        共 {count} 个模型
      </span>
    </div>
  );
}
