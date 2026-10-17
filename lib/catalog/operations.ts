// lib/catalog/operations.ts
//
// The one operation catalog. Every tool in cufx — the ffmpeg pipeline that used
// to live under /op and the yt-dlp downloader that used to live under /yt — now
// draws from this single list. Instead of two copies of OPERATIONS and two
// translate modules, each operation declares:
//
//   • what it takes in   (`accepts`, `source`)
//   • what it produces   (`produces`, `preservesKind`)
//   • how to turn media  (`buildJob`, below)
//
// Nothing here imports `server-only` or Node builtins, so the same definition
// drives the client UI (names, params, icons) and the server runner (job
// construction). Engine-specific argument building lives in `./engines/*`.
//
// Design rules that keep the forms honest:
//
//   • `accepts` is precise — an image op never shows up for an audio source.
//   • `preservesKind` means "the output is the same kind as the input" (a cut
//     of an audio file is still audio); `produces` is only the fallback for
//     ops that genuinely change kind (extract audio, make a gif, probe).
//   • `dynamic` params (heights, audio formats, subtitle languages) are filled
//     from the resolved URL profile, so a download form can only offer
//     resolutions and captions the link actually has.
//   • `object` params pick a *second* catalog object (for concat, overlay,
//     replacing audio, burning subtitles), so multi-input ops are explicit.

import type { MediaKind } from "./types";

export type ParamType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "multiselect"
  | "textarea"
  | "object";

export type Option = { value: string; label: string };

export type Condition = {
  param: string;
  operator: "eq" | "neq" | "truthy" | "falsy";
  value?: unknown;
};

/** Where an enum/multiselect param gets its options when a URL is resolved. */
export type DynamicSource = "heights" | "audioFormats" | "subtitleLangs";

