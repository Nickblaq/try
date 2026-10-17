"use client";

import type { Job, StudioSource } from "@/lib/studio/types";
import { Icons } from "../Icons";

export function RunView({
  source,
  job,
  error,
}: {
  source: StudioSource;
  job: Job | null;
  error: string | null;
}) {
  const percent = job?.percent ?? 0;
  const steps = job?.steps ?? [];
  const activeIndex = steps.findIndex((s) => s.status === "running");
  const circumference = 2 * Math.PI * 52;
  const displayName = source.name ?? source.url ?? "…";

  return (
    <div className="pad">
      <section className="card runHeader">
        <div className="runRingWrap">
          <svg viewBox="0 0 120 120" className="runRing">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="6" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - percent / 100)}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="runRingText">
            <span className="runPct">{Math.round(percent)}%</span>
            <span className="runState">{job?.status ?? "queued"}</span>
          </div>
        </div>
        <div className="runMeta">
          <span className="runSource">{displayName}</span>
          <span className="runStep">
            {steps[activeIndex >= 0 ? activeIndex : steps.length - 1]?.name ??
              "Preparing pipeline…"}
          </span>
        </div>
      </section>

      {error && (
        <div className="errorBox">
          <Icons.Warn /> {error}
        </div>
      )}

      {job?.error && (
        <div className="errorBox">
          <Icons.Warn /> {job.error}
        </div>
      )}

      <section className="card logCard">
        <div className="logHead">
          <Icons.Terminal /> <span>Live Output</span>
        </div>
        <pre className="logBody">{job?.log || "Waiting for output…"}</pre>
      </section>

      <section className="stepList">
        {steps.map((step) => {
          const state =
            step.status === "completed"
              ? "stepDone"
              : step.status === "running"
                ? "stepActive"
                : step.status === "failed"
                  ? "stepActive"
                  : "";
          return (
            <div key={step.id} className={"stepRow " + state}>
              <div className="stepDot">
                {step.status === "completed" ? (
                  <Icons.Check size={12} />
                ) : step.status === "running" ? (
                  <Icons.Bolt size={12} />
                ) : step.status === "failed" ? (
                  <Icons.Warn size={12} />
                ) : (
                  <span>{step.seq + 1}</span>
                )}
              </div>
              <span className="stepName">{step.name}</span>
              {step.outputObjectId && (
                <span className="stepPct">→ {step.outputObjectId.slice(0, 6)}</span>
              )}
              {step.status === "running" && (
                <span className="stepPct">{Math.round(step.percent)}%</span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
