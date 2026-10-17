// app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getJob, retryJob } from "@/lib/catalog/jobs";
import { sweepExpiredMedia } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Polling a running job is also the heartbeat that expires idle media.
  void sweepExpiredMedia();

  const job = getJob(id);
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job });
}

/** Retry-safe: a retry appends a new run rather than mutating history. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runId = await retryJob(id);
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, runId });
}
