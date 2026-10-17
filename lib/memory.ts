// Hierarchical memory for the two-agent pipeline.
// working  -> never persisted
// episodic -> per-agent local vector index (vectra)
// shared   -> sqlite table, gated by the other agent's confirmation
// held     -> kept in the agent's episodic index, flagged as heldFromShared

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import OpenAI from "openai";
import { LocalIndex } from "vectra";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const THETA_P = 0.4;
export const THETA_S = 0.55;
export const W1 = 0.6;
export const W2 = 0.4;
export const KAPPA = 5;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const EMBEDDING_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
const TFIDF_DIMENSIONS = 256;
const EMBEDDING_MODE_FILE = "embedding.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface RouteResult {
    tier: MemoryTier;
    supersedesId?: string;
}

export interface MemoryLogEntry {
    id: string;
    content: string;
    tier: MemoryTier;
    agent: SourceAgent;
    persistence: number;
    scope: number;
}

export type ConfirmFn = (item: MemoryItem) => Promise<ConfirmationResult>;

export type EmbedFn = (text: string) => Promise<number[]>;

export type EpisodicMetadata = {
    content: string;
    sourceAgent: string;
    heldFromShared: boolean;
    persistence: number;
    scope: number;
    createdAt: string;
};

export interface EpisodicEntry {
    id: string;
    content: string;
    sourceAgent: SourceAgent;
    heldFromShared: boolean;
    persistence: number;
    scope: number;
}

export interface RetrievedEpisodicEntry extends EpisodicEntry {
    retrievalCount: number;
    kappa: number;
}

export interface EpisodicSummary {
    id: string;
    content: string;
    retrievalCount: number;
    kappa: number;
    heldFromShared: boolean;
}

export interface SharedMemoryRow {
    id: string;
    content: string;
    sourceAgent: SourceAgent;
    confirmedBy: SourceAgent;
    createdAt: string;
    isActive: number;
    supersedes: string | null;
    promotedFrom: string | null;
}

export interface SharedMemoryRecord extends SharedMemoryRow {
    supersededBy: string | null;
}

export interface Stores {
    shared: SharedStore;
    episodic: Record<SourceAgent, EpisodicStore>;
}

// ---------------------------------------------------------------------------
// Scoring and routing
// ---------------------------------------------------------------------------

/**
 * R = W1 * persistence + W2 * scope.
 * Exported for logging only: routing never branches on R.
 */
export function computeR(item: Pick<MemoryItem, "persistence" | "scope">): number {
    return W1 * item.persistence + W2 * item.scope;
}

export function otherAgent(agent: SourceAgent): SourceAgent {
    return agent === "researcher" ? "synthesizer" : "researcher";
}

/**
 * persistence < THETA_P          -> working
 * scope < THETA_S                -> episodic
 * otherwise ask the other agent  -> shared (maybe superseding) or held
 */
export async function routeItem(item: MemoryItem, confirm: ConfirmFn): Promise<RouteResult> {
    if (item.persistence < THETA_P) {
        return { tier: "working" };
    }
    if (item.scope < THETA_S) {
        return { tier: "episodic" };
    }

    const confirmation = await confirm(item);
    if (confirmation.confirmed) {
        return { tier: "shared", supersedesId: confirmation.supersedesId };
    }
    return { tier: "held" };
}

function extractContent(raw: unknown): string {
    if (typeof raw === "string") {
        return raw;
    }
    if (raw && typeof raw === "object") {
        const content = (raw as Record<string, unknown>).content;
        if (typeof content === "string") {
            return content;
        }
    }
    return "";
}

/**
 * Never throws. Anything that does not validate becomes a zero-score item,
 * which routes to working memory by design.
 */
export function toMemoryItem(raw: unknown, sourceAgent: SourceAgent, id: string): MemoryItem {
    const parsed = ScoredItemSchema.safeParse(raw);
    if (parsed.success) {
        return {
            id,
            sourceAgent,
            content: parsed.data.content,
            persistence: parsed.data.persistence,
            scope: parsed.data.scope,
        };
    }
    return {
        id,
        sourceAgent,
        content: extractContent(raw),
        persistence: 0,
        scope: 0,
    };
}

// ---------------------------------------------------------------------------
// Data directory
// ---------------------------------------------------------------------------

let cachedDataDir: string | null = null;

function isWritableDir(dir: string): boolean {
    const probe = path.join(dir, `.write-probe-${process.pid}-${Date.now()}`);
    try {
        writeFileSync(probe, "ok", "utf8");
        unlinkSync(probe);
        return true;
    } catch {
        return false;
    }
}

/**
 * Prefer <project root>/data, fall back to <tmp>/data. Cached for the process.
 */
