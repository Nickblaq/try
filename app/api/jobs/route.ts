// app/api/jobs/route.ts
//
// The single job endpoint both the runner and the UI share. POST starts a job
// from a source (a catalog object id and/or a URL) plus an ordered operation
// list; GET lists recent jobs. All state is read from SQLite — there is no
// status.json polling anywhere.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob, listJobs } from "@/lib/catalog/jobs";
import { getOperation } from "@/lib/catalog/operations";
import { getObject } from "@/lib/catalog/store";
import { sweepExpiredMedia } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OperationSchema = z.object({
  id: z.string().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
});

const BodySchema = z
  .object({
    sourceObjectId: z.string().min(1).nullish(),
    sourceUrl: z.string().url().nullish(),
    operations: z.array(OperationSchema).min(1),
  })
  .refine((v) => Boolean(v.sourceObjectId) || Boolean(v.sourceUrl), {
    message: "A sourceObjectId or sourceUrl is required",
  });

export async function GET() {
  await sweepExpiredMedia();
  return NextResponse.json({ ok: true, jobs: listJobs() });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid job payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { sourceObjectId, sourceUrl, operations } = parsed.data;

  for (const op of operations) {
    if (!getOperation(op.id)) {
      return NextResponse.json(
        { ok: false, error: `Unknown operation: ${op.id}` },
        { status: 400 }
      );
    }
  }

  if (sourceObjectId && !getObject(sourceObjectId)) {
    return NextResponse.json(
      { ok: false, error: "Source object not found" },
      { status: 404 }
    );
  }

  // Every download step draws from the same URL, so a URL is required as soon
  // as any step uses the ytdlp engine.
  const needsUrl = operations.some((op) => getOperation(op.id)?.engine === "ytdlp");
  if (needsUrl && !sourceUrl) {
    return NextResponse.json(
      { ok: false, error: "This pipeline downloads from a URL — provide one" },
      { status: 400 }
    );
  }

  try {
    const jobId = await createJob({
      sourceObjectId: sourceObjectId ?? null,
      sourceUrl: sourceUrl ?? null,
      operations,
    });
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start job";
    console.error("[jobs] create failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
