// lib/catalog/jobs.ts
//
// Job state lives in SQLite, in the same database as the catalog it writes to.
// There is no status.json anywhere in this path: a `job` is the user's request,
// a `run` is one execution attempt (retry-safe — a failed run is kept and a new
// one appended rather than mutating history), and a `step` is one operation
// within a run whose `output_object_id` is a catalog link. That link is what
// makes chaining work: the next step simply consumes the previous step's
// result, server-side, with no re-upload.
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getCatalogDb } from "./db";
import { JOBS_DIR } from "@/lib/tmp";
import { getOperation, type FormValues } from "./operations";
import {
  buildObjectStep,
  buildYtdlpOptions,
  type EngineInput,
  type FfmpegStep,
  type FfprobeStep,
} from "./engines";
import { extFromName, mimeForExt } from "./blobs";
import {
  getStoredObject,
  ingestFile,
  objectFilePath,
  setObjectDuration,
  toPublic,
} from "./store";
import type { MediaObject } from "./types";
import { sweepExpiredMedia } from "@/lib/cleanup";

export type JobStatus = "queued" | "running" | "completed" | "failed";
export type StepStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export type JobStepView = {
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

export type JobView = {
  id: string;
  status: JobStatus;
  sourceObjectId: string | null;
  sourceUrl: string | null;
  error: string | null;
  log: string;
  resultObjectId: string | null;
  percent: number;
  steps: JobStepView[];
  /** Public catalog objects produced by this job (by id), for the result view. */
  outputs: MediaObject[];
  createdAt: number;
  updatedAt: number;
};

export type JobInput = {
  sourceObjectId?: string | null;
  sourceUrl?: string | null;
  operations: { id: string; params: FormValues }[];
};

/* --------------------------------- rows ----------------------------------- */

type JobRow = {
  id: string;
  source_object_id: string | null;
  source_url: string | null;
  status: JobStatus;
  error: string | null;
  log: string;
  result_object_id: string | null;
  created_at: number;
  updated_at: number;
};

type StepRow = {
  id: string;
  job_id: string;
  run_id: string;
  seq: number;
  op_id: string;
  params_json: string;
  status: StepStatus;
  input_object_id: string | null;
  output_object_id: string | null;
  error: string | null;
  log: string;
  percent: number;
  created_at: number;
  updated_at: number;
};

function parseParams(raw: string): FormValues {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as FormValues) : {};
  } catch {
    return {};
  }
}

function stepToView(row: StepRow): JobStepView {
  return {
    id: row.id,
    seq: row.seq,
    opId: row.op_id,
    name: getOperation(row.op_id)?.name ?? row.op_id,
    engine: getOperation(row.op_id)?.engine ?? "ffmpeg",
    status: row.status,
    percent: row.percent,
    inputObjectId: row.input_object_id,
    outputObjectId: row.output_object_id,
    error: row.error,
    log: row.log,
  };
}

/* --------------------------------- writes --------------------------------- */

