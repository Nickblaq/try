// lib/tmp.ts
//
// Where cufx keeps its disposable working data.
//
// Everything here is one directory at the project root — `.cufx-data/` — so the
// SQLite catalog, its blobs, and per-job scratch files are all in one
// gitignored corner of the repo instead of an OS temp dir that differs between
// dev and production. The catalog is the source of truth for media objects;
// individual job folders are scratch space that is swept once it goes idle
// (see lib/cleanup.ts).
import "server-only";
import path from "node:path";
import { readdir, rm, stat } from "node:fs/promises";

/** One root for every file cufx owns. Gitignored. */
export const DATA_ROOT = path.join(process.cwd(), ".cufx-data");

/** SQLite index + content-addressed blobs — the shared catalog. */
export const CATALOG_DIR = path.join(DATA_ROOT, "catalog");

/** One scratch directory per job, holding its working files. */
export const JOBS_DIR = path.join(DATA_ROOT, "jobs");

/** Temporary media is deleted once it has been idle for this long. */
export const MEDIA_TTL_MS = 15 * 60 * 1000;

/**
 * The newest modification time found anywhere inside `target`, in ms.
 *
 * Age is measured from the newest write rather than from creation so that work
 * in progress protects itself: a job still downloading or encoding keeps
 * rewriting its output, so its directory stays young and is never deleted out
 * from under it.
 */
export async function newestMtimeMs(target: string): Promise<number> {
  const info = await stat(target).catch(() => null);
  if (!info) return 0;
  if (!info.isDirectory()) return info.mtimeMs;

  let newest = info.mtimeMs;
  for (const entry of await readdir(target).catch(() => [])) {
    newest = Math.max(newest, await newestMtimeMs(path.join(target, entry)));
  }
  return newest;
}

/** Deletes every entry directly inside `dir` that has been idle since `cutoff`. */
export async function removeExpiredChildren(dir: string, cutoff: number): Promise<void> {
  for (const entry of await readdir(dir).catch(() => [])) {
    const target = path.join(dir, entry);
    if ((await newestMtimeMs(target)) < cutoff) {
      await rm(target, { recursive: true, force: true }).catch(() => {});
    }
  }
}
