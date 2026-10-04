"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { configResult } from "@/lib/config/env";
import { reads } from "@/lib/genlayer/contract";
import { LIST_POLL, useRead } from "@/lib/genlayer/hooks";
import { formatTime, shortAddress, specificationLabel } from "@/lib/format/present";
import { ConfigProblem } from "@/components/config-problem";
import { Empty, Loading, Problem } from "@/components/empty";
import { SpecStateChip } from "@/components/status";

const FILTERS = ["All", "Frozen", "Draft"] as const;

export default function Specifications() {
  const { data, error, loading } = useRead(reads.specifications(0, 100), { pollMs: LIST_POLL });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    const needle = query.trim().toLowerCase();
    return items.filter((spec) => {
      const matchesFilter =
        filter === "All" ? true
        : filter === "Frozen" ? spec.state === "FROZEN"
        : spec.state !== "FROZEN";
      const matchesQuery = !needle
        || spec.name.toLowerCase().includes(needle)
        || spec.specification_id.toLowerCase().includes(needle)
        || spec.creator.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [data, filter, query]);

  if (!configResult.ok) return <ConfigProblem />;

  return (
    <div className="grid gap-6">
      <header className="grid max-w-2xl gap-2">
        <p className="label">Registry</p>
        <h1>Specifications on this contract</h1>
        <p className="lede">
          Read from the deployment each time this page loads. Nothing is indexed anywhere else,
          so what you see is what the chain holds.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Filter by state">
          {FILTERS.map((name) => (
            <button key={name} type="button"
                    aria-pressed={filter === name}
                    onClick={() => setFilter(name)}
                    className={`rounded-[6px] border px-3 py-1.5 text-xs transition-colors ${
                      filter === name
                        ? "border-[var(--graphite)] bg-white"
                        : "border-[var(--border)] text-[var(--slate)] hover:text-[var(--graphite)]"}`}>
              {name}
            </button>
          ))}
        </div>
        <input className="control ml-auto max-w-xs" placeholder="Name, id or creator"
               aria-label="Search specifications"
               value={query} onChange={(e) => setQuery(e.target.value)} />
        <Link href="/specifications/new" className="btn btn-primary">Register</Link>
      </div>

      {error ? <Problem message={error} />
        : loading ? <Loading what="specifications" />
        : rows.length === 0 ? (
          <Empty title="Nothing here"
                 detail={query || filter !== "All"
                   ? "No specification matches that."
                   : "Register a specification to put its requirements on the record."} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((spec) => (
              <li key={spec.specification_id}>
                <Link href={`/specifications/${spec.specification_id}`}
                      className="panel block p-4 transition-colors hover:border-[var(--graphite)]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="mono text-xs text-[var(--slate)]">
                      {specificationLabel(spec.specification_id)}
                    </span>
                    <SpecStateChip state={spec.state} />
                    <span className="ml-auto text-xs text-[var(--slate)]">
                      {formatTime(spec.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] font-[540]">{spec.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-[var(--slate)]">
                    {spec.description}
                  </p>
                  <p className="mt-2 text-xs text-[var(--slate)]">
                    Baseline {spec.baseline_version} &middot;{" "}
                    {spec.requirement_count} requirement{spec.requirement_count === 1 ? "" : "s"}
                    {spec.assessment_count > 0
                      ? ` · ${spec.assessment_count} assessment${spec.assessment_count === 1 ? "" : "s"}`
                      : ""}
                    {" · "}by <span className="mono">{shortAddress(spec.creator)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
