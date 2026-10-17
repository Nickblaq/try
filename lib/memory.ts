import { z } from "zod";
import { LocalIndex } from "vectra";
import Database from "better-sqlite3";
import OpenAI from "openai";
import path from "path";
import fs from "fs";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export const THETA_P = 0.4;
export const THETA_S = 0.55;
export const W1 = 0.6;
export const W2 = 0.4;
export const KAPPA = 5;

export const ScoredItemSchema = z.object({
  content: z.string().min(1),
  persistence: z.number().min(0).max(1),
  scope: z.number().min(0).max(1),
});

export type ScoredItem = z.infer<typeof ScoredItemSchema>;
export type MemoryTier = "working" | "episodic" | "shared" | "held";
export type SourceAgent = "researcher" | "synthesizer";

export interface MemoryItem {
  id: string;
  content: string;
  persistence: number;
  scope: number;
  sourceAgent: SourceAgent;
}

export interface ConfirmationResult {
  confirmed: boolean;
  supersedesId?: string;
}

export interface RoutingConfig {
  w1: number;
  w2: number;
  thetaP: number;
  thetaS: number;
}

export const DEFAULT_CONFIG: RoutingConfig = {
  w1: W1,
  w2: W2,
  thetaP: THETA_P,
  thetaS: THETA_S,
};

export function computeR(item: MemoryItem, config: RoutingConfig = DEFAULT_CONFIG): number {
  return config.w1 * item.persistence + config.w2 * item.scope;
}

