"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The old shell listed every half-finished experiment (editor, extract, edit,
// op, yt, design, test). There is one product now — the catalog studio — so the
// nav is just the landing page and the single entry point into it.
const NAV_ITEMS = [
  { href: "/", label: "home" },
  { href: "/cufx", label: "cufx" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="root">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="cufx home">
          cufx
        </Link>
        <span className="wordmarkSub">operation catalog</span>
        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`navLink ${active ? "navActive" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="shellMain">{children}</main>

      <footer className="footer">
        <span>Next.js · ffmpeg · sharp · yt-dlp · SQLite catalog</span>
      </footer>

      <style jsx>{`
        .topbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 20px 0 8px;
          flex-wrap: nowrap;
        }
        .wordmark {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--ink);
          text-decoration: none;
          flex-shrink: 0;
        }
        .wordmark:hover {
          text-decoration: none;
        }
        .wordmarkSub {
          font-family: var(--font-mono), monospace;
          font-size: 10.5px;
          color: var(--ink-soft);
          padding-left: 8px;
          border-left: 1px solid var(--border);
          flex-shrink: 0;
        }

        .nav {
          display: flex;
          gap: 8px;
          margin-left: auto;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          min-width: 0;
        }
        .nav::-webkit-scrollbar {
          display: none;
        }

        .navLink {
          font-size: 11.5px;
          font-family: var(--font-mono), monospace;
          color: var(--ink-soft);
          text-decoration: none;
          padding: 5px 9px;
          border-radius: 999px;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 120ms ease, color 120ms ease;
        }
        .navLink:hover {
          color: var(--ink);
          background: rgba(20, 23, 26, 0.06);
          text-decoration: none;
        }
        .navActive {
          background: var(--ink);
          color: #fff;
        }
        .navActive:hover {
          background: var(--ink);
          color: #fff;
        }

        .shellMain {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .footer {
          margin-top: auto;
          padding: 40px 0 28px;
          font-family: var(--font-mono), monospace;
          font-size: 11.5px;
          color: var(--ink-soft);
        }
      `}</style>
    </div>
  );
}
