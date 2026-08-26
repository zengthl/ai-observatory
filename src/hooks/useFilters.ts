import { useMemo, useState } from 'react';
import type { ModelMeta } from '../types';

export interface FilterState {
  query: string;
  org: string;
  license: 'all' | 'closed' | 'open';
}

/** 按关键词 / 厂商 / 许可证过滤榜单条目（query 匹配 display_name/org/model_id，大小写不敏感子串） */
export function applyFilters<T extends { model_id: string }>(
  entries: T[],
  models: Record<string, ModelMeta>,
  f: FilterState,
): T[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) => {
    const m = models[e.model_id];
    if (!m) return q === '';
    if (f.org !== '' && m.org !== f.org) return false;
    if (f.license !== 'all' && m.license !== f.license) return false;
    if (q !== '') {
      const hay = `${m.display_name} ${m.org} ${m.model_id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function useFilters<T extends { model_id: string }>(
  entries: T[],
  models: Record<string, ModelMeta>,
) {
  const [filter, setFilter] = useState<FilterState>({ query: '', org: '', license: 'all' });
  const orgs = useMemo(
    () => [...new Set(entries.map((e) => models[e.model_id]?.org).filter(Boolean))] as string[],
    [entries, models],
  );
  const filtered = useMemo(() => applyFilters(entries, models, filter), [entries, models, filter]);
  return { filtered, orgs, filter, setFilter };
}
