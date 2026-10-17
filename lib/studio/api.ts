"use client";

// lib/studio/api.ts
//
// Thin client over the shared catalog + job APIs. Everything is keyed by
// catalog object id: uploads become objects, a job references a source object
// (or a URL), and outputs are objects again — so "save to device" is just a
// download of a catalog id, and chaining is a link between two ids.

import type {
  FormValues,
  Job,
  MediaKind,
  MediaObject,
  MediaProfile,
} from "./types";

export type CatalogFilter = {
  kind?: MediaKind;
  origin?: "upload" | "download" | "derived";
  search?: string;
  limit?: number;
};

export const studioApi = {
  async listObjects(filter: CatalogFilter = {}): Promise<MediaObject[]> {
    const sp = new URLSearchParams();
    if (filter.kind) sp.set("kind", filter.kind);
    if (filter.origin) sp.set("origin", filter.origin);
    if (filter.search) sp.set("search", filter.search);
    if (filter.limit) sp.set("limit", String(filter.limit));
    const res = await fetch(`/api/catalog?${sp.toString()}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to list catalog");
    return data.objects as MediaObject[];
  },

  async getObject(id: string): Promise<MediaObject | null> {
    const res = await fetch(`/api/catalog?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.status === 404) return null;
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load object");
    return data.object as MediaObject;
  },

  upload(file: File, onProgress?: (p: number) => void): Promise<MediaObject> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("origin", "upload");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/catalog");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
            resolve(data.object as MediaObject);
          } else {
            reject(new Error(data.error || "Upload failed"));
          }
        } catch {
          reject(new Error("Invalid response from server"));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(fd);
    });
  },

  async createJob(input: {
    sourceObjectId?: string | null;
    sourceUrl?: string | null;
    operations: { id: string; params: FormValues }[];
  }): Promise<string> {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to start job");
    return data.jobId as string;
  },

  async getJob(id: string): Promise<Job> {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load job");
    return data.job as Job;
  },

  async deleteObject(id: string): Promise<void> {
    const res = await fetch(`/api/catalog/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Delete failed");
    }
  },

  /** Save-to-device / chaining target: stream an object out of the catalog. */
  downloadUrl: (id: string) => `/api/catalog/${encodeURIComponent(id)}?download=1`,

  /** Inline playback/stream URL (no Content-Disposition attachment). */
  streamUrl: (id: string) => `/api/catalog/${encodeURIComponent(id)}`,

  /**
   * Describe a URL before downloading it: title, thumbnail, real resolutions,
   * real audio formats, real caption languages.
   */
  async resolve(url: string): Promise<MediaProfile> {
    const res = await fetch(
      `/api/resolve?url=${encodeURIComponent(url)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Could not read that link");
    }
    return data.profile as MediaProfile;
  },
};
