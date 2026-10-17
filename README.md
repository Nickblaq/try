# cufx — one shared operation catalog

cufx is a media pipeline with a single catalog at its center. Upload a file or
paste a URL; every operation is a step that reads the previous step's result
from the catalog and writes a new catalog object. Chained jobs run entirely on
the server — nothing is re-uploaded between steps.

The single entry point is **`/cufx`**. `/op` and `/yt` (two apps with two copies
of `OPERATIONS` and two translate modules) are gone.

## How it fits together

```
lib/catalog/
  types.ts        MediaObject — the one data model (uploads, downloads, derivations)
  operations.ts   THE operation catalog: accepts / produces / params per operation
  engines.ts      the one job builder (ffmpeg passes + yt-dlp options)
  db.ts           SQLite: objects/edges + jobs/runs/steps
  store.ts        content-addressed blob store, streaming ingest, hash dedupe
  jobs.ts         SQLite-backed runner — chains steps by catalog id
app/api/
  catalog/        list · filter · get · ingest · download · delete
  jobs/           start · poll · retry
app/cufx/         the studio (source → catalog → pipeline → run → result)
```

### Catalog ids everywhere

- Run and result views work with **object ids**, not job-relative filenames.
- **Save to device** exports straight from the catalog (`/api/catalog/:id?download=1`).
- **Chaining** links a step to the previous step's result, e.g.
  `URL → download → trim → crop`. The runner threads each step's
  `output_object_id` into the next step's input.

### Job state in SQLite

`jobs`, `runs`, and `steps` tables replace the old per-job `status.json`
polling. A job is the request, a run is one attempt (retry-safe: a failed run is
kept and a new one appended), and a step's `output_object_id` is the catalog
link the next step consumes.

### Pipeline undo/redo

The client pipeline lives in a `zustand` store with a `zundo` history — undo and
redo only affect the pipeline. `dexie` is gone: the server's SQLite catalog is
the source of truth.

## Working data

Everything cufx writes lives under `.cufx-data/` at the project root (gitignored)
and is disposable — catalog objects are swept once idle.

## Requirements

- Node 22+
- `ffmpeg` / `ffprobe` on `PATH` (processing)
- `python3` + `pip install -r requirements.txt` (yt-dlp downloads)