export function resolveDataDir(): string {
    if (cachedDataDir) {
        return cachedDataDir;
    }

    const projectData = path.join(process.cwd(), "data");
    try {
        mkdirSync(projectData, { recursive: true });
        if (isWritableDir(projectData)) {
            cachedDataDir = projectData;
            return cachedDataDir;
        }
    } catch {
        // fall through to tmp
    }

    const tmpData = path.join(os.tmpdir(), "data");
    try {
        mkdirSync(tmpData, { recursive: true });
    } catch {
        // nothing else to try
    }
    cachedDataDir = tmpData;
    return cachedDataDir;
}

// ---------------------------------------------------------------------------
// Embeddings: one mode per deployment, persisted, never mixed
// ---------------------------------------------------------------------------

interface EmbeddingMode {
    mode: "openai" | "tfidf";
    dimensions: number;
}

let embeddingModePromise: Promise<EmbeddingMode> | null = null;
let openaiClient: OpenAI | null = null;

function getEmbeddingClient(): OpenAI {
    if (!openaiClient) {
        openaiClient = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY ?? "",
            baseURL: OPENROUTER_BASE_URL,
        });
    }
    return openaiClient;
}

function embeddingModePath(): string {
    return path.join(resolveDataDir(), EMBEDDING_MODE_FILE);
}

function readPersistedEmbeddingMode(): EmbeddingMode | null {
    try {
        const file = embeddingModePath();
        if (!existsSync(file)) {
            return null;
        }
        const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<EmbeddingMode>;
        if ((parsed.mode === "openai" || parsed.mode === "tfidf") && Number.isInteger(parsed.dimensions)) {
            return { mode: parsed.mode, dimensions: parsed.dimensions as number };
        }
    } catch {
        // corrupt or unreadable -> treat as missing
    }
    return null;
}

function persistEmbeddingMode(mode: EmbeddingMode): void {
    try {
        writeFileSync(embeddingModePath(), JSON.stringify(mode, null, 2), "utf8");
    } catch {
        // The in-process cache still keeps dimensions consistent for this lifetime.
    }
}

async function probeEmbeddingMode(): Promise<EmbeddingMode> {
    const persisted = readPersistedEmbeddingMode();
    if (persisted) {
        return persisted;
    }

    try {
        const response = await getEmbeddingClient().embeddings.create({
            model: EMBEDDING_MODEL,
            input: "cufx hierarchical memory probe",
        });
        const vector = response.data[0]?.embedding;
        if (!Array.isArray(vector) || vector.length === 0) {
            throw new Error("embedding probe returned no vector");
        }
        const mode: EmbeddingMode = { mode: "openai", dimensions: vector.length };
        persistEmbeddingMode(mode);
        return mode;
    } catch {
        const mode: EmbeddingMode = { mode: "tfidf", dimensions: TFIDF_DIMENSIONS };
        persistEmbeddingMode(mode);
        return mode;
    }
}

function getEmbeddingMode(): Promise<EmbeddingMode> {
    if (!embeddingModePromise) {
        // Checked once per deployment (first use), then cached for the process.
        embeddingModePromise = probeEmbeddingMode();
    }
    return embeddingModePromise;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(token: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Deterministic 256-dimension TF-IDF-style embedding.
 * Lowercase, split on non-word chars, drop short tokens, FNV-1a into buckets,
 * accumulate count / (count + 1.5) per token, then L2 normalize.
 */
export function tfidfEmbed(text: string, dimensions: number = TFIDF_DIMENSIONS): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const tokens = text
        .toLowerCase()
        .split(/\W+/)
        .filter((token) => token.length >= 3);

    if (tokens.length === 0) {
        return vector;
    }

    const counts = new Map<string, number>();
    for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }

    for (const [token, count] of counts) {
        const bucket = fnv1a(token) % dimensions;
        vector[bucket] += count / (count + 1.5);
    }

    let sumSquares = 0;
    for (const value of vector) {
        sumSquares += value * value;
    }
    if (sumSquares === 0) {
        return vector;
    }
    const norm = Math.sqrt(sumSquares);
    return vector.map((value) => value / norm);
}

export async function embed(text: string): Promise<number[]> {
    const mode = await getEmbeddingMode();

    if (mode.mode === "tfidf") {
        return tfidfEmbed(text, mode.dimensions);
    }

    // OpenAI mode is sticky: a later failure throws instead of silently
    // switching modes and corrupting the vector index with other dimensions.
    const response = await getEmbeddingClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
    });
    const vector = response.data[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== mode.dimensions) {
        throw new Error(
            `embedding dimension mismatch: expected ${mode.dimensions}, got ${vector?.length ?? 0}`,
        );
    }
    return vector;
}

