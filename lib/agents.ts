import OpenAI from "openai";
import crypto from "crypto";
import { z } from "zod";
import {
  type MemoryItem,
  type ConfirmationResult,
  type SourceAgent,
  type StoreBundle,
  toMemoryItem,
  handleMemoryItem,
  readEpisodicAndCheckPromotion,
} from "./memory";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1/chat/completions",
  apiKey: "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",
});

const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export interface MemoryLogEntry {
  id: string;
  content: string;
  tier: "working" | "episodic" | "shared" | "held";
  agent: SourceAgent;
  persistence: number;
  scope: number;
}

export interface AgentContext {
  stores: StoreBundle;
  confirm: (item: MemoryItem) => Promise<ConfirmationResult>;
  embed: (text: string) => Promise<number[]>;
  log: MemoryLogEntry[];
}

function observationPrompt(agentName: string): string {
  return `You are a ${agentName} agent. When you produce an observation, respond ONLY with a valid JSON object matching exactly this shape and nothing else, no markdown, no explanation, no wrapper:
{
  "content": "<the observation as a plain string, never empty>",
  "persistence": <float 0.0 to 1.0, how long this stays relevant>,
  "scope": <float 0.0 to 1.0, how broadly relevant this is to the whole team vs just you>
}`;
}

function confirmationPrompt(
  existingActive: Array<{ id: string; content: string }>,
  newContent: string
): string {
  const list =
    existingActive.length === 0
      ? "(none)"
      : existingActive.map((e) => `- ${e.content} (id: ${e.id})`).join("\n");
  return `You are reviewing a proposed shared memory entry.

Existing active shared memory:
${list}

Proposed new entry:
"${newContent}"

Decide exactly one of:
- The entry adds durable, team-relevant knowledge not already covered. Respond with confirmed: true and no supersedesId.
- The entry corrects or replaces an existing entry above. Respond with confirmed: true and supersedesId set to that entry's id.
- The entry is unreliable, unverifiable, or irrelevant to the team. Respond with confirmed: false.

Respond ONLY with a JSON object matching exactly this shape, no markdown, no explanation:
{ "confirmed": true or false, "supersedesId": "<id>" or omit }`;
}

function synthesizerFinalPrompt(
  task: string,
  researcherOutput: string,
  sharedActive: Array<{ content: string }>,
  episodicForSynth: Array<{ content: string }>
): string {
  const sharedList =
    sharedActive.length === 0
      ? "(none)"
      : sharedActive.map((e) => `- ${e.content}`).join("\n");
  const episodicList =
    episodicForSynth.length === 0
      ? "(none)"
      : episodicForSynth.map((e) => `- ${e.content}`).join("\n");
  return `You are a Synthesizer agent producing a final answer.

Task: ${task}
Researcher's findings: ${researcherOutput}

Team shared memory (confirmed):
${sharedList}

Your prior episodic memory:
${episodicList}

Write the final answer as plain prose. No preamble, no headings, no markdown, no code fences.`;
}

function researcherSummaryPrompt(task: string, observations: string[]): string {
  return `Summarize these observations into a 3 to 5 sentence briefing for a downstream synthesizer. Plain prose. No headings, no markdown.

Task: ${task}
Observations:
${observations.map((o) => `- ${o}`).join("\n")}`;
}

async function callModel(
  system: string,
  user: string,
  jsonMode: boolean
): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function runResearcher(task: string, ctx: AgentContext): Promise<string> {
  let episodicContext = "";
  try {
    const entries = await readEpisodicAndCheckPromotion(
      "researcher",
      ctx.stores,
      task,
      5,
      ctx.confirm,
      ctx.embed
    );
    if (entries.length > 0) {
      episodicContext =
        "Your prior episodic memory:\n" +
        entries.map((e) => `- ${e.content}`).join("\n");
    }
  } catch {
    episodicContext = "";
  }

  const observations: string[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const user = `Task: ${task}\nObservation ${i + 1} of 3.`;
      const fullUser = episodicContext ? `${episodicContext}\n\n${user}` : user;
      const raw = await callModel(observationPrompt("Researcher"), fullUser, true);
      const parsed = JSON.parse(raw);
      const item = toMemoryItem(parsed, "researcher", crypto.randomUUID());
      const tier = await handleMemoryItem(item, ctx.stores, ctx.confirm, ctx.embed);
      ctx.log.push({
        id: item.id,
        content: item.content,
        tier,
        agent: "researcher",
        persistence: item.persistence,
        scope: item.scope,
      });
      observations.push(item.content);
    } catch {
      ctx.log.push({
        id: crypto.randomUUID(),
        content: "(observation failed)",
        tier: "working",
        agent: "researcher",
        persistence: 0,
        scope: 0,
      });
    }
  }

  try {
    const summary = await callModel(
      "Respond in plain prose only.",
      researcherSummaryPrompt(task, observations),
      false
    );
    return summary.trim() || observations.join(" ");
  } catch {
    return observations.join(" ");
  }
}

export async function runSynthesizer(
  task: string,
  researcherOutput: string,
  ctx: AgentContext
): Promise<string> {
  let episodicEntries: Array<{ content: string }> = [];
  try {
    episodicEntries = await readEpisodicAndCheckPromotion(
      "synthesizer",
      ctx.stores,
      `${task}\n${researcherOutput}`,
      5,
      ctx.confirm,
      ctx.embed
    );
  } catch {
    episodicEntries = [];
  }

  const sharedActive = ctx.stores.shared.readActive();

  let finalOutput = researcherOutput;
  try {
    const raw = await callModel(
      "You are a Synthesizer agent. Respond in plain prose only, no markdown, no headings.",
      synthesizerFinalPrompt(task, researcherOutput, sharedActive, episodicEntries),
      false
    );
    finalOutput = raw.trim() || researcherOutput;
  } catch {
    finalOutput = researcherOutput;
  }

  try {
    const user = `Task: ${task}\nFinal answer: ${finalOutput}\nProduce one observation about your own synthesis.`;
    const raw = await callModel(observationPrompt("Synthesizer"), user, true);
    const parsed = JSON.parse(raw);
    const item = toMemoryItem(parsed, "synthesizer", crypto.randomUUID());
    const tier = await handleMemoryItem(item, ctx.stores, ctx.confirm, ctx.embed);
    ctx.log.push({
      id: item.id,
      content: item.content,
      tier,
      agent: "synthesizer",
      persistence: item.persistence,
      scope: item.scope,
    });
  } catch {
    // silent
  }

  return finalOutput;
}

const ConfirmationSchema = z.object({
  confirmed: z.boolean(),
  supersedesId: z.string().optional(),
});

export function buildConfirm(
  shared: StoreBundle["shared"]
): (item: MemoryItem) => Promise<ConfirmationResult> {
  return async (item: MemoryItem) => {
    try {
      const active = shared.readActive();
      const prompt = confirmationPrompt(active, item.content);
      const raw = await callModel(prompt, "Respond with JSON only.", true);
      const parsed = JSON.parse(raw);
      const validated = ConfirmationSchema.safeParse(parsed);
      if (!validated.success) return { confirmed: false };
      return {
        confirmed: validated.data.confirmed,
        supersedesId: validated.data.supersedesId,
      };
    } catch {
      return { confirmed: false };
    }
  };
}
