"use client";

import type { ReactNode } from "react";
import { Icons } from "./Icons";

export function Sheet({
  title,
  badge,
  note,
  onClose,
  children,
}: {
  title: string;
  badge?: string;
  note?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheetOverlay" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheetHandle" />
        <div className="sheetHead">
          <div className="sheetHeadLeft">
            <span className="sheetTitle">{title}</span>
            {badge && <span className="sheetBadge">{badge}</span>}
          </div>
          <button
            className="closebtn"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <Icons.Close />
          </button>
        </div>
        {note && <p className="sheetNote">{note}</p>}
        <div className="sheetBody">{children}</div>
      </div>
    </div>
  );
}