// ---------------------------------------------------------------------------
// Episodic store (one vectra index per agent)
// ---------------------------------------------------------------------------

export class EpisodicStore {
    readonly agent: SourceAgent;
    readonly dataDir: string;
    private readonly index: LocalIndex<EpisodicMetadata>;
    private readonly countsFile: string;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(dataDir: string, agent: SourceAgent) {
        this.agent = agent;
        this.dataDir = dataDir;
        this.index = new LocalIndex<EpisodicMetadata>(path.join(dataDir, "episodic", agent));
        this.countsFile = path.join(dataDir, "episodic", agent, "counts.json");
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    async init(): Promise<void> {
        await fsp.mkdir(path.dirname(this.countsFile), { recursive: true });
        if (!(await this.index.isIndexCreated())) {
            await this.index.createIndex({ version: 1 });
        }
        await this.ensureCountsFile();
    }

    private async ensureCountsFile(): Promise<void> {
        if (!existsSync(this.countsFile)) {
            await fsp.writeFile(this.countsFile, "{}", "utf8");
        }
    }

    private async readCounts(): Promise<Record<string, number>> {
        try {
            const raw = await fsp.readFile(this.countsFile, "utf8");
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const counts: Record<string, number> = {};
            for (const [id, value] of Object.entries(parsed)) {
                if (typeof value === "number" && Number.isFinite(value)) {
                    counts[id] = value;
                }
            }
            return counts;
        } catch {
            return {};
        }
    }

    async write(item: MemoryItem, vector: number[], heldFromShared = false): Promise<void> {
        await this.enqueue(async () => {
            await fsp.mkdir(path.dirname(this.countsFile), { recursive: true });
            if (!(await this.index.isIndexCreated())) {
                await this.index.createIndex({ version: 1 });
            }
            await this.index.beginUpdate();
            try {
                await this.index.upsertItem({
                    id: item.id,
                    vector,
                    metadata: {
                        content: item.content,
                        sourceAgent: item.sourceAgent,
                        heldFromShared,
                        persistence: item.persistence,
                        scope: item.scope,
                        createdAt: new Date().toISOString(),
                    },
                });
            } finally {
                await this.index.endUpdate();
            }
        });
    }

    async read(queryVector: number[], topK: number): Promise<EpisodicEntry[]> {
        if (!(await this.index.isIndexCreated())) {
            return [];
        }
        const results = await this.index.queryItems(queryVector, "", Math.max(1, topK));
        return results.map((result) => ({
            id: result.item.id,
            content: String(result.item.metadata.content ?? ""),
            sourceAgent: this.agent,
            heldFromShared: Boolean(result.item.metadata.heldFromShared),
            persistence: Number(result.item.metadata.persistence ?? 0),
            scope: Number(result.item.metadata.scope ?? 0),
        }));
    }

    async delete(id: string): Promise<void> {
        await this.enqueue(async () => {
            if (!(await this.index.isIndexCreated())) {
                return;
            }
            await this.index.beginUpdate();
            try {
                await this.index.deleteItem(id);
            } finally {
                await this.index.endUpdate();
            }
        });
    }

    async bumpRetrievalCount(id: string): Promise<number> {
        return this.enqueue(async () => {
            await this.ensureCountsFile();
            const counts = await this.readCounts();
            const next = (counts[id] ?? 0) + 1;
            counts[id] = next;
            await fsp.writeFile(this.countsFile, JSON.stringify(counts, null, 2), "utf8");
            return next;
        });
    }

    /**
     * Every entry in this index, merged with its retrieval counts.
     */
    async readAllWithCounts(): Promise<EpisodicSummary[]> {
        if (!(await this.index.isIndexCreated())) {
            return [];
        }
        const [items, counts] = await Promise.all([
            this.index.listItems<EpisodicMetadata>(),
            this.readCounts(),
        ]);
        return items.map((item) => ({
            id: item.id,
            content: String(item.metadata.content ?? ""),
            retrievalCount: counts[item.id] ?? 0,
            kappa: KAPPA,
            heldFromShared: Boolean(item.metadata.heldFromShared),
        }));
    }
}

// ---------------------------------------------------------------------------
// Shared store (sqlite)
// ---------------------------------------------------------------------------

export class SharedStore {
    readonly db: Database.Database;

    constructor(dataDir: string) {
        this.db = new Database(path.join(dataDir, "shared.db"));
        this.db.pragma("journal_mode = WAL");
    }

