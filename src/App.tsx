import { useState } from 'react';
import { useBoardData } from './hooks/useBoardData';
import TopBar from './components/TopBar';
import HeroChampions from './components/HeroChampions';
import BoardTabs from './components/BoardTabs';
import ErrorState from './components/ErrorState';

export default function App() {
  const { loading, error, retry, latest, history } = useBoardData();
  const [tab, setTab] = useState<'llm' | 'agent'>('llm');
  void history; // Task 9-11 时间序列消费

  return (
    <>
      <TopBar date={latest?.date ?? ''} />
      <main className="page">
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading || !latest ? (
          <p style={{ padding: 48 }} className="label-caps">
            LOADING…
          </p>
        ) : (
          <>
            <HeroChampions latest={latest} />
            <BoardTabs tab={tab} onChange={setTab} />
            {/* Task 9-11 在此挂子榜单 */}
          </>
        )}
      </main>
    </>
  );
}
