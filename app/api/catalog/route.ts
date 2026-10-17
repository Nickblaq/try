// app/api/catalog/route.ts
//
// One endpoint every tool can read from and write to. This is the HTTP face of
// the shared catalog: list/search what the system already has, or add a new
// object (bytes + provenance) so other tools can act on it without a round-trip
// through the user's machine.
import { NextRequest, NextResponse } from "next/server";
import { listObjects, getObject, getObjectByHash, ingestObject } from "@/lib/catalog/store";
import type { MediaKind, ObjectOrigin } from "@/lib/catalog/types";
import { sweepExpiredMedia } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: MediaKind[] = ["video", "audio", "image", "subtitle", "other"];
const ORIGINS: ObjectOrigin[] = ["upload", "download", "derived"];

export async function GET(req: NextRequest) {
  // Expire first, so a listing never shows media that is already on its way
  // out the door.
  await sweepExpiredMedia();

  const sp = req.nextUrl.searchParams;

  const id = sp.get("id");
  if (id) {
    const obj = getObject(id);
    return obj
      ? NextResponse.json({ ok: true, object: obj })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const hash = sp.get("hash");
  if (hash) {
    const obj = getObjectByHash(hash);
    return obj
      ? NextResponse.json({ ok: true, object: obj })
      : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const kindParam = sp.get("kind");
  const originParam = sp.get("origin");
  const limitParam = sp.get("limit");

  const objects = listObjects({
    kind: kindParam && KINDS.includes(kindParam as MediaKind) ? (kindParam as MediaKind) : undefined,
    origin:
      originParam && ORIGINS.includes(originParam as ObjectOrigin)
        ? (originParam as ObjectOrigin)
        : undefined,
    search: sp.get("search") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  });

  return NextResponse.json({ ok: true, objects, count: objects.length });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { ok: false, error: "Expected multipart/form-data with a file field" },
        { status: 415 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "File too large (max 500 MB)" }, { status: 413 });
    }

    const originParam = String(form.get("origin") ?? "upload");
    const origin: ObjectOrigin = ORIGINS.includes(originParam as ObjectOrigin)
      ? (originParam as ObjectOrigin)
      : "upload";

    void sweepExpiredMedia();

    const object = await ingestObject({
      data: Buffer.from(await file.arrayBuffer()),
      name: file.name || "upload",
      mime: file.type || null,
      origin,
      url: strOrNull(form.get("url")),
      provider: strOrNull(form.get("provider")),
      tool: strOrNull(form.get("tool")),
      parents: listOf(form.get("parents")),
    });

    return NextResponse.json({ ok: true, object });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    console.error("[catalog]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function listOf(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string" || !v.trim()) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
