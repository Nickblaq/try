// lib/catalog/engines.ts
//
// Job construction for the shared operation catalog. The old /op and /yt pages
// each carried their own translate module; this is the single place that turns
// an operation + params (+ the previous step's object) into something runnable.
//
// Three engines:
//   • ffprobe — one probe invocation that writes a JSON report
//   • ffmpeg  — one or more argument passes for a single operation
//   • ytdlp   — a merged options blob for the python yt-dlp bridge
//
// Pure string/number work only: no `server-only`, no Node builtins, so the
// client can type-check against the same shapes the runner uses.
//
// Every ffmpeg builder reports the *kind* it produces (`outputKind`) rather
// than leaving it to extension guessing, so processing an image is never
// mislabelled a video and processing audio is never mislabelled a video.

import type { MediaKind } from "./types";
import { getOperation, type FormValues } from "./operations";

/* ------------------------------- shared util ------------------------------ */

const s = (v: unknown, d = ""): string => (v == null ? d : String(v));
const n = (v: unknown, d = 0): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};
const b = (v: unknown): boolean => v === true || v === "true" || v === "on";
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(Math.max(x, lo), hi);

function parseTime(input: string): number {
  const str = input.trim().replace(/^\*/, "");
  if (!str) return 0;
  if (str.includes(":")) {
    const parts = str.split(":").map((p) => parseFloat(p));
    if (parts.some(Number.isNaN)) return 0;
    return parts.reduce((acc, x) => acc * 60 + x, 0);
  }
  const v = parseFloat(str);
  return Number.isNaN(v) ? 0 : v;
}

function parseSection(section: string): [number, number] | null {
  const m = section.match(/^\*?\s*([\d:.]+)\s*-\s*([\d:.]+)\s*$/);
  if (!m) return null;
  const start = parseTime(m[1]);
  const end = parseTime(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return [start, end];
}

function sanitizeBase(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "output";
}

/** atempo only accepts 0.5–2.0, so chain for larger/smaller factors. */
function buildAtempo(factor: number): string {
  const parts: string[] = [];
  let f = factor;
  while (f > 2) {
    parts.push("atempo=2.0");
    f /= 2;
  }
  while (f < 0.5) {
    parts.push("atempo=0.5");
    f /= 0.5;
  }
  parts.push(`atempo=${f.toFixed(4)}`);
  return parts.join(",");
}

/** Escape a filesystem path for use inside an ffmpeg filter argument. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

/* ------------------------------ extension map ----------------------------- */

const VIDEO_EXTS = ["mp4", "mkv", "webm", "mov", "avi", "m4v"];
const AUDIO_EXTS = ["mp3", "m4a", "aac", "wav", "flac", "opus", "ogg"];
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "gif", "bmp"];
const SUBTITLE_EXTS = ["srt", "ass", "vtt"];

