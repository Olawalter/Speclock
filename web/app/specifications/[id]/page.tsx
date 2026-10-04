"use client";

import Link from "next/link";
import { use, useState } from "react";

import { configResult } from "@/lib/config/env";
import { reads } from "@/lib/genlayer/contract";
import { useRead } from "@/lib/genlayer/hooks";
import {
  assessmentLabel, byteSize, formatTime, shortAddress, shortDigest, specificationLabel,
} from "@/lib/format/present";
import { ConfigProblem } from "@/components/config-problem";
import { Empty, Loading, Problem } from "@/components/empty";
import { SeverityChip, SpecStateChip, VerdictChip } from "@/components/status";

export default function SpecificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const specification = useRead(reads.specification(id));
  const assessments = useRead(reads.specificationAssessments(id, 0, 50));
  const [showBaseline, setShowBaseline] = useState(false);
  const baseline = useRead(showBaseline ? reads.baseline(id) : undefined);

  if (!configResult.ok) return <ConfigProblem />;
  if (specification.error) return <Problem message={specification.error} />;
  if (specification.loading || !specification.data) return <Loading what="this specification" />;

  const spec = specification.data;
  const frozen = spec.state === "FROZEN";
  const requirements = spec.requirements ?? [];
  const rounds = assessments.data?.items ?? [];

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono text-xs text-[var(--slate)]">
            {specificationLabel(spec.specification_id)}
          </span>
          <SpecStateChip state={spec.state} />
        </div>
        <h1 className="max-w-3xl">{spec.name}</h1>
        <p className="lede max-w-3xl">{spec.description}</p>
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--slate)]">
          <Pair term="Registered by">
            <span className="mono">{shortAddress(spec.creator)}</span>
          </Pair>
          <Pair term="Baseline"><span className="mono">{spec.baseline_version}</span></Pair>
          <Pair term="Registered">{formatTime(spec.created_at)}</Pair>
          {frozen ? (
            <Pair term="Frozen as">
              <span className="mono">{shortDigest(spec.criteria_digest)}</span>
            </Pair>
          ) : null}
        </dl>
        {frozen ? (
          <div>
            <Link href={`/assessments/new?specification=${spec.specification_id}`}
                  className="btn btn-primary">
              Assess a proposed version
            </Link>
          </div>
        ) : (
          <p className="max-w-2xl rounded-[6px] border border-dashed p-3 text-xs
                        text-[var(--slate)]">
            This specification is not frozen, so it cannot be assessed yet. Until it is, its
            requirements can still change, and a finding measured against moving criteria would
            mean nothing.
          </p>
        )}
      </header>

      <section className="grid gap-3" aria-labelledby="requirements">
        <h2 id="requirements" className="label">
          {frozen ? "Frozen requirements" : "Requirements so far"}
        </h2>
        {requirements.length === 0 ? (
          <Empty title="No requirements yet"
                 detail="A specification needs at least one before it can be frozen." />
        ) : (
          <ul className="grid gap-2">
            {requirements.map((requirement) => (
              <li key={requirement.requirement_id} className="panel p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {requirement.frozen ? (
                    <span className="frozen-mark" aria-label="frozen" />
                  ) : null}
                  <span className="mono text-xs font-[540]">{requirement.requirement_id}</span>
                  <SeverityChip severity={requirement.severity} />
                </div>
                <p className="mt-2 text-sm">{requirement.statement}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="baseline">
        <div className="flex items-baseline justify-between">
          <h2 id="baseline" className="label">The baseline document</h2>
          <button type="button" className="btn btn-quiet px-0 text-xs"
                  aria-expanded={showBaseline}
                  onClick={() => setShowBaseline((v) => !v)}>
            {showBaseline ? "Hide" : "Show it"}
          </button>
        </div>
        <div className="panel p-4">
          <p className="text-xs text-[var(--slate)]">
            Version <span className="mono">{spec.baseline_version}</span>
            {" · "}{byteSize(spec.baseline_bytes)}
            {" · "}sha-256 <span className="mono">{shortDigest(spec.baseline_hash)}</span>
          </p>
          {spec.source_reference ? (
            <p className="mt-1 text-xs text-[var(--slate)]">
              Published at{" "}
              <a className="mono underline decoration-dotted underline-offset-2"
                 href={spec.source_reference} target="_blank" rel="noreferrer">
                {spec.source_reference}
              </a>
              {" — "}a reference only. What was assessed is the document stored here.
            </p>
          ) : null}
          {showBaseline ? (
            baseline.loading ? <p className="mt-3 text-xs text-[var(--slate)]">Reading&hellip;</p>
            : baseline.error ? <p className="mt-3 text-xs text-[var(--breaking-ink)]">
                                 {baseline.error}</p>
            : <pre className="document mt-3">{baseline.data?.content ?? ""}</pre>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="assessments">
        <h2 id="assessments" className="label">Assessments against these criteria</h2>
        {assessments.loading ? <Loading what="assessments" />
          : rounds.length === 0 ? (
            <Empty title="Nothing assessed yet"
                   detail={frozen
                     ? "Submit a proposed version to have it read against these requirements."
                     : "Freeze the requirements first."} />
          ) : (
            <ul className="grid gap-2">
              {rounds.map((assessment) => (
                <li key={assessment.assessment_id}>
                  <Link href={`/assessments/${assessment.assessment_id}`}
                        className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4
                                   transition-colors hover:border-[var(--graphite)]">
                    <span className="mono text-xs text-[var(--slate)]">
                      {assessmentLabel(assessment.assessment_id)}
                    </span>
                    <span className="mono text-xs">
                      {assessment.baseline_version} &rarr; {assessment.proposed_version}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--slate)]">
                      {assessment.summary}
                    </span>
                    <VerdictChip verdict={assessment.verdict} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

function Pair({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt>{term}</dt>
      <dd className="text-[var(--graphite)]">{children}</dd>
    </div>
  );
}
