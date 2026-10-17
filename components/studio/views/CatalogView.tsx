"use client";

import type { CatalogOperation } from "@/lib/studio/types";
import { TIER_LABELS } from "@/lib/catalog/operations";
import { Icons } from "../Icons";
import { OperationCard } from "../OperationCard";
import { Empty } from "../Empty";

export function CatalogView({
  grouped,
  search,
  setSearch,
  tierFilters,
  tierFilter,
  setTierFilter,
  onOpenOp,
}: {
  grouped: [number, CatalogOperation[]][];
  search: string;
  setSearch: (s: string) => void;
  tierFilters: readonly { id: string; label: string }[];
  tierFilter: string;
  setTierFilter: (t: string) => void;
  onOpenOp: (op: CatalogOperation) => void;
}) {
  return (
    <div className="pad">
      <div className="searchWrap">
        <Icons.Search />
        <input
          className="searchInput"
          placeholder="Search operations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="filterScroll">
        {tierFilters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={"filterChip" + (tierFilter === f.id ? " filterActive" : "")}
            onClick={() => setTierFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {grouped.length === 0 && (
        <Empty
          title="No operations match"
          hint="Try a different filter or search term."
        />
      )}

      <div className="catalog">
        {grouped.map(([tier, ops]) => (
          <section key={tier} className="tierSection">
            <h3 className="tierHead">{TIER_LABELS[tier] ?? `Tier ${tier}`}</h3>
            <ul className="opList">
              {ops.map((op) => (
                <li key={op.id}>
                  <OperationCard op={op} onOpen={() => onOpenOp(op)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