function kindForExt(ext: string): MediaKind {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (AUDIO_EXTS.includes(e)) return "audio";
  if (IMAGE_EXTS.includes(e)) return "image";
  if (SUBTITLE_EXTS.includes(e)) return "subtitle";
  if (VIDEO_EXTS.includes(e)) return "video";
  return "video";
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/* ----------------------------- codec lookups ------------------------------ */

const VIDEO_CODEC_ARG: Record<string, string> = {
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libsvtav1",
};

const AUDIO_CODEC_ARG: Record<string, string> = {
  mp3: "libmp3lame",
  m4a: "aac",
  aac: "aac",
  wav: "pcm_s16le",
  flac: "flac",
  opus: "libopus",
  ogg: "libvorbis",
};

const AUDIO_BITRATE: Record<string, string> = {
  mp3: "libmp3lame",
  m4a: "aac",
  aac: "aac",
  opus: "libopus",
  ogg: "libvorbis",
};

/** Default video codec for a container when the user picked "auto". */
function autoCodecFor(container: string): string {
  switch (container) {
    case "webm":
      return "libvpx-vp9";
    case "mov":
    case "mkv":
    case "mp4":
    default:
      return "libx264";
  }
}

/** Quality tier → CRF, roughly "visually lossless" down to "tiny file". */
const CRF_TIER: Record<string, number> = {
  light: 30,
  balanced: 26,
  strong: 23,
  maximum: 18,
  high: 18,
  small: 28,
};

/* --------------------------------- ffprobe -------------------------------- */

export type FfprobeStep = {
  engine: "ffprobe";
  /** Absolute path the JSON report is written to. */
  outputPath: string;
  outputName: string;
  ext: "json";
  outputKind: "other";
  args: string[];
};

/* --------------------------------- ffmpeg --------------------------------- */

export type FfmpegPass = { name: string; args: string[] };

export type FfmpegStep = {
  engine: "ffmpeg";
  /** Absolute path the final pass writes to. */
  outputPath: string;
  /** Basename of the output, for the catalog record. */
  outputName: string;
  /** Lowercase file extension chosen for the output. */
  ext: string;
  /** Catalog kind the output should be recorded as. */
  outputKind: MediaKind;
  passes: FfmpegPass[];
};

/** An input to an ffmpeg invocation: the pipeline input or an extra object. */
export type EngineInput = {
  path: string;
  kind: MediaKind;
  name: string;
  /** Known duration in seconds — used to budget bitrates. */
  durationSeconds?: number | null;
};

/**
 * Build the ffmpeg invocation(s) for a single operation step.
 *
 * `input` is the staged path to the previous step's object (or the source
 * object). `outBase` is a filename stem the runner guarantees is unique within
 * the job, so intermediate objects never collide. `extras` are any additional
 * catalog objects the operation pulls in (concat partner, overlay image,
 * subtitle file, replacement audio).
 */
export function buildFfmpegStep(
  opId: string,
  params: FormValues,
  input: EngineInput,
  outBase: string,
  extras: EngineInput[] = []
): FfmpegStep {
  const p = params ?? {};
  const vf: string[] = [];
  const af: string[] = [];
  const inArgs: string[] = []; // before -i
  const outArgs: string[] = []; // after filters/codecs, before output
  const pre: FfmpegPass[] = []; // passes that run before the final one
  const inputs: string[] = ["-i", input.path];
  const fc: string[] = []; // filter_complex fragments
  let vCodec: string | null = null;
  let aCodec: string | null = null;
  let crf: number | null = null;
  let preset: string | null = null;
  let vBitrate: string | null = null;
  let aBitrate: string | null = null;
  let explicitMaps: string[] = [];
  // Default output extension follows the input so same-kind operations keep
  // the container the user already had.
  let ext = extensionOf(input.name) || (input.kind === "audio" ? "m4a" : "mp4");
  const keepExt = () => {
    ext = extensionOf(input.name) || ext;
  };

  switch (opId) {
    /* ── ffprobe handled by buildObjectStep, not here ──────────────────── */

    /* ── Tier 2 — Info & Convert ───────────────────────────────────────── */

    case "convert-video": {
      const container = s(p.container, "mp4");
      ext = container;
      const codec = s(p.codec, "auto");
      if (codec === "copy") {
        vCodec = "copy";
      } else {
        vCodec =
          codec === "auto" ? autoCodecFor(container) : VIDEO_CODEC_ARG[codec] ?? codec;
        const quality = s(p.quality, "balanced");
        crf = quality === "custom" ? clamp(n(p.crf, 20), 0, 51) : CRF_TIER[quality] ?? 23;
        // VP9/AV1 don't use the x264 `-preset` knob.
        if (vCodec === "libx264" || vCodec === "libx265") preset = "medium";
      }
      const audio = s(p.audio, "aac");
      if (audio !== "copy") {
        aCodec = AUDIO_CODEC_ARG[audio] ?? audio;
        aBitrate = s(p.audioBitrate, "192k");
      } else {
        aCodec = "copy";
      }
      if (container === "mp4" || container === "mov") {
        outArgs.push("-movflags", "+faststart");
      }
      break;
    }

    case "convert-audio": {
      const fmt = s(p.format, "mp3");
      ext = fmt === "m4a" || fmt === "aac" ? "m4a" : fmt;
      aCodec = AUDIO_CODEC_ARG[fmt] ?? fmt;
      vCodec = null;
      outArgs.push("-vn");
      if (fmt !== "flac") aBitrate = s(p.bitrate, "192k");
      if (p.sampleRate) outArgs.push("-ar", s(p.sampleRate, "44100"));
      if (p.channels) outArgs.push("-ac", s(p.channels, "2"));
      break;
    }

    case "convert-image": {
      const fmt = s(p.format, "jpg");
      ext = fmt;
      vCodec = null;
      aCodec = null;
      outArgs.push("-an");
      outArgs.push(...imageQualityArgs(fmt, n(p.quality, 85)));
      break;
    }

    /* ── Tier 3 — Edit ─────────────────────────────────────────────────── */

    case "cut": {
      const start = s(p.start, "").trim();
      const end = s(p.end, "").trim();
      if (start) inArgs.push("-ss", String(parseTime(start)));
      if (end) inArgs.push("-to", String(parseTime(end)));
      if (s(p.mode, "reencode") === "copy") {
        vCodec = "copy";
        aCodec = "copy";
      }
      keepExt();
      break;
    }

    case "compress": {
      const maxWidth = n(p.maxWidth, 0);
      if (maxWidth > 0) vf.push(`scale='min(${maxWidth},iw)':-2`);
      vCodec = "libx264";
      aCodec = "aac";
      preset = "medium";
      aBitrate = "128k";
      if (s(p.mode, "quality") === "target") {
        const targetBits = n(p.targetMB, 20) * 8 * 1024 * 1024;
        const duration = input.durationSeconds ?? 0;
        if (duration > 0) {
          // Budget total bitrate, then carve out ~128k for audio.
          const totalKbps = Math.max(120, Math.floor(targetBits / duration / 1000));
          vBitrate = `${Math.max(64, totalKbps - 128)}k`;
          crf = null;
        } else {
          // No duration to budget against — fall back to a small quality tier.
          crf = CRF_TIER.strong;
        }
      } else {
        crf = CRF_TIER[s(p.quality, "balanced")] ?? CRF_TIER.balanced;
      }
      keepExt();
      break;
    }

    case "resize": {
      const w = n(p.width, 1280);
      const h = n(p.height, 720);
      const scaler = s(p.scaler, "lanczos");
      if (b(p.preserveAspect ?? true)) vf.push(`scale=${w}:-2:flags=${scaler}`);
      else vf.push(`scale=${w}:${h}:flags=${scaler}`);
      keepExt();
      break;
    }

    case "speed": {
      const factor = n(p.factor, 1);
      if (factor !== 1) {
        vf.push(`setpts=${(1 / factor).toFixed(6)}*PTS`);
        if (b(p.keepPitch ?? true)) af.push(buildAtempo(factor));
        else af.push(`asetrate=48000*${factor},aresample=48000`);
      }
      keepExt();
      break;
    }

    case "concat": {
      const extra = extras[0];
      if (!extra) {
        throw new Error("Concat needs a second clip selected in the operation.");
      }
      inputs.push("-i", extra.path);
      const keepAudio = s(p.audio, "keep") === "keep";
      const w = n(p.width, 1920);
      const h = n(p.height, 1080);
      const normalize = b(p.normalize ?? true);
      const prep = (label: string) =>
        normalize
          ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`
          : "setsar=1";
      fc.push(`[0:v]${prep("v0")}[v0]`);
      fc.push(`[1:v]${prep("v1")}[v1]`);
      if (keepAudio) {
        fc.push(`[0:a]aresample=48000[a0]`);
        fc.push(`[1:a]aresample=48000[a1]`);
        fc.push(`[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]`);
        explicitMaps = ["-map", "[v]", "-map", "[a]"];
        vCodec = "libx264";
        aCodec = "aac";
        preset = "medium";
        crf = 20;
      } else {
        fc.push(`[v0][v1]concat=n=2:v=1:a=0[v]`);
        explicitMaps = ["-map", "[v]", "-an"];
        vCodec = "libx264";
        preset = "medium";
        crf = 20;
      }
      if (input.kind === "audio" && !keepAudio) {
        // Concatenating audio with audio disabled makes no sense — keep audio.
        throw new Error("Concat of audio always keeps the audio track.");
      }
      ext = extensionOf(input.name) || ext;
      break;
    }

    case "replace-audio": {
      const extra = extras[0];
      if (!extra) {
        throw new Error("Replace Audio needs a second object selected.");
      }
      inputs.push("-i", extra.path);
      explicitMaps = ["-map", "0:v:0", "-map", "1:a:0"];
      vCodec = "copy";
      const container = extensionOf(input.name);
      aCodec = container === "webm" ? "libopus" : "aac";
      if (b(p.shortest ?? true)) outArgs.push("-shortest");
      ext = container || "mp4";
      break;
    }

    case "strip-audio": {
      outArgs.push("-an");
      keepExt();
      break;
    }

    case "fps": {
      vf.push(`fps=${s(p.fps, "30")}`);
      keepExt();
      break;
    }

    /* ── Tier 4 — Video filters ────────────────────────────────────────── */

    case "crop": {
      vf.push(`crop=${n(p.w, 1280)}:${n(p.h, 720)}:${n(p.x, 0)}:${n(p.y, 0)}`);
      keepExt();
      break;
    }

    case "rotate": {
      const map: Record<string, string> = {
        "90cw": "transpose=1",
        "90ccw": "transpose=2",
        "180": "transpose=2,transpose=2",
        hflip: "hflip",
        vflip: "vflip",
      };
      const f = map[s(p.dir, "90cw")];
      if (f) vf.push(f);
      keepExt();
      break;
    }

    case "pad": {
      vf.push(
        `pad=${n(p.w, 1920)}:${n(p.h, 1080)}:${n(p.x, 0)}:${n(p.y, 0)}:${s(p.color, "black")}`
      );
      keepExt();
      break;
    }

    case "color": {
      vf.push(
        `eq=brightness=${n(p.brightness, 0)}:contrast=${n(p.contrast, 1)}:saturation=${n(
          p.saturation,
          1
        )}:gamma=${n(p.gamma, 1)}`
      );
      keepExt();
      break;
    }

    case "blur": {
      const radius = n(p.radius, 5);
      const type = s(p.type, "gblur");
      if (type === "boxblur") vf.push(`boxblur=${radius}:1`);
      else if (type === "bilateral") vf.push(`bilateral=sigmaS=${radius}`);
      else vf.push(`gblur=sigma=${radius}`);
      keepExt();
      break;
    }

    case "sharpen": {
      vf.push(`unsharp=${n(p.amount, 1)}:${n(p.size, 5)}`);
      keepExt();
      break;
    }

    case "denoise": {
      const strength = s(p.strength, "medium");
      const luma =
        strength === "light" ? "2:1:2:1" : strength === "strong" ? "8:5:8:5" : "4:3:4:3";
      vf.push(`hqdn3d=${luma}`);
      keepExt();
      break;
    }

    case "watermark": {
      const extra = extras[0];
      if (!extra) {
        throw new Error("Image Overlay needs an overlay image selected.");
      }
      inputs.push("-i", extra.path);
      const opacity = clamp(n(p.opacity, 1), 0, 1);
      const width = n(p.width, 120);
      const margin = n(p.margin, 16);
      const wmParts: string[] = [];
      if (width > 0) wmParts.push(`scale=${width}:-1`);
      if (opacity < 1) wmParts.push(`colorchannelmixer=aa=${opacity}`);
      wmParts.push("format=rgba");
      const pos = overlayPosition(s(p.position, "bottom-right"), margin);
      fc.push(`[1:v]${wmParts.join(",")}[wm]`);
      fc.push(`[0:v][wm]overlay=${pos}[v]`);
      explicitMaps = ["-map", "[v]"];
      keepExt();
      break;
    }

    case "hdr-to-sdr": {
      const algo = s(p.algo, "hable");
      vf.push(
        `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=${algo}:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p`
      );
      keepExt();
      break;
    }

    case "stabilize": {
      const trf = `${outBase}.trf`;
      pre.push({
        name: "stabilize detect",
        args: [
          "-i",
          input.path,
          "-vf",
          `vidstabdetect=shakiness=${n(p.shakiness, 5)}:result=${trf}`,
          "-f",
          "null",
          "-",
        ],
      });
      vf.push(`vidstabtransform=input=${trf}:smoothing=${n(p.smoothing, 10)}:zoom=0`);
      keepExt();
      break;
    }

    /* ── Tier 5 — Audio & subtitles ────────────────────────────────────── */

    case "extract-audio": {
      const fmt = s(p.format, "mp3");
      ext = fmt === "m4a" ? "m4a" : fmt;
      aCodec = AUDIO_CODEC_ARG[fmt] ?? fmt;
      vCodec = null;
      outArgs.push("-vn");
      if (fmt !== "flac" && p.bitrate) aBitrate = s(p.bitrate, "192k");
      break;
    }

    case "volume": {
      af.push(`volume=${n(p.gain, 0)}dB`);
      keepExt();
      break;
    }

    case "loudnorm": {
      af.push(`loudnorm=I=${s(p.target, "-16")}:TP=${n(p.truePeak, -2)}:LRA=${n(p.lra, 7)}`);
      keepExt();
      break;
    }

    case "compressor": {
      af.push(
        `acompressor=threshold=${n(p.threshold, -20)}dB:ratio=${n(p.ratio, 2)}:attack=${n(
          p.attack,
          20
        )}:release=${n(p.release, 250)}`
      );
      keepExt();
      break;
    }

    case "eq": {
      af.push(`equalizer=f=${n(p.freq, 1000)}:t=q:w=${n(p.q, 1)}:g=${n(p.gain, 0)}`);
      keepExt();
      break;
    }

    case "noise-reduce": {
      af.push(`afftdn=nr=${n(p.reduction, 12)}`);
      keepExt();
      break;
    }

    case "fade": {
      const dur = Math.max(n(p.duration, 1.5), 0.1);
      const curve = s(p.curve, "tri");
      const mode = s(p.mode, "both");
      if (mode === "in" || mode === "both") {
        af.push(`afade=t=in:st=0:d=${dur}:curve=${curve}`);
      }
      if (mode === "out" || mode === "both") {
        // Fade must start before the end; if we don't know the duration we
        // assume the clip is a little longer than the fade.
        const total = input.durationSeconds ?? 0;
        const st = total > dur ? total - dur : 0;
        af.push(`afade=t=out:st=${st}:d=${dur}:curve=${curve}`);
      }
      keepExt();
      break;
    }

    case "extract-subtitles": {
      ext = s(p.format, "srt");
      vCodec = null;
      aCodec = null;
      outArgs.push("-map", `0:s:${n(p.stream, 0)}`, "-c:s", "copy");
      break;
    }

    case "mux-subtitles": {
      const extra = extras[0];
      if (!extra) {
        throw new Error("Add Subtitles needs a subtitle file selected.");
      }
      inputs.push("-i", extra.path);
      const container = extensionOf(input.name);
      explicitMaps = ["-map", "0", "-map", "1:0"];
      outArgs.push("-c:s", container === "mp4" || container === "mov" ? "mov_text" : "copy");
      if (s(p.language).trim()) outArgs.push("-metadata:s:s:0", `language=${s(p.language, "eng")}`);
      vCodec = "copy";
      ext = container || "mp4";
      break;
    }

    case "burn-subtitles": {
      const extra = extras[0];
      if (!extra) {
        throw new Error("Burn Subtitles needs a subtitle file selected.");
      }
      const style = `FontSize=${n(p.fontSize, 24)}`;
      vf.push(`subtitles=filename='${escapeFilterPath(extra.path)}':force_style='${style}'`);
      vCodec = "libx264";
      preset = "medium";
      crf = 20;
      ext = extensionOf(input.name) || "mp4";
      break;
    }

    /* ── Tier 6 — Image ────────────────────────────────────────────────── */

    case "to-gif": {
      ext = "gif";
      const start = parseTime(s(p.start, "0"));
      const dur = n(p.duration, 3);
      const fps = n(p.fps, 12);
      const w = n(p.width, 480);
      if (start > 0) inArgs.push("-ss", String(start));
      inArgs.push("-t", String(dur));
      vf.push(`fps=${fps}`, `scale=${w}:-1:flags=lanczos`);
      vCodec = null;
      aCodec = null;
      outArgs.push("-an");
      break;
    }

    case "extract-frame": {
      ext = s(p.format, "jpg");
      inArgs.push("-ss", String(parseTime(s(p.at, "5"))), "-frames:v", "1");
      vCodec = null;
      aCodec = null;
      outArgs.push("-an");
      outArgs.push(...imageQualityArgs(ext, 95));
      break;
    }

    case "compress-image": {
      const fmt = s(p.format, "webp");
      ext = fmt;
      vCodec = null;
      aCodec = null;
      outArgs.push("-an");
      const maxWidth = n(p.maxWidth, 0);
      if (maxWidth > 0) vf.push(`scale='min(${maxWidth},iw)':-2`);
      outArgs.push(...imageQualityArgs(fmt, n(p.quality, 75)));
      break;
    }

    /* ── Tier 7 — Advanced ─────────────────────────────────────────────── */

    case "preset-web": {
      vf.push(`scale=-2:min(${n(p.maxHeight, 1080)},ih)`);
      vCodec = "libx264";
      aCodec = "aac";
      crf = n(p.crf, 23);
      preset = "medium";
      ext = "mp4";
      aBitrate = "192k";
      outArgs.push("-movflags", "+faststart");
      break;
    }

    case "preset-social": {
      vf.push("crop=ih*9/16:ih", "scale=1080:1920");
      af.push("loudnorm=I=-16:TP=-2:LRA=7");
      vCodec = "libx264";
      aCodec = "aac";
      crf = 20;
      preset = "medium";
      ext = "mp4";
      outArgs.push("-movflags", "+faststart");
      break;
    }

    case "preset-archive": {
      vCodec = "libx264";
      aCodec = "aac";
      crf = 18;
      preset = "slow";
      ext = "mp4";
      aBitrate = "256k";
      outArgs.push("-movflags", "+faststart");
      break;
    }

    case "metadata": {
      if (s(p.title)) outArgs.push("-metadata", `title=${s(p.title)}`);
      if (s(p.artist)) outArgs.push("-metadata", `artist=${s(p.artist)}`);
      if (s(p.album)) outArgs.push("-metadata", `album=${s(p.album)}`);
      if (s(p.comment)) outArgs.push("-metadata", `comment=${s(p.comment)}`);
      if (s(p.language)) outArgs.push("-metadata", `language=${s(p.language)}`);
      keepExt();
      break;
    }

    default:
      // Unknown / not an ffmpeg operation: copy through unchanged.
      outArgs.push("-c", "copy");
      keepExt();
      break;
  }

  const outputPath = `${outBase}.${ext}`;
  const outputName = outputPath.split(/[\\/]/).pop() ?? outputPath;

  const args: string[] = [...inputs];
  // -ss/-to are input options, so they must sit right before their input.
  if (inArgs.length) args.push(...inArgs);
  if (fc.length) args.push("-filter_complex", fc.join(";"));
  else if (vf.length) args.push("-vf", vf.join(","));
  if (af.length) args.push("-af", af.join(","));
  if (explicitMaps.length) args.push(...explicitMaps);
  if (vCodec) args.push("-c:v", vCodec);
  if (aCodec) args.push("-c:a", aCodec);
  if (vBitrate) args.push("-b:v", vBitrate, "-maxrate", vBitrate, "-bufsize", vBitrate);
  if (aBitrate) args.push("-b:a", aBitrate);
  if (crf !== null && vCodec !== "copy") args.push("-crf", String(crf));
  if (preset) args.push("-preset", preset);
  args.push(...outArgs, outputPath);

  return {
    engine: "ffmpeg",
    outputPath,
    outputName,
    ext,
    outputKind: kindForExt(ext),
    passes: [...pre, { name: opId, args }],
  };
}

/**
 * ffmpeg quality flags for a still image. JPEG and WebP take `-q:v`, AVIF takes
 * a CRF, and PNG is lossless so quality is ignored.
 */
function imageQualityArgs(ext: string, quality: number): string[] {
  const e = ext.replace(/^\./, "").toLowerCase();
  if (e === "jpg" || e === "jpeg") {
    // qscale 2 (best) … 31 (worst); map a 0–100 quality dial onto it.
    const q = clamp(Math.round(31 - (quality / 100) * 29), 2, 31);
    return ["-q:v", String(q)];
  }
  if (e === "webp") {
    return ["-quality", String(clamp(Math.round(quality), 0, 100))];
  }
  if (e === "avif") {
    // AVIF uses CRF; higher quality → lower CRF.
    const crf = clamp(Math.round(63 - (quality / 100) * 40), 10, 63);
    return ["-crf", String(crf), "-cpu-used", "6"];
  }
  return [];
}

function overlayPosition(position: string, margin: number): string {
  const m = Math.max(margin, 0);
  switch (position) {
    case "top-left":
      return `${m}:${m}`;
    case "top-right":
      return `W-w-${m}:${m}`;
    case "bottom-left":
      return `${m}:H-h-${m}`;
    case "center":
      return "(W-w)/2:(H-h)/2";
    case "bottom-right":
    default:
      return `W-w-${m}:H-h-${m}`;
  }
}

/* --------------------------------- ytdlp ---------------------------------- */

export type YtdlpOptions = {
  url: string;
  mode: "video" | "audio";
  height?: number;
  container?: string;
  formatSelector?: string;
  maxFilesize?: string;
  audioFormat?: string;
  audioQuality?: string;
  outputTemplate?: string;
  restrictFilenames?: boolean;
  downloadArchive?: string;
  rateLimit?: string;
  concurrentFragments?: number;
  proxy?: string;
  cookieBrowser?: string;
  cookieProfile?: string;
  cookieFile?: string;
  subsOn?: boolean;
  subLangs?: string[];
  embedSubs?: boolean;
  embedThumb?: boolean;
  embedMeta?: boolean;
  saveChapters?: boolean;
  writeThumbnail?: boolean;
  writeInfoJson?: boolean;
  writeComments?: boolean;
  clipOn?: boolean;
  clipStart?: number;
  clipEnd?: number;
  sponsorblockRemoveCategories?: string[];
};

/**
 * Fold every ytdlp operation in a contiguous group into one options blob,
 * processed in order. Later ops override scalar fields; list fields accumulate.
 */
export function buildYtdlpOptions(
  entries: { id: string; params: FormValues }[]
): YtdlpOptions {
  const out: Partial<YtdlpOptions> = { mode: "video" };

  for (const entry of entries) {
    const p = entry.params ?? {};
    switch (entry.id) {
      case "download-video": {
        out.mode = "video";
        const container = s(p.container, "mp4").trim();
        if (container) out.container = container;
        const quality = s(p.quality, "best").trim();
        if (quality && quality !== "best") {
          const h = Number(quality);
          if (Number.isFinite(h) && h > 0) out.height = h;
          else delete out.height;
        } else {
          delete out.height;
        }
        if (b(p.clip)) {
          const start = parseTime(s(p.start, "0"));
          const end = parseTime(s(p.end, "0"));
          if (start > 0 && end > start) {
            out.clipOn = true;
            out.clipStart = start;
            out.clipEnd = end;
          }
        }
        break;
      }
      case "download-audio": {
        out.mode = "audio";
        const fmt = s(p.format, "mp3").trim();
        if (fmt) out.audioFormat = fmt;
        const quality = s(p.quality, "0").trim();
        if (quality) out.audioQuality = quality;
        break;
      }
      case "download-subs": {
        out.subsOn = true;
        const langs = arr(p.langs)
          .map((x) => x.trim())
          .filter(Boolean);
        if (langs.length) out.subLangs = langs;
        if (b(p.embed)) out.embedSubs = true;
        break;
      }
      default:
        // A selector/modifier we don't recognize is skipped rather than
        // failing the whole job.
        break;
    }
  }

  return { url: "", ...out, mode: out.mode ?? "video" } as YtdlpOptions;
}

/* ------------------------------- dispatch --------------------------------- */

export type StepJob =
  | FfmpegStep
  | FfprobeStep
  | { engine: "ytdlp"; options: YtdlpOptions };

/**
 * Turn one object-consuming step into a runnable job. URL-consuming steps are
 * merged separately (see buildYtdlpOptions) because several download options
 * fold into a single invocation.
 */
export function buildObjectStep(
  opId: string,
  params: FormValues,
  input: EngineInput,
  outBase: string,
  extras: EngineInput[] = []
): FfmpegStep | FfprobeStep {
  const op = getOperation(opId);

  if (op?.engine === "ffprobe" || opId === "media-info") {
    const detail = s(params?.detail, "basic");
    const filePath = input.path;
    const showStreams = detail === "full" ? ["-show_streams"] : [];
    const args = [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      ...showStreams,
      filePath,
    ];
    const outputPath = `${outBase}.info.json`;
    return {
      engine: "ffprobe",
      outputPath,
      outputName: outputPath.split(/[\\/]/).pop() ?? outputPath,
      ext: "json",
      outputKind: "other",
      args,
    };
  }

  if (op?.engine === "ffmpeg") {
    return buildFfmpegStep(opId, params, input, outBase, extras);
  }

  // Unknown object operation: an empty ffmpeg step so the runner surfaces a
  // clear "no passes" error rather than silently doing nothing.
  const outputPath = `${outBase}.${input.kind === "audio" ? "m4a" : "mp4"}`;
  return {
    engine: "ffmpeg",
    outputPath,
    outputName: outputPath.split(/[\\/]/).pop() ?? outputPath,
    ext: outputPath.split(".").pop() ?? "mp4",
    outputKind: input.kind,
    passes: [],
  };
}

export { sanitizeBase };