export type Param = {
  key: string;
  type: ParamType;
  label: string;
  group?: string;
  default?: unknown;
  options?: Option[];
  /** Fill options from the resolved URL profile; `options` is the fallback. */
  dynamic?: DynamicSource;
  /** Accepted object kinds for a `type: "object"` param. */
  accepts?: MediaKind[];
  /** A `type: "object"` param the operation cannot run without. */
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  advanced?: boolean;
  showIf?: Condition;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

export type FormValues = Record<string, unknown>;

/** Which engine executes an operation. */
export type OperationEngine = "ffmpeg" | "ytdlp" | "ffprobe";

/** Where an operation gets its input: a catalog object, or the job's URL. */
export type OperationSource = "object" | "url";

export type CatalogOperation = {
  id: string;
  name: string;
  description: string;
  tier: number;
  category: string;
  engine: OperationEngine;
  source: OperationSource;
  /** Catalog object kinds this operation can consume from the previous step. */
  accepts: MediaKind[];
  /** Primary kind this operation creates when it changes kind. */
  produces: MediaKind;
  /** Output keeps the input's kind (cut an audio file → still audio). */
  preservesKind?: boolean;
  /** Icon key resolved against components/studio/Icons. */
  icon: string;
  favorite?: boolean;
  /** One-line summary of what the operation does, shown as a note. */
  chainSteps?: string[];
  params: Param[];
};

/* ------------------------------- tier labels ------------------------------ */

export const TIER_LABELS: Record<number, string> = {
  1: "Download",
  2: "Info & Convert",
  3: "Edit",
  4: "Video Filters",
  5: "Audio & Subtitles",
  6: "Image",
  7: "Advanced",
};

export const TIER_FILTERS = [
  { id: "all", label: "All" },
  { id: "download", label: "Download" },
  { id: "convert", label: "Convert" },
  { id: "edit", label: "Edit" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Image" },
  { id: "advanced", label: "Advanced" },
] as const;

export type TierFilter = (typeof TIER_FILTERS)[number]["id"];

export const TIER_RANGES: Record<TierFilter, [number, number]> = {
  all: [1, 7],
  download: [1, 1],
  convert: [2, 2],
  edit: [3, 3],
  video: [4, 4],
  audio: [5, 5],
  image: [6, 6],
  advanced: [7, 7],
};

/* --------------------------------- catalog -------------------------------- */

const CONTAINERS: Option[] = [
  { value: "mp4", label: "MP4" },
  { value: "mkv", label: "Matroska (MKV)" },
  { value: "webm", label: "WebM" },
  { value: "mov", label: "QuickTime (MOV)" },
];

const BITRATES: Option[] = [
  { value: "96k", label: "96 kbps" },
  { value: "128k", label: "128 kbps" },
  { value: "192k", label: "192 kbps" },
  { value: "256k", label: "256 kbps" },
  { value: "320k", label: "320 kbps" },
];

const POSITIONS: Option[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "center", label: "Center" },
];

export const OPERATIONS: CatalogOperation[] = [
  /* ── Tier 1 — Download (URL) ─────────────────────────────────────────── */

  {
    id: "download-video",
    name: "Download Video",
    description:
      "Save the video track at a resolution the link really offers.",
    tier: 1,
    category: "download",
    engine: "ytdlp",
    source: "url",
    accepts: [],
    produces: "video",
    icon: "Video",
    favorite: true,
    params: [
      {
        key: "quality",
        type: "enum",
        label: "Resolution",
        dynamic: "heights",
        default: "best",
        options: [
          { value: "best", label: "Best available" },
          { value: "2160", label: "2160p (4K)" },
          { value: "1440", label: "1440p" },
          { value: "1080", label: "1080p" },
          { value: "720", label: "720p" },
          { value: "480", label: "480p" },
          { value: "360", label: "360p" },
        ],
        helpText: "Options come from the resolved link; “Best” picks the top one.",
      },
      {
        key: "container",
        type: "enum",
        label: "Container",
        default: "mp4",
        options: [
          { value: "mp4", label: "MP4" },
          { value: "mkv", label: "Matroska (MKV)" },
          { value: "webm", label: "WebM" },
        ],
      },
      {
        key: "clip",
        type: "boolean",
        label: "Download only a section",
        default: false,
        group: "Section",
      },
      {
        key: "start",
        type: "string",
        label: "Start",
        group: "Section",
        default: "00:00:00",
        placeholder: "HH:MM:SS",
        showIf: { param: "clip", operator: "truthy" },
      },
      {
        key: "end",
        type: "string",
        label: "End",
        group: "Section",
        default: "",
        placeholder: "HH:MM:SS",
        showIf: { param: "clip", operator: "truthy" },
      },
    ],
  },
  {
    id: "download-audio",
    name: "Download Audio",
    description: "Keep only the audio track, transcoded to the format you pick.",
    tier: 1,
    category: "download",
    engine: "ytdlp",
    source: "url",
    accepts: [],
    produces: "audio",
    icon: "Music",
    favorite: true,
    params: [
      {
        key: "format",
        type: "enum",
        label: "Format",
        default: "mp3",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "m4a", label: "M4A (AAC)" },
          { value: "opus", label: "Opus" },
          { value: "flac", label: "FLAC (lossless)" },
          { value: "wav", label: "WAV (lossless)" },
        ],
      },
      {
        key: "quality",
        type: "enum",
        label: "Quality",
        default: "0",
        options: [
          { value: "0", label: "Best (V0)" },
          { value: "2", label: "High (V2)" },
          { value: "5", label: "Medium (V5)" },
          { value: "320K", label: "CBR 320k" },
          { value: "192K", label: "CBR 192k" },
        ],
        showIf: { param: "format", operator: "neq", value: "flac" },
        helpText: "Ignored for lossless formats.",
      },
    ],
  },
  {
    id: "download-subs",
    name: "Download Subtitles",
    description:
      "Save the caption tracks the link actually offers as sidecar files.",
    tier: 1,
    category: "download",
    engine: "ytdlp",
    source: "url",
    accepts: [],
    produces: "subtitle",
    icon: "Subtitle",
    params: [
      {
        key: "langs",
        type: "multiselect",
        label: "Languages",
        dynamic: "subtitleLangs",
        default: [],
        options: [
          { value: "en", label: "English" },
          { value: "ja", label: "Japanese" },
          { value: "es", label: "Spanish" },
          { value: "fr", label: "French" },
          { value: "de", label: "German" },
        ],
        helpText: "Only languages present in the resolved link are listed.",
      },
      {
        key: "embed",
        type: "boolean",
        label: "Embed into the media file",
        default: false,
      },
    ],
  },

  /* ── Tier 2 — Info & Convert ─────────────────────────────────────────── */

  {
    id: "media-info",
    name: "Media Info",
    description:
      "Probe the file with ffprobe and write its streams, codecs, and format details as JSON.",
    tier: 2,
    category: "inspect",
    engine: "ffprobe",
    source: "object",
    accepts: [],
    produces: "other",
    icon: "Info",
    favorite: true,
    params: [
      {
        key: "detail",
        type: "enum",
        label: "Detail",
        default: "basic",
        options: [
          { value: "basic", label: "Summary" },
          { value: "full", label: "Full stream dump" },
        ],
      },
    ],
  },
  {
    id: "convert-video",
    name: "Convert Video",
    description:
      "Change container and codec with real quality and audio controls.",
    tier: 2,
    category: "convert",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Archive",
    favorite: true,
    params: [
      {
        key: "container",
        type: "enum",
        label: "Container",
        default: "mp4",
        options: CONTAINERS,
      },
      {
        key: "codec",
        type: "enum",
        label: "Video Codec",
        group: "Codecs",
        default: "auto",
        options: [
          { value: "auto", label: "Auto (match container)" },
          { value: "h264", label: "H.264 (compatible)" },
          { value: "h265", label: "H.265 / HEVC" },
          { value: "vp9", label: "VP9" },
          { value: "av1", label: "AV1" },
          { value: "copy", label: "Copy (no re-encode)" },
        ],
      },
      {
        key: "audio",
        type: "enum",
        label: "Audio Codec",
        group: "Codecs",
        default: "aac",
        options: [
          { value: "aac", label: "AAC" },
          { value: "opus", label: "Opus" },
          { value: "mp3", label: "MP3" },
          { value: "copy", label: "Copy" },
        ],
      },
      {
        key: "quality",
        type: "enum",
        label: "Quality",
        group: "Quality",
        default: "balanced",
        options: [
          { value: "high", label: "High (large file)" },
          { value: "balanced", label: "Balanced" },
          { value: "small", label: "Small file" },
          { value: "custom", label: "Custom CRF" },
        ],
      },
      {
        key: "crf",
        type: "integer",
        label: "CRF",
        group: "Quality",
        default: 20,
        min: 0,
        max: 51,
        showIf: { param: "quality", operator: "eq", value: "custom" },
        helpText: "Lower is better quality (18–28 is the useful range).",
      },
      {
        key: "audioBitrate",
        type: "enum",
        label: "Audio Bitrate",
        group: "Quality",
        default: "192k",
        options: BITRATES,
        showIf: { param: "audio", operator: "neq", value: "copy" },
      },
    ],
  },
  {
    id: "convert-audio",
    name: "Convert Audio",
    description: "Transcode between lossy and lossless audio formats.",
    tier: 2,
    category: "convert",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "audio",
    icon: "Music",
    favorite: true,
    params: [
      {
        key: "format",
        type: "enum",
        label: "Format",
        default: "mp3",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "m4a", label: "M4A (AAC)" },
          { value: "aac", label: "AAC" },
          { value: "wav", label: "WAV" },
          { value: "flac", label: "FLAC" },
          { value: "opus", label: "Opus" },
          { value: "ogg", label: "Ogg Vorbis" },
        ],
      },
      {
        key: "bitrate",
        type: "enum",
        label: "Bitrate",
        default: "192k",
        options: BITRATES,
        showIf: { param: "format", operator: "neq", value: "flac" },
      },
      {
        key: "sampleRate",
        type: "enum",
        label: "Sample Rate",
        group: "Advanced",
        default: "44100",
        options: [
          { value: "22050", label: "22.05 kHz" },
          { value: "44100", label: "44.1 kHz" },
          { value: "48000", label: "48 kHz" },
        ],
      },
      {
        key: "channels",
        type: "enum",
        label: "Channels",
        group: "Advanced",
        default: "2",
        options: [
          { value: "1", label: "Mono" },
          { value: "2", label: "Stereo" },
        ],
      },
    ],
  },
  {
    id: "convert-image",
    name: "Convert Image",
    description: "Convert between JPEG, PNG, WebP, and AVIF with a quality dial.",
    tier: 2,
    category: "convert",
    engine: "ffmpeg",
    source: "object",
    accepts: ["image"],
    produces: "image",
    icon: "Image",
    favorite: true,
    params: [
      {
        key: "format",
        type: "enum",
        label: "Format",
        default: "jpg",
        options: [
          { value: "jpg", label: "JPEG" },
          { value: "png", label: "PNG (lossless)" },
          { value: "webp", label: "WebP" },
          { value: "avif", label: "AVIF" },
        ],
      },
      {
        key: "quality",
        type: "integer",
        label: "Quality",
        default: 85,
        min: 1,
        max: 100,
        showIf: { param: "format", operator: "neq", value: "png" },
      },
    ],
  },

  /* ── Tier 3 — Edit ───────────────────────────────────────────────────── */

  {
    id: "cut",
    name: "Cut / Trim",
    description:
      "Trim to a time range — frame-accurate re-encode or instant stream copy.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Scissors",
    favorite: true,
    params: [
      {
        key: "start",
        type: "string",
        label: "Start",
        group: "Range",
        default: "00:00:00",
        placeholder: "HH:MM:SS.ms",
        helpText: "Timecode or seconds.",
      },
      {
        key: "end",
        type: "string",
        label: "End",
        group: "Range",
        default: "",
        placeholder: "HH:MM:SS.ms",
        helpText: "Leave empty to keep to the end.",
      },
      {
        key: "mode",
        type: "enum",
        label: "Mode",
        group: "Options",
        default: "reencode",
        options: [
          { value: "reencode", label: "Re-encode (frame accurate)" },
          { value: "copy", label: "Stream copy (fast, keyframes only)" },
        ],
      },
    ],
  },
  {
    id: "compress",
    name: "Compress",
    description:
      "Shrink a video by quality tier, or aim for a target file size.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    preservesKind: true,
    icon: "Archive",
    favorite: true,
    params: [
      {
        key: "mode",
        type: "enum",
        label: "Method",
        default: "quality",
        options: [
          { value: "quality", label: "Quality tier" },
          { value: "target", label: "Target file size" },
        ],
      },
      {
        key: "quality",
        type: "enum",
        label: "Size",
        default: "balanced",
        options: [
          { value: "light", label: "Light (barely visible)" },
          { value: "balanced", label: "Balanced" },
          { value: "strong", label: "Strong" },
          { value: "maximum", label: "Maximum compression" },
        ],
        showIf: { param: "mode", operator: "eq", value: "quality" },
      },
      {
        key: "targetMB",
        type: "number",
        label: "Target Size",
        default: 20,
        min: 1,
        unit: "MB",
        showIf: { param: "mode", operator: "eq", value: "target" },
        helpText: "Uses the known duration to compute a bitrate.",
      },
      {
        key: "maxWidth",
        type: "integer",
        label: "Max Width",
        default: 0,
        min: 0,
        unit: "px",
        helpText: "0 keeps the original width; a smaller width also shrinks the file.",
      },
    ],
  },
  {
    id: "resize",
    name: "Resize",
    description: "Change resolution with a choice of scaling filters.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Settings",
    favorite: true,
    params: [
      { key: "width", type: "integer", label: "Width", group: "Dimensions", default: 1280, min: 16, max: 7680, unit: "px" },
      { key: "height", type: "integer", label: "Height", group: "Dimensions", default: 720, min: 16, max: 4320, unit: "px" },
      { key: "preserveAspect", type: "boolean", label: "Preserve aspect ratio", group: "Dimensions", default: true },
      {
        key: "scaler",
        type: "enum",
        label: "Scaler",
        group: "Quality",
        default: "lanczos",
        options: [
          { value: "fast_bilinear", label: "Fast bilinear" },
          { value: "bilinear", label: "Bilinear" },
          { value: "bicubic", label: "Bicubic" },
          { value: "lanczos", label: "Lanczos (best)" },
          { value: "spline", label: "Spline" },
        ],
      },
    ],
  },
  {
    id: "speed",
    name: "Speed",
    description: "Fast or slow motion, with optional pitch preservation.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Bolt",
    params: [
      { key: "factor", type: "number", label: "Speed Factor", default: 1, min: 0.25, max: 4, step: 0.25, unit: "x" },
      { key: "keepPitch", type: "boolean", label: "Preserve audio pitch", default: true },
    ],
  },
  {
    id: "concat",
    name: "Concat / Merge",
    description: "Join this media with another catalog object end to end.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Flow",
    favorite: true,
    params: [
      {
        key: "with",
        type: "object",
        label: "Second Clip",
        accepts: ["video", "audio"],
        required: true,
        helpText: "Played after this media. Staged server-side.",
      },
      { key: "normalize", type: "boolean", label: "Normalize to one resolution", default: true, group: "Output" },
      { key: "width", type: "integer", label: "Width", group: "Output", default: 1920, min: 16, unit: "px", showIf: { param: "normalize", operator: "truthy" } },
      { key: "height", type: "integer", label: "Height", group: "Output", default: 1080, min: 16, unit: "px", showIf: { param: "normalize", operator: "truthy" } },
      {
        key: "audio",
        type: "enum",
        label: "Audio",
        group: "Output",
        default: "keep",
        options: [
          { value: "keep", label: "Keep audio (both clips must have it)" },
          { value: "mute", label: "Mute (video only)" },
        ],
      },
    ],
  },
  {
    id: "replace-audio",
    name: "Replace Audio",
    description:
      "Swap in the audio track from another object; the video stream is copied.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Music",
    params: [
      {
        key: "with",
        type: "object",
        label: "Audio Source",
        accepts: ["audio", "video"],
        required: true,
      },
      { key: "shortest", type: "boolean", label: "Trim to the shorter track", default: true },
    ],
  },
  {
    id: "strip-audio",
    name: "Remove Audio",
    description: "Drop the audio track and keep video only.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Video",
    params: [],
  },
  {
    id: "fps",
    name: "Frame Rate",
    description: "Convert the video to a different frame rate.",
    tier: 3,
    category: "edit",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Clock",
    params: [
      {
        key: "fps",
        type: "enum",
        label: "Frame Rate",
        default: "30",
        options: [
          { value: "23.976", label: "23.976 fps (film)" },
          { value: "24", label: "24 fps" },
          { value: "25", label: "25 fps" },
          { value: "30", label: "30 fps" },
          { value: "50", label: "50 fps" },
          { value: "60", label: "60 fps" },
        ],
      },
    ],
  },

  /* ── Tier 4 — Video Filters ──────────────────────────────────────────── */

  {
    id: "crop",
    name: "Crop",
    description: "Cut away borders or regions with precise coordinates.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Crop",
    favorite: true,
    params: [
      { key: "w", type: "integer", label: "Width", default: 1280, min: 16, unit: "px" },
      { key: "h", type: "integer", label: "Height", default: 720, min: 16, unit: "px" },
      { key: "x", type: "integer", label: "X Offset", group: "Position", default: 0, min: 0 },
      { key: "y", type: "integer", label: "Y Offset", group: "Position", default: 0, min: 0 },
    ],
  },
  {
    id: "rotate",
    name: "Rotate / Flip",
    description: "Rotate by 90/180 degrees or flip horizontally and vertically.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Rotate",
    params: [
      {
        key: "dir",
        type: "enum",
        label: "Transform",
        default: "90cw",
        options: [
          { value: "90cw", label: "90° clockwise" },
          { value: "90ccw", label: "90° counter-clockwise" },
          { value: "180", label: "180°" },
          { value: "hflip", label: "Flip horizontal" },
          { value: "vflip", label: "Flip vertical" },
        ],
      },
    ],
  },
  {
    id: "pad",
    name: "Pad",
    description: "Add borders around the media with a background color.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Crop",
    params: [
      { key: "w", type: "integer", label: "Output Width", default: 1920, min: 16, unit: "px" },
      { key: "h", type: "integer", label: "Output Height", default: 1080, min: 16, unit: "px" },
      { key: "x", type: "integer", label: "X Offset", group: "Position", default: 0 },
      { key: "y", type: "integer", label: "Y Offset", group: "Position", default: 0 },
      { key: "color", type: "string", label: "Fill Color", group: "Position", default: "black", placeholder: "black / #1a1a1a" },
    ],
  },
  {
    id: "color",
    name: "Color Adjust",
    description: "Tune brightness, contrast, saturation, and gamma.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Sparkle",
    params: [
      { key: "brightness", type: "number", label: "Brightness", default: 0, min: -1, max: 1, step: 0.05 },
      { key: "contrast", type: "number", label: "Contrast", default: 1, min: 0, max: 3, step: 0.05 },
      { key: "saturation", type: "number", label: "Saturation", default: 1, min: 0, max: 3, step: 0.05 },
      { key: "gamma", type: "number", label: "Gamma", default: 1, min: 0.1, max: 3, step: 0.05 },
    ],
  },
  {
    id: "blur",
    name: "Blur",
    description: "Apply Gaussian, box, or edge-preserving blur.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Sparkle",
    params: [
      { key: "radius", type: "integer", label: "Radius", default: 5, min: 1, max: 50, unit: "px" },
      {
        key: "type",
        type: "enum",
        label: "Blur Type",
        default: "gblur",
        options: [
          { value: "gblur", label: "Gaussian" },
          { value: "boxblur", label: "Box" },
          { value: "bilateral", label: "Bilateral (edge preserving)" },
        ],
      },
    ],
  },
  {
    id: "sharpen",
    name: "Sharpen",
    description: "Enhance edge detail with the unsharp mask filter.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Sparkle",
    params: [
      { key: "amount", type: "number", label: "Amount", default: 1, min: 0, max: 3, step: 0.1 },
      { key: "size", type: "integer", label: "Kernel Size", default: 5, min: 3, max: 23, step: 2 },
    ],
  },
  {
    id: "denoise",
    name: "Denoise",
    description: "Reduce video noise while preserving edge detail.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Sparkle",
    params: [
      {
        key: "strength",
        type: "enum",
        label: "Strength",
        default: "medium",
        options: [
          { value: "light", label: "Light" },
          { value: "medium", label: "Medium" },
          { value: "strong", label: "Strong" },
        ],
      },
    ],
  },
  {
    id: "watermark",
    name: "Image Overlay",
    description: "Place a logo or image from the catalog over the media.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "image"],
    produces: "video",
    preservesKind: true,
    icon: "Image",
    params: [
      {
        key: "image",
        type: "object",
        label: "Overlay Image",
        accepts: ["image"],
        required: true,
      },
      {
        key: "position",
        type: "enum",
        label: "Position",
        default: "bottom-right",
        options: POSITIONS,
      },
      { key: "width", type: "integer", label: "Width", default: 120, min: 0, max: 4000, unit: "px", helpText: "0 uses the image's natural size." },
      { key: "opacity", type: "number", label: "Opacity", default: 1, min: 0, max: 1, step: 0.05 },
      { key: "margin", type: "integer", label: "Margin", group: "Position", default: 16, min: 0, unit: "px" },
    ],
  },
  {
    id: "hdr-to-sdr",
    name: "HDR to SDR",
    description: "Tone map HDR10 or HLG content down to standard dynamic range.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Sparkle",
    params: [
      {
        key: "algo",
        type: "enum",
        label: "Tone Map",
        default: "hable",
        options: [
          { value: "clip", label: "Clip" },
          { value: "hable", label: "Hable (recommended)" },
          { value: "reinhard", label: "Reinhard" },
          { value: "mobius", label: "Mobius" },
        ],
      },
    ],
  },
  {
    id: "stabilize",
    name: "Video Stabilization",
    description: "Two-pass deshake using vidstab detect/transform.",
    tier: 4,
    category: "video",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Sparkle",
    params: [
      { key: "shakiness", type: "integer", label: "Shakiness", default: 5, min: 1, max: 10 },
      { key: "smoothing", type: "integer", label: "Smoothing Frames", default: 10, min: 0, max: 100 },
    ],
  },

  /* ── Tier 5 — Audio & Subtitles ──────────────────────────────────────── */

  {
    id: "extract-audio",
    name: "Extract Audio",
    description: "Pull the audio track out of a video as a standalone file.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "audio",
    icon: "Music",
    favorite: true,
    params: [
      {
        key: "format",
        type: "enum",
        label: "Audio Format",
        default: "mp3",
        options: [
          { value: "mp3", label: "MP3" },
          { value: "m4a", label: "AAC / M4A" },
          { value: "wav", label: "WAV" },
          { value: "flac", label: "FLAC" },
          { value: "opus", label: "Opus" },
        ],
      },
      { key: "bitrate", type: "enum", label: "Bitrate", default: "192k", options: BITRATES, showIf: { param: "format", operator: "neq", value: "flac" } },
    ],
  },
  {
    id: "volume",
    name: "Volume",
    description: "Adjust audio gain by a fixed amount in decibels.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Music",
    params: [
      { key: "gain", type: "number", label: "Gain", default: 0, min: -60, max: 60, step: 0.5, unit: "dB" },
    ],
  },
  {
    id: "loudnorm",
    name: "Loudness Normalization",
    description: "Normalize to a target integrated loudness (EBU R128).",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Music",
    favorite: true,
    params: [
      {
        key: "target",
        type: "enum",
        label: "Target",
        default: "-16",
        options: [
          { value: "-23", label: "-23 LUFS (broadcast)" },
          { value: "-16", label: "-16 LUFS (podcast)" },
          { value: "-14", label: "-14 LUFS (streaming)" },
        ],
      },
      { key: "truePeak", type: "number", label: "Max True Peak", group: "Advanced", default: -2, min: -9, max: 0, unit: "dBTP" },
      { key: "lra", type: "number", label: "Loudness Range", group: "Advanced", default: 7, min: 1, max: 50, unit: "LU" },
    ],
  },
  {
    id: "compressor",
    name: "Dynamic Compression",
    description: "Reduce dynamic range using acompressor.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Settings",
    params: [
      { key: "threshold", type: "number", label: "Threshold", default: -20, min: -60, max: 0, unit: "dB" },
      { key: "ratio", type: "number", label: "Ratio", default: 2, min: 1, max: 20, step: 0.5 },
      { key: "attack", type: "integer", label: "Attack", group: "Advanced", default: 20, min: 1, max: 2000, unit: "ms" },
      { key: "release", type: "integer", label: "Release", group: "Advanced", default: 250, min: 1, max: 9000, unit: "ms" },
    ],
  },
  {
    id: "eq",
    name: "Parametric EQ",
    description: "Apply a peaking equalizer band with adjustable Q.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Settings",
    params: [
      { key: "freq", type: "integer", label: "Frequency", default: 1000, min: 20, max: 20000, unit: "Hz" },
      { key: "gain", type: "number", label: "Gain", default: 0, min: -20, max: 20, step: 0.5, unit: "dB" },
      { key: "q", type: "number", label: "Q Factor", default: 1, min: 0.1, max: 10, step: 0.1 },
    ],
  },
  {
    id: "noise-reduce",
    name: "Noise Reduction",
    description: "Reduce broadband noise via spectral subtraction.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Sparkle",
    params: [
      { key: "reduction", type: "number", label: "Reduction", default: 12, min: 0.01, max: 97, unit: "dB" },
    ],
  },
  {
    id: "fade",
    name: "Fade",
    description: "Fade audio in, out, or both.",
    tier: 5,
    category: "audio",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "Music",
    params: [
      {
        key: "mode",
        type: "enum",
        label: "Mode",
        default: "both",
        options: [
          { value: "in", label: "Fade in" },
          { value: "out", label: "Fade out" },
          { value: "both", label: "Both" },
        ],
      },
      { key: "duration", type: "number", label: "Duration", default: 1.5, min: 0.1, max: 30, step: 0.1, unit: "s" },
      {
        key: "curve",
        type: "enum",
        label: "Curve",
        group: "Advanced",
        default: "tri",
        options: [
          { value: "tri", label: "Linear" },
          { value: "qsin", label: "Sine" },
          { value: "exp", label: "Exponential" },
          { value: "log", label: "Logarithmic" },
        ],
      },
    ],
  },
  {
    id: "extract-subtitles",
    name: "Extract Subtitles",
    description: "Pull an embedded subtitle stream out into a separate file.",
    tier: 5,
    category: "subtitle",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "subtitle",
    icon: "Subtitle",
    params: [
      {
        key: "format",
        type: "enum",
        label: "Output Format",
        default: "srt",
        options: [
          { value: "srt", label: "SRT" },
          { value: "ass", label: "ASS" },
          { value: "vtt", label: "VTT" },
        ],
      },
      { key: "stream", type: "integer", label: "Subtitle Stream", group: "Advanced", default: 0, min: 0, max: 30 },
    ],
  },
  {
    id: "mux-subtitles",
    name: "Add Subtitles",
    description: "Add a subtitle file from the catalog as a soft subtitle track.",
    tier: 5,
    category: "subtitle",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Subtitle",
    params: [
      {
        key: "with",
        type: "object",
        label: "Subtitle File",
        accepts: ["subtitle"],
        required: true,
      },
      { key: "language", type: "string", label: "Language Tag", default: "eng", placeholder: "eng / ja" },
    ],
  },
  {
    id: "burn-subtitles",
    name: "Burn Subtitles",
    description: "Hard-code a subtitle file into the picture.",
    tier: 5,
    category: "subtitle",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Subtitle",
    params: [
      {
        key: "with",
        type: "object",
        label: "Subtitle File",
        accepts: ["subtitle"],
        required: true,
      },
      { key: "fontSize", type: "integer", label: "Font Size", default: 24, min: 8, max: 96 },
    ],
  },

  /* ── Tier 6 — Image ──────────────────────────────────────────────────── */

  {
    id: "to-gif",
    name: "Export as GIF",
    description: "Turn a segment of a video into a looping animated GIF.",
    tier: 6,
    category: "image",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "image",
    icon: "Image",
    params: [
      { key: "start", type: "string", label: "Start", default: "0" },
      { key: "duration", type: "integer", label: "Duration", default: 3, min: 1, max: 60, unit: "s" },
      { key: "fps", type: "integer", label: "FPS", default: 12, min: 5, max: 30 },
      { key: "width", type: "integer", label: "Width", default: 480, min: 120, max: 1280, unit: "px" },
    ],
  },
  {
    id: "extract-frame",
    name: "Extract Frame",
    description: "Grab a single frame from a video as an image.",
    tier: 6,
    category: "image",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "image",
    icon: "Image",
    params: [
      { key: "at", type: "string", label: "At Time", default: "5", placeholder: "HH:MM:SS or seconds" },
      {
        key: "format",
        type: "enum",
        label: "Format",
        default: "jpg",
        options: [
          { value: "jpg", label: "JPEG" },
          { value: "png", label: "PNG" },
          { value: "webp", label: "WebP" },
        ],
      },
    ],
  },
  {
    id: "compress-image",
    name: "Compress Image",
    description: "Shrink an image by format, quality, and maximum width.",
    tier: 6,
    category: "image",
    engine: "ffmpeg",
    source: "object",
    accepts: ["image"],
    produces: "image",
    icon: "Image",
    params: [
      {
        key: "format",
        type: "enum",
        label: "Format",
        default: "webp",
        options: [
          { value: "webp", label: "WebP" },
          { value: "jpg", label: "JPEG" },
          { value: "avif", label: "AVIF" },
          { value: "png", label: "PNG" },
        ],
      },
      { key: "quality", type: "integer", label: "Quality", default: 75, min: 1, max: 100, showIf: { param: "format", operator: "neq", value: "png" } },
      { key: "maxWidth", type: "integer", label: "Max Width", group: "Dimensions", default: 1920, min: 16, unit: "px" },
    ],
  },

  /* ── Tier 7 — Advanced ───────────────────────────────────────────────── */

  {
    id: "preset-web",
    name: "Web Optimized",
    description: "H.264 MP4 with faststart and AAC audio — ready to publish.",
    tier: 7,
    category: "preset",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Globe",
    favorite: true,
    params: [
      {
        key: "maxHeight",
        type: "enum",
        label: "Max Height",
        default: "1080",
        options: [
          { value: "480", label: "480p" },
          { value: "720", label: "720p" },
          { value: "1080", label: "1080p" },
          { value: "1440", label: "1440p" },
        ],
      },
      { key: "crf", type: "integer", label: "Quality (CRF)", default: 23, min: 0, max: 51 },
    ],
  },
  {
    id: "preset-social",
    name: "Social Vertical",
    description: "Crop to 9:16, scale to 1080×1920, and normalize loudness.",
    tier: 7,
    category: "preset",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Crop",
    params: [],
  },
  {
    id: "preset-archive",
    name: "Archive Quality",
    description: "High-quality H.264 MP4 (CRF 18, slow preset) for keeping a master.",
    tier: 7,
    category: "preset",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video"],
    produces: "video",
    icon: "Archive",
    params: [],
  },
  {
    id: "metadata",
    name: "Metadata Tags",
    description: "Write title, artist, album, and language tags into the file.",
    tier: 7,
    category: "metadata",
    engine: "ffmpeg",
    source: "object",
    accepts: ["video", "audio"],
    produces: "video",
    preservesKind: true,
    icon: "File",
    params: [
      { key: "title", type: "string", label: "Title", default: "" },
      { key: "artist", type: "string", label: "Artist", default: "" },
      { key: "album", type: "string", label: "Album", default: "" },
      { key: "comment", type: "string", label: "Comment", default: "" },
      { key: "language", type: "string", label: "Language", group: "Advanced", default: "eng" },
    ],
  },
];

/* -------------------------------- lookups --------------------------------- */

const BY_ID = new Map(OPERATIONS.map((op) => [op.id, op]));

export function getOperation(id: string): CatalogOperation | undefined {
  return BY_ID.get(id);
}

export function acceptsKind(op: CatalogOperation, kind: MediaKind): boolean {
  return op.accepts.length === 0 || op.accepts.includes(kind);
}

/** The kind a step produces, given the kind flowing into it. */
export function producedKind(op: CatalogOperation, inputKind: MediaKind): MediaKind {
  return op.preservesKind ? inputKind : op.produces;
}

export function groupByTier(ops: CatalogOperation[]): [number, CatalogOperation[]][] {
  const map = new Map<number, CatalogOperation[]>();
  for (const op of ops) {
    const list = map.get(op.tier);
    if (list) list.push(op);
    else map.set(op.tier, [op]);
  }
  return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
}