    init(): void {
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
            )
        `);
    }

    write(item: MemoryItem, confirmedBy: SourceAgent, supersedesId?: string, promotedFrom?: string): void {
        const insert = this.db.prepare(`
            INSERT OR REPLACE INTO shared_memory
                (id, content, sourceAgent, confirmedBy, createdAt, isActive, supersedes, promotedFrom)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `);
        const deactivate = this.db.prepare(`UPDATE shared_memory SET isActive = 0 WHERE id = ?`);

        const transaction = this.db.transaction(() => {
            insert.run(
                item.id,
                item.content,
                item.sourceAgent,
                confirmedBy,
                new Date().toISOString(),
                supersedesId ?? null,
                promotedFrom ?? null,
            );
            if (supersedesId) {
                deactivate.run(supersedesId);
            }
        });
        transaction();
    }

    readActive(): SharedMemoryRow[] {
        return this.db
            .prepare(
                `SELECT id, content, sourceAgent, confirmedBy, createdAt, isActive, supersedes, promotedFrom
                 FROM shared_memory WHERE isActive = 1 ORDER BY createdAt ASC`,
            )
            .all() as SharedMemoryRow[];
    }

    readAll(): SharedMemoryRecord[] {
        const rows = this.db
            .prepare(
                `SELECT id, content, sourceAgent, confirmedBy, createdAt, isActive, supersedes, promotedFrom
                 FROM shared_memory ORDER BY createdAt ASC`,
            )
            .all() as SharedMemoryRow[];

        const supersededBy = new Map<string, string>();
        for (const row of rows) {
            if (row.supersedes) {
                supersededBy.set(row.supersedes, row.id);
            }
        }

        return rows.map((row) => ({ ...row, supersededBy: supersededBy.get(row.id) ?? null }));
    }

    close(): void {
        this.db.close();
    }
}

// ---------------------------------------------------------------------------
// Dispatch, promotion, retrieval
// ---------------------------------------------------------------------------

export async function handleMemoryItem(
    item: MemoryItem,
    stores: Stores,
    confirm: ConfirmFn,
    embedText: EmbedFn,
): Promise<MemoryTier> {
    const route = await routeItem(item, confirm);

    switch (route.tier) {
        case "working":
            return "working";

        case "episodic": {
            const vector = await embedText(item.content);
            await stores.episodic[item.sourceAgent].write(item, vector, false);
            return "episodic";
        }

        case "held": {
            const vector = await embedText(item.content);
            await stores.episodic[item.sourceAgent].write(item, vector, true);
            return "held";
        }

        case "shared": {
            stores.shared.write(item, otherAgent(item.sourceAgent), route.supersedesId);
            return "shared";
        }
    }
}

export async function checkForPromotion(
    item: MemoryItem,
    retrievalCount: number,
    shared: SharedStore,
    confirm: ConfirmFn,
    episodic?: EpisodicStore,
): Promise<boolean> {
    if (retrievalCount < KAPPA) {
        return false;
    }

    const confirmation = await confirm(item);
    if (!confirmation.confirmed) {
        return false;
    }

    shared.write(item, otherAgent(item.sourceAgent), confirmation.supersedesId, item.id);

    const store = episodic ?? (await getStores()).episodic[item.sourceAgent];
    await store.delete(item.id);
    return true;
}

export async function readEpisodicAndCheckPromotion(
    agent: SourceAgent,
    episodic: EpisodicStore,
    shared: SharedStore,
    queryText: string,
    topK: number,
    confirm: ConfirmFn,
    embedText: EmbedFn,
): Promise<RetrievedEpisodicEntry[]> {
    const queryVector = await embedText(queryText);
    const entries = await episodic.read(queryVector, topK);

    const results: RetrievedEpisodicEntry[] = [];
    for (const entry of entries) {
        const retrievalCount = await episodic.bumpRetrievalCount(entry.id);
        const item: MemoryItem = {
            id: entry.id,
            content: entry.content,
            persistence: entry.persistence,
            scope: entry.scope,
            sourceAgent: agent,
        };

        try {
            await checkForPromotion(item, retrievalCount, shared, confirm, episodic);
        } catch (error) {
            // A promotion failure must not take down the run.
            console.warn("promotion check failed", error);
        }

        results.push({ ...entry, sourceAgent: agent, retrievalCount, kappa: KAPPA });
    }

    return results;
}

// ---------------------------------------------------------------------------
// Process-level store cache
// ---------------------------------------------------------------------------

let storesPromise: Promise<Stores> | null = null;

export function getStores(): Promise<Stores> {
    if (!storesPromise) {
        storesPromise = (async () => {
            const dataDir = resolveDataDir();

            const shared = new SharedStore(dataDir);
            shared.init();

            const researcher = new EpisodicStore(dataDir, "researcher");
            const synthesizer = new EpisodicStore(dataDir, "synthesizer");
            await researcher.init();
            await synthesizer.init();

            return { shared, episodic: { researcher, synthesizer } };
        })().catch((error) => {
            storesPromise = null;
            throw error;
        });
    }
    return storesPromise;
}
