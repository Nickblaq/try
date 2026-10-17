import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import {
  getStores,
  embed,
  type SourceAgent,
} from "./memory";
import {
  runResearcher,
  runSynthesizer,
  buildConfirm,
  type AgentContext,
  type MemoryLogEntry,
} from "./agents";

export interface ApiResponse {
  finalOutput: string;
  memoryLog: MemoryLogEntry[];
  sharedMemory: Array<{
    id: string;
    content: string;
    active: boolean;
    sourceAgent: SourceAgent;
    supersedes: string | null;
    supersededBy: string | null;
    promotedFrom: string | null;
    createdAt: string;
  }>;
  episodicMemory: {
    researcher: Array<{
      id: string;
      content: string;
      retrievalCount: number;
      kappa: number;
      heldFromShared: boolean;
    }>;
    synthesizer: Array<{
      id: string;
      content: string;
      retrievalCount: number;
      kappa: number;
      heldFromShared: boolean;
    }>;
  };
}

const PipelineState = Annotation.Root({
  task: Annotation<string>(),
  researcherOutput: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  finalOutput: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

export async function runPipeline(task: string): Promise<ApiResponse> {
  const stores = await getStores();
  const log: MemoryLogEntry[] = [];

  const ctx: AgentContext = {
    stores,
    confirm: buildConfirm(stores.shared),
    embed,
    log,
  };

  const graph = new StateGraph(PipelineState)
    .addNode("researcher", async (state: { task: string }) => {
      const out = await runResearcher(state.task, ctx);
      return { researcherOutput: out };
    })
    .addNode("synthesizer", async (state: { task: string; researcherOutput: string }) => {
      const out = await runSynthesizer(state.task, state.researcherOutput, ctx);
      return { finalOutput: out };
    })
    .addEdge(START, "researcher")
    .addEdge("researcher", "synthesizer")
    .addEdge("synthesizer", END)
    .compile();

  const result = await graph.invoke({ task });

  const sharedRows = stores.shared.readAll();
  const sharedMemory = sharedRows.map((r) => ({
    id: r.id,
    content: r.content,
    active: r.isActive === 1,
    sourceAgent: r.sourceAgent,
    supersedes: r.supersedes ?? null,
    supersededBy: r.supersededBy ?? null,
    promotedFrom: r.promotedFrom ?? null,
    createdAt: r.createdAt,
  }));

  const researcherEpisodic = (await stores.episodic.researcher.readAllWithCounts()).map(
    (e) => ({
      id: e.id,
      content: e.content,
      retrievalCount: e.retrievalCount,
      kappa: e.kappa,
      heldFromShared: e.heldFromShared === true,
    })
  );

  const synthesizerEpisodic = (await stores.episodic.synthesizer.readAllWithCounts()).map(
    (e) => ({
      id: e.id,
      content: e.content,
      retrievalCount: e.retrievalCount,
      kappa: e.kappa,
      heldFromShared: e.heldFromShared === true,
    })
  );

  return {
    finalOutput: (result as { finalOutput?: string }).finalOutput ?? "",
    memoryLog: log,
    sharedMemory,
    episodicMemory: {
      researcher: researcherEpisodic,
      synthesizer: synthesizerEpisodic,
    },
  };
}
