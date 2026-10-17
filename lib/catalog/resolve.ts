// lib/catalog/resolve.ts
//
// Turning a URL into a description of what is actually there — before any
// bytes are downloaded. The python bridge already knows how to ask yt-dlp for
// a link's metadata; this trims that (potentially huge) extractor dict down to
// the handful of facts the studio needs:
//
//   • who/what it is  (title, channel, duration, thumbnail)
//   • which resolutions really exist  → powers the "Resolution" param
//   • which audio formats really exist → powers the "Download Audio" form
//   • which caption languages really exist → powers "Download Subtitles"
//
// That is the whole point: a download form that can only offer what the link
// has can never ask the user for a resolution or language that doesn't exist.
import "server-only";
import path from "node:path";
import { spawn } from "node:child_process";
import type { MediaFormat, MediaKind, MediaProfile, SubtitleTrack } from "./types";

/** Longest we'll wait on an extractor before telling the user it hung. */
const RESOLVE_TIMEOUT_MS = 45_000;

/** Resolved URLs are cached briefly — re-parsing the same link is pure cost. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; profile: MediaProfile }>();

export type ResolveResult =
  | { ok: true; profile: MediaProfile }
  | { ok: false; error: string };

/* ------------------------------ raw extraction ---------------------------- */

type RawFormat = Record<string, unknown>;
type RawInfo = Record<string, unknown>;

/** Run the python bridge's `resolve` command and parse its JSON. */
function extractInfo(url: string): Promise<RawInfo> {
  const cwd = process.cwd();
  const script = path.join(cwd, "python", "ytdlp.py");
  const modules = path.join(cwd, "python-modules");

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, "resolve", url], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PYTHONPATH: modules },
    });

    let out = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out reading link information"));
    }, RESOLVE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      // Keep it bounded; extractor warnings can be verbose.
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        err.code === "ENOENT"
          ? new Error("python3 is not installed on the server")
          : err
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trimmed = out.trim();
      if (!trimmed) {
        reject(new Error(stderr.trim() || "Extractor returned no data"));
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed && typeof parsed.error === "string") {
          reject(new Error(parsed.error));
          return;
        }
        resolve(parsed as RawInfo);
      } catch {
        reject(new Error("Could not parse extractor output"));
      }
    });
  });
}

/* -------------------------------- trimming -------------------------------- */

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

/** Classify one raw yt-dlp format entry. */
function classifyFormat(f: RawFormat): MediaKind {
  const v = str(f.vcodec) ?? "none";
  const a = str(f.acodec) ?? "none";
  if (v !== "none") return "video";
  if (a !== "none") return "audio";
  return "other";
}

function trimFormats(raw: unknown): MediaFormat[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaFormat[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const f = entry as RawFormat;
    const kind = classifyFormat(f);
    // Storyboards, thumbnails and caption streams are not downloadable media —
    // surfacing them as "formats" would inflate the count the UI shows. The
    // caption tracks are surfaced separately anyway.
    if (kind === "other") continue;
    out.push({
      formatId: str(f.format_id) ?? String(out.length),
      ext: str(f.ext),
      kind,
      height: num(f.height),
      width: num(f.width),
      fps: num(f.fps),
      vcodec: str(f.vcodec),
      acodec: str(f.acodec),
      filesize: num(f.filesize) ?? num(f.filesize_approx),
      tbr: num(f.tbr),
      abr: num(f.abr),
      note: str(f.format_note),
    });
  }
  return out;
}

function collectSubtitleTracks(
  dict: unknown,
  auto: boolean,
  into: Map<string, SubtitleTrack>
): void {
  if (!dict || typeof dict !== "object") return;
  for (const [code, entries] of Object.entries(dict as Record<string, unknown>)) {
    if (into.has(code)) continue;
    let name = code;
    if (Array.isArray(entries) && entries.length > 0) {
      const first = entries[0] as Record<string, unknown> | undefined;
      name = str(first?.name) ?? code;
    }
    into.set(code, { code, name, auto });
  }
}

function buildProfile(url: string, info: RawInfo): MediaProfile {
  const formats = trimFormats(info.formats);

  const heights = Array.from(
    new Set(
      formats
        .filter((f) => f.kind === "video" && f.height)
        .map((f) => f.height as number)
    )
  ).sort((a, b) => b - a);

  const audioFormats = Array.from(
    new Set(
      formats
        .filter((f) => f.kind === "audio" && f.ext)
        .map((f) => f.ext as string)
    )
  );

  const subtitleTracks = new Map<string, SubtitleTrack>();
  collectSubtitleTracks(info.subtitles, false, subtitleTracks);
  collectSubtitleTracks(info.automatic_captions, true, subtitleTracks);

  return {
    url,
    id: str(info.id),
    title: str(info.title),
    uploader: str(info.uploader) ?? str(info.channel),
    channel: str(info.channel),
    durationSeconds: num(info.duration),
    thumbnail: str(info.thumbnail),
    extractor: str(info.extractor) ?? str(info.extractor_key),
    webpageUrl: str(info.webpage_url),
    description: str(info.description)?.slice(0, 1000) ?? null,
    viewCount: num(info.view_count),
    uploadDate: str(info.upload_date),
    live: info.is_live === true || info.live_status === "is_live",
    formats,
    heights,
    audioFormats,
    subtitleLangs: Array.from(subtitleTracks.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
  };
}

/* --------------------------------- public --------------------------------- */

/**
 * Resolve a URL to its media profile. Throws with a user-facing message when
 * the extractor fails; the API route turns that into a 502.
 */
export async function resolveUrl(url: string): Promise<MediaProfile> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("No URL provided");

  const hit = cache.get(trimmed);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.profile;

  const info = await extractInfo(trimmed);
  const profile = buildProfile(trimmed, info);
  cache.set(trimmed, { at: Date.now(), profile });

  // Bounded cache so a long session can't grow it without limit.
  if (cache.size > 50) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return profile;
}
