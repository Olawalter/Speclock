"use client";

import Link from "next/link";

import { configResult } from "@/lib/config/env";
import { reads } from "@/lib/genlayer/contract";
import { LIST_POLL, useRead } from "@/lib/genlayer/hooks";
import { assessmentLabel, formatTime, specificationLabel } from "@/lib/format/present";
import { ConfigProblem } from "@/components/config-problem";
import { Empty, Loading, Problem } from "@/components/empty";
import { SpecStateChip, VerdictChip } from "@/components/status";

export default function Overview() {
  const specifications = useRead(reads.specifications(0, 50), { pollMs: LIST_POLL });
  const assessments = useRead(reads.assessments(0, 20), { pollMs: LIST_POLL });

  if (!configResult.ok) return <ConfigProblem />;

  const specs = specifications.data?.items ?? [];
  const rounds = assessments.data?.items ?? [];
  const frozen = specs.filter((s) => s.state === "FROZEN").length;
  const breaking = rounds.filter((a) => a.verdict === "BREAKING_CHANGE").length;

  return (
    <div className="grid gap-10">
      <header className="grid max-w-3xl gap-3">
        <p className="label">Semantic change adjudication</p>
        <h1>A specification change is a question about meaning, not a diff</h1>
        <p className="lede">
          Write down what an integration actually depends on, freeze it, then let GenLayer
          validators decide for themselves whether a proposed version preserves it. The verdict
          is derived from their answers in the contract, and it is recorded on chain where
          nobody can quietly revise it.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Link href="/specifications/new" className="btn btn-primary">Register a specification</Link>
          <Link href="/specifications" className="btn">Browse the registry</Link>
        </div>
      </header>

      <section className="grid gap-3" aria-labelledby="activity">
        <h2 id="activity" className="label">On this contract</h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Specifications" value={specifications.loading ? null : specs.length} />
          <Figure label="Frozen" value={specifications.loading ? null : frozen} />
          <Figure label="Assessments" value={assessments.loading ? null : rounds.length} />
          <Figure label="Breaking changes" value={assessments.loading ? null : breaking} />
        </dl>
      </section>

      <section className="grid gap-3" aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="label">Recent adjudications</h2>
          <Link href="/assessments" className="text-xs text-[var(--slate)] hover:text-[var(--graphite)]">
            All assessments
          </Link>
        </div>
        {assessments.error ? <Problem message={assessments.error} />
          : assessments.loading ? <Loading what="assessments" />
          : rounds.length === 0 ? (
            <Empty title="Nothing has been adjudicated yet"
                   detail="Register a specification, freeze its requirements, then submit a
                           proposed version to have it assessed." />
          ) : (
            <ul className="grid gap-2">
              {rounds.slice(0, 6).map((assessment) => (
                <li key={assessment.assessment_id}>
                  <Link href={`/assessments/${assessment.assessment_id}`}
                        className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4
                                   transition-colors hover:border-[var(--graphite)]">
                    <span className="mono text-xs text-[var(--slate)]">
                      {assessmentLabel(assessment.assessment_id)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-[540]">
                      {assessment.specification_name}
                    </span>
                    <span className="mono text-xs text-[var(--slate)]">
                      {assessment.baseline_version} &rarr; {assessment.proposed_version}
                    </span>
                    <VerdictChip verdict={assessment.verdict} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section className="grid gap-3" aria-labelledby="specs">
        <div className="flex items-baseline justify-between">
          <h2 id="specs" className="label">Specifications</h2>
          <Link href="/specifications"
                className="text-xs text-[var(--slate)] hover:text-[var(--graphite)]">
            All specifications
          </Link>
        </div>
        {specifications.error ? <Problem message={specifications.error} />
          : specifications.loading ? <Loading what="specifications" />
          : specs.length === 0 ? (
            <Empty title="No specification has been registered"
                   detail="A specification is a baseline document plus the requirements an
                           integration depends on." />
          ) : (
            <ul className="grid gap-2">
              {specs.slice(0, 5).map((spec) => (
                <li key={spec.specification_id}>
                  <Link href={`/specifications/${spec.specification_id}`}
                        className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4
                                   transition-colors hover:border-[var(--graphite)]">
                    <span className="mono text-xs text-[var(--slate)]">
                      {specificationLabel(spec.specification_id)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-[540]">{spec.name}</span>
                    <span className="text-xs text-[var(--slate)]">
                      {spec.requirement_count} requirement{spec.requirement_count === 1 ? "" : "s"}
                    </span>
                    <span className="hidden text-xs text-[var(--slate)] sm:inline">
                      {formatTime(spec.created_at)}
                    </span>
                    <SpecStateChip state={spec.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="panel p-4">
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-2xl font-[540] tabular-nums">
        {value === null ? <span className="text-[var(--slate)]">&mdash;</span> : value}
      </dd>
    </div>
  );
}
