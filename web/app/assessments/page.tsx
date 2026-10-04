"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { configResult } from "@/lib/config/env";
import { reads } from "@/lib/genlayer/contract";
import { LIST_POLL, useRead } from "@/lib/genlayer/hooks";
import { assessmentLabel, formatTime, shortAddress } from "@/lib/format/present";
import { ConfigProblem } from "@/components/config-problem";
import { Empty, Loading, Problem } from "@/components/empty";
import { VerdictChip } from "@/components/status";

const FILTERS = ["All", "Compatible", "Breaking change", "Inconclusive"] as const;
const VERDICT_OF: Record<string, string> = {
  Compatible: "COMPATIBLE",
  "Breaking change": "BREAKING_CHANGE",
  Inconclusive: "INCONCLUSIVE",
};

export default function Assessments() {
  const { data, error, loading } = useRead(reads.assessments(0, 100), { pollMs: LIST_POLL });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (filter === "All") return items;
    return items.filter((a) => a.verdict === VERDICT_OF[filter]);
  }, [data, filter]);

  if (!configResult.ok) return <ConfigProblem />;

  return (
    <div className="grid gap-6">
      <header className="grid max-w-2xl gap-2">
        <p className="label">History</p>
        <h1>What GenLayer has adjudicated</h1>
        <p className="lede">
          Every assessment is a round in which each validator read the frozen requirements
          against both documents and had to agree. A round with no majority wrote nothing and
          does not appear here.
        </p>
      </header>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by verdict">
        {FILTERS.map((name) => (
          <button key={name} type="button" aria-pressed={filter === name}
                  onClick={() => setFilter(name)}
                  className={`rounded-[6px] border px-3 py-1.5 text-xs transition-colors ${
                    filter === name
                      ? "border-[var(--graphite)] bg-white"
                      : "border-[var(--border)] text-[var(--slate)] hover:text-[var(--graphite)]"}`}>
            {name}
          </button>
        ))}
      </div>

      {error ? <Problem message={error} />
        : loading ? <Loading what="assessments" />
        : rows.length === 0 ? (
          <Empty title="Nothing to show"
                 detail={filter === "All"
                   ? "No proposal has been assessed yet."
                   : `No assessment came back ${filter.toLowerCase()}.`} />
        ) : (
          <ul className="grid gap-2">
            {rows.map((assessment) => (
              <li key={assessment.assessment_id}>
                <Link href={`/assessments/${assessment.assessment_id}`}
                      className="panel block p-4 transition-colors hover:border-[var(--graphite)]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="mono text-xs text-[var(--slate)]">
                      {assessmentLabel(assessment.assessment_id)}
                    </span>
                    <VerdictChip verdict={assessment.verdict} />
                    <span className="ml-auto text-xs text-[var(--slate)]">
                      {formatTime(assessment.submitted_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] font-[540]">{assessment.specification_name}</p>
                  <p className="mt-0.5 text-sm text-[var(--slate)]">{assessment.summary}</p>
                  <p className="mt-2 text-xs text-[var(--slate)]">
                    <span className="mono">{assessment.baseline_version}</span> &rarr;{" "}
                    <span className="mono">{assessment.proposed_version}</span>
                    {" · "}submitted by{" "}
                    <span className="mono">{shortAddress(assessment.submitted_by)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
