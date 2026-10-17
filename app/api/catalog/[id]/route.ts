// app/api/catalog/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { getObject, objectFilePath, deleteObject } from "@/lib/catalog/store";
import { resolveMime } from "@/lib/catalog/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Build a `Content-Disposition` value that every browser understands.
 *
 * A bare `filename="…"` breaks as soon as the name has a character outside
 * Latin-1 (CJK, emoji, accents — extremely common in yt-dlp titles): Node
 * rejects the header outright, the download fails, and the browser falls back
 * to naming the error body `.txt`. So the quoted `filename` is forced to a
 * clean ASCII value and the real name is carried in the RFC 5987 `filename*`.
 */
function contentDisposition(name: string, download: boolean): string {
  if (!download) return "inline";

  const safe = (name || "download").replace(/["\\\r\n\t]/g, "_");
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_") || "download";
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const object = getObject(id);
  if (!object) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const filePath = objectFilePath(id);
  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ ok: false, error: "Blob missing" }, { status: 410 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const stat = fs.statSync(filePath);
  const stream = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      // Derive the type from the object itself so downloads are served as
      // their real media type, not a generic octet-stream.
      "Content-Type": resolveMime(object.mime, object.ext, object.kind),
      "Content-Length": String(stat.size),
      "Content-Disposition": contentDisposition(object.name, download),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = await deleteObject(id);
  return removed
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}
