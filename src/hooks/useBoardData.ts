import { useCallback, useEffect, useState } from 'react';
import type { History, LatestFile } from '../types';

interface BoardData {
  loading: boolean;
  error: string | null;
  retry: () => void;
  latest: LatestFile | null;
  history: History | null;
}

export function useBoardData(): BoardData {
  const [state, setState] = useState<Omit<BoardData, 'retry'>>({
    loading: true,
    error: null,
    latest: null,
    history: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.all([
      fetch(import.meta.env.BASE_URL + 'data/latest.json'),
      fetch(import.meta.env.BASE_URL + 'data/history.json'),
    ])
      .then(async ([l, h]) => {
        if (!l.ok) throw new Error(`latest.json HTTP ${l.status}`);
        const latest = (await l.json()) as LatestFile;
        const history = h.ok ? ((await h.json()) as History) : {};
        if (!alive) return;
        setState({ loading: false, error: null, latest, history });
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

  return { ...state, retry };
}
