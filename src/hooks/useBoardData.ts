import { useCallback, useEffect, useState } from 'react';
import type { History, LatestFile } from '../types';

interface BoardData {
  loading: boolean;
  error: string | null;
  retry: () => void;
  latest: LatestFile | null;
  history: History | null;
  /** pending.json 待收录模型名数量；加载失败（文件缺失等）静默为 0 */
  pendingCount: number;
  /** pending names 被截断时的全量总数 */
  pendingTotal?: number;
}

export function useBoardData(): BoardData {
  const [state, setState] = useState<Omit<BoardData, 'retry' | 'pendingTotal'>>({
    loading: true,
    error: null,
    latest: null,
    history: null,
    pendingCount: 0,
  });
  const [pendingTotal, setPendingTotal] = useState<number | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([
      fetch(import.meta.env.BASE_URL + 'data/latest.json'),
      fetch(import.meta.env.BASE_URL + 'data/history.json'),
      // pending.json 是透明度提示，非关键数据：失败静默降级为 0
      fetch(import.meta.env.BASE_URL + 'data/pending.json'),
    ])
      .then(async ([l, h, p]) => {
        if (!l.ok) throw new Error(`latest.json HTTP ${l.status}`);
        const latest = (await l.json()) as LatestFile;
        const history = h.ok ? ((await h.json()) as History) : {};
        let pendingCount = 0;
        let total: number | undefined;
        if (p.ok) {
          try {
            const pending = (await p.json()) as { names?: unknown; total?: unknown };
            if (Array.isArray(pending.names)) pendingCount = pending.names.length;
            if (typeof pending.total === 'number') total = pending.total;
          } catch {
            /* 损坏的 pending.json 不影响主数据 */
          }
        }
        if (!alive) return;
        setState({ loading: false, error: null, latest, history, pendingCount });
        setPendingTotal(total);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  return { ...state, retry, pendingTotal };
}
