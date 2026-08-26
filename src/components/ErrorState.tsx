interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <section className="error-state" role="alert">
      <div className="error-state__title">数据加载失败</div>
      <div className="error-state__message mono">{message}</div>
      <button type="button" className="error-state__retry" onClick={onRetry}>
        重试
      </button>
    </section>
  );
}
