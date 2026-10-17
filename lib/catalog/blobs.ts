// lib/catalog/blobs.ts
import "server-only";
import { createHash } from "node:crypto";
import type { MediaKind } from "./types";

export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const VIDEO_EXTS = ["mp4", "mkv", "webm", "mov", "avi", "m4v"];
const AUDIO_EXTS = ["mp3", "m4a", "aac", "wav", "flac", "opus", "ogg"];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
const SUBTITLE_EXTS = ["srt", "vtt", "ass", "ssa", "sub"];

export function extFromName(name: string): string {
  const clean = name.split("?")[0];
  const dot = clean.lastIndexOf(".");
  if (dot <= 0 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

export function inferKind(mime: string | null | undefined, name: string): MediaKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("text/") || m.includes("subrip") || m.includes("subtitle")) {
    return "subtitle";
  }
  const ext = extFromName(name);
  if (VIDEO_EXTS.includes(ext)) return "video";
  if (AUDIO_EXTS.includes(ext)) return "audio";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (SUBTITLE_EXTS.includes(ext)) return "subtitle";
  return "other";
}

const DEFAULT_EXT: Record<MediaKind, string> = {
  video: "mp4",
  audio: "m4a",
  image: "png",
  subtitle: "srt",
  other: "bin",
};

export function resolveExt(name: string, mime: string | null | undefined, kind: MediaKind): string {
  // `mimeToExt` already returns a bare extension ("mp4"), so it is used
  // directly rather than passed back through `extFromName` (which expects a
  // filename and would always return "").
  return extFromName(name) || mimeToExt(mime) || DEFAULT_EXT[kind];
}

/** Canonical MIME type per file extension, used when serving media back out. */
const EXT_TO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mkv: "video/x-matroska",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  opus: "audio/opus",
  ogg: "audio/ogg",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  srt: "application/x-subrip",
  vtt: "text/vtt",
  ass: "text/x-ssa",
  ssa: "text/x-ssa",
  sub: "text/plain; charset=utf-8",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
};

/** MIME type for a bare extension (with or without a leading dot), or null. */
export function mimeForExt(ext: string): string | null {
  const clean = ext.replace(/^\./, "").toLowerCase();
  return EXT_TO_MIME[clean] ?? null;
}

/** Fallback MIME for an object that has neither a stored MIME nor a known ext. */
export function mimeForKind(kind: MediaKind): string {
  switch (kind) {
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/mpeg";
    case "image":
      return "image/png";
    case "subtitle":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

/**
 * The MIME type to send when serving an object. A stored MIME wins; otherwise
 * it is derived from the extension so media is never served as a generic
 * binary (or worse, as text) — which is what makes browsers save the file with
 * the wrong name/type.
 */
export function resolveMime(
  mime: string | null | undefined,
  ext: string,
  kind: MediaKind
): string {
  if (mime && mime.trim()) return mime;
  return mimeForExt(ext) ?? mimeForKind(kind);
}

function mimeToExt(mime: string | null | undefined): string {
  if (!mime) return "";
  const base = mime.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/x-matroska": "mkv",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/flac": "flac",
    "audio/opus": "opus",
    "audio/ogg": "ogg",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/x-subrip": "srt",
    "text/vtt": "vtt",
    "text/x-ssa": "ass",
  };
  return map[base] ?? base.split("/").pop() ?? "";
}
