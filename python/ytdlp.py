"""
Unified yt-dlp bridge for cufx.

Usage:
  python3 ytdlp.py resolve <url>
  python3 ytdlp.py download <status_file> <output_dir> <options_json>

resolve  — prints a single JSON blob (raw yt-dlp info dict, trimmed) to
           stdout. On failure prints {"error": "..."} and exits 1.
download — runs the download in the foreground. Every state change is both
           written to <status_file> and mirrored to stdout as one JSON line;
           the Node runner reads those lines and keeps job state in SQLite
           (see lib/catalog/jobs.ts), so the file is only a local convenience.
           Exits 0 regardless — failure is reported in the JSON, not the exit
           code (see lib/catalog/jobs.ts for how the runner consumes it).
"""
import json
import os
import sys
import time
import traceback

import yt_dlp
from yt_dlp.utils import download_range_func


# ---------------------------------------------------------------------------
# status file
# ---------------------------------------------------------------------------

def write_status(status_file: str, data: dict):
    tmp = status_file + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    # Atomic-ish replace so any file reader never sees a half-written blob.
    os.replace(tmp, status_file)
    # Mirror every state change to stdout as a single JSON line. The Node job
    # runner reads these lines and writes progress into SQLite — the status
    # file is now only a local convenience, never the source of truth.
    print(json.dumps(data), flush=True)


