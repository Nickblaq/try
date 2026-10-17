// lib/cleanup.ts
//
// Temporary media is deleted 15 minutes after it was last written. That is the
// whole retention policy: uploaded files, downloaded media, catalog blobs and
// job folders all age out the same way, so the catalog stays a rolling view of
// what this server has handled recently instead of growing forever.
//
// There is no timer to own and no cron to configure. The sweep runs
// opportunistically from the few places that create or serve media (uploads,
// catalog reads, job polling) and is throttled, so a busy minute costs one
// sweep no matter how many requests pass through.
import "server-only";
import { purgeExpiredObjects } from "@/lib/catalog/store";
import { JOBS_DIR, MEDIA_TTL_MS, removeExpiredChildren } from "@/lib/tmp";

/** A sweep runs at most this often, however often this is called. */
const SWEEP_INTERVAL_MS = 60 * 1000;

let lastSweepAt = 0;

export async function sweepExpiredMedia(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  // Stamp before awaiting so concurrent requests don't all sweep at once.
  lastSweepAt = now;

  const cutoff = now - MEDIA_TTL_MS;

  // Best-effort by design: failing to tidy up must never fail the request that
  // triggered the sweep, so a problem here is logged, not thrown.
  try {
    const expired = await purgeExpiredObjects(cutoff);
    await removeExpiredChildren(JOBS_DIR, cutoff);
    if (expired > 0) {
      console.log(`[cleanup] expired ${expired} media object(s)`);
    }
  } catch (err) {
    console.error("[cleanup] sweep failed:", err);
  }
}
