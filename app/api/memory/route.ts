import { runPipeline } from "../../../lib/pipeline";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        body = undefined;
    }

    const task =
        body && typeof body === "object" ? (body as Record<string, unknown>).task : undefined;

    if (typeof task !== "string") {
        return Response.json({ error: "task is required" }, { status: 400 });
    }

    try {
        const result = await runPipeline(task);
        return Response.json(result);
    } catch (error) {
        console.error("memory pipeline failed", error);
        return Response.json({ error: "pipeline failed" }, { status: 500 });
    }
}
