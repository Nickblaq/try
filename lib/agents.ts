// Researcher and Synthesizer agents plus every prompt the pipeline uses.
// The model itself scores each observation it writes (persistence + scope),
// so routing decisions come out of the same call that produced the content.

import { randomUUID } from "node:crypto";

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";

import {
    type ConfirmationResult,
    type EpisodicStore,
    type MemoryItem,
    type MemoryLogEntry,
    type RetrievedEpisodicEntry,
    type SharedMemoryRow,
    type SharedStore,
    type SourceAgent,
    type Stores,
    handleMemoryItem,
    readEpisodicAndCheckPromotion,
    toMemoryItem,
} from "./memory";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CHAT_MODEL = "openRouter/free";

const OBSERVATION_COUNT = 3;
const EPISODIC_TOP_K = 5;

export interface AgentContext {
    stores: Stores;
    shared: SharedStore;
    episodic: Record<SourceAgent, EpisodicStore>;
    confirm: (item: MemoryItem) => Promise<ConfirmationResult>;
    embed: (text: string) => Promise<number[]>;
    log: MemoryLogEntry[];
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
    if (!client) {
        client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY ?? "",
            baseURL: OPENROUTER_BASE_URL,
        });
    }
    return client;
}

// ---------------------------------------------------------------------------
// Prompts (used verbatim)
// ---------------------------------------------------------------------------

function observationPrompt(agentName: string): string {
    return [
        `You are a ${agentName} agent. When you produce an observation, respond ONLY with a valid JSON object`,
        "matching exactly this shape and nothing else, no markdown, no explanation, no wrapper:",
        '{"content": "<plain string, never empty>", "persistence": <float 0 to 1>, "scope": <float 0 to 1>}',
        "content is a plain string that is never empty.",
        "persistence is a float from 0 to 1 describing how long this stays relevant.",
        "scope is a float from 0 to 1 describing how broadly relevant this is to the whole team versus just you.",
    ].join("\n");
}

function confirmationPrompt(activeEntries: SharedMemoryRow[], proposedContent: string): string {
    const existing =
        activeEntries.length > 0
            ? activeEntries.map((entry) => `- ${entry.content} (id: ${entry.id})`).join("\n")
            : "- None.";

    return [
        "You are the confirmation agent for shared team memory. Decide whether a proposed entry belongs in shared memory.",
        "",
        "Existing shared entries:",
        existing,
        "",
        `Proposed entry: "${proposedContent}"`,
        "",
        "Choose one decision:",
        "1. It adds durable new knowledge: respond confirmed true with no supersedesId.",
        "2. It corrects or replaces an existing entry: respond confirmed true with supersedesId set to that entry's id.",
        "3. It is unreliable or irrelevant: respond confirmed false.",
        "",
        'Respond with a JSON object only: {"confirmed": true, "supersedesId": "existing entry id"}',
    ].join("\n");
}

function researcherSummaryPrompt(task: string, observations: string[]): string {
    const collected = observations.length > 0 ? observations.map((text) => `- ${text}`).join("\n") : "- None.";

    return [
        "You are a researcher agent. Read the task and the observations you collected.",
        "",
        `Task:\n${task}`,
        "",
        `Collected observations:\n${collected}`,
        "",
        "Write a three to five sentence briefing for a downstream synthesizer.",
        "Plain prose, no headings, no markdown.",
    ].join("\n");
}

