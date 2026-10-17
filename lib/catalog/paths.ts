// lib/catalog/paths.ts
import "server-only";
import path from "node:path";
import { CATALOG_DIR } from "@/lib/tmp";

/**
 * Where the catalog keeps its SQLite index and content-addressed blobs.
 *
 * Both are temporary — media is deleted 15 minutes after it stops being used
 * (see lib/cleanup.ts) — so this is just the catalog's corner of the temp tree.
 * There is nothing to point at a mounted volume and nothing to configure.
 */
export const CATALOG_DB_PATH = path.join(CATALOG_DIR, "catalog.db");
export const BLOBS_DIR = path.join(CATALOG_DIR, "blobs");

export function blobRelPath(hash: string, ext: string): string {
  return path.join("blobs", hash.slice(0, 2), ext ? `${hash}.${ext}` : hash);
}

export function resolveBlob(relPath: string): string {
  return path.join(CATALOG_DIR, relPath);
}
