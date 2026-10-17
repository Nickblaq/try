"use client";

import { useState, type ReactNode } from "react";

interface MemoryLogEntry {
  id: string;
  content: string;
  tier: "working" | "episodic" | "shared" | "held";
  agent: "researcher" | "synthesizer";
  persistence: number;
  scope: number;
}

interface SharedEntry {
  id: string;
  content: string;
  active: boolean;
  sourceAgent: "researcher" | "synthesizer";
  supersedes: string | null;
  supersededBy: string | null;
  promotedFrom: string | null;
  createdAt: string;
}

interface EpisodicEntry {
  id: string;
  content: string;
  retrievalCount: number;
  kappa: number;
  heldFromShared: boolean;
}

interface ApiResponse {
  finalOutput: string;
  memoryLog: MemoryLogEntry[];
  sharedMemory: SharedEntry[];
  episodicMemory: {
    researcher: EpisodicEntry[];
    synthesizer: EpisodicEntry[];
  };
}

export default function MemoryRunPanel() {
  const [task, setTask] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const data: ApiResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const workingEntries = result?.memoryLog.filter((e) => e.tier === "working") ?? [];
  const episodicResearcher = result?.episodicMemory.researcher ?? [];
  const episodicSynthesizer = result?.episodicMemory.synthesizer ?? [];
  const sharedEntries = result?.sharedMemory ?? [];

  return (
    <div className="panel">
      <header className="panelHeader">
        <h1>Memory runner</h1>
        <p>
          Run a task through the Researcher and Synthesizer. Observations are scored and
          routed live. Everything below reflects real model calls, real routing, and real
          disk writes.
        </p>
      </header>

      <div className="inputRow">
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter a research question..."
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading && task.trim().length > 0) run();
          }}
        />
        <button onClick={run} disabled={loading || task.trim().length === 0}>
          {loading ? "Running" : "Run"}
        </button>
      </div>

      {loading && (
        <div className="spinner" aria-label="Loading">
          <span />
          <span />
          <span />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <section className="answer">
            <p className="answerLabel">Final answer</p>
            <p className="answerBody">{result.finalOutput}</p>
          </section>

          <section className="columns">
            <Column
              title="Working memory"
              subtitle="discarded after this task"
              tone="working"
              count={workingEntries.length}
            >
              {workingEntries.length === 0 ? (
                <p className="empty">No items</p>
              ) : (
                workingEntries.map((e) => (
                  <Card
                    key={e.id}
                    persistence={e.persistence}
                    scope={e.scope}
                  >
                    {e.content}
                  </Card>
                ))
              )}
            </Column>

            <Column
              title="Episodic memory"
              subtitle="agent local, vectra"
              tone="episodic"
              count={episodicResearcher.length + episodicSynthesizer.length}
            >
              {episodicResearcher.length === 0 && episodicSynthesizer.length === 0 && (
                <p className="empty">No items</p>
              )}
              {episodicResearcher.length > 0 && (
                <Group label="Researcher">
                  {episodicResearcher.map((e) => (
                    <Card
                      key={e.id}
                      retrieval={`retrieved ${e.retrievalCount} of ${e.kappa}`}
                    >
                      {e.content}
                    </Card>
                  ))}
                </Group>
              )}
              {episodicSynthesizer.length > 0 && (
                <Group label="Synthesizer">
                  {episodicSynthesizer.map((e) => (
                    <Card
                      key={e.id}
                      retrieval={`retrieved ${e.retrievalCount} of ${e.kappa}`}
                    >
                      {e.content}
                    </Card>
                  ))}
                </Group>
              )}
            </Column>

            <Column
              title="Shared memory"
              subtitle="team wide, better sqlite3"
              tone="shared"
              count={sharedEntries.filter((e) => e.active).length}
            >
              {sharedEntries.length === 0 ? (
                <p className="empty">No items</p>
              ) : (
                sharedEntries.map((e) => (
                  <Card
                    key={e.id}
                    superseded={!e.active}
                    tags={[
                      e.supersededBy ? `superseded by ${e.supersededBy}` : null,
                      e.supersedes ? `supersedes ${e.supersedes}` : null,
                      e.promotedFrom ? `promoted from ${e.promotedFrom}` : null,
                    ].filter((t): t is string => Boolean(t))}
                  >
                    {e.content}
                  </Card>
                ))
              )}
            </Column>
          </section>

          <section className="trace">
            <p className="traceLabel">Decision trace</p>
            <ol>
              {result.memoryLog.map((e) => (
                <li key={e.id}>
                  {e.agent} → {e.tier} (p={e.persistence.toFixed(2)}, s=
                  {e.scope.toFixed(2)})
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      <style jsx>{`
        .panel {
          --paper: #faf9f6;
          --ink: #1c1f1d;
          --ink-soft: #52584f;
          --line: #d9dbd3;
          --working: #80857a;
          --episodic: #2f6b47;
          --shared: #a63b2e;
          --amber: #b9791f;

          max-width: 960px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3rem;
          background: var(--paper);
          color: var(--ink);
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
            sans-serif;
        }
        .panelHeader h1 {
          font-size: 1.5rem;
          font-weight: 650;
          margin: 0 0 0.5rem;
          letter-spacing: -0.01em;
        }
        .panelHeader p {
          margin: 0 0 1.5rem;
          max-width: 62ch;
          color: var(--ink-soft);
          font-size: 0.92rem;
          line-height: 1.55;
        }
        .inputRow {
          display: flex;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .inputRow input {
          flex: 1;
          padding: 0.6rem 0.8rem;
          border: 1px solid var(--line);
          border-radius: 4px;
          background: #ffffff;
          color: var(--ink);
          font-family: inherit;
          font-size: 0.9rem;
        }
        .inputRow input:focus {
          outline: 2px solid var(--amber);
          outline-offset: -1px;
          border-color: transparent;
        }
        .inputRow button {
          padding: 0.6rem 1.2rem;
          border: 1px solid var(--ink);
          border-radius: 4px;
          background: var(--ink);
          color: #ffffff;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
        }
        .inputRow button:hover:not(:disabled) {
          background: #000000;
        }
        .inputRow button:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .spinner {
          display: flex;
          gap: 0.35rem;
          margin: 1.25rem 0;
          justify-content: center;
        }
        .spinner span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--amber);
          animation: pulse 1s ease-in-out infinite;
        }
        .spinner span:nth-child(2) { animation-delay: 0.15s; }
        .spinner span:nth-child(3) { animation-delay: 0.3s; }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .error {
          color: #a63b2e;
          font-size: 0.85rem;
          margin: 0 0 1rem;
        }
        .answer {
          border: 1px solid #e2e4dd;
          background: #ffffff;
          border-radius: 4px;
          padding: 1rem 1.1rem;
          margin: 1rem 0 1.25rem;
        }
        .answerLabel {
          margin: 0 0 0.5rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: var(--ink-soft);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .answerBody {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.6;
          max-width: 62ch;
          white-space: pre-wrap;
        }
        .columns {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.85rem;
          margin: 0 0 1.25rem;
          align-items: start;
        }
        @media (max-width: 720px) {
          .columns { grid-template-columns: 1fr; }
        }
        .trace {
          border-top: 1px solid #e2e4dd;
          padding-top: 0.75rem;
          margin-top: 0.5rem;
        }
        .traceLabel {
          margin: 0 0 0.4rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: var(--ink-soft);
        }
        .trace ol {
          margin: 0;
          padding-left: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          max-height: 7rem;
          overflow-y: auto;
        }
        .trace li {
          font-size: 0.72rem;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          color: #70756a;
          line-height: 1.5;
        }
        .empty {
          margin: 0;
          font-size: 0.72rem;
          color: #9a9d93;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

function Column({
  title,
  subtitle,
  tone,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "working" | "episodic" | "shared";
  count: number;
  children: ReactNode;
}) {
  return (
    <div className={`column column-${tone}`}>
      <div className="columnHead">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="count">{count}</span>
      </div>
      <div className="columnBody">{children}</div>
      <style jsx>{`
        .column {
          border-radius: 4px;
          padding: 0.85rem 0.85rem 0.9rem;
          min-height: 12rem;
        }
        .column-working {
          background: #f6f6f3;
          border: 1px dashed #c7c9c0;
        }
        .column-episodic {
          background: #eef4f0;
          border: 1px solid #d3e2d8;
        }
        .column-shared {
          background: #f6edea;
          border: 1px solid #e3cfc9;
        }
        .columnHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.65rem;
        }
        .columnHead h2 {
          margin: 0;
          font-size: 0.86rem;
          font-weight: 650;
        }
        .columnHead p {
          margin: 0.1rem 0 0;
          font-size: 0.68rem;
          color: #70756a;
        }
        .count {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.72rem;
          color: #52584f;
          background: #ffffffaa;
          border-radius: 3px;
          padding: 0.05rem 0.4rem;
        }
        .columnBody {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="ownerLabel">{label}</p>
      <div className="ownerItems">{children}</div>
      <style jsx>{`
        .ownerLabel {
          margin: 0 0 0.35rem;
          font-size: 0.65rem;
          color: #70756a;
          font-weight: 600;
        }
        .ownerItems {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          margin-bottom: 0.4rem;
        }
      `}</style>
    </div>
  );
}

function Card({
  children,
  persistence,
  scope,
  retrieval,
  superseded,
  tags,
}: {
  children: ReactNode;
  persistence?: number;
  scope?: number;
  retrieval?: string;
  superseded?: boolean;
  tags?: string[];
}) {
  return (
    <div className={`card ${superseded ? "cardSuperseded" : ""}`}>
      <p className="content">{children}</p>
      {typeof persistence === "number" && (
        <p className="meta">
          persistence {persistence.toFixed(2)}, scope {scope?.toFixed(2) ?? "0.00"}
        </p>
      )}
      {retrieval && <p className="retrieval">{retrieval}</p>}
      {tags && tags.length > 0 && (
        <div className="tags">
          {tags.map((t, i) => (
            <span key={i} className="tag">
              {t}
            </span>
          ))}
        </div>
      )}
      <style jsx>{`
        .card {
          background: #ffffff;
          border: 1px solid #e6e4da;
          border-radius: 3px;
          padding: 0.55rem 0.65rem;
        }
        .cardSuperseded {
          opacity: 0.55;
        }
        .cardSuperseded .content {
          text-decoration: line-through;
          text-decoration-color: #a63b2e88;
        }
        .content {
          margin: 0;
          font-size: 0.78rem;
          line-height: 1.4;
        }
        .meta {
          margin: 0.3rem 0 0;
          font-size: 0.64rem;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          color: #8a8f87;
        }
        .retrieval {
          margin: 0.3rem 0 0;
          font-size: 0.64rem;
          color: #2f6b47;
        }
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
          margin-top: 0.35rem;
        }
        .tag {
          font-size: 0.62rem;
          color: #a63b2e;
          background: #a63b2e14;
          border-radius: 3px;
          padding: 0.05rem 0.4rem;
        }
      `}</style>
    </div>
  );
}
