"use client";

// lib/studio/store.ts
//
// The studio's client state: the source, the pipeline, the current view, and the
// running job id. Pipeline edits are undoable — zundo snapshots the pipeline
// slice, so undo/redo only ever touch the pipeline (not the view or logging).
//
// There is no IndexedDB (dexie) mirror of job state any more: the server's
// SQLite catalog is the single source of truth, and this store deliberately
// holds only what the current browser session is editing.

import { create } from "zustand";
import { temporal } from "zundo";
import { useStore } from "zustand";
import type {
  FormValues,
  MediaProfile,
  PipelineStep,
  StudioSource,
  View,
} from "./types";
import { makeUid } from "./helpers";

export type StudioState = {
  source: StudioSource;
  pipeline: PipelineStep[];
  view: View;
  jobId: string | null;
  /**
   * What a URL source actually contains, resolved before any download. Null for
   * file sources. This is what makes the operation forms honest — the download
   * params read real resolutions and caption languages out of it.
   */
  profile: MediaProfile | null;

  setView: (view: View) => void;
  setJobId: (jobId: string | null) => void;
  setSource: (source: Partial<StudioSource>) => void;
  setProfile: (profile: MediaProfile | null) => void;
  clearSource: () => void;

  addStep: (opId: string, values: FormValues) => void;
  removeStep: (uid: string) => void;
  moveStep: (index: number, dir: -1 | 1) => void;
  updateStep: (uid: string, values: FormValues) => void;
  clearPipeline: () => void;
  reset: () => void;
};

const EMPTY_SOURCE: StudioSource = {
  objectId: null,
  url: null,
  name: null,
  kind: null,
  sizeBytes: null,
};

export const useStudioStore = create<StudioState>()(
  temporal(
    (set) => ({
      source: EMPTY_SOURCE,
      pipeline: [],
      view: "source",
      jobId: null,
      profile: null,

      setView: (view) => set({ view }),
      setJobId: (jobId) => set({ jobId }),
      setSource: (source) => set((s) => ({ source: { ...s.source, ...source } })),
      setProfile: (profile) => set({ profile }),
      clearSource: () =>
        set({
          source: EMPTY_SOURCE,
          pipeline: [],
          jobId: null,
          view: "source",
          profile: null,
        }),

      addStep: (opId, values) =>
        set((s) => ({
          pipeline: [...s.pipeline, { uid: makeUid(), opId, values }],
        })),

      removeStep: (uid) =>
        set((s) => ({ pipeline: s.pipeline.filter((step) => step.uid !== uid) })),

      moveStep: (index, dir) =>
        set((s) => {
          const next = [...s.pipeline];
          const target = index + dir;
          if (target < 0 || target >= next.length) return s;
          [next[index], next[target]] = [next[target], next[index]];
          return { pipeline: next };
        }),

      updateStep: (uid, values) =>
        set((s) => ({
          pipeline: s.pipeline.map((step) =>
            step.uid === uid ? { ...step, values } : step
          ),
        })),

      clearPipeline: () => set({ pipeline: [] }),

      reset: () =>
        set({
          source: EMPTY_SOURCE,
          pipeline: [],
          view: "source",
          jobId: null,
          profile: null,
        }),
    }),
    {
      // Only pipeline edits are undoable; navigation and job ids are not part
      // of the history the user thinks of as "undo my pipeline changes".
      partialize: (state) =>
        ({ pipeline: state.pipeline }) as unknown as StudioState,
      limit: 100,
    }
  )
);

/* ------------------------------- history hooks ----------------------------- */

export function useUndoRedo() {
  const canUndo = useStore(
    useStudioStore.temporal,
    (s) => s.pastStates.length > 0
  );
  const canRedo = useStore(
    useStudioStore.temporal,
    (s) => s.futureStates.length > 0
  );
  return {
    canUndo,
    canRedo,
    undo: () => useStudioStore.temporal.getState().undo(),
    redo: () => useStudioStore.temporal.getState().redo(),
  };
}
