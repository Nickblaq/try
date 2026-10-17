// app/api/resolve/route.ts
//
// GET /api/resolve?url=…
//
// Describes a link *before* anything is downloaded: title, channel, duration,
// thumbnail, the resolutions that actually exist, the audio formats, and the
// caption languages. The studio uses this so a download form only offers what
// the link really has, and so the user can see the media they are about to work
// on instead of a wall of dummy form defaults.
import { NextRequest, NextResponse } from "next/server";
import { resolveUrl } from "@/lib/catalog/resolve";
import { sweepExpiredMedia } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Resolving is a read of a page, not of our media, but it is a convenient
  // moment to expire anything that has gone idle.
  void sweepExpiredMedia();

  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Not a valid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, error: "Only http(s) links are supported" },
      { status: 400 }
    );
  }

  try {
    const profile = await resolveUrl(parsed.toString());
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that link";
    console.error("[resolve]", parsed.toString(), "->", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