/** Insert a job, its first run, and one row per requested step. */
export async function createJob(input: JobInput): Promise<string> {
  const db = getCatalogDb();
  const jobId = randomUUID();
  const runId = randomUUID();
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO jobs (
        id, source_object_id, source_url, status, error, log, result_object_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'queued', NULL, '', NULL, ?, ?)`
    ).run(
      jobId,
      input.sourceObjectId ?? null,
      input.sourceUrl ?? null,
      now,
      now
    );

    db.prepare(
      `INSERT INTO runs (id, job_id, attempt, status, error, result_object_id, created_at, updated_at)
       VALUES (?, ?, 1, 'queued', NULL, NULL, ?, ?)`
    ).run(runId, jobId, now, now);

    const insertStep = db.prepare(
      `INSERT INTO steps (
        id, job_id, run_id, seq, op_id, params_json, status, input_object_id,
        output_object_id, error, log, percent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, NULL, '', 0, ?, ?)`
    );
    input.operations.forEach((op, i) => {
      insertStep.run(
        randomUUID(),
        jobId,
        runId,
        i,
        op.id,
        JSON.stringify(op.params ?? {}),
        now,
        now
      );
    });
  })();

  // Kick off execution without blocking the request that created the job.
  void executeRun(jobId, runId).catch((err) => {
    markJobFailed(jobId, runId, err instanceof Error ? err.message : String(err));
  });

  return jobId;
}

function appendJobLog(jobId: string, line: string): void {
  const db = getCatalogDb();
  const row = db.prepare(`SELECT log FROM jobs WHERE id = ?`).get(jobId) as
    | { log: string }
    | undefined;
  if (!row) return;
  const next = `${row.log ? row.log + "\n" : ""}${line}`.slice(-8000);
  db.prepare(`UPDATE jobs SET log = ?, updated_at = ? WHERE id = ?`).run(
    next,
    Date.now(),
    jobId
  );
}

function setJobStatus(jobId: string, status: JobStatus, error: string | null = null): void {
  getCatalogDb()
    .prepare(`UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?`)
    .run(status, error, Date.now(), jobId);
}

function setRunStatus(runId: string, status: JobStatus, error: string | null = null): void {
  getCatalogDb()
    .prepare(`UPDATE runs SET status = ?, error = ?, updated_at = ? WHERE id = ?`)
    .run(status, error, Date.now(), runId);
}

function markJobFailed(jobId: string, runId: string, message: string): void {
  setJobStatus(jobId, "failed", message);
  setRunStatus(runId, "failed", message);
  appendJobLog(jobId, `failed: ${message}`);
}

function updateStep(
  stepId: string,
  fields: Partial<{
    status: StepStatus;
    percent: number;
    input_object_id: string | null;
    output_object_id: string | null;
    error: string | null;
    log: string;
  }>
): void {
  const db = getCatalogDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  sets.push("updated_at = ?");
  params.push(Date.now());
  params.push(stepId);
  db.prepare(`UPDATE steps SET ${sets.join(", ")} WHERE id = ?`).run(...params);
}

/* ---------------------------------- reads --------------------------------- */

/** The most recent attempt at a job. Older runs are kept for history only. */
export function latestRunId(jobId: string): string | null {
  const row = getCatalogDb()
    .prepare(`SELECT id FROM runs WHERE job_id = ? ORDER BY attempt DESC LIMIT 1`)
    .get(jobId) as { id: string } | undefined;
  return row?.id ?? null;
}

export function getJob(jobId: string): JobView | null {
  const db = getCatalogDb();
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
    | JobRow
    | undefined;
  if (!job) return null;

  const runId = latestRunId(jobId);
  const stepRows = runId
    ? (db.prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY seq`).all(runId) as StepRow[])
    : [];
  const steps = stepRows.map(stepToView);

  const outputs: MediaObject[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const id = step.outputObjectId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const stored = getStoredObject(id);
    if (stored) outputs.push(toPublic(stored));
  }

  const done = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const percent =
    job.status === "completed"
      ? 100
      : steps.length === 0
        ? 0
        : Math.round((done / steps.length) * 100);

  return {
    id: job.id,
    status: job.status,
    sourceObjectId: job.source_object_id,
    sourceUrl: job.source_url,
    error: job.error,
    log: job.log,
    resultObjectId: job.result_object_id,
    percent,
    steps,
    outputs,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

export function listJobs(limit = 50): JobView[] {
  const rows = getCatalogDb()
    .prepare(`SELECT id FROM jobs ORDER BY created_at DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 200)) as { id: string }[];
  return rows.map((r) => getJob(r.id)).filter((j): j is JobView => j !== null);
}

/* --------------------------------- runner --------------------------------- */

function jobWorkDir(jobId: string): string {
  return path.join(JOBS_DIR, jobId);
}

/**
 * Hard-link (or copy) a catalog blob into the job's scratch dir.
 *
 * `key` prefixes the staged filename so several inputs that happen to share a
 * basename (the pipeline input and an extra object, say) never collide.
 */
async function stageInput(
  jobId: string,
  sourcePath: string,
  name: string,
  key?: string
): Promise<string> {
  const dir = path.join(jobWorkDir(jobId), "input");
  await fsp.mkdir(dir, { recursive: true });
  const base = path.basename(name) || "input";
  const target = path.join(dir, key ? `${key}-${base}` : base);
  try {
    await fsp.link(sourcePath, target);
  } catch {
    await fsp.copyFile(sourcePath, target);
  }
  return target;
}

/**
 * Collect the extra catalog objects an operation pulls in (its `object`
 * params) and stage them alongside the pipeline input. A missing or unresolvable
 * reference fails the step with a message the user can act on.
 */
async function collectExtras(
  jobId: string,
  step: StepRow,
  opId: string
): Promise<EngineInput[]> {
  const op = getOperation(opId);
  if (!op) return [];
  const params = parseParams(step.params_json);
  const extras: EngineInput[] = [];

  let index = 0;
  for (const p of op.params) {
    if (p.type !== "object") continue;
    const objectId = s(params[p.key]);
    if (!objectId) {
      if (p.required) throw new Error(`${op.name} needs a ${p.label.toLowerCase()} selected.`);
      continue;
    }
    const stored = getStoredObject(objectId);
    const filePath = stored ? objectFilePath(objectId) : null;
    if (!stored || !filePath || !fs.existsSync(filePath)) {
      throw new Error(
        `${op.name}: the selected ${p.label.toLowerCase()} is no longer available on the server.`
      );
    }
    index += 1;
    extras.push({
      path: await stageInput(jobId, filePath, stored.name, `x${index}`),
      kind: stored.kind,
      name: stored.name,
    });
  }
  return extras;
}

/**
 * Run ffprobe once and write its JSON report where the step expects it. The
 * runner never treats this output as media — it lands in the catalog as an
 * `other` object so it can be downloaded like anything else.
 */
async function runFfprobe(step: StepRow, spec: FfprobeStep): Promise<void> {
  updateStep(step.id, { status: "running", percent: 10 });
  const json = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", spec.args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error("ffprobe is not installed on the server")
          : err
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
    });
  });

  await fsp.writeFile(spec.outputPath, json, "utf8");
  updateStep(step.id, { status: "running", percent: 80 });
}

function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function providerOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function runFfmpeg(
  jobId: string,
  step: StepRow,
  passes: { name: string; args: string[] }[],
  outputDir: string
): Promise<void> {
  const log: string[] = [];
  void outputDir;
  for (const pass of passes) {
    // buildFfmpegStep already emits absolute output/scratch paths, so the args
    // are used verbatim.
    const args = ["-y", "-hide_banner", "-loglevel", "error", ...pass.args];

    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "ENOENT"
            ? new Error("ffmpeg is not installed on the server")
            : err
        );
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });

    log.push(`${pass.name}: ok`);
    updateStep(step.id, {
      status: "running",
      log: log.join("\n"),
      percent: Math.round((passes.indexOf(pass) / passes.length) * 90),
    });
  }
}

/**
 * Run the yt-dlp bridge, mirroring its JSON progress lines into the step row.
 * The python script still writes a status file (an internal detail of the
 * child); the canonical state read by the API is SQLite.
 */
async function runYtdlp(
  jobId: string,
  stepIds: string[],
  options: Record<string, unknown>,
  outputDir: string
): Promise<void> {
  const script = path.join(process.cwd(), "python", "ytdlp.py");
  const statusFile = path.join(jobWorkDir(jobId), `${stepIds[0]}.status.json`);
  const modules = path.join(process.cwd(), "python-modules");

  await fsp.mkdir(outputDir, { recursive: true });

  const log: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "python3",
      [script, "download", statusFile, outputDir, JSON.stringify(options)],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONPATH: modules },
      }
    );

    let buffer = "";
    let stderr = "";
    const applyProgress = (data: Record<string, unknown>) => {
      const line =
        typeof data.status === "string" ? String(data.status) : undefined;
      if (line && !log.includes(line)) log.push(line);
      const percent =
        typeof data.progress === "number" ? Math.round(data.progress) : 0;
      for (const id of stepIds) {
        updateStep(id, {
          status: "running",
          percent: Math.min(percent, 99),
          log: log.join("\n"),
        });
      }
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object") applyProgress(parsed);
        } catch {
          /* non-JSON noise from the extractor */
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error("python3 is not installed on the server")
          : err
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

/** Register every file a download produced in the catalog as an object. */
async function registerDownloadOutputs(
  jobId: string,
  opId: string,
  url: string,
  outputDir: string
): Promise<string | null> {
  const entries = (await fsp.readdir(outputDir).catch(() => [] as string[]))
    .filter((name) => {
      const full = path.join(outputDir, name);
      return fs.existsSync(full) && fs.statSync(full).isFile();
    })
    .sort();

  const provider = providerOf(url);
  let primary: MediaObject | null = null;
  let primarySize = -1;
  // A subtitles-only download produces no media at all, so keep the largest
  // non-media object as a fallback — otherwise "Download Subtitles" on its own
  // would report "Download produced no media" despite having worked.
  let fallback: MediaObject | null = null;
  let fallbackSize = -1;

  for (const name of entries) {
    const full = path.join(outputDir, name);
    const size = fs.statSync(full).size;
    try {
      const object = await ingestFile({
        path: full,
        name,
        // yt-dlp hands us a bare file, so give the record its real MIME type
        // up front — otherwise a downloaded video is only known by extension
        // and gets served back as a generic binary.
        mime: mimeForExt(extFromName(name)),
        origin: "download",
        url,
        provider,
        tool: "yt-dlp",
        parents: primary ? [primary.id] : [],
        meta: { jobId, opId },
      });
      if (object.kind !== "subtitle" && object.kind !== "other" && size > primarySize) {
        primary = object;
        primarySize = size;
      }
      if (size > fallbackSize) {
        fallback = object;
        fallbackSize = size;
      }
    } catch (err) {
      // Bookkeeping must never fail the job the user is watching.
      console.error(`[jobs] register ${name} for ${jobId} failed:`, err);
    }
  }

  void sweepExpiredMedia();
  return (primary ?? fallback)?.id ?? null;
}

function slug(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "output";
}

/**
 * Execute every step of a run in order, threading the previous step's catalog
 * object into the next. A contiguous group of ytdlp steps folds into a single
 * download so "URL → download → trim → crop" costs exactly one fetch.
 */
async function executeRun(jobId: string, runId: string): Promise<void> {
  const db = getCatalogDb();
  setJobStatus(jobId, "running");
  setRunStatus(runId, "running");
  appendJobLog(jobId, `run ${runId.slice(0, 8)} started`);

  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as JobRow;
  const steps = db
    .prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY seq`)
    .all(runId) as StepRow[];

  const outputDir = jobWorkDir(jobId);
  await fsp.mkdir(outputDir, { recursive: true });

  let current = job.source_object_id ?? null;
  let i = 0;

  while (i < steps.length) {
    const op = getOperation(steps[i].op_id);

    if (op?.engine === "ytdlp") {
      // Fold the contiguous download group into one invocation.
      const group: StepRow[] = [];
      while (i < steps.length && getOperation(steps[i].op_id)?.engine === "ytdlp") {
        group.push(steps[i]);
        i++;
      }

      if (!job.source_url) {
        for (const step of group) {
          updateStep(step.id, {
            status: "failed",
            error: "Download steps need a source URL",
          });
        }
        markJobFailed(jobId, runId, "Download steps need a source URL");
        return;
      }

      for (const step of group) updateStep(step.id, { status: "running" });
      const options = buildYtdlpOptions(
        group.map((step) => ({ id: step.op_id, params: parseParams(step.params_json) }))
      );
      const downloadDir = path.join(outputDir, `dl-${group[0].seq}`);
      options.url = job.source_url;
      options.outputTemplate = path.join(downloadDir, "%(title).150B [%(id)s].%(ext)s");

      try {
        await runYtdlp(jobId, group.map((s) => s.id), options, downloadDir);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Download failed";
        for (const step of group) updateStep(step.id, { status: "failed", error: message });
        markJobFailed(jobId, runId, message);
        return;
      }

      const primaryId = await registerDownloadOutputs(
        jobId,
        group[group.length - 1].op_id,
        job.source_url,
        downloadDir
      );
      if (!primaryId) {
        for (const step of group) {
          updateStep(step.id, { status: "failed", error: "Download produced no media" });
        }
        markJobFailed(jobId, runId, "Download produced no media");
        return;
      }

      for (const step of group) {
        updateStep(step.id, {
          status: "completed",
          percent: 100,
          output_object_id: primaryId,
        });
      }
      current = primaryId;
      appendJobLog(jobId, `downloaded → ${primaryId.slice(0, 8)}`);
      continue;
    }

    // ── object-consuming ffmpeg step ──────────────────────────────────────
    const step = steps[i];
    i++;

    if (!current) {
      updateStep(step.id, {
        status: "failed",
        error: "No input object for this step",
      });
      markJobFailed(jobId, runId, "No input object for a processing step");
      return;
    }

    const stored = getStoredObject(current);
    if (!stored) {
      updateStep(step.id, { status: "failed", error: "Input object missing" });
      markJobFailed(jobId, runId, "Input object missing");
      return;
    }

    updateStep(step.id, { status: "running", input_object_id: current });

    const sourcePath = objectFilePath(current);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      updateStep(step.id, { status: "failed", error: "Input bytes missing" });
      markJobFailed(jobId, runId, "Input bytes missing");
      return;
    }

    let staged: string;
    try {
      staged = await stageInput(jobId, sourcePath, stored.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stage input";
      updateStep(step.id, { status: "failed", error: message });
      markJobFailed(jobId, runId, message);
      return;
    }

    const outBase = path.join(outputDir, `${String(step.seq + 1).padStart(2, "0")}-${slug(stored.name)}`);

    let spec: FfmpegStep | FfprobeStep;
    try {
      const extras = await collectExtras(jobId, step, step.op_id);
      spec = buildObjectStep(
        step.op_id,
        parseParams(step.params_json),
        {
          path: staged,
          kind: stored.kind,
          name: stored.name,
          durationSeconds: stored.durationSeconds,
        },
        outBase,
        extras
      );

      if (spec.engine === "ffprobe") {
        await runFfprobe(step, spec);
      } else if (spec.engine === "ffmpeg") {
        if (spec.passes.length === 0) {
          throw new Error(`Operation ${step.op_id} has no ffmpeg passes`);
        }
        await runFfmpeg(jobId, step, spec.passes, outputDir);
      } else {
        throw new Error(`Operation ${step.op_id} is not an object operation`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      updateStep(step.id, { status: "failed", error: message });
      markJobFailed(jobId, runId, message);
      return;
    }

    const producedPath = spec.outputPath;
    const exists = fs.existsSync(producedPath);
    if (!exists) {
      updateStep(step.id, { status: "failed", error: "No output produced" });
      markJobFailed(jobId, runId, "No output produced");
      return;
    }

    let produced: MediaObject;
    try {
      produced = await ingestFile({
        path: producedPath,
        name: spec.outputName,
        // The engine already knows what it produced (an image is an image, a
        // probe is an `other` object), so kind is not left to extension guessing.
        kind: spec.outputKind,
        origin: "derived",
        tool: spec.engine === "ffprobe" ? "ffprobe" : "ffmpeg",
        parents: [current],
        meta: { jobId, opId: step.op_id },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to catalog output";
      updateStep(step.id, { status: "failed", error: message });
      markJobFailed(jobId, runId, message);
      return;
    }

    // Probe a duration for the new object when it is media and still unknown.
    if (produced.kind === "video" || produced.kind === "audio") {
      const seconds = await probeDurationSeconds(producedPath);
      if (seconds != null) setObjectDuration(produced.id, seconds);
    }

    updateStep(step.id, {
      status: "completed",
      percent: 100,
      output_object_id: produced.id,
    });
    current = produced.id;
    void sweepExpiredMedia();
  }

  db.prepare(`UPDATE jobs SET result_object_id = ?, updated_at = ? WHERE id = ?`).run(
    current,
    Date.now(),
    jobId
  );
  db.prepare(`UPDATE runs SET result_object_id = ?, updated_at = ? WHERE id = ?`).run(
    current,
    Date.now(),
    runId
  );
  setRunStatus(runId, "completed");
  setJobStatus(jobId, "completed");
  appendJobLog(jobId, "completed");
}

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      const secs = parseFloat(out.trim());
      resolve(Number.isFinite(secs) && secs > 0 ? secs : null);
    });
  });
}

