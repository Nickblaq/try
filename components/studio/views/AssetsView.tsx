"use client";

import type { MediaKind, MediaObject } from "@/lib/studio/types";
import { formatBytes, formatDuration } from "@/lib/studio/helpers";
import { Icons } from "../Icons";

const KIND_FILTERS: { id: MediaKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "image", label: "Image" },
  { id: "subtitle", label: "Subs" },
  { id: "other", label: "Other" },
];

function kindIcon(kind: MediaKind) {
  if (kind === "audio") return <Icons.Music />;
  if (kind === "image") return <Icons.Image />;
  if (kind === "subtitle") return <Icons.Subtitle />;
  if (kind === "other") return <Icons.File />;
  return <Icons.Video />;
}

/**
 * Everything the server currently holds. Each row can be selected as the
 * source of a new pipeline, exported straight from the catalog, or deleted
 * from the server entirely.
 */
export function AssetsView({
  objects,
  loading,
  error,
  query,
  setQuery,
  kind,
  setKind,
  onUse,
  onInspect,
  onDownload,
  onDelete,
  onRefresh,
  deletingId,
}: {
  objects: MediaObject[];
  loading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  kind: MediaKind | "all";
  setKind: (k: MediaKind | "all") => void;
  onUse: (object: MediaObject) => void;
  /** Clicking the file itself previews it instead of jumping into a pipeline. */
  onInspect: (object: MediaObject) => void;
  onDownload: (object: MediaObject) => void;
  onDelete: (object: MediaObject) => void;
  onRefresh: () => void;
  deletingId: string | null;
}) {
  return (
    <div className="pad">
      <div className="searchWrap">
        <Icons.Search />
        <input
          className="searchInput"
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="filterScroll">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={"filterChip" + (kind === f.id ? " filterActive" : "")}
            onClick={() => setKind(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="errorBox">
          <Icons.Warn /> {error}
        </div>
      )}

      <section>
        <div className="rowHead">
          <h3 className="sectionTitle">
            {loading ? "Loading…" : `${objects.length} asset${objects.length === 1 ? "" : "s"} on server`}
          </h3>
          <button type="button" className="rowAction" onClick={onRefresh}>
            Refresh
          </button>
        </div>

        {!loading && !error && objects.length === 0 && (
          <div className="empty">
            <p>No assets yet</p>
            <span>Uploads and downloads will appear here.</span>
          </div>
        )}

        <ul className="recentList">
          {objects.map((object) => (
            <li key={object.id}>
              <div className="assetCard assetRow">
                <div className="assetIcon">{kindIcon(object.kind)}</div>
                <button
                  type="button"
                  className="assetMeta assetMetaBtn"
                  onClick={() => onInspect(object)}
                  title="Preview this asset"
                >
                  <span className="assetName">{object.name}</span>
                  <span className="assetInfo">
                    {object.origin} · {object.kind} · {formatBytes(object.sizeBytes)}
                    {object.durationSeconds
                      ? ` · ${formatDuration(object.durationSeconds)}`
                      : ""}
                    {` · ${object.id.slice(0, 8)}`}
                  </span>
                </button>
                <div className="assetActions">
                  <button
                    type="button"
                    className="iconAction"
                    onClick={() => onUse(object)}
                    aria-label="Use for operations"
                    title="Use as the source of a new pipeline"
                  >
                    <Icons.Flow size={16} />
                  </button>
                  <button
                    type="button"
                    className="iconAction"
                    onClick={() => onDownload(object)}
                    aria-label="Save to device"
                  >
                    <Icons.Download size={16} />
                  </button>
                  <button
                    type="button"
                    className="iconAction iconActionDanger"
                    onClick={() => onDelete(object)}
                    disabled={deletingId === object.id}
                    aria-label="Delete from server"
                  >
                    <Icons.Trash size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
