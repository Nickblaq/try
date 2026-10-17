"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * HierarchicalMemoryDemo
 *
 * A standalone, self contained demo of the routing function, memory tiers,
 * confirmation gate, promotion, and supersession mechanisms described in
 * Chapter Three. Nothing here calls a real model or a real database: the
 * whole run is a scripted timeline, replayed step by step, so the mechanism
 * itself is what is on display rather than any particular benchmark result.
 *
 * Drop this file into a Next.js app (app router or pages router, Next 13+)
 * and render <HierarchicalMemoryDemo /> on any page. No extra dependencies.
 */

type AgentId = "researcher" | "synthesizer";

type Action =
  | {
      kind: "route";
      id: string;
      agent: AgentId;
      content: string;
      persistence: number;
      scope: number;
      decision: "working" | "episodic";
    }
  | {
      kind: "routeShared";
      id: string;
      agent: AgentId;
      content: string;
      persistence: number;
      scope: number;
      confirmedBy: AgentId;
      supersedes?: string;
    }
  | {
      kind: "routeHeld";
      id: string;
      agent: AgentId;
      content: string;
      persistence: number;
      scope: number;
      declinedBy: AgentId;
    }
  | { kind: "retrieve"; id: string; agent: AgentId; kappa: number }
  | { kind: "promote"; id: string; agent: AgentId; newId: string; confirmedBy: AgentId };

interface ScriptStep {
  agent: AgentId;
  thought: string;
  action?: Action;
}

interface MemoryCardData {
  id: string;
  content: string;
  persistence?: number;
  scope?: number;
  owner?: AgentId;
  active?: boolean;
  supersedes?: string;
  supersededBy?: string;
  retrievalCount?: number;
  kappa?: number;
  promotedFrom?: string;
  heldFromShared?: boolean;
}

const AGENT_LABEL: Record<AgentId, string> = {
  researcher: "Researcher",
  synthesizer: "Synthesizer",
};

// The scripted run. Twelve steps, covering every mechanism in Chapter Three:
// working memory, episodic memory for both agents, a confirmed shared write,
// a shared write that supersedes an earlier one, repeated retrieval building
// toward the promotion threshold, and the promotion itself.
const SCRIPT: ScriptStep[] = [
  {
    agent: "researcher",
    thought: "Pulling results for query: remote work productivity, 2023 studies",
    action: {
      kind: "route",
      id: "m1",
      agent: "researcher",
      content: "Search returned 14 results for 2023 productivity studies",
      persistence: 0.14,
      scope: 0.1,
      decision: "working",
    },
  },
  {
    agent: "researcher",
    thought: "Reading source: Stanford remote work study",
    action: {
      kind: "routeShared",
      id: "s1",
      agent: "researcher",
      content: "Stanford 2023 study found a 13 percent productivity increase among remote workers",
      persistence: 0.88,
      scope: 0.84,
      confirmedBy: "synthesizer",
    },
  },
  {
    agent: "synthesizer",
    thought: "Noting source reliability before citing the Stanford study",
    action: {
      kind: "route",
      id: "e1",
      agent: "synthesizer",
      content: "Stanford working paper series carries high citation weight in this field",
      persistence: 0.72,
      scope: 0.15,
      decision: "episodic",
    },
  },
  {
    agent: "researcher",
    thought: "Logging session search filter",
    action: {
      kind: "route",
      id: "m2",
      agent: "researcher",
      content: "Filter set to peer reviewed sources only for this session",
      persistence: 0.18,
      scope: 0.09,
      decision: "working",
    },
  },
  {
    agent: "synthesizer",
    thought: "Drafting summary, citing the Stanford note again",
    action: { kind: "retrieve", id: "e1", agent: "synthesizer", kappa: 5 },
  },
  {
    agent: "researcher",
    thought: "Reading source: MIT remote work follow up study",
    action: {
      kind: "routeShared",
      id: "s2",
      agent: "researcher",
      content: "MIT 2024 follow up study revises the productivity gain down to 8 percent",
      persistence: 0.89,
      scope: 0.85,
      confirmedBy: "synthesizer",
      supersedes: "s1",
    },
  },
  {
    agent: "synthesizer",
    thought: "Reconciling the two studies, rechecking the Stanford note",
    action: { kind: "retrieve", id: "e1", agent: "synthesizer", kappa: 5 },
  },
  {
    agent: "researcher",
    thought: "Verifying MIT author credentials",
    action: {
      kind: "route",
      id: "e2",
      agent: "researcher",
      content: "MIT authors have a prior publication on hybrid work arrangements",
      persistence: 0.65,
      scope: 0.2,
      decision: "episodic",
    },
  },
  {
    agent: "synthesizer",
    thought: "Citing the Stanford note a third time in the draft",
    action: { kind: "retrieve", id: "e1", agent: "synthesizer", kappa: 5 },
  },
  {
    agent: "synthesizer",
    thought: "Citing the Stanford note again while finalizing the draft",
    action: { kind: "retrieve", id: "e1", agent: "synthesizer", kappa: 5 },
  },
  {
    agent: "synthesizer",
    thought: "This note keeps coming up, citing it once more",
    action: { kind: "promote", id: "e1", agent: "synthesizer", newId: "s3", confirmedBy: "researcher" },
  },
  {
    agent: "researcher",
    thought: "Finalizing synthesis handoff",
    action: {
      kind: "route",
      id: "m3",
      agent: "researcher",
      content: "Draft ready for final review",
      persistence: 0.1,
      scope: 0.05,
      decision: "working",
    },
  },
];

