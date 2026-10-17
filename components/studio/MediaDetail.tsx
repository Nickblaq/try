"use client";

// components/studio/MediaDetail.tsx
//
// Clicking a catalog object should show you the *media*, not a wall of form
// defaults. This sheet plays/renders the object inline (video, audio, image,
// subtitle or a text preview for sidecar files) and lists the metadata the
// catalog actually holds, so you can confirm what a file is before deciding to
// use it as a source, save it, or chain from it.

import { useEffect, useState } from "react";
import type { MediaObject } from "@/lib/studio/types";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDuration,
} from "@/lib/studio/helpers";
import { Sheet } from "./Sheet";
import { Icons } from "./Icons";

function Player({
  object,
  src,
}: {
  object: MediaObject;
  src: string;
}) {
  if (object.kind === "video") {
    return <video className="player" src={src} controls preload="metadata" />;
  }
  if (object.kind === "audio") {
    return (
      <div className="playerWrap playerWrapAudio">
        <audio className="player" src={src} controls preload="metadata" />
      </div>
    );
  }
  if (object.kind === "image") {
    return <img className="player" src={src} alt={object.name} />;
  }
  return null;
}

/** Text preview for subtitle / probe / sidecar objects. */
function TextPreview({ src }: { src: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(src, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Could not read"))))
      .then((body) => {
        if (cancelled) return;
        setText(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not read");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) return <p className="fieldHelp">{error}</p>;
  if (text === null) return <p className="fieldHelp">Loading…</p>;
  return (
    <pre className="subPreview">
      {text.split("\n").slice(0, 60).join("\n")}
      {text.split("\n").length > 60 ? "\n…" : ""}
    </pre>
  );
}

export function MediaDetail({
  object,
  streamUrl,
  downloadUrl,
  onClose,
  onUse,
  onSave,
  onDelete,
  busy,
}: {
  object: MediaObject;
  streamUrl: (id: string) => string;
  downloadUrl: (id: string) => string;
  onClose: () => void;
  onUse: (object: MediaObject) => void;
  onSave: (object: MediaObject) => void;
  onDelete?: (object: MediaObject) => void;
  busy?: boolean;
}) {
  const src = streamUrl(object.id);
  const isText = object.kind === "subtitle" || object.kind === "other";

  const rows: { key: string; value: string }[] = [
    { key: "Kind", value: object.kind },
    { key: "Size", value: formatBytes(object.sizeBytes) },
    ...(object.durationSeconds
      ? [{ key: "Duration", value: formatDuration(object.durationSeconds) }]
      : []),
    ...(object.width && object.height
      ? [{ key: "Dimensions", value: `${object.width} × ${object.height}` }]
      : []),
    { key: "Origin", value: object.origin },
    { key: "Format", value: (object.ext || object.mime || "–").toUpperCase() },
    ...(object.provider ? [{ key: "Provider", value: object.provider }] : []),
    ...(object.tool ? [{ key: "Produced by", value: object.tool }] : []),
    ...(object.url ? [{ key: "Source URL", value: object.url }] : []),
    { key: "Views", value: formatCount(metaNumber(object.meta, "viewCount")) },
    { key: "Uploaded", value: formatDate(metaString(object.meta, "uploadDate")) },
    { key: "Catalog id", value: object.id.slice(0, 12) },
    {
      key: "Content hash",
      value: `${object.hash.slice(0, 16)}…`,
    },
  ];

  return (
    <Sheet
      title={object.name}
      badge={`${object.kind} · ${formatBytes(object.sizeBytes)}`}
      note={metaString(object.meta, "title") || undefined}
      onClose={onClose}
    >
      <section className="detailMedia">
        <Player object={object} src={src} />
        {isText && <TextPreview src={src} />}
        {!isText && object.kind !== "video" && object.kind !== "audio" && object.kind !== "image" && (
          <p className="fieldHelp">No preview for this kind of file.</p>
        )}
      </section>

      <section className="infoList">
        {rows
          .filter((r) => r.value && r.value !== "–")
          .map((r) => (
            <div className="infoRow" key={r.key}>
              <span className="infoKey">{r.key}</span>
              <span className="infoVal">{r.value}</span>
            </div>
          ))}
      </section>

      <div className="detailActions">
        <button
          type="button"
          className="primaryBtn"
          onClick={() => onUse(object)}
          disabled={busy}
        >
          <Icons.Flow size={16} /> Use as source
        </button>
        <button type="button" className="ghostBtnWide" onClick={() => onSave(object)}>
          <Icons.Download size={16} /> Save to device
        </button>
        {onDelete && (
          <button
            type="button"
            className="ghostBtnWide ghostBtnDanger"
            onClick={() => onDelete(object)}
          >
            <Icons.Trash size={14} /> Delete from server
          </button>
        )}
      </div>
    </Sheet>
  );
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? v : null;
}
