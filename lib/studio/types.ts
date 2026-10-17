// lib/studio/types.ts
//
// Client-facing view of the shared catalog. Operations and params come straight
// from the catalog, so the UI and the server runner can never drift apart.

import type {
  CatalogOperation,
  Condition,
  FormValues,
  Option,
  Param,
  ParamType,
} from "@/lib/catalog/operations";
import type { DynamicSource } from "@/lib/catalog/operations";
import type {
  MediaFormat,
  MediaKind,
  MediaObject,
  MediaProfile,
  SubtitleTrack,
} from "@/lib/catalog/types";

export type {
  CatalogOperation,
  Condition,
  DynamicSource,
  FormValues,
  Option,
  Param,
  ParamType,
  MediaFormat,
  MediaKind,
  MediaObject,
  MediaProfile,
  SubtitleTrack,
};

export type IconProps = { size?: number };

export type View =
  | "source"
  | "assets"
  | "catalog"
  | "pipeline"
  | "run"
  | "result";

export type PipelineStep = { uid: string; opId: string; values: FormValues };

/** Where the pipeline currently starts. */
export type StudioSource = {
  objectId: string | null;
  url: string | null;
  name: string | null;
  kind: MediaKind | null;
  sizeBytes: number | null;
};

export type StepStatus = "queued" | "running" | "completed" | "failed" | "skipped";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobStep = {
  id: string;
  seq: number;
  opId: string;
  name: string;
  engine: string;
  status: StepStatus;
  percent: number;
  inputObjectId: string | null;
  outputObjectId: string | null;
  error: string | null;
  log: string;
};

export type Job = {
  id: string;
  status: JobStatus;
  sourceObjectId: string | null;
  sourceUrl: string | null;
  error: string | null;
  log: string;
  resultObjectId: string | null;
  percent: number;
  steps: JobStep[];
  outputs: MediaObject[];
  createdAt: number;
  updatedAt: number;
};

/** Minimal source shape the run/result views display. */
export type SourceRef = { name?: string; title?: string } | null;