export function validateScoredItem(raw: unknown): ScoredItem | null {
  const result = ScoredItemSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function toMemoryItem(raw: unknown, sourceAgent: SourceAgent, id: string): MemoryItem {
  const validated = validateScoredItem(raw);
  if (!validated) {
    const content =
      typeof raw === "object" && raw !== null && "content" in raw
        ? String((raw as { content: unknown }).content)
        : "";
    return { id, content, persistence: 0, scope: 0, sourceAgent };
  }
  return { id, ...validated, sourceAgent };
}

export async function routeItem(
  item: MemoryItem,
  confirmWithOtherAgent: (item: MemoryItem) => Promise<ConfirmationResult>
): Promise<{ tier: MemoryTier; supersedesId?: string }> {
  if (item.persistence < THETA_P) return { tier: "working" };
  if (item.scope < THETA_S) return { tier: "episodic" };
  const result = await confirmWithOtherAgent(item);
  return result.confirmed
    ? { tier: "shared", supersedesId: result.supersedesId }
    : { tier: "held" };
}

let cachedDataDir: string | null = null;

export function resolveDataDir(): string {
  if (cachedDataDir) return cachedDataDir;
  const primary = path.join(process.cwd(), "data");
  try {
    fs.mkdirSync(primary, { recursive: true });
    fs.accessSync(primary, fs.constants.W_OK);
    cachedDataDir = primary;
    return primary;
  } catch {
    const fallback = path.join("/tmp", "data");
    fs.mkdirSync(fallback, { recursive: true });
    cachedDataDir = fallback;
    return fallback;
  }
}

interface EmbeddingMode {
  mode: "openai" | "tfidf";
  dim: number;
}

let cachedEmbeddingMode: EmbeddingMode | null = null;

function embeddingModePath(): string {
  return path.join(resolveDataDir(), "embedding-mode.json");
}

function loadEmbeddingMode(): EmbeddingMode | null {
  try {
    const raw = fs.readFileSync(embeddingModePath(), "utf-8");
    const parsed = JSON.parse(raw) as EmbeddingMode;
    if ((parsed.mode === "openai" || parsed.mode === "tfidf") && typeof parsed.dim === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveEmbeddingMode(m: EmbeddingMode): void {
  try {
    fs.writeFileSync(embeddingModePath(), JSON.stringify(m), "utf-8");
  } catch {
    // ignore
  }
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function tfidfVector(text: string, dim = 256): number[] {
  const vector = new Array(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return vector;
  const counts = new Map<number, number>();
  for (const token of tokens) {
    const bucket = fnv1a(token) % dim;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  for (const [bucket, count] of counts) {
    vector[bucket] = count / (count + 1.5);
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vector[i] /= norm;
  }
  return vector;
}

async function initializeEmbeddingMode(): Promise<EmbeddingMode> {
  const persisted = loadEmbeddingMode();
  if (persisted) return persisted;
  try {
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: "probe",
    });
    const dim = res.data[0]?.embedding?.length ?? 0;
    if (dim > 0) {
      const mode: EmbeddingMode = { mode: "openai", dim };
      saveEmbeddingMode(mode);
      return mode;
    }
    throw new Error("empty embedding");
  } catch {
    const mode: EmbeddingMode = { mode: "tfidf", dim: 256 };
    saveEmbeddingMode(mode);
    return mode;
  }
}

export async function embed(text: string): Promise<number[]> {
  if (!cachedEmbeddingMode) {
    cachedEmbeddingMode = await initializeEmbeddingMode();
  }
  if (cachedEmbeddingMode.mode === "openai") {
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return res.data[0].embedding;
  }
  return tfidfVector(text, cachedEmbeddingMode.dim);
}

export interface EpisodicMetadata {
  id: string;
  content: string;
  sourceAgent: SourceAgent;
  heldFromShared?: boolean;
}

export class EpisodicStore {
  private index: LocalIndex;
  private countsPath: string;
  private counts: Record<string, number> = {};

  constructor(agentName: SourceAgent, dataDir: string) {
    const dir = path.join(dataDir, "episodic", agentName);
    this.index = new LocalIndex(dir);
    this.countsPath = path.join(dir, "counts.json");
  }

  async init(): Promise<void> {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex();
    }
    try {
      const raw = fs.readFileSync(this.countsPath, "utf-8");
      this.counts = JSON.parse(raw);
    } catch {
      this.counts = {};
    }
  }

  async write(item: MemoryItem, vector: number[], heldFromShared = false): Promise<void> {
    await this.index.insertItem({
      vector,
      metadata: {
        id: item.id,
        content: item.content,
        sourceAgent: item.sourceAgent,
        heldFromShared,
      },
    });
  }

  async read(queryVector: number[], topK: number): Promise<EpisodicMetadata[]> {
    const results = await this.index.queryItems(queryVector, "", topK);
    return results.map((r) => r.item.metadata as EpisodicMetadata);
  }

  async delete(id: string): Promise<void> {
    const items = await this.index.listItems();
    const found = items.find((i) => (i.metadata as EpisodicMetadata).id === id);
    if (found) {
      await this.index.deleteItem(found.id);
    }
    if (id in this.counts) {
      delete this.counts[id];
      this.persistCounts();
    }
  }

  bumpRetrievalCount(id: string): number {
    const next = (this.counts[id] ?? 0) + 1;
    this.counts[id] = next;
    this.persistCounts();
    return next;
  }

  private persistCounts(): void {
    try {
      fs.writeFileSync(this.countsPath, JSON.stringify(this.counts), "utf-8");
    } catch {
      // ignore
    }
  }

  async readAllWithCounts(): Promise<
    Array<EpisodicMetadata & { retrievalCount: number; kappa: number }>
  > {
    const items = await this.index.listItems();
    return items.map((i) => {
      const meta = i.metadata as EpisodicMetadata;
      return {
        ...meta,
        retrievalCount: this.counts[meta.id] ?? 0,
        kappa: KAPPA,
      };
    });
  }
}

export interface SharedRow {
  id: string;
  content: string;
  sourceAgent: SourceAgent;
  confirmedBy: SourceAgent;
  createdAt: string;
  isActive: number;
  supersedes: string | null;
  promotedFrom: string | null;
}

export class SharedStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shared_memory (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        sourceAgent TEXT NOT NULL,
        confirmedBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        supersedes TEXT,
        promotedFrom TEXT
      );
    `);
  }

  write(
    item: MemoryItem,
    confirmedBy: SourceAgent,
    supersedesId: string | null = null,
    promotedFrom: string | null = null
  ): void {
    const insert = this.db.prepare(`
      INSERT INTO shared_memory (id, content, sourceAgent, confirmedBy, createdAt, isActive, supersedes, promotedFrom)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const update = this.db.prepare(`UPDATE shared_memory SET isActive = 0 WHERE id = ?`);
    const tx = this.db.transaction(() => {
      insert.run(
        item.id,
        item.content,
        item.sourceAgent,
        confirmedBy,
        new Date().toISOString(),
        supersedesId,
        promotedFrom
      );
      if (supersedesId) {
        update.run(supersedesId);
      }
    });
    tx();
  }

  readActive(): SharedRow[] {
    return this.db
      .prepare(`SELECT * FROM shared_memory WHERE isActive = 1 ORDER BY createdAt DESC`)
      .all() as SharedRow[];
  }

  readAll(): Array<SharedRow & { supersededBy: string | null }> {
    const rows = this.db
      .prepare(`SELECT * FROM shared_memory ORDER BY createdAt DESC`)
      .all() as SharedRow[];
    const bySupersedes = new Map<string, string>();
    for (const r of rows) {
      if (r.supersedes) bySupersedes.set(r.supersedes, r.id);
    }
    return rows.map((r) => ({ ...r, supersededBy: bySupersedes.get(r.id) ?? null }));
  }
}

export interface StoreBundle {
  shared: SharedStore;
  episodic: {
    researcher: EpisodicStore;
    synthesizer: EpisodicStore;
  };
}

let cachedStores: StoreBundle | null = null;

export async function getStores(): Promise<StoreBundle> {
  if (cachedStores) return cachedStores;
  const dataDir = resolveDataDir();
  const shared = new SharedStore(path.join(dataDir, "shared.db"));
  const researcher = new EpisodicStore("researcher", dataDir);
  const synthesizer = new EpisodicStore("synthesizer", dataDir);
  await researcher.init();
  await synthesizer.init();
  cachedStores = { shared, episodic: { researcher, synthesizer } };
  return cachedStores;
}

export async function handleMemoryItem(
  item: MemoryItem,
  stores: StoreBundle,
  confirm: (item: MemoryItem) => Promise<ConfirmationResult>,
  embedFn: (text: string) => Promise<number[]>
): Promise<MemoryTier> {
  const { tier, supersedesId } = await routeItem(item, confirm);

  if (tier === "episodic" || tier === "held") {
    const store = stores.episodic[item.sourceAgent];
    const vector = await embedFn(item.content);
    await store.write(item, vector, tier === "held");
  } else if (tier === "shared") {
    const other: SourceAgent =
      item.sourceAgent === "researcher" ? "synthesizer" : "researcher";
    stores.shared.write(item, other, supersedesId ?? null);
  }

  return tier;
}

export async function checkForPromotion(
  item: MemoryItem,
  retrievalCount: number,
  stores: StoreBundle,
  confirm: (item: MemoryItem) => Promise<ConfirmationResult>
): Promise<void> {
  if (retrievalCount < KAPPA) return;
  const result = await confirm(item);
  if (result.confirmed) {
    const other: SourceAgent =
      item.sourceAgent === "researcher" ? "synthesizer" : "researcher";
    stores.shared.write(item, other, result.supersedesId ?? null, item.id);
    await stores.episodic[item.sourceAgent].delete(item.id);
  }
}

export async function readEpisodicAndCheckPromotion(
  agent: SourceAgent,
  stores: StoreBundle,
  queryText: string,
  topK: number,
  confirm: (item: MemoryItem) => Promise<ConfirmationResult>,
  embedFn: (text: string) => Promise<number[]>
): Promise<Array<EpisodicMetadata & { retrievalCount: number; kappa: number }>> {
  const store = stores.episodic[agent];
  const queryVector = await embedFn(queryText);
  const results = await store.read(queryVector, topK);

  const augmented: Array<EpisodicMetadata & { retrievalCount: number; kappa: number }> = [];
  for (const r of results) {
    const count = store.bumpRetrievalCount(r.id);
    const item: MemoryItem = {
      id: r.id,
      content: r.content,
      persistence: 1,
      scope: 1,
      sourceAgent: r.sourceAgent,
    };
    await checkForPromotion(item, count, stores, confirm);
    augmented.push({ ...r, retrievalCount: count, kappa: KAPPA });
  }
  return augmented;
}
