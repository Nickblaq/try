import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const task = body?.task;
    if (typeof task !== "string" || task.trim().length === 0) {
      return Response.json({ error: "task is required" }, { status: 400 });
    }
    const result = await runPipeline(task);
    return Response.json(result);
  } catch (err) {
    console.error("memory route error", err);
    return Response.json({ error: "pipeline failed" }, { status: 500 });
  }
}
