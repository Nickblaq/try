"use client";

import type { PipelineStep, StudioSource } from "@/lib/studio/types";
import { getOperation } from "@/lib/catalog/operations";
import { Icons } from "../Icons";
import { OperationIcon } from "../OperationCard";
import { Stat } from "../Stat";
import { formatBytes } from "@/lib/studio/helpers";

export function PipelineView({
  source,
  pipeline,
  onAdd,
  onRemove,
  onMove,
  onRun,
  onEdit,
  running,
  error,
  undo,
  redo,
  canUndo,
  canRedo,
  onClear,
}: {
  source: StudioSource;
  pipeline: PipelineStep[];
  onAdd: () => void;
  onRemove: (uid: string) => void;
  onMove: (i: number, d: -1 | 1) => void;
  onRun: () => void;
  onEdit: (step: PipelineStep) => void;
  running: boolean;
  error: string | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
}) {
  const sourceLabel = source.name ?? source.url ?? null;

  return (
    <div className="pad">
      <section className="flowWrap">
        <div className="flowNode">
          <div className="flowNodeIcon">
            {source.kind === "audio" ? (
              <Icons.Music />
            ) : source.kind === "image" ? (
              <Icons.Image />
            ) : source.url && !source.objectId ? (
              <Icons.Globe />
            ) : (
              <Icons.File />
            )}
          </div>
          <div className="flowNodeBody">
            <span className="flowNodeLabel">Source</span>
            <span className="flowNodeValue">
              {sourceLabel ?? "No source loaded"}
            </span>
          </div>
        </div>

        {pipeline.length === 0 && (
          <div className="flowEmpty">
            <Icons.Flow size={26} />
            <p>No steps yet</p>
            <span>Add operations to build your pipeline.</span>
          </div>
        )}

        {pipeline.map((step, i) => {
          const op = getOperation(step.opId);
          return (
            <div key={step.uid} className="flowRow">
              <div className="flowLine" />
              <div className="flowNode">
                <div className="flowReorder">
                  <button
                    type="button"
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <Icons.Up />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(i, 1)}
                    disabled={i === pipeline.length - 1}
                    aria-label="Move down"
                  >
                    <Icons.Down />
                  </button>
                </div>
                <div className="flowNodeIcon flowNodeIconOp">
                  <OperationIcon icon={op?.icon ?? "File"} size={18} />
                </div>
                <button
                  type="button"
                  className="flowNodeBody flowNodeBodyBtn"
                  onClick={() => onEdit(step)}
                >
                  <span className="flowNodeLabel">Step {i + 1}</span>
                  <span className="flowNodeValue">
                    {op?.name ?? step.opId}
                  </span>
                </button>
                <button
                  type="button"
                  className="flowDelete"
                  onClick={() => onRemove(step.uid)}
                  aria-label="Remove"
                >
                  <Icons.Trash />
                </button>
              </div>
            </div>
          );
        })}

        <div className="flowRow">
          <div className="flowLine" />
          <button type="button" className="flowAdd" onClick={onAdd}>
            <Icons.Plus /> Add Operation
          </button>
        </div>
      </section>

      {pipeline.length > 0 && (
        <section className="card statsCard">
          <Stat label="Steps" value={String(pipeline.length)} />
          <Stat label="Source" value={source.kind ?? "url"} />
          <Stat
            label="Input"
            value={source.sizeBytes != null ? formatBytes(source.sizeBytes) : "–"}
          />
        </section>
      )}

      {pipeline.length > 0 && (
        <div className="historyRow">
          <button
            type="button"
            className="miniBtn"
            onClick={undo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="miniBtn"
            onClick={redo}
            disabled={!canRedo}
          >
            Redo
          </button>
          <button type="button" className="miniBtn miniBtnDanger" onClick={onClear}>
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="errorBox">
          <Icons.Warn /> {error}
        </div>
      )}

      <button
        type="button"
        className="primaryBtn"
        onClick={onRun}
        disabled={pipeline.length === 0 || running}
      >
        {running ? "Starting…" : "Start"}
      </button>
    </div>
  );
}