const THETA_P = 0.4;
const THETA_S = 0.55;

function computeState(upTo: number) {
  const working: MemoryCardData[] = [];
  const episodic: Record<AgentId, MemoryCardData[]> = { researcher: [], synthesizer: [] };
  const shared: MemoryCardData[] = [];
  const log: string[] = [];

  for (let i = 0; i <= upTo && i < SCRIPT.length; i++) {
    const action = SCRIPT[i].action;
    if (!action) continue;

    if (action.kind === "route") {
      const card: MemoryCardData = {
        id: action.id,
        content: action.content,
        persistence: action.persistence,
        scope: action.scope,
        owner: action.agent,
        retrievalCount: action.decision === "episodic" ? 0 : undefined,
        kappa: action.decision === "episodic" ? 5 : undefined,
      };
      if (action.decision === "working") {
        working.unshift(card);
        log.push(`m${i + 1}: routed to working memory, discarded after this task`);
      } else {
        episodic[action.agent].unshift(card);
        log.push(`m${i + 1}: routed to episodic memory, owned by ${AGENT_LABEL[action.agent]}`);
      }
    }

    if (action.kind === "routeShared") {
      if (action.supersedes) {
        const prior = shared.find((c) => c.id === action.supersedes);
        if (prior) {
          prior.active = false;
          prior.supersededBy = action.id;
        }
        log.push(`${action.id}: confirmed by ${AGENT_LABEL[action.confirmedBy]}, supersedes ${action.supersedes}`);
      } else {
        log.push(`${action.id}: confirmed by ${AGENT_LABEL[action.confirmedBy]}, written to shared memory`);
      }
      shared.unshift({
        id: action.id,
        content: action.content,
        persistence: action.persistence,
        scope: action.scope,
        active: true,
        owner: action.agent,
        supersedes: action.supersedes,
      });
    }

    if (action.kind === "routeHeld") {
      episodic[action.agent].unshift({
        id: action.id,
        content: action.content,
        persistence: action.persistence,
        scope: action.scope,
        owner: action.agent,
        retrievalCount: 0,
        kappa: 5,
        heldFromShared: true,
      });
      log.push(`${action.id}: declined by ${AGENT_LABEL[action.declinedBy]}, held in episodic memory instead`);
    }

    if (action.kind === "retrieve") {
      const item = episodic[action.agent].find((c) => c.id === action.id);
      if (item) {
        item.retrievalCount = (item.retrievalCount ?? 0) + 1;
        log.push(`${action.id}: retrieved by ${AGENT_LABEL[action.agent]} (${item.retrievalCount} of ${action.kappa})`);
      }
    }

    if (action.kind === "promote") {
      const idx = episodic[action.agent].findIndex((c) => c.id === action.id);
      if (idx >= 0) {
        const [item] = episodic[action.agent].splice(idx, 1);
        shared.unshift({
          ...item,
          id: action.newId,
          active: true,
          promotedFrom: action.id,
          retrievalCount: undefined,
          kappa: undefined,
        });
        log.push(`${action.id}: reached its retrieval threshold, confirmed by ${AGENT_LABEL[action.confirmedBy]}, promoted to shared memory as ${action.newId}`);
      }
    }
  }

  return { working, episodic, shared, log };
}