/** Re-run a failed job by appending a fresh run over the same operations. */
export async function retryJob(jobId: string): Promise<string | null> {
  const db = getCatalogDb();
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
    | JobRow
    | undefined;
  if (!job) return null;

  const previousRun = latestRunId(jobId);
  if (!previousRun) return null;
  const previous = db
    .prepare(`SELECT * FROM steps WHERE run_id = ? ORDER BY seq`)
    .all(previousRun) as StepRow[];
  if (previous.length === 0) return null;

  const runId = randomUUID();
  const now = Date.now();
  db.transaction(() => {
    const attempt =
      ((db.prepare(`SELECT MAX(attempt) AS a FROM runs WHERE job_id = ?`).get(jobId) as {
        a: number | null;
      }).a ?? 0) + 1;

    db.prepare(
      `INSERT INTO runs (id, job_id, attempt, status, error, result_object_id, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', NULL, NULL, ?, ?)`
    ).run(runId, jobId, attempt, now, now);

    const insertStep = db.prepare(
      `INSERT INTO steps (
        id, job_id, run_id, seq, op_id, params_json, status, input_object_id,
        output_object_id, error, log, percent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, NULL, '', 0, ?, ?)`
    );
    for (const step of previous) {
      insertStep.run(
        randomUUID(),
        jobId,
        runId,
        step.seq,
        step.op_id,
        step.params_json,
        now,
        now
      );
    }

    db.prepare(`UPDATE jobs SET status = 'queued', error = NULL, updated_at = ? WHERE id = ?`).run(
      now,
      jobId
    );
  })();

  void executeRun(jobId, runId).catch((err) => {
    markJobFailed(jobId, runId, err instanceof Error ? err.message : String(err));
  });

  return runId;
}
