// lib/catalog/types.ts
//
// The one data model every tool in cufx operates on. A "media object" is any
// piece of media the system has ever touched — user upload, downloaded media,
// or a processor byproduct — and it is a first-class citizen in a single
// shared catalog.
//
// `origin` records *how* the object entered the system, but nothing downstream
// branches on it: given a MediaObject, any tool can read from it and produce a
// new MediaObject that points back at it via `parents`.

export type MediaKind = "video" | "audio" | "image" | "subtitle" | "other";

/** How an object entered the catalog. */
export type ObjectOrigin = "upload" | "download" | "derived";

export type MediaObject = {
  /** Stable catalog id. */
  id: string;
  /** sha256 of the bytes — the identity key used for de-duplication. */
  hash: string;
  /** Display filename (extension included). */
  name: string;
  kind: MediaKind;
  mime: string | null;
  ext: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  origin: ObjectOrigin;
  /** Source URL when the object was pulled from the internet. */
  url: string | null;
  /** Extractor/provider, e.g. "youtube". */
  provider: string | null;
  /** Tool that produced a derived object, e.g. "ffmpeg". */
  tool: string | null;
  /** Catalog ids of the objects this one was derived from. */
  parents: string[];
  /** Free-form extra metadata (probe results, extractor info, run params). */
  meta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

/** Internal record — adds the on-disk location, never sent to clients. */
export type StoredMediaObject = MediaObject & { blobPath: string };

export type IngestInput = {
  data: Buffer;
  name: string;
  mime?: string | null;
  origin: ObjectOrigin;
  /** Override kind inference when the caller already knows. */
  kind?: MediaKind;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  url?: string | null;
  provider?: string | null;
  tool?: string | null;
  /** Parent object ids this object was derived from. */
  parents?: string[];
  meta?: Record<string, unknown>;
};

export type IngestFileInput = Omit<IngestInput, "data"> & {
  /** Absolute path to the source file; it is streamed, not buffered. */
  path: string;
};

export type CatalogFilter = {
  kind?: MediaKind;
  origin?: ObjectOrigin;
  /** Case-insensitive substring match against the object name. */
  search?: string;
  limit?: number;
};

/* ------------------------------ URL profiles ------------------------------ */

/** One downloadable stream reported by the extractor. */
export type MediaFormat = {
  /** yt-dlp format id, e.g. "137" or "sb1". */
  formatId: string;
  ext: string | null;
  /** Video, audio, image (thumbnail/subtitle streams are grouped under other). */
  kind: MediaKind;
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  /** Total bitrate in kbps. */
  tbr: number | null;
  /** Audio bitrate in kbps. */
  abr: number | null;
  /** Free-form label the extractor attached to the stream. */
  note: string | null;
};

/** A caption track offered by a URL. */
export type SubtitleTrack = {
  code: string;
  name: string;
  /** True when this is an auto-generated (ASR) caption. */
  auto: boolean;
};

/**
 * Everything the studio needs to describe a URL *before* downloading it.
 * Trimming the raw extractor dict down to this is what keeps the operation
 * forms honest: resolutions, audio formats, and caption languages are the
 * ones the link actually has.
 */
export type MediaProfile = {
  url: string;
  id: string | null;
  title: string | null;
  uploader: string | null;
  channel: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  extractor: string | null;
  webpageUrl: string | null;
  description: string | null;
  viewCount: number | null;
  uploadDate: string | null;
  live: boolean;
  formats: MediaFormat[];
  /** Distinct video heights, highest first. */
  heights: number[];
  /** Distinct audio-only extensions. */
  audioFormats: string[];
  subtitleLangs: SubtitleTrack[];
};