def _append_log(state: dict, line: str):
    """Keep a bounded rolling log so the status file never grows unbounded."""
    cur = state.get("log") or ""
    cur = (cur + "\n" + line).strip()
    if len(cur) > 8000:
        cur = cur[-8000:]
    state["log"] = cur


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def _parse_filesize(v):
    """'500M' -> 524288000. yt-dlp expects bytes as int."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().upper()
    units = {"K": 1024, "M": 1024 ** 2, "G": 1024 ** 3, "T": 1024 ** 4}
    for suf, mult in units.items():
        if s.endswith(suf):
            try:
                return int(float(s[:-1]) * mult)
            except ValueError:
                return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _build_cookies_from_browser(spec):
    """('chrome', 'Default') -> ('chrome', 'Default', None, None)."""
    browser = spec.get("browser")
    profile = spec.get("profile") or None
    if not browser:
        return None
    return (browser, profile, None, None)


# ---------------------------------------------------------------------------
# resolve
# ---------------------------------------------------------------------------

def cmd_resolve(url: str):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    # Keep the tail — yt-dlp lists worst → best, and there can be hundreds.
    if isinstance(info.get("formats"), list):
        info["formats"] = info["formats"][-64:]

    # Drop fields the UI doesn't need that can be huge.
    for k in ("requested_downloads", "requested_formats", "url",
              "manifest_url", "fragments"):
        info.pop(k, None)

    print(json.dumps(info))


# ---------------------------------------------------------------------------
# download
# ---------------------------------------------------------------------------

def cmd_download(status_file: str, output_dir: str, options_json: str):
    state = {
        "status": "starting",
        "progress": 0,
        "downloadedBytes": 0,
        "totalBytes": None,
        "speed": None,
        "eta": None,
        "error": None,
        "filename": None,
        "log": "",
    }
    write_status(status_file, state)

    try:
        opts = json.loads(options_json)
    except Exception as e:
        state.update({"status": "error", "error": f"Invalid job options: {e}"})
        write_status(status_file, state)
        return

    last_write = 0.0

    def hook(d):
        nonlocal last_write
        now = time.time()
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes", 0)
            state.update({
                "status": "downloading",
                "progress": round((downloaded / total) * 100, 1) if total else state["progress"],
                "downloadedBytes": downloaded,
                "totalBytes": total,
                "speed": d.get("speed"),
                "eta": d.get("eta"),
            })
            if now - last_write > 0.25:
                _append_log(state, f"downloading {state['progress']}%")
                write_status(status_file, state)
                last_write = now
        elif d["status"] == "finished":
            state.update({"status": "processing", "progress": 99})
            _append_log(state, "download finished, post-processing")
            write_status(status_file, state)

    def pp_hook(d):
        if d["status"] == "started":
            pp = d.get("postprocessor", "")
            state["status"] = f"post-processing ({pp})"
            _append_log(state, f"post-processor: {pp}")
            write_status(status_file, state)

    outtmpl = opts.get("outputTemplate") or (
        f"{output_dir}/%(title).150B [%(id)s].%(ext)s"
    )

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": outtmpl,
        "progress_hooks": [hook],
        "postprocessor_hooks": [pp_hook],
        "restrictfilenames": bool(opts.get("restrictFilenames")),
    }

    # ── format selection ──────────────────────────────────────────────────
    if opts.get("formatSelector"):
        ydl_opts["format"] = opts["formatSelector"]
    elif opts["mode"] == "audio":
        ydl_opts["format"] = "bestaudio/best"
    else:
        height = opts.get("height")
        if height:
            ydl_opts["format"] = (
                f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
            )
        else:
            ydl_opts["format"] = "bestvideo+bestaudio/best"

    if opts["mode"] == "video":
        ydl_opts["merge_output_format"] = opts.get("container") or "mp4"

    if opts.get("codecSort"):
        ydl_opts["format_sort"] = [s for s in str(opts["codecSort"]).split(",") if s]

    # ── network ───────────────────────────────────────────────────────────
    if opts.get("rateLimit"):
        ydl_opts["ratelimit"] = opts["rateLimit"]
    if opts.get("concurrentFragments"):
        try:
            ydl_opts["concurrent_fragment_downloads"] = int(opts["concurrentFragments"])
        except (TypeError, ValueError):
            pass
    if opts.get("proxy"):
        ydl_opts["proxy"] = opts["proxy"]

    # ── cookies ───────────────────────────────────────────────────────────
    if opts.get("cookieBrowser"):
        cfb = _build_cookies_from_browser({
            "browser": opts["cookieBrowser"],
            "profile": opts.get("cookieProfile"),
        })
        if cfb:
            ydl_opts["cookiesfrombrowser"] = cfb
    elif opts.get("cookieFile"):
        ydl_opts["cookiefile"] = opts["cookieFile"]

    # ── filesize / archive / extractor args ───────────────────────────────
    mfs = _parse_filesize(opts.get("maxFilesize"))
    if mfs:
        ydl_opts["max_filesize"] = mfs
    if opts.get("downloadArchive"):
        ydl_opts["download_archive"] = opts["downloadArchive"]
    if isinstance(opts.get("extractorArgs"), dict):
        ydl_opts["extractor_args"] = {
            k: {"_": [v]} if isinstance(v, str) else v
            for k, v in opts["extractorArgs"].items()
        }

    # ── thumbnail / info json sidecars ────────────────────────────────────
    if opts.get("writeThumbnail"):
        ydl_opts["writethumbnail"] = True
    if opts.get("writeAllThumbnails"):
        ydl_opts["writethumbnail"] = True
        ydl_opts["write_all_thumbnails"] = True
    if opts.get("thumbnailFormat"):
        ydl_opts["convertthumbnails"] = opts["thumbnailFormat"]
    if opts.get("writeInfoJson"):
        ydl_opts["writeinfojson"] = True
    if opts.get("writeComments"):
        ydl_opts["getcomments"] = True
    if opts.get("splitChapters"):
        ydl_opts["split_chapters"] = True

    # ── postprocessors ────────────────────────────────────────────────────
    postprocessors = []

    if opts["mode"] == "audio":
        target = opts.get("audioFormat", "m4a")
        if target != "best":
            postprocessors.append({
                "key": "FFmpegExtractAudio",
                "preferredcodec": target,
                "preferredquality": opts.get("audioQuality")
                    or ("0" if target in ("mp3", "opus") else None),
            })

    if opts.get("subsOn") and opts.get("subLangs"):
        auto_codes = [c.replace("-auto", "") for c in opts["subLangs"] if c.endswith("-auto")]
        manual_codes = [c for c in opts["subLangs"] if not c.endswith("-auto")]
        ydl_opts["writesubtitles"] = bool(manual_codes)
        ydl_opts["writeautomaticsub"] = bool(auto_codes)
        ydl_opts["subtitleslangs"] = manual_codes + auto_codes or ["en"]
        if opts.get("embedSubs"):
            ydl_opts["embedsubtitles"] = True
            postprocessors.append({"key": "FFmpegEmbedSubtitle"})

    if opts.get("embedThumb"):
        ydl_opts["writethumbnail"] = True
        postprocessors.append({"key": "EmbedThumbnail"})

    add_chapters = bool(opts.get("saveChapters"))
    if opts.get("embedMeta") or add_chapters:
        postprocessors.append({
            "key": "FFmpegMetadata",
            "add_metadata": bool(opts.get("embedMeta")),
            "add_chapters": add_chapters,
        })

    # Legacy single boolean still works.
    remove_cats = opts.get("sponsorblockRemoveCategories")
    if remove_cats is None and opts.get("sponsorBlock"):
        remove_cats = ["sponsor"]
    mark_cats = opts.get("sponsorblockMarkCategories")
    if mark_cats:
        postprocessors.append({
            "key": "SponsorBlock",
            "categories": set(mark_cats),
            "when": "after_filter",
        })
    if remove_cats:
        postprocessors.append({
            "key": "SponsorBlock",
            "categories": set(remove_cats),
            "when": "after_filter",
        })
        postprocessors.append({
            "key": "ModifyChapters",
            "remove_sponsor_segments": set(remove_cats),
        })

    if (opts.get("clipOn")
            and opts.get("clipStart") is not None
            and opts.get("clipEnd") is not None):
        start, end = float(opts["clipStart"]), float(opts["clipEnd"])
        ydl_opts["download_ranges"] = download_range_func(None, [(start, end)])
        ydl_opts["force_keyframes_at_cuts"] = True
        ydl_opts["external_downloader"] = "ffmpeg"

    if postprocessors:
        ydl_opts["postprocessors"] = postprocessors

    # ── run ───────────────────────────────────────────────────────────────
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(opts["url"], download=True)
            final_path = ydl.prepare_filename(info)
            if opts.get("mode") == "audio" and opts.get("audioFormat") not in (None, "best"):
                base, _ = os.path.splitext(final_path)
                candidate = base + "." + opts["audioFormat"]
                if os.path.exists(candidate):
                    final_path = candidate

        state.update({
            "status": "done",
            "progress": 100,
            "filename": os.path.basename(final_path),
        })
        _append_log(state, "done")
        write_status(status_file, state)

    except Exception as e:  # noqa: BLE001
        state.update({"status": "error", "error": f"{e}"})
        _append_log(state, f"error: {e}")
        write_status(status_file, state)
        traceback.print_exc(file=sys.stderr)
        # Exit 0 by the standing contract — the status file is authoritative.


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print("usage: ytdlp.py <resolve|download> ...", file=sys.stderr)
        sys.exit(2)

    cmd = sys.argv[1]

    if cmd == "resolve":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "missing url"}))
            sys.exit(1)
        cmd_resolve(sys.argv[2])
        return

    if cmd == "download":
        if len(sys.argv) < 5:
            print("usage: ytdlp.py download <status_file> <output_dir> <options_json>",
                  file=sys.stderr)
            sys.exit(2)
        cmd_download(sys.argv[2], sys.argv[3], sys.argv[4])
        return

    print(f"unknown command: {cmd}", file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Last-resort: argv missing entirely. Print to stderr for the Node
        # child.stderr logger. Still exit 0 for download; for resolve let
        # the shell see a failure so runPythonJSON's recovery kicks in.
        traceback.print_exc(file=sys.stderr)
        if len(sys.argv) > 1 and sys.argv[1] == "resolve":
            print(json.dumps({"error": "unexpected failure"}))
            sys.exit(1)