type Phase = "thinking" | "scoring" | "confirming" | "settled";

export default function HierarchicalMemoryDemo() {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [phase, setPhase] = useState<Phase>("thinking");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = SCRIPT[stepIndex];
  const state = useMemo(() => computeState(stepIndex), [stepIndex]);

  const needsConfirmation =
    step.action?.kind === "routeShared" || step.action?.kind === "routeHeld" || step.action?.kind === "promote";
  const hasScoring = step.action?.kind === "route" || step.action?.kind === "routeShared" || step.action?.kind === "routeHeld";

  // Drive the thinking, then scoring, then confirming, then settled sequence
  // whenever the current step changes.
  useEffect(() => {
    setPhase("thinking");
    const t1 = setTimeout(() => setPhase(hasScoring ? "scoring" : "settled"), 500);
    const t2 = hasScoring
      ? setTimeout(() => setPhase(needsConfirmation ? "confirming" : "settled"), 1300)
      : null;
    const t3 = needsConfirmation ? setTimeout(() => setPhase("settled"), 2200) : null;
    return () => {
      clearTimeout(t1);
      if (t2) clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Autoplay.
  useEffect(() => {
    if (!isPlaying) return;
    const settleDelay = needsConfirmation ? 2200 : hasScoring ? 1300 : 500;
    timeoutRef.current = setTimeout(() => {
      setStepIndex((i) => (i + 1 < SCRIPT.length ? i + 1 : i));
      if (stepIndex + 1 >= SCRIPT.length) setIsPlaying(false);
    }, settleDelay + 1100);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, isPlaying]);

  function goTo(i: number) {
    setIsPlaying(false);
    setStepIndex(Math.max(0, Math.min(SCRIPT.length - 1, i)));
  }

  function restart() {
    setStepIndex(0);
    setIsPlaying(true);
  }

  const currentAction = step.action;
  const decisionLabel = useMemo(() => {
    if (!currentAction) return null;
    if (currentAction.kind === "route") return currentAction.decision;
    if (currentAction.kind === "routeShared") return "shared";
    if (currentAction.kind === "routeHeld") return "held";
    if (currentAction.kind === "promote") return "promoted";
    return null;
  }, [currentAction]);

  return (
    <div className="deck">
      <header className="deckHeader">
        <h1>Live routing manifest</h1>
        <p>
          A scripted walk through the routing function, the confirmation gate, promotion, and
          supersession, exactly as specified in Chapter Three. Nothing below is a real model call;
          the sequence is fixed so the mechanism is what is on display.
        </p>
      </header>

      <section className="agents">
        <AgentPanel
          id="researcher"
          active={step.agent === "researcher"}
          thought={step.agent === "researcher" ? step.thought : undefined}
        />
        <div className="handoff" aria-hidden="true">
          <span className="handoffLine" />
          <span className="handoffLabel">task handoff</span>
        </div>
        <AgentPanel
          id="synthesizer"
          active={step.agent === "synthesizer"}
          thought={step.agent === "synthesizer" ? step.thought : undefined}
        />
      </section>

      <RoutingPanel
        step={step}
        phase={phase}
        decisionLabel={decisionLabel}
        stepNumber={stepIndex + 1}
      />

      <section className="tiers">
        <TierColumn
          title="Working memory"
          subtitle="discarded after this task"
          tone="working"
          count={state.working.length}
        >
          {state.working.map((c) => (
            <MemoryCard key={c.id} data={c} tone="working" />
          ))}
          {state.working.length === 0 && <EmptyNote text="No items yet" />}
        </TierColumn>

        <TierColumn
          title="Episodic memory"
          subtitle="agent local, vectra"
          tone="episodic"
          count={state.episodic.researcher.length + state.episodic.synthesizer.length}
        >
          {[...state.episodic.researcher, ...state.episodic.synthesizer].length === 0 && (
            <EmptyNote text="No items yet" />
          )}
          {state.episodic.researcher.length > 0 && (
            <OwnerGroup label="Researcher">
              {state.episodic.researcher.map((c) => (
                <MemoryCard key={c.id} data={c} tone="episodic" />
              ))}
            </OwnerGroup>
          )}
          {state.episodic.synthesizer.length > 0 && (
            <OwnerGroup label="Synthesizer">
              {state.episodic.synthesizer.map((c) => (
                <MemoryCard key={c.id} data={c} tone="episodic" />
              ))}
            </OwnerGroup>
          )}
        </TierColumn>

        <TierColumn
          title="Shared memory"
          subtitle="team wide, better sqlite3"
          tone="shared"
          count={state.shared.filter((c) => c.active).length}
        >
          {state.shared.length === 0 && <EmptyNote text="No items yet" />}
          {state.shared.map((c) => (
            <MemoryCard key={c.id} data={c} tone="shared" />
          ))}
        </TierColumn>
      </section>

      <Transcript log={state.log} />

      <PlaybackControls
        stepIndex={stepIndex}
        total={SCRIPT.length}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying((p) => !p)}
        onStep={(dir) => goTo(stepIndex + dir)}
        onRestart={restart}
        onScrub={goTo}
      />

      <style jsx>{`
        .deck {
          --paper: #faf9f6;
          --ink: #1c1f1d;
          --ink-soft: #52584f;
          --line: #d9dbd3;
          --working: #80857a;
          --working-bg: #f1f1ed;
          --episodic: #2f6b47;
          --episodic-bg: #eaf2ec;
          --shared: #a63b2e;
          --shared-bg: #f6ece9;
          --amber: #b9791f;
          --amber-bg: #faf0dd;

          max-width: 960px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 3rem;
          background: var(--paper);
          color: var(--ink);
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        }

        .deckHeader h1 {
          font-size: 1.5rem;
          font-weight: 650;
          margin: 0 0 0.5rem;
          letter-spacing: -0.01em;
        }

        .deckHeader p {
          margin: 0 0 1.75rem;
          max-width: 62ch;
          color: var(--ink-soft);
          font-size: 0.92rem;
          line-height: 1.55;
        }

        .agents {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 0.75rem;
          align-items: stretch;
          margin-bottom: 1.25rem;
        }

        .handoff {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.3rem;
          padding: 0 0.25rem;
        }

        .handoffLine {
          width: 2.25rem;
          height: 1px;
          background: var(--line);
        }

        .handoffLabel {
          font-size: 0.66rem;
          color: var(--ink-soft);
          white-space: nowrap;
        }

        .tiers {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.85rem;
          margin: 1.25rem 0;
          align-items: start;
        }

        @media (max-width: 720px) {
          .agents {
            grid-template-columns: 1fr;
          }
          .handoff {
            flex-direction: row;
            padding: 0.25rem 0;
          }
          .handoffLine {
            width: 1px;
            height: 1.25rem;
          }
          .tiers {
            grid-template-columns: 1fr;
          }
        }

        :global(.deck *) {
          box-sizing: border-box;
        }

        :global(.deck button:focus-visible) {
          outline: 2px solid var(--amber);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}

function AgentPanel({
  id,
  active,
  thought,
}: {
  id: AgentId;
  active: boolean;
  thought?: string;
}) {
  return (
    <div className={`panel ${active ? "panelActive" : ""}`}>
      <div className="panelHead">
        <span className="dot" />
        <span className="panelTitle">{AGENT_LABEL[id]}</span>
      </div>
      <p className="panelThought">{thought ?? "Idle, waiting for its turn"}</p>

      <style jsx>{`
        .panel {
          border: 1px solid #e2e4dd;
          border-radius: 4px;
          background: #ffffff;
          padding: 0.85rem 1rem;
          transition: border-color 180ms ease, box-shadow 180ms ease;
          min-height: 5.5rem;
        }
        .panelActive {
          border-color: #b9791f55;
          box-shadow: 0 0 0 1px #b9791f22;
        }
        .panelHead {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin-bottom: 0.4rem;
        }
        .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #c7c9c0;
          transition: background 180ms ease;
        }
        .panelActive .dot {
          background: #b9791f;
        }
        .panelTitle {
          font-size: 0.78rem;
          font-weight: 600;
          color: #1c1f1d;
        }
        .panelThought {
          margin: 0;
          font-size: 0.82rem;
          line-height: 1.45;
          color: #52584f;
          font-style: italic;
        }
      `}</style>
    </div>
  );
}

function RoutingPanel({
  step,
  phase,
  decisionLabel,
  stepNumber,
}: {
  step: ScriptStep;
  phase: Phase;
  decisionLabel: string | null;
  stepNumber: number;
}) {
  const action = step.action;
  const hasItem =
    action?.kind === "route" || action?.kind === "routeShared" || action?.kind === "routeHeld";
  const content = hasItem ? (action as { content: string }).content : null;
  const persistence = hasItem ? (action as { persistence: number }).persistence : 0;
  const scope = hasItem ? (action as { scope: number }).scope : 0;

  const showGauges = phase === "scoring" || phase === "confirming" || phase === "settled";
  const showDecision = phase === "settled" && decisionLabel;
  const showConfirming = phase === "confirming";

  const confirmingWith =
    action?.kind === "routeShared"
      ? action.confirmedBy
      : action?.kind === "routeHeld"
        ? action.declinedBy
        : action?.kind === "promote"
          ? action.confirmedBy
          : null;

  return (
    <section className="routing" aria-live="polite">
      <div className="routingHead">
        <span className="label">Routing function</span>
        <code className="formula">R(m) = w1 · Persistence(m) + w2 · Scope(m)</code>
        <span className="stepTag">step {stepNumber} of {SCRIPT.length}</span>
      </div>

      {action?.kind === "retrieve" ? (
        <p className="retrieveNote">
          Episodic entry {action.id} retrieved by {AGENT_LABEL[action.agent]}. Counted toward the
          promotion threshold described in Section 3.4.3.
        </p>
      ) : action?.kind === "promote" ? (
        <>
          <p className="retrieveNote">
            Episodic entry {action.id} has reached its retrieval threshold. Passed through the same
            confirmation gate described in Section 3.4.2 before it can be promoted.
          </p>
          {showConfirming && (
            <p className="confirming">
              <span className="pulse" /> Asking {AGENT_LABEL[action.confirmedBy]} to confirm this entry
            </p>
          )}
          {showDecision && (
            <p className="decision decision-promoted">
              Decision: confirmed, promoted to shared memory as {action.newId}
            </p>
          )}
        </>
      ) : content ? (
        <>
          <p className="itemContent">{content}</p>
          <div className="gauges">
            <Gauge
              label="Persistence"
              value={showGauges ? persistence : 0}
              threshold={0.4}
              tone="episodic"
            />
            <Gauge
              label="Scope"
              value={showGauges ? scope : 0}
              threshold={0.55}
              tone="shared"
            />
          </div>

          {showConfirming && confirmingWith && (
            <p className="confirming">
              <span className="pulse" /> Asking {AGENT_LABEL[confirmingWith]} to confirm this item
            </p>
          )}

          {showDecision && (
            <p className={`decision decision-${decisionLabel}`}>
              Decision: {decisionLabel === "working" && "routed to working memory"}
              {decisionLabel === "episodic" && "routed to episodic memory"}
              {decisionLabel === "shared" && "confirmed, written to shared memory"}
              {decisionLabel === "held" && "declined, held in episodic memory"}
              {decisionLabel === "promoted" && "confirmed, promoted to shared memory"}
            </p>
          )}
        </>
      ) : null}

      <style jsx>{`
        .routing {
          border: 1px solid #e2e4dd;
          border-radius: 4px;
          background: #fffdf8;
          padding: 1rem 1.1rem 1.15rem;
          margin-bottom: 1.25rem;
          min-height: 9.5rem;
        }
        .routingHead {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0.6rem;
          margin-bottom: 0.65rem;
        }
        .label {
          font-size: 0.78rem;
          font-weight: 650;
        }
        .formula {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.72rem;
          color: #52584f;
          background: #f1f0ea;
          padding: 0.1rem 0.4rem;
          border-radius: 3px;
        }
        .stepTag {
          margin-left: auto;
          font-size: 0.7rem;
          color: #8a8f87;
        }
        .itemContent {
          margin: 0 0 0.75rem;
          font-size: 0.88rem;
          line-height: 1.5;
        }
        .retrieveNote {
          margin: 0.4rem 0 0;
          font-size: 0.85rem;
          color: #52584f;
          line-height: 1.5;
        }
        .gauges {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.9rem;
        }
        .confirming {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0.8rem 0 0;
          font-size: 0.82rem;
          color: #b9791f;
        }
        .pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #b9791f;
          animation: pulse 900ms ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .decision {
          margin: 0.8rem 0 0;
          font-size: 0.82rem;
          font-weight: 600;
          padding-top: 0.6rem;
          border-top: 1px dashed #e2e4dd;
          animation: settle 260ms ease;
        }
        .decision-working { color: #80857a; }
        .decision-episodic { color: #2f6b47; }
        .decision-shared, .decision-promoted { color: #a63b2e; }
        .decision-held { color: #8a6a1f; }
        @keyframes settle {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

function Gauge({
  label,
  value,
  threshold,
  tone,
}: {
  label: string;
  value: number;
  threshold: number;
  tone: "episodic" | "shared";
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="gauge">
      <div className="gaugeLabelRow">
        <span>{label}</span>
        <span className="gaugeValue">{value > 0 ? value.toFixed(2) : "0.00"}</span>
      </div>
      <div className="track">
        <div className={`fill fill-${tone}`} style={{ width: `${pct}%` }} />
        <div className="thresholdMark" style={{ left: `${threshold * 100}%` }} />
      </div>
      <div className="thresholdLabel">threshold {threshold.toFixed(2)}</div>

      <style jsx>{`
        .gauge {
          font-size: 0.72rem;
          color: #52584f;
        }
        .gaugeLabelRow {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.3rem;
        }
        .gaugeValue {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        }
        .track {
          position: relative;
          height: 6px;
          background: #ece9e0;
          border-radius: 3px;
          overflow: visible;
        }
        .fill {
          height: 100%;
          border-radius: 3px;
          transition: width 650ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .fill-episodic { background: #2f6b47; }
        .fill-shared { background: #a63b2e; }
        .thresholdMark {
          position: absolute;
          top: -2px;
          width: 2px;
          height: 10px;
          background: #1c1f1d55;
        }
        .thresholdLabel {
          margin-top: 0.25rem;
          font-size: 0.64rem;
          color: #8a8f87;
        }
      `}</style>
    </div>
  );
}

function TierColumn({
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

function OwnerGroup({ label, children }: { label: string; children: ReactNode }) {
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

function MemoryCard({ data, tone }: { data: MemoryCardData; tone: "working" | "episodic" | "shared" }) {
  const superseded = tone === "shared" && data.active === false;
  return (
    <div className={`card ${superseded ? "cardSuperseded" : ""}`}>
      <p className="content">{data.content}</p>

      {typeof data.persistence === "number" && (
        <p className="meta">
          persistence {data.persistence.toFixed(2)}, scope {data.scope?.toFixed(2)}
        </p>
      )}

      {tone === "episodic" && typeof data.retrievalCount === "number" && (
        <p className="retrieval">
          retrieved {data.retrievalCount} of {data.kappa} {data.heldFromShared ? "(held from shared)" : ""}
        </p>
      )}

      {tone === "shared" && superseded && (
        <p className="tag tagSuperseded">superseded by {data.supersededBy}</p>
      )}
      {tone === "shared" && data.supersedes && (
        <p className="tag">supersedes {data.supersedes}</p>
      )}
      {tone === "shared" && data.promotedFrom && (
        <p className="tag">promoted from {data.promotedFrom}</p>
      )}

      <style jsx>{`
        .card {
          background: #ffffff;
          border: 1px solid #e6e4da;
          border-radius: 3px;
          padding: 0.55rem 0.65rem;
          animation: enter 320ms ease;
        }
        .cardSuperseded {
          opacity: 0.55;
        }
        .cardSuperseded .content {
          text-decoration: line-through;
          text-decoration-color: #a63b2e88;
        }
        @keyframes enter {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
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
        .tag {
          display: inline-block;
          margin: 0.35rem 0 0;
          font-size: 0.62rem;
          color: #a63b2e;
          background: #a63b2e14;
          border-radius: 3px;
          padding: 0.05rem 0.4rem;
        }
        .tagSuperseded {
          color: #70756a;
          background: #70756a14;
        }
      `}</style>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="empty">
      {text}
      <style jsx>{`
        .empty {
          margin: 0;
          font-size: 0.72rem;
          color: #9a9d93;
          font-style: italic;
        }
      `}</style>
    </p>
  );
}

function Transcript({ log }: { log: string[] }) {
  return (
    <section className="transcript">
      <p className="transcriptLabel">Decision trace</p>
      <ol>
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <style jsx>{`
        .transcript {
          border-top: 1px solid #e2e4dd;
          padding-top: 0.75rem;
          margin-top: 0.5rem;
        }
        .transcriptLabel {
          margin: 0 0 0.4rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: #52584f;
        }
        ol {
          margin: 0;
          padding-left: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          max-height: 7rem;
          overflow-y: auto;
        }
        li {
          font-size: 0.72rem;
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          color: #70756a;
          line-height: 1.5;
        }
        li::marker {
          color: #c7c9c0;
        }
      `}</style>
    </section>
  );
}

function PlaybackControls({
  stepIndex,
  total,
  isPlaying,
  onPlayPause,
  onStep,
  onRestart,
  onScrub,
}: {
  stepIndex: number;
  total: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onStep: (dir: 1 | -1) => void;
  onRestart: () => void;
  onScrub: (i: number) => void;
}) {
  return (
    <div className="controls">
      <div className="buttons">
        <button onClick={onRestart} aria-label="Restart">
          ↺
        </button>
        <button onClick={() => onStep(-1)} disabled={stepIndex === 0} aria-label="Previous step">
          ‹
        </button>
        <button onClick={onPlayPause} className="playButton" aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button onClick={() => onStep(1)} disabled={stepIndex === total - 1} aria-label="Next step">
          ›
        </button>
      </div>
      <div className="dots">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            className={`dot ${i === stepIndex ? "dotActive" : ""} ${i < stepIndex ? "dotDone" : ""}`}
            onClick={() => onScrub(i)}
            aria-label={`Go to step ${i + 1}`}
          />
        ))}
      </div>

      <style jsx>{`
        .controls {
          margin-top: 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
        }
        .buttons {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        button {
          font-family: inherit;
          border: 1px solid #d9dbd3;
          background: #ffffff;
          color: #1c1f1d;
          border-radius: 4px;
          padding: 0.4rem 0.7rem;
          font-size: 0.85rem;
          cursor: pointer;
          transition: background 150ms ease, border-color 150ms ease;
        }
        button:hover:not(:disabled) {
          border-color: #b9791f;
        }
        button:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .playButton {
          font-weight: 600;
          min-width: 4.5rem;
        }
        .dots {
          display: flex;
          gap: 0.3rem;
        }
        .dot {
          width: 7px;
          height: 7px;
          padding: 0;
          border-radius: 50%;
          border: none;
          background: #e2e4dd;
        }
        .dotDone {
          background: #c7c9c0;
        }
        .dotActive {
          background: #b9791f;
          transform: scale(1.3);
        }
      `}</style>
    </div>
  );
}