function synthesizerFinalPrompt(
    task: string,
    researcherOutput: string,
    activeShared: SharedMemoryRow[],
    episodicEntries: RetrievedEpisodicEntry[],
): string {
    const shared =
        activeShared.length > 0 ? activeShared.map((entry) => `- ${entry.content}`).join("\n") : "- None.";
    const episodic =
        episodicEntries.length > 0 ? episodicEntries.map((entry) => `- ${entry.content}`).join("\n") : "- None.";

    return [
        "You are a synthesizer agent. Produce the final answer to the task.",
        "",
        `Task:\n${task}`,
        "",
        `Researcher briefing:\n${researcherOutput}`,
        "",
        `Active shared memory:\n${shared}`,
        "",
        `Your episodic memory:\n${episodic}`,
        "",
        "Write the final answer as plain prose with no preamble, no headings, no markdown, no code fences.",
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------

async function callModel(
    systemPrompt: string,
    userPrompt: string,
    extraSystemPrompt?: string,
    json: boolean = false,
): Promise<string> {
    const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
    if (extraSystemPrompt) {
        messages.push({ role: "system", content: extraSystemPrompt });
    }
    messages.push({ role: "user", content: userPrompt });

    const response = await getClient().chat.completions.create({
        model: CHAT_MODEL,
        messages,
        ...(json ? { response_format: { type: "json_object" as const } } : {}),
    });

    const content = response.choices[0]?.message?.content ?? "";
    return content.trim();
}

/** Tolerates fenced or padded JSON, still throws on genuinely malformed output. */
function parseJsonObject(text: string): unknown {
    const unfenced = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    try {
        return JSON.parse(unfenced);
    } catch {
        // fall through to brace extraction
    }

    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return JSON.parse(unfenced.slice(start, end + 1));
    }

    throw new Error("model response contained no JSON object");
}

function formatEpisodicContext(entries: RetrievedEpisodicEntry[]): string {
    if (entries.length === 0) {
        return "Episodic memory: none yet.";
    }
    const lines = entries.map(
        (entry) =>
            `- ${entry.content} (retrievalCount: ${entry.retrievalCount}, held: ${entry.heldFromShared ? "yes" : "no"})`,
    );
    return ["Episodic memory from previous runs:", ...lines].join("\n");
}

function pushWorkingLog(ctx: AgentContext, id: string, agent: SourceAgent, content: string): void {
    ctx.log.push({ id, content, tier: "working", agent, persistence: 0, scope: 0 });
}

// ---------------------------------------------------------------------------
// Researcher
// ---------------------------------------------------------------------------

export async function runResearcher(task: string, ctx: AgentContext): Promise<string> {
    const episodicEntries = await readEpisodicAndCheckPromotion(
        "researcher",
        ctx.episodic.researcher,
        ctx.shared,
        task,
        EPISODIC_TOP_K,
        ctx.confirm,
        ctx.embed,
    );
    const episodicContext = formatEpisodicContext(episodicEntries);

    const observations: string[] = [];

    for (let index = 1; index <= OBSERVATION_COUNT; index++) {
        const id = randomUUID();
        let rawText = "";

        try {
            rawText = await callModel(
                observationPrompt("Researcher"),
                `Task: ${task}\n\nThis is observation ${index} of ${OBSERVATION_COUNT}. Produce exactly one observation.`,
                episodicContext,
                true,
            );

            const item = toMemoryItem(parseJsonObject(rawText), "researcher", id);
            const tier = await handleMemoryItem(item, ctx.stores, ctx.confirm, ctx.embed);

            ctx.log.push({
                id,
                content: item.content,
                tier,
                agent: "researcher",
                persistence: item.persistence,
                scope: item.scope,
            });
            observations.push(item.content);
        } catch (error) {
            console.error("researcher observation failed", error);
            pushWorkingLog(ctx, id, "researcher", rawText);
        }
    }

    try {
        return await callModel(researcherSummaryPrompt(task, observations), "Write the briefing now.");
    } catch (error) {
        console.error("researcher summary failed", error);
        return observations.join(" ");
    }
}

// ---------------------------------------------------------------------------
// Synthesizer
// ---------------------------------------------------------------------------

export async function runSynthesizer(task: string, researcherOutput: string, ctx: AgentContext): Promise<string> {
    const episodicEntries = await readEpisodicAndCheckPromotion(
        "synthesizer",
        ctx.episodic.synthesizer,
        ctx.shared,
        `${task}\n\n${researcherOutput}`,
        EPISODIC_TOP_K,
        ctx.confirm,
        ctx.embed,
    );

    const activeShared = ctx.shared.readActive();

    let finalOutput: string;
    try {
        finalOutput = await callModel(
            synthesizerFinalPrompt(task, researcherOutput, activeShared, episodicEntries),
            "Write the final answer now.",
        );
    } catch (error) {
        console.error("synthesizer final answer failed", error);
        finalOutput = researcherOutput;
    }
    if (finalOutput.length === 0) {
        finalOutput = researcherOutput;
    }

    const id = randomUUID();
    try {
        const rawText = await callModel(
            observationPrompt("Synthesizer"),
            `Task: ${task}\n\nYour final answer:\n${finalOutput}\n\nProduce exactly one observation about your own synthesis.`,
            formatEpisodicContext(episodicEntries),
            true,
        );

        const item = toMemoryItem(parseJsonObject(rawText), "synthesizer", id);
        const tier = await handleMemoryItem(item, ctx.stores, ctx.confirm, ctx.embed);

        ctx.log.push({
            id,
            content: item.content,
            tier,
            agent: "synthesizer",
            persistence: item.persistence,
            scope: item.scope,
        });
    } catch (error) {
        console.error("synthesizer observation failed", error);
        pushWorkingLog(ctx, id, "synthesizer", "");
    }

    return finalOutput;
}

// ---------------------------------------------------------------------------
// Confirmation gate
// ---------------------------------------------------------------------------

const ConfirmationSchema = z.object({
    confirmed: z.boolean(),
    supersedesId: z.string().optional(),
});

export async function confirmWithOtherAgent(item: MemoryItem, shared: SharedStore): Promise<ConfirmationResult> {
    try {
        const activeEntries = shared.readActive();
        const rawText = await callModel(
            confirmationPrompt(activeEntries, item.content),
            "Respond with the JSON object only.",
            undefined,
            true,
        );

        const candidate = parseJsonObject(rawText);
        if (candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).supersedesId === null) {
            delete (candidate as Record<string, unknown>).supersedesId;
        }

        const parsed = ConfirmationSchema.safeParse(candidate);
        if (!parsed.success) {
            return { confirmed: false };
        }
        return { confirmed: parsed.data.confirmed, supersedesId: parsed.data.supersedesId };
    } catch (error) {
        console.error("shared memory confirmation failed", error);
        return { confirmed: false };
    }
}
