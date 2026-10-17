"use client";

import { useState } from "react";
import type { Job, MediaObject } from "@/lib/studio/types";
import { formatBytes } from "@/lib/studio/helpers";
import { Icons } from "../Icons";

export function ResultView({
  job,
  downloadUrl,
  titleComplete,
  titleFailed,
  onAgain,
  onHome,
  onChain,
  onRetry,
  onInspect,
}: {
  job: Job | null;
  downloadUrl: (id: string) => string;
  titleComplete: string;
  titleFailed: string;
  onAgain: () => void;
  onHome: () => void;
  onChain: (objectId: string) => void;
  onRetry: () => void;
  /** Preview an output instead of downloading it. */
  onInspect?: (object: MediaObject) => void;
}) {
  const ok = job?.status === "completed";
  const outputs = job?.outputs ?? [];
  const primary =
    outputs.find((o) => o.id === job?.resultObjectId) ?? outputs[0] ?? null;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function save(object: MediaObject) {
    setSavingId(object.id);
    setSaveError(null);
    try {
      // "Save to device" is an export straight from the catalog: the anchor
      // points at the object id, so the server streams the exact bytes.
      const a = document.createElement("a");
      a.href = downloadUrl(object.id);
      a.download = object.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="pad">
      <section className="card resultHero">
        <div className={"resultIcon" + (ok ? "" : " resultIconFail")}>
          {ok ? <Icons.Check size={28} /> : <Icons.Warn size={28} />}
        </div>
        <h2 className="resultTitle">{ok ? titleComplete : titleFailed}</h2>
        <p className="resultSub">{job?.error || "Job finished"}</p>
      </section>

      {primary && (
        <section className="card videoPreview">
          <div className="videoThumb">
            <Icons.Play size={28} />
          </div>
          <div className="videoMeta">
            <span className="videoName">{primary.name}</span>
            <span className="videoInfo">
              {formatBytes(primary.sizeBytes)} · {primary.kind} ·{" "}
              {primary.id.slice(0, 8)}
            </span>
          </div>
        </section>
      )}

      {saveError && (
        <div className="errorBox">
          <Icons.Warn /> {saveError}
        </div>
      )}

      {ok && primary && (
        <button
          type="button"
          className="primaryBtn"
          onClick={() => save(primary)}
          disabled={savingId === primary.id}
        >
          <Icons.Download size={18} /> Save to device
        </button>
      )}

      {ok && primary && (
        <button
          type="button"
          className="ghostBtnWide"
          onClick={() => onChain(primary.id)}
        >
          <Icons.Flow /> Chain from this result
        </button>
      )}

      {!ok && (
        <button type="button" className="ghostBtnWide" onClick={onRetry}>
          Retry job
        </button>
      )}

      {outputs.length > 0 && (
        <section>
          <div className="rowHead">
            <h3 className="sectionTitle">Catalog outputs</h3>
            <span className="rowAction">{outputs.length} objects</span>
          </div>
          <ul className="outputList">
            {outputs.map((o) => (
              <li key={o.id}>
                <div className="outputRow">
                  {onInspect ? (
                    <button
                      type="button"
                      className="iconAction"
                      onClick={() => onInspect(o)}
                      aria-label="Preview output"
                      title="Preview"
                    >
                      <Icons.Play size={14} />
                    </button>
                  ) : (
                    <Icons.Download size={16} />
                  )}
                  <button
                    type="button"
                    className="outputNameBtn"
                    onClick={() => save(o)}
                    title="Save to device"
                  >
                    {o.name}
                  </button>
                  <span className="outputSize">{formatBytes(o.sizeBytes)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="resultActions">
        <button type="button" className="primaryBtn" onClick={onHome}>
          Back to Home
        </button>
        <button type="button" className="ghostBtnWide" onClick={onAgain}>
          Start Another
        </button>
      </div>
    </div>
  );
}
