// lib/catalog/store.ts
import "server-only";
import { mkdir, writeFile, stat, readdir, unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { getCatalogDb } from "./db";
import { sha256, inferKind, resolveExt } from "./blobs";
import { blobRelPath, resolveBlob, BLOBS_DIR } from "./paths";
import type {
  CatalogFilter,
  IngestFileInput,
  IngestInput,
  MediaKind,
  MediaObject,
  ObjectOrigin,
  StoredMediaObject,
} from "./types";

/* --------------------------------- rows ---------------------------------- */

type ObjectRow = {
  id: string;
  hash: string;
  name: string;
  kind: string;
  mime: string | null;
  ext: string;
  size_bytes: number;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  origin: string;
  url: string | null;
  provider: string | null;
  tool: string | null;
  meta_json: string;
  blob_path: string;
  created_at: number;
  updated_at: number;
};

function parseMeta(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToStored(row: ObjectRow, parents: string[]): StoredMediaObject {
  return {
    id: row.id,
    hash: row.hash,
    name: row.name,
    kind: row.kind as MediaKind,
    mime: row.mime,
    ext: row.ext,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    origin: row.origin as ObjectOrigin,
    url: row.url,
    provider: row.provider,
    tool: row.tool,
    parents,
    meta: parseMeta(row.meta_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    blobPath: row.blob_path,
  };
}

/** Strip the internal on-disk location before a record leaves the server. */
export function toPublic(obj: StoredMediaObject): MediaObject {
  const { blobPath: _ignored, ...pub } = obj;
  void _ignored;
  return pub;
}

/* --------------------------------- reads --------------------------------- */

function parentsOf(id: string): string[] {
  const rows = getCatalogDb()
    .prepare(`SELECT parent_id FROM edges WHERE child_id = ? ORDER BY parent_id`)
    .all(id) as { parent_id: string }[];
  return rows.map((r) => r.parent_id);
}

export function getStoredObject(id: string): StoredMediaObject | null {
  const row = getCatalogDb()
    .prepare(`SELECT * FROM objects WHERE id = ?`)
    .get(id) as ObjectRow | undefined;
  return row ? rowToStored(row, parentsOf(row.id)) : null;
}

export function getObject(id: string): MediaObject | null {
  const stored = getStoredObject(id);
  return stored ? toPublic(stored) : null;
}

export function getStoredObjectByHash(hash: string): StoredMediaObject | null {
  const row = getCatalogDb()
    .prepare(`SELECT * FROM objects WHERE hash = ?`)
    .get(hash) as ObjectRow | undefined;
  return row ? rowToStored(row, parentsOf(row.id)) : null;
}

export function getObjectByHash(hash: string): MediaObject | null {
  const stored = getStoredObjectByHash(hash);
  return stored ? toPublic(stored) : null;
}

export function listObjects(filter: CatalogFilter = {}): MediaObject[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) {
    clauses.push("kind = ?");
    params.push(filter.kind);
  }
  if (filter.origin) {
    clauses.push("origin = ?");
    params.push(filter.origin);
  }
  if (filter.search) {
    clauses.push("LOWER(name) LIKE ?");
    params.push(`%${filter.search.toLowerCase()}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);

  const rows = getCatalogDb()
    .prepare(`SELECT * FROM objects ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, limit) as ObjectRow[];

  return rows.map((r) => toPublic(rowToStored(r, parentsOf(r.id))));
}

/** Absolute path to an object's bytes, or null if it is missing on disk. */
export function objectFilePath(id: string): string | null {
  const stored = getStoredObject(id);
  return stored ? resolveBlob(stored.blobPath) : null;
}

/* --------------------------------- writes -------------------------------- */

function linkDerivation(childId: string, parentIds: string[]): void {
  const db = getCatalogDb();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO edges (child_id, parent_id, relation) VALUES (?, ?, 'derived_from')`
  );
  const run = db.transaction((ids: string[]) => {
    for (const pid of ids) {
      if (pid && pid !== childId) stmt.run(childId, pid);
    }
  });
  run(parentIds);
}

type NewObject = {
  hash: string;
  name: string;
  ext: string;
  kind: MediaKind;
  mime: string | null;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  origin: ObjectOrigin;
  url: string | null;
  provider: string | null;
  tool: string | null;
  meta: Record<string, unknown>;
  blobPath: string;
};

function insertObject(p: NewObject): StoredMediaObject {
  const id = randomUUID();
  const now = Date.now();
  getCatalogDb()
    .prepare(
      `INSERT INTO objects (
        id, hash, name, kind, mime, ext, size_bytes, duration_seconds,
        width, height, origin, url, provider, tool, meta_json, blob_path,
        created_at, updated_at
      ) VALUES (
        @id, @hash, @name, @kind, @mime, @ext, @sizeBytes, @durationSeconds,
        @width, @height, @origin, @url, @provider, @tool, @metaJson, @blobPath,
        @createdAt, @updatedAt
      )`
    )
    .run({
      id,
      hash: p.hash,
      name: p.name,
      kind: p.kind,
      mime: p.mime,
      ext: p.ext,
      sizeBytes: p.sizeBytes,
      durationSeconds: p.durationSeconds,
      width: p.width,
      height: p.height,
      origin: p.origin,
      url: p.url,
      provider: p.provider,
      tool: p.tool,
      metaJson: JSON.stringify(p.meta),
      blobPath: p.blobPath,
      createdAt: now,
      updatedAt: now,
    });

  const created = getStoredObject(id);
  if (!created) throw new Error("Catalog insert failed");
  return created;
}

function deriveFields(input: {
  name: string;
  mime?: string | null;
  kind?: MediaKind;
  ext?: string;
}): { kind: MediaKind; ext: string } {
  const kind: MediaKind = input.kind ?? inferKind(input.mime ?? null, input.name);
  const ext = input.ext || resolveExt(input.name, input.mime ?? null, kind);
  return { kind, ext };
}

/**
 * Add bytes to the catalog. If an object with identical content already
 * exists, its record is returned unchanged (the existing object is the one
 * true owner of those bytes) and any new parent links are still recorded.
 */
export async function ingestObject(input: IngestInput): Promise<MediaObject> {
  const hash = sha256(input.data);
  const parents = input.parents ?? [];

  const existing = getStoredObjectByHash(hash);
  if (existing) {
    if (parents.length) linkDerivation(existing.id, parents);
    return toPublic(existing);
  }

  const { kind, ext } = deriveFields({
    name: input.name,
    mime: input.mime,
    kind: input.kind,
  });
  const relPath = blobRelPath(hash, ext);
  const absPath = resolveBlob(relPath);

  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, input.data);

  const created = insertObject({
    hash,
    name: input.name,
    ext,
    kind,
    mime: input.mime ?? null,
    sizeBytes: input.data.byteLength,
    durationSeconds: input.durationSeconds ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    origin: input.origin,
    url: input.url ?? null,
    provider: input.provider ?? null,
    tool: input.tool ?? null,
    meta: input.meta ?? {},
    blobPath: relPath,
  });

  if (parents.length) linkDerivation(created.id, parents);
  return toPublic(created);
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * Same contract as ingestObject but sources the bytes from a file on disk,
 * streaming it into the blob store so multi-gigabyte media never has to be
 * held in memory. Used by the download path, where outputs already exist as
 * files.
 */
export async function ingestFile(input: IngestFileInput): Promise<MediaObject> {
  const name = input.name ?? path.basename(input.path);
  const hash = await hashFile(input.path);
  const parents = input.parents ?? [];

  const existing = getStoredObjectByHash(hash);
  if (existing) {
    if (parents.length) linkDerivation(existing.id, parents);
    return toPublic(existing);
  }

  const info = await stat(input.path);
  const { kind, ext } = deriveFields({
    name,
    mime: input.mime,
    kind: input.kind,
  });
  const relPath = blobRelPath(hash, ext);
  const absPath = resolveBlob(relPath);

  await mkdir(path.dirname(absPath), { recursive: true });
  await pipeline(createReadStream(input.path), createWriteStream(absPath));

  const created = insertObject({
    hash,
    name,
    ext,
    kind,
    mime: input.mime ?? null,
    sizeBytes: info.size,
    durationSeconds: input.durationSeconds ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    origin: input.origin,
    url: input.url ?? null,
    provider: input.provider ?? null,
    tool: input.tool ?? null,
    meta: input.meta ?? {},
    blobPath: relPath,
  });

  if (parents.length) linkDerivation(created.id, parents);
  return toPublic(created);
}

export function setObjectDuration(id: string, seconds: number): void {
  getCatalogDb()
    .prepare(`UPDATE objects SET duration_seconds = ?, updated_at = ? WHERE id = ?`)
    .run(seconds, Date.now(), id);
}

/**
 * Remove an object entirely: its row, every edge that referenced it, and the
 * blob on disk. Leaving the blob behind would keep the file listed by nothing
 * but still eating server space until the next orphan sweep.
 */
export async function deleteObject(id: string): Promise<boolean> {
  const stored = getStoredObject(id);
  if (!stored) return false;

  const db = getCatalogDb();
  db.transaction(() => {
    db.prepare(`DELETE FROM edges WHERE child_id = ? OR parent_id = ?`).run(id, id);
    db.prepare(`DELETE FROM objects WHERE id = ?`).run(id);
  })();

  await unlink(resolveBlob(stored.blobPath)).catch(() => {});
  return true;
}

/* -------------------------------- expiry --------------------------------- */

/**
 * Deletes catalog objects that have outlived `cutoff` (an epoch ms), along with
 * their blobs. The row goes first: a record whose bytes are already gone would
 * surface in the UI as a download that 410s, which is worse than not listing it
 * at all.
 */
export async function purgeExpiredObjects(cutoff: number): Promise<number> {
  const db = getCatalogDb();
  const expired = db
    .prepare(`SELECT id, blob_path FROM objects WHERE updated_at < ?`)
    .all(cutoff) as { id: string; blob_path: string }[];

  if (expired.length > 0) {
    const dropEdges = db.prepare(
      `DELETE FROM edges WHERE child_id = ? OR parent_id = ?`
    );
    const dropObject = db.prepare(`DELETE FROM objects WHERE id = ?`);
    const run = db.transaction((rows: { id: string }[]) => {
      for (const row of rows) {
        dropEdges.run(row.id, row.id);
        dropObject.run(row.id);
      }
    });
    run(expired);

    await Promise.all(
      expired.map((row) => unlink(resolveBlob(row.blob_path)).catch(() => {}))
    );
  }

  await purgeOrphanBlobs(cutoff);
  return expired.length;
}

/**
 * Blob files with no row — the residue of a process that died between writing
 * bytes and inserting the record — would otherwise sit on disk forever, so
 * they are swept too. Files younger than the cutoff are left alone: an ingest
 * that is mid-write has no row yet either.
 */
async function purgeOrphanBlobs(cutoff: number): Promise<void> {
  const known = new Set(
    (getCatalogDb().prepare(`SELECT blob_path FROM objects`).all() as {
      blob_path: string;
    }[]).map((row) => row.blob_path)
  );

  const shards = await readdir(BLOBS_DIR).catch(() => [] as string[]);
  for (const shard of shards) {
    const shardDir = path.join(BLOBS_DIR, shard);
    const files = await readdir(shardDir).catch(() => [] as string[]);
    for (const file of files) {
      const relPath = path.join("blobs", shard, file);
      if (known.has(relPath)) continue;
      const info = await stat(path.join(shardDir, file)).catch(() => null);
      if (!info || info.mtimeMs >= cutoff) continue;
      await unlink(path.join(shardDir, file)).catch(() => {});
    }
  }
}
