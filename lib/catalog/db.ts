// lib/catalog/db.ts
import "server-only";
import fs from "node:fs";
import Database from "better-sqlite3";
import { CATALOG_DB_PATH } from "./paths";
import { CATALOG_DIR } from "@/lib/tmp";

export type CatalogDb = Database.Database;

// Cache the connection across HMR reloads in dev so we don't open a new
// handle (and re-run migrations) on every module reload.
const globalForDb = globalThis as unknown as { __cufxCatalogDb?: CatalogDb };

const MIGRATIONS: string[] = [
  // v1 — the catalog itself.
  `
  CREATE TABLE objects (
    id               TEXT PRIMARY KEY,
    hash             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    kind             TEXT NOT NULL,
    mime             TEXT,
    ext              TEXT NOT NULL DEFAULT '',
    size_bytes       INTEGER NOT NULL,
    duration_seconds REAL,
    width            INTEGER,
    height           INTEGER,
    origin           TEXT NOT NULL,
    url              TEXT,
    provider         TEXT,
    tool             TEXT,
    meta_json        TEXT NOT NULL DEFAULT '{}',
    blob_path        TEXT NOT NULL,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
  );
  CREATE INDEX idx_objects_kind ON objects(kind);
  CREATE INDEX idx_objects_origin ON objects(origin);
  CREATE INDEX idx_objects_created ON objects(created_at DESC);

  CREATE TABLE edges (
    child_id  TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    relation  TEXT NOT NULL DEFAULT 'derived_from',
    PRIMARY KEY (child_id, parent_id, relation)
  );
  CREATE INDEX idx_edges_parent ON edges(parent_id);
  `,

  // v2 — job state. This replaces the old per-job status.json files: the
  // canonical record of what was asked for, how far it has got, and what it
  // produced now lives in the same SQLite file as the catalog it writes to.
  //
  // A `job` is the user's request. A `run` is one attempt at executing it
  // (retry-safe: a failed run is kept and a new one is appended rather than
  // mutating history). A `step` is one operation within a run; its
  // output_object_id is a catalog link, so the next step can consume the
  // previous step's result without any re-upload.
  `
  CREATE TABLE jobs (
    id                TEXT PRIMARY KEY,
    source_object_id  TEXT,
    source_url        TEXT,
    status            TEXT NOT NULL,
    error             TEXT,
    log               TEXT NOT NULL DEFAULT '',
    result_object_id  TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );
  CREATE INDEX idx_jobs_created ON jobs(created_at DESC);

  CREATE TABLE runs (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL,
    attempt           INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL,
    error             TEXT,
    result_object_id  TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );
  CREATE INDEX idx_runs_job ON runs(job_id, attempt DESC);

  CREATE TABLE steps (
    id                TEXT PRIMARY KEY,
    job_id            TEXT NOT NULL,
    run_id            TEXT NOT NULL,
    seq               INTEGER NOT NULL,
    op_id             TEXT NOT NULL,
    params_json       TEXT NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL,
    input_object_id   TEXT,
    output_object_id  TEXT,
    error             TEXT,
    log               TEXT NOT NULL DEFAULT '',
    percent           REAL NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );
  CREATE INDEX idx_steps_job ON steps(job_id, seq);
  CREATE INDEX idx_steps_run ON steps(run_id, seq);
  `,
];

export function getCatalogDb(): CatalogDb {
  if (globalForDb.__cufxCatalogDb) return globalForDb.__cufxCatalogDb;

  fs.mkdirSync(CATALOG_DIR, { recursive: true });
  const db = new Database(CATALOG_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  globalForDb.__cufxCatalogDb = db;
  return db;
}

function migrate(db: CatalogDb): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const run = db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    });
    run();
  }
}
