"use client";

import Link from "next/link";
import { use, useState } from "react";

import { configResult, explorerAddress } from "@/lib/config/env";
import { reads, type Finding } from "@/lib/genlayer/contract";
import { useRead } from "@/lib/genlayer/hooks";
import {
  assessmentLabel, byteSize, formatTime, shortAddress, shortDigest, specificationLabel,
} from "@/lib/format/present";
import { ConfigProblem } from "@/components/config-problem";
import { Loading, Problem } from "@/components/empty";
import { SeverityChip, StatusChip, VerdictChip } from "@/components/status";

/**
 * The assessment page.
 *
 * Not a text diff. A diff is loudest exactly where nothing broke -- a document
 * reorganised and reworded can change on every line and keep every promise --
 * and silent exactly where something did, because `required` becoming
 * `optional` is two words.
 *
 * So the page is built one frozen requirement at a time: what was agreed, what
 * each document says about it, what the panel decided, and the words it decided
 * from. On a narrow screen those stack rather than cramming into columns.
 */
export default function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const assessment = useRead(reads.assessment(id));
  const specification = useRead(
    assessment.data ? reads.specification(assessment.data.specification_id) : undefined);

  if (!configResult.ok) return <ConfigProblem />;
  if (assessment.error) return <Problem message={assessment.error} />;
  if (assessment.loading || !assessment.data) return <Loading what="this assessment" />;

  const record = assessment.data;

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="mono text-xs text-[var(--slate)]">
            {assessmentLabel(record.assessment_id)}
          </span>
          <VerdictChip verdict={record.verdict} />
        </div>
        <h1 className="max-w-3xl">{record.specification_name}</h1>
        <p className="lede max-w-3xl">{record.summary}</p>

        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--slate)]">
          <Pair term="Baseline">
            <span className="mono">{record.baseline_version}</span>
          </Pair>
          <Pair term="Proposed">
            <span className="mono">{record.proposed_version}</span>
          </Pair>
          <Pair term="Submitted">{formatTime(record.submitted_at)}</Pair>
          <Pair term="By"><span className="mono">{shortAddress(record.submitted_by)}</span></Pair>
          <Pair term="Against criteria">
            <span className="mono">{shortDigest(record.criteria_digest)}</span>
          </Pair>
        </dl>

        <p className="max-w-3xl rounded-[6px] border border-dashed p-3 text-xs text-[var(--slate)]">
          <span className="font-[540] text-[var(--graphite)]">What this says.</span>{" "}
          {record.scope}
        </p>
      </header>

      <section className="grid gap-3" aria-labelledby="findings">
        <h2 id="findings" className="label">
          Requirement by requirement
        </h2>
        <ul className="grid gap-3">
          {record.findings.map((finding) => (
            <li key={finding.requirement_id}>
              <FindingCard finding={finding}
                           severity={specification.data?.requirements?.find(
                             (r) => r.requirement_id === finding.requirement_id)?.severity} />
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3" aria-labelledby="evidence">
        <h2 id="evidence" className="label">The documents that were assessed</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <Document title="Baseline" version={record.baseline_version}
                    hash={record.baseline_hash}
                    read={reads.baseline(record.specification_id)} />
          <Document title="Proposed" version={record.proposed_version}
                    hash={record.proposed_hash} bytes={record.proposed_bytes}
                    read={reads.proposed(record.assessment_id)} />
        </div>
      </section>

      <section className="grid gap-2" aria-labelledby="provenance">
        <h2 id="provenance" className="label">Checking this</h2>
        <div className="panel grid gap-2 p-4 text-xs">
          <Row label="Specification">
            <Link className="underline decoration-dotted underline-offset-2"
                  href={`/specifications/${record.specification_id}`}>
              {specificationLabel(record.specification_id)}
            </Link>
          </Row>
          <Row label="Criteria frozen as">
            <span className="mono">{record.criteria_digest}</span>
          </Row>
          <Row label="What the panel agreed">
            <span className="mono">{record.decisive_digest}</span>
          </Row>
          <Row label="Aggregation rules"><span className="mono">{record.rules}</span></Row>
          <Row label="Contract">
            <a className="mono underline decoration-dotted underline-offset-2"
               href={explorerAddress(configResult.config.contractAddress)}
               target="_blank" rel="noreferrer">
              {configResult.config.contractAddress}
            </a>
          </Row>
        </div>
        <p className="text-xs text-[var(--slate)]">
          The verdict is derived in the contract from the statuses above, under the rules named
          here. No model named it, and reloading this page reads it back from the chain rather
          than from anything this browser kept.
        </p>
      </section>
    </div>
  );
}

function FindingCard({ finding, severity }: { finding: Finding; severity?: string }) {
  const [open, setOpen] = useState(false);
  const held = finding.held_for_grounding;

  return (
    <article className="panel">
      <div className="panel-head flex flex-wrap items-center gap-3">
        <span className="mono text-xs font-[540]">{finding.requirement_id}</span>
        {severity ? <SeverityChip severity={severity} /> : null}
        <span className="ml-auto">
          <StatusChip status={finding.effective_status} held={held} />
        </span>
      </div>

      <div className="grid gap-4 p-4">
        <div>
          <p className="label">What was agreed</p>
          <p className="mt-1 text-sm">{finding.statement}</p>
        </div>

        {held ? (
          <p className="rounded-[6px] bg-[var(--pending)] p-3 text-xs text-[var(--pending-ink)]">
            The reader answered <strong>{finding.status === "VIOLATED" ? "violated" : "preserved"}
            </strong>, but could not point at words in either document that show it, so this
            requirement is recorded as not settled. The rule holds a pass exactly as it holds a
            failure.
          </p>
        ) : null}

        {finding.evidence ? (
          <div>
            <p className="label">Quoted from the documents</p>
            <blockquote className="mt-1 border-l-2 border-[var(--border)] pl-3 text-sm
                                   text-[var(--graphite)]">
              {finding.evidence}
            </blockquote>
          </div>
        ) : (
          <p className="text-sm text-[var(--slate)]">
            Nothing in either document settles this requirement.
          </p>
        )}

        {finding.reasoning ? (
          <div>
            <button type="button" className="btn btn-quiet px-0 text-xs"
                    aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Hide the reasoning" : "Why those words settle it"}
            </button>
            {open ? (
              <p className="mt-1 text-sm text-[var(--slate)]">{finding.reasoning}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function Document({ title, version, hash, bytes, read }: {
  title: string; version: string; hash: string; bytes?: number;
  read: ReturnType<typeof reads.baseline>;
}) {
  const [open, setOpen] = useState(false);
  const document = useRead(open ? read : undefined);

  return (
    <div className="panel">
      <div className="panel-head flex flex-wrap items-center gap-2">
        <span className="label">{title}</span>
        <span className="mono text-xs">{version}</span>
        <button type="button" className="btn btn-quiet ml-auto px-0 text-xs"
                aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show the document"}
        </button>
      </div>
      <div className="grid gap-2 p-4">
        <p className="text-xs text-[var(--slate)]">
          sha-256 <span className="mono">{shortDigest(hash)}</span>
          {bytes ? ` · ${byteSize(bytes)}` : ""}
        </p>
        {open ? (
          document.loading ? <p className="text-xs text-[var(--slate)]">Reading…</p>
          : document.error ? <p className="text-xs text-[var(--breaking-ink)]">{document.error}</p>
          : <pre className="document">{document.data?.content ?? ""}</pre>
        ) : null}
      </div>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <span className="min-w-40 text-[var(--slate)]">{label}</span>
      <span className="min-w-0 break-all">{children}</span>
    </div>
  );
}
