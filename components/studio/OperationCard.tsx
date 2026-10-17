"use client";

import type { CatalogOperation } from "@/lib/studio/types";
import { Icons } from "./Icons";

export function OperationIcon({
  icon,
  size,
}: {
  icon: string;
  size?: number;
}) {
  const Icon = Icons[icon as keyof typeof Icons] ?? Icons.File;
  return <Icon size={size} />;
}

export function OperationCard({
  op,
  onOpen,
  disabled,
}: {
  op: CatalogOperation;
  onOpen: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="opCard"
      onClick={onOpen}
      disabled={disabled}
    >
      <span className="opIcon">
        <OperationIcon icon={op.icon} />
      </span>
      <span className="opBody">
        <span className="opName">
          {op.name}
          {op.chainSteps && <span className="chainBadge">chain</span>}
        </span>
        <span className="opDesc">{op.description}</span>
        <span className="opMeta">
          {op.engine} · {op.accepts.length ? op.accepts.join("/") : "url"} →{" "}
          {op.produces}
        </span>
      </span>
      <Icons.Chevron />
    </button>
  );
}
