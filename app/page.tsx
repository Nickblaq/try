"use client";

import Link from "next/link";

// The landing page frames the one idea the product is built on: a URL or a file
// goes into a single shared catalog, and every operation is a step that reads
// the previous step's result and writes a new catalog object — no re-uploading,
// no format ping-pong.

const STEPS = [
  { id: "url", label: "URL", detail: "youtube.com/watch?v=…" },
  { id: "download", label: "Download", detail: "→ catalog object" },
  { id: "trim", label: "Trim", detail: "→ catalog object" },
  { id: "crop", label: "Crop", detail: "→ save to device" },
];

const FEATURES = [
  {
    title: "One catalog, every tool",
    body: "Uploads, downloads, and every derived file are catalog objects with content-addressed bytes and a provenance link back to their parent.",
  },
  {
    title: "Chain without re-uploading",
    body: "A step simply points at the previous step's result. URL → download → trim → crop runs server-side, start to finish.",
  },
  {
    title: "Job state in SQLite",
    body: "Jobs, runs, and steps live in the same database as the catalog — retry-safe history instead of a status file on disk.",
  },
  {
    title: "Export from the catalog",
    body: "“Save to device” streams any object straight out by id, and can feed it back in as the source of the next pipeline.",
  },
];

export default function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <span className="eyebrow">unified media pipeline</span>
        <h1>One catalog in. Every format out.</h1>
        <p className="sub">
          Upload a file or paste a link. Every operation is a catalog step, so
          chained jobs run on the server without a single re-upload.
        </p>
        <div className="ctaRow">
          <Link href="/cufx" className="cta">
            Open the studio
          </Link>
          <Link href="/cufx" className="ctaGhost">
            Browse operations
          </Link>
        </div>
      </section>

      <section className="chainCard">
        <span className="chainLabel">a pipeline is just links</span>
        <div className="chain">
          {STEPS.map((step, i) => (
            <div key={step.id} className="chainItem">
              <div className="chainNode">
                <span className="chainNodeLabel">{step.label}</span>
                <span className="chainNodeDetail">{step.detail}</span>
              </div>
              {i < STEPS.length - 1 && <span className="chainLink" />}
            </div>
          ))}
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="closing">
        <h2>Ready when you are.</h2>
        <p>Start from a file or a link — the catalog takes it from there.</p>
        <Link href="/cufx" className="cta">
          Start a pipeline
        </Link>
      </section>

      <style jsx>{`
        .landing {
          max-width: 560px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 30px;
          min-height: 100vh;
          padding: 0 20px;
        }

        .hero {
          padding: 34px 0 6px;
        }
        .eyebrow {
          font-family: var(--font-mono), monospace;
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .hero h1 {
          font-size: 33px;
          line-height: 1.12;
          letter-spacing: -0.015em;
          margin: 12px 0 12px;
        }
        .sub {
          font-size: 15px;
          line-height: 1.5;
          color: var(--ink-soft);
          margin: 0;
          max-width: 44ch;
        }
        .ctaRow {
          display: flex;
          gap: 10px;
          margin-top: 22px;
          flex-wrap: wrap;
        }
        .cta,
        .ctaGhost {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 20px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .cta {
          background: var(--ink);
          color: #fff;
        }
        .cta:hover {
          text-decoration: none;
          background: #000;
        }
        .ctaGhost {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--ink);
        }
        .ctaGhost:hover {
          text-decoration: none;
          border-color: var(--ink);
        }

        .chainCard {
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--surface);
          padding: 18px;
        }
        .chainLabel {
          font-family: var(--font-mono), monospace;
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-soft);
        }
        .chain {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 14px;
          overflow-x: auto;
        }
        .chainItem {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .chainNode {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 10px 12px;
          border-radius: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
        }
        .chainNodeLabel {
          font-size: 12.5px;
          font-weight: 600;
        }
        .chainNodeDetail {
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          color: var(--ink-soft);
        }
        .chainLink {
          width: 18px;
          height: 2px;
          background: var(--accent);
          border-radius: 1px;
          flex-shrink: 0;
        }

        .features {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .feature {
          border: 1px solid var(--border);
          border-radius: 16px;
          background: var(--surface);
          padding: 16px;
        }
        .feature h2 {
          font-size: 14px;
          margin: 0 0 6px;
        }
        .feature p {
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink-soft);
          margin: 0;
        }

        .closing {
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--surface);
          padding: 26px 20px;
          text-align: center;
        }
        .closing h2 {
          font-size: 19px;
          margin: 0 0 8px;
        }
        .closing p {
          font-size: 13.5px;
          color: var(--ink-soft);
          margin: 0 0 18px;
        }

        @media (min-width: 640px) {
          .features {
            grid-template-columns: 1fr 1fr;
          }
          .hero h1 {
            font-size: 38px;
          }
        }
      `}</style>
    </div>
  );
}
