// Per-request LangGraph wiring: researcher -> synthesizer.
// Everything request-scoped (stores handle, confirmation closure, log buffer)
// lives in this function so concurrent Railway requests never share state.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { type AgentContext, confirmWithOtherAgent, runResearcher, runSynthesizer } from "./agents";
import {
    type EpisodicSummary,
    type MemoryLogEntry,
    type SharedMemoryRecord,
    embed,
    getStores,
    resolveDataDir,
} from "./memory";

export interface SharedMemoryView {
    id: string;
    content: string;
    active: boolean;
    sourceAgent: string;
    supersedes: string | null;
    supersededBy: string | null;
    promotedFrom: string | null;
    createdAt: string;
}

export interface EpisodicMemoryView {
    researcher: EpisodicSummary[];
    synthesizer: EpisodicSummary[];
}

export interface PipelineResult {
    finalOutput: string;
    memoryLog: MemoryLogEntry[];
    sharedMemory: SharedMemoryView[];
    episodicMemory: EpisodicMemoryView;
}

const MemoryState = Annotation.Root({
    task: Annotation<string>,
    researcherOutput: Annotation<string>,
    finalOutput: Annotation<string>,
    memoryLog: Annotation<MemoryLogEntry[]>({
        reducer: (_previous, next) => next,
        default: () => [],
    }),
});

function toSharedView(row: SharedMemoryRecord): SharedMemoryView {
    return {
        id: row.id,
        content: row.content,
        active: row.isActive === 1,
        sourceAgent: row.sourceAgent,
        supersedes: row.supersedes ?? null,
        supersededBy: row.supersededBy ?? null,
        promotedFrom: row.promotedFrom ?? null,
        createdAt: row.createdAt,
    };
}

export async function runPipeline(task: string): Promise<PipelineResult> {
    // Resolve (and create) the memory root before anything else touches disk.
    resolveDataDir();
    const stores = await getStores();

    const ctx: AgentContext = {
        stores,
        shared: stores.shared,
        episodic: stores.episodic,
        confirm: (item) => confirmWithOtherAgent(item, stores.shared),
        embed,
        log: [],
    };

    const graph = new StateGraph(MemoryState)
        .addNode("researcher", async (state) => {
            const researcherOutput = await runResearcher(state.task, ctx);
            return { researcherOutput, memoryLog: [...ctx.log] };
        })
        .addNode("synthesizer", async (state) => {
            const finalOutput = await runSynthesizer(state.task, state.researcherOutput, ctx);
            return { finalOutput, memoryLog: [...ctx.log] };
        })
        .addEdge(START, "researcher")
        .addEdge("researcher", "synthesizer")
        .addEdge("synthesizer", END)
        .compile();

    const result = await graph.invoke({ task });

    return {
        finalOutput: result.finalOutput ?? "",
        memoryLog: [...ctx.log],
        sharedMemory: stores.shared.readAll().map(toSharedView),
        episodicMemory: {
            researcher: await stores.episodic.researcher.readAllWithCounts(),
            synthesizer: await stores.episodic.synthesizer.readAllWithCounts(),
        },
    };
}
