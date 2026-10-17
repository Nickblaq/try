"use client";

import { useState } from "react";

interface MemoryLogEntry {
    id: string;
    content: string;
    tier: string;
    agent: string;
    persistence: number;
    scope: number;
}

interface SharedMemoryEntry {
    id: string;
    content: string;
    active: boolean;
    sourceAgent: string;
    supersedes: string | null;
    supersededBy: string | null;
    promotedFrom: string | null;
    createdAt: string;
}

interface EpisodicMemoryEntry {
    id: string;
    content: string;
    retrievalCount: number;
    kappa: number;
    heldFromShared: boolean;
}

interface RunResult {
    finalOutput: string;
    memoryLog: MemoryLogEntry[];
    sharedMemory: SharedMemoryEntry[];
    episodicMemory: {
        researcher: EpisodicMemoryEntry[];
        synthesizer: EpisodicMemoryEntry[];
    };
}

function formatScore(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export default function MemoryRunPanel() {
    const [task, setTask] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RunResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const canRun = !loading && task.trim().length > 0;

    async function run() {
        if (!canRun) {
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/memory", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task }),
            });
            const payload = (await response.json().catch(() => null)) as
                | (RunResult & { error?: string })
                | null;

            if (!response.ok) {
                throw new Error(payload?.error ?? `run failed (${response.status})`);
            }
            if (!payload) {
                throw new Error("run failed (empty response)");
            }
            setResult(payload);
        } catch (runError) {
            setResult(null);
            setError(runError instanceof Error ? runError.message : "run failed");
        } finally {
            setLoading(false);
        }
    }

    const workingEntries = result ? result.memoryLog.filter((entry) => entry.tier === "working") : [];
    const researcherEpisodic = result ? result.episodicMemory.researcher : [];
    const synthesizerEpisodic = result ? result.episodicMemory.synthesizer : [];

    return (
        <section className="panel">
            <header className="panel-header">
                <h1>Hierarchical Memory Run</h1>
                <p>
                    One researcher and one synthesizer work the task in sequence. Each observation is scored on
                    persistence and scope, then routed to working, episodic, shared, or held memory.
                </p>
            </header>

            <div className="controls">
                <input
                    aria-label="Task"
                    className="task-input"
                    value={task}
                    onChange={(event) => setTask(event.target.value)}
                    placeholder="Describe the task for the agents"
                    disabled={loading}
                />
                <button type="button" className="run-button" onClick={run} disabled={!canRun}>
                    {loading ? "Running" : "Run"}
                </button>
            </div>

            {loading ? (
                <div className="spinner" aria-label="Running">
                    <span />
                    <span />
                    <span />
                </div>
            ) : null}

            {error ? <p className="error">{error}</p> : null}

            {result ? (
                <div className="result">
                    <p className="final-output">{result.finalOutput}</p>

                    <div className="columns">
                        <div className="column column-working">
                            <h2>Working</h2>
                            {workingEntries.length === 0 ? (
                                <p className="empty">Nothing stayed transient.</p>
                            ) : (
                                workingEntries.map((entry) => (
                                    <article key={entry.id} className="card">
                                        <p className="card-content">{entry.content || "(no content)"}</p>
                                        <p className="meta">
                                            {entry.agent} · p {formatScore(entry.persistence)} · s{" "}
                                            {formatScore(entry.scope)}
                                        </p>
                                    </article>
                                ))
                            )}
                        </div>

                        <div className="column column-episodic">
                            <h2>Episodic</h2>
                            <h3>Researcher</h3>
                            {researcherEpisodic.length === 0 ? (
                                <p className="empty">No researcher entries.</p>
                            ) : (
                                researcherEpisodic.map((entry) => (
                                    <article key={entry.id} className="card">
                                        <p className="card-content">{entry.content || "(no content)"}</p>
                                        <p className="meta">
                                            retrieved {entry.retrievalCount}/{entry.kappa}
                                            {entry.heldFromShared ? " · held from shared" : ""}
                                        </p>
                                    </article>
                                ))
                            )}

                            <h3>Synthesizer</h3>
                            {synthesizerEpisodic.length === 0 ? (
                                <p className="empty">No synthesizer entries.</p>
                            ) : (
                                synthesizerEpisodic.map((entry) => (
                                    <article key={entry.id} className="card">
                                        <p className="card-content">{entry.content || "(no content)"}</p>
                                        <p className="meta">
                                            retrieved {entry.retrievalCount}/{entry.kappa}
                                            {entry.heldFromShared ? " · held from shared" : ""}
                                        </p>
                                    </article>
                                ))
                            )}
                        </div>

                        <div className="column column-shared">
                            <h2>Shared</h2>
                            {result.sharedMemory.length === 0 ? (
                                <p className="empty">Nothing confirmed yet.</p>
                            ) : (
                                result.sharedMemory.map((entry) => (
                                    <article
                                        key={entry.id}
                                        className={entry.active ? "card" : "card card-inactive"}
                                    >
                                        <p className="card-content">{entry.content || "(no content)"}</p>
                                        <p className="meta">
                                            {entry.sourceAgent} · {new Date(entry.createdAt).toLocaleString()}
                                        </p>
                                        <div className="tags">
                                            {entry.promotedFrom ? <span className="tag tag-promoted">promoted</span> : null}
                                            {entry.supersededBy ? (
                                                <span className="tag tag-superseded">
                                                    superseded by {entry.supersededBy.slice(0, 8)}
                                                </span>
                                            ) : null}
                                        </div>
                                    </article>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="trace">
                        <h2>Decision trace</h2>
                        <ul>
                            {result.memoryLog.map((entry) => (
                                <li key={entry.id}>
                                    <span className="trace-id">{entry.id.slice(0, 8)}</span>
                                    <span className={`trace-tier tier-${entry.tier}`}>{entry.tier}</span>
                                    <span className="trace-score">
                                        p {formatScore(entry.persistence)} · s {formatScore(entry.scope)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                .panel {
                    background-color: #f7f2e7;
                    color: #2e2a25;
                    border: 1px solid #e2d9c8;
                    border-radius: 14px;
                    padding: 28px;
                    font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
                }

                .panel-header h1 {
                    margin: 0 0 8px;
                    font-size: 1.35rem;
                    font-weight: 600;
                    letter-spacing: 0.01em;
                }

                .panel-header p {
                    margin: 0;
                    color: #6f685c;
                    font-size: 0.9rem;
                    line-height: 1.65;
                    max-width: 58ch;
                }

                .controls {
                    display: flex;
                    gap: 10px;
                    margin: 20px 0 8px;
                }

                .task-input {
                    flex: 1;
                    background: #fffdf8;
                    border: 1px solid #ddd3c1;
                    border-radius: 9px;
                    padding: 11px 13px;
                    font-size: 0.92rem;
                    color: #2e2a25;
                    font-family: inherit;
                }

                .task-input:focus {
                    outline: 2px solid #b9d3ce;
                    outline-offset: 1px;
                }

                .run-button {
                    background: #35746e;
                    color: #fbf8f1;
                    border: none;
                    border-radius: 9px;
                    padding: 11px 22px;
                    font-size: 0.9rem;
                    font-family: inherit;
                    cursor: pointer;
                }

                .run-button:disabled {
                    background: #cfc7b8;
                    color: #fbf8f1;
                    cursor: not-allowed;
                }

                .spinner {
                    display: flex;
                    gap: 6px;
                    padding: 14px 2px;
                }

                .spinner span {
                    width: 7px;
                    height: 7px;
                    border-radius: 50%;
                    background: #c8871f;
                    animation: pulse 1.1s ease-in-out infinite;
                }

                .spinner span:nth-child(2) {
                    animation-delay: 0.16s;
                }

                .spinner span:nth-child(3) {
                    animation-delay: 0.32s;
                }

                @keyframes pulse {
                    0%,
                    100% {
                        opacity: 0.25;
                        transform: translateY(0);
                    }
                    50% {
                        opacity: 1;
                        transform: translateY(-3px);
                    }
                }

                .error {
                    margin: 10px 0 0;
                    color: #a4534c;
                    font-size: 0.9rem;
                }

                .final-output {
                    font-size: 0.95rem;
                    line-height: 1.85;
                    margin: 22px 0 26px;
                    color: #2e2a25;
                    white-space: pre-wrap;
                }

                .columns {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 16px;
                }

                .column {
                    background: #fffdf8;
                    border: 1px solid #e5dccb;
                    border-radius: 11px;
                    padding: 15px;
                    min-width: 0;
                }

                .column h2 {
                    margin: 0 0 10px;
                    font-size: 0.82rem;
                    text-transform: uppercase;
                    letter-spacing: 0.09em;
                    font-weight: 600;
                }

                .column h3 {
                    margin: 12px 0 8px;
                    font-size: 0.74rem;
                    text-transform: uppercase;
                    letter-spacing: 0.07em;
                    font-weight: 600;
                    color: #857f74;
                }

                .column-working h2 {
                    color: #8b877f;
                }

                .column-episodic h2 {
                    color: #35746e;
                }

                .column-shared h2 {
                    color: #a4534c;
                }

                .card {
                    border: 1px solid #eae2d3;
                    border-radius: 8px;
                    padding: 9px 11px;
                    margin-bottom: 9px;
                    background: #fdfbf5;
                }

                .card-inactive .card-content {
                    text-decoration: line-through;
                    color: #9b948a;
                }

                .card-content {
                    margin: 0 0 6px;
                    font-size: 0.84rem;
                    line-height: 1.55;
                    word-break: break-word;
                }

                .meta {
                    margin: 0;
                    font-size: 0.71rem;
                    color: #9a9488;
                }

                .tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-top: 7px;
                }

                .tag {
                    font-size: 0.66rem;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    padding: 2px 7px;
                    border-radius: 999px;
                }

                .tag-promoted {
                    background: #e7f0ee;
                    color: #35746e;
                }

                .tag-superseded {
                    background: #f6e7e4;
                    color: #a4534c;
                }

                .empty {
                    margin: 0;
                    font-size: 0.78rem;
                    color: #a9a294;
                    font-style: italic;
                }

                .trace {
                    margin-top: 26px;
                    border-top: 1px dashed #ddd3c1;
                    padding-top: 16px;
                }

                .trace h2 {
                    margin: 0 0 10px;
                    font-size: 0.82rem;
                    text-transform: uppercase;
                    letter-spacing: 0.09em;
                    font-weight: 600;
                    color: #6f685c;
                }

                .trace ul {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                }

                .trace li {
                    display: flex;
                    align-items: baseline;
                    gap: 10px;
                    padding: 5px 0;
                    font-size: 0.78rem;
                    border-bottom: 1px dotted #e7ded0;
                }

                .trace-id {
                    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
                    color: #857f74;
                    font-size: 0.72rem;
                }

                .trace-tier {
                    font-size: 0.7rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                }

                .tier-working {
                    color: #8b877f;
                }

                .tier-episodic {
                    color: #35746e;
                }

                .tier-shared {
                    color: #a4534c;
                }

                .tier-held {
                    color: #b07d33;
                }

                .trace-score {
                    margin-left: auto;
                    color: #9a9488;
                    font-size: 0.72rem;
                }

                @media (max-width: 820px) {
                    .columns {
                        grid-template-columns: 1fr;
                    }

                    .controls {
                        flex-direction: column;
                    }
                }
            `}</style>
        </section>
    );
}
