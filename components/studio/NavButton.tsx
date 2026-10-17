"use client";

import type { ReactNode } from "react";

export function NavButton({
  active,
  label,
  icon,
  onClick,
  badge,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      className={"navBtn" + (active ? " navActive" : "")}
      onClick={onClick}
    >
      <span className="navIcon">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="navBadge">{badge}</span>
        )}
      </span>
      <span className="navLabel">{label}</span>
    </button>
  );
}
