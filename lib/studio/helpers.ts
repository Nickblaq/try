import type {
  CatalogOperation,
  Condition,
  DynamicSource,
  FormValues,
  MediaKind,
  MediaProfile,
  Option,
  PipelineStep,
} from "./types";
import {
  acceptsKind,
  getOperation,
  producedKind,
} from "@/lib/catalog/operations";

export function evalCondition(
  cond: Condition | undefined,
  values: FormValues
): boolean {
  if (!cond) return true;
  const v = values[cond.param];
  switch (cond.operator) {
    case "eq":
      return v === cond.value;
    case "neq":
      return v !== cond.value;
    case "truthy":
      return Boolean(v);
    case "falsy":
      return !v;
    default:
      return true;
  }
}

export function defaultValues(op: CatalogOperation): FormValues {
  const out: FormValues = {};
  for (const p of op.params) {
    if (p.default !== undefined) {
      out[p.key] = p.default;
      continue;
    }
    switch (p.type) {
      case "number":
      case "integer":
        out[p.key] = p.min ?? 0;
        break;
      case "boolean":
        out[p.key] = false;
        break;
      case "multiselect":
        out[p.key] = [];
        break;
      case "enum":
        out[p.key] = p.options?.[0]?.value ?? "";
        break;
      default:
        out[p.key] = "";
        break;
    }
  }
  return out;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "–";
  if (bytes < 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds <= 0) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function makeUid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* --------------------------- media-profile helpers ------------------------ */

/**
 * Options for a `dynamic` param, derived from the resolved URL profile.
 *
 * The catalogue's own `options` are the offline fallback so the form still
 * renders before (or without) a resolve; once a profile exists the options are
 * the ones the link actually offers — which is what stops a user choosing a
 * resolution or caption language that does not exist.
 */
export function dynamicOptions(
  source: DynamicSource | undefined,
  fallback: Option[],
  profile: MediaProfile | null | undefined
): Option[] {
  if (!source || !profile) return fallback;
  switch (source) {
    case "heights":
      return [
        { value: "best", label: "Best available" },
        ...profile.heights.map((h) => ({ value: String(h), label: `${h}p` })),
      ];
    case "audioFormats":
      return profile.audioFormats.length
        ? profile.audioFormats.map((f) => ({ value: f, label: f.toUpperCase() }))
        : fallback;
    case "subtitleLangs":
      return profile.subtitleLangs.length
        ? profile.subtitleLangs.map((t) => ({
            value: t.code,
            label: `${t.name}${t.auto ? " (auto)" : ""}`,
          }))
        : fallback;
    default:
      return fallback;
  }
}

/**
 * Walk the pipeline and work out what kind of media comes out the far end.
 *
 * This is what keeps the operation list honest for multi-step pipelines: after
 * "convert audio", image and video filters stop being offered, and after
 * "extract frame" only image operations are.
 */
export function pipelineOutputKind(
  startKind: MediaKind | null,
  pipeline: PipelineStep[]
): MediaKind | null {
  let kind = startKind;
  for (const step of pipeline) {
    const op = getOperation(step.opId);
    if (!op || !kind) continue;
    // A step that cannot consume the current kind is left out of the walk —
    // the UI already filters those out.
    if (!acceptsKind(op, kind)) continue;
    kind = producedKind(op, kind);
  }
  return kind;
}

/* ------------------------------ display helpers --------------------------- */

/** yt-dlp hands back upload dates as `YYYYMMDD`. */
export function formatDate(raw?: string | null): string {
  const m = (raw ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return raw ?? "–";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Compact count for view numbers: 1234 → "1.2K", 4200000 → "4.2M". */
export function formatCount(value?: number | null): string {
  if (!value || !Number.isFinite(value)) return "–";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
