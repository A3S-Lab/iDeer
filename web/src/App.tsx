import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamResearch } from './sse';
import { applyEvent, emptyTrace, ResearchTrace } from './types';

interface StatusResponse {
  ready: boolean;
  message: string;
}

export function App() {
  const [question, setQuestion] = useState('');
  const [trace, setTrace] = useState<ResearchTrace>(emptyTrace);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initial status check so users see a meaningful banner when LLM creds
  // aren't wired yet (rather than failing only at submit time).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/research/status')
      .then(res => res.json() as Promise<StatusResponse>)
      .then(data => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    const trimmed = question.trim();
    if (!trimmed || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTrace(emptyTrace());
    setRunning(true);
    try {
      for await (const event of streamResearch(trimmed, controller.signal)) {
        setTrace(prev => applyEvent(prev, event));
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      const message = err instanceof Error ? err.message : String(err);
      setTrace(prev => applyEvent(prev, { type: 'error', message }));
    } finally {
      setRunning(false);
    }
  }, [question, running]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTrace(emptyTrace());
    setRunning(false);
    setQuestion('');
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    },
    [submit],
  );

  const showWelcome = !running && !trace.answer && !trace.thinking && !trace.error;
  const modelLabel = useMemo(() => {
    if (!trace.model) return '';
    return `${trace.provider}/${trace.model}`;
  }, [trace.model, trace.provider]);

  return (
    <main className="app">
      <header className="app__header">
        <h1>🔍 深度研究</h1>
        {modelLabel && <span className="app__header__model">{modelLabel}</span>}
      </header>

      {status && !status.ready && (
        <div className="status">⚠️ {status.message}</div>
      )}

      <section className="composer">
        <textarea
          className="composer__textarea"
          placeholder="想研究什么？比如：分析 2026 年最具影响力的开源 AI 编译器项目并给出对比"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={running}
        />
        <div className="composer__row">
          <span className="composer__hint">⌘/Ctrl + Enter 提交</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={reset} disabled={running}>
              清空
            </button>
            {running ? (
              <button type="button" className="btn" onClick={stop}>
                停止
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={submit}
                disabled={!question.trim()}
              >
                开始研究
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="trace">
        {trace.webSearches.length > 0 && (
          <div>
            <p className="section-title">检索工具</p>
            {trace.webSearches.map((search, index) => (
              <div className="tool-card" key={`${search.query}-${index}`}>
                <div className="tool-card__title">
                  {running && search.resultCount === undefined ? (
                    <span className="spinner" />
                  ) : (
                    <span>✓</span>
                  )}
                  <strong>web_search</strong>
                  <span className="tool-card__query">{search.query || '(查询中…)'}</span>
                  {search.resultCount !== undefined && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {search.resultCount} 条结果
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {trace.thinking && (
          <div>
            <p className="section-title">推理</p>
            <div className="thinking">{trace.thinking}</div>
          </div>
        )}

        {trace.answer && (
          <div>
            <p className="section-title">研究结论</p>
            <article className="answer">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{trace.answer}</ReactMarkdown>
            </article>
          </div>
        )}

        {trace.citations.length > 0 && (
          <div>
            <p className="section-title">引用 ({trace.citations.length})</p>
            <div className="citations">
              <ol>
                {trace.citations.map((citation, index) => (
                  <li key={`${citation.url}-${index}`}>
                    <a href={citation.url} target="_blank" rel="noreferrer">
                      {citation.title}
                    </a>
                    {citation.citedText && (
                      <span className="citations__quote">"{citation.citedText}"</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {trace.usage && (
          <div className="usage">
            tokens: in {trace.usage.inputTokens} · out {trace.usage.outputTokens}
          </div>
        )}

        {trace.error && (
          <div className="status status--error">⚠️ {trace.error}</div>
        )}

        {showWelcome && (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '40px 0' }}>
            输入研究问题后，Agent 会自动检索网络并整理带引用的总结。
          </p>
        )}
      </div>
    </main>
  );
}
