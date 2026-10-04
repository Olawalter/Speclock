"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { configResult } from "@/lib/config/env";
import { reads, writes } from "@/lib/genlayer/contract";
import { useRead } from "@/lib/genlayer/hooks";
import { useSend, sendBlocker } from "@/lib/genlayer/send";
import { digestOf, shortDigest, specificationLabel } from "@/lib/format/present";
import { useWallet } from "@/components/wallet/wallet-provider";
import { ConfigProblem } from "@/components/config-problem";
import { Loading, Problem } from "@/components/empty";
import { TxPanel } from "@/components/tx-panel";

export default function NewAssessmentPage() {
  return (
    <Suspense fallback={<Loading what="the registry" />}>
      <NewAssessment />
    </Suspense>
  );
}

function NewAssessment() {
  const router = useRouter();
  const search = useSearchParams();
  const { wallet, wrongNetwork } = useWallet();
  const { tx, send } = useSend();

  const [specId, setSpecId] = useState(search.get("specification") ?? "");
  const [version, setVersion] = useState("");
  const [content, setContent] = useState("");
  const [hash, setHash] = useState("");

  const specifications = useRead(reads.specifications(0, 100));
  const specification = useRead(specId ? reads.specification(specId) : undefined);

  // One async set, never a synchronous one on the way in: an empty document
  // resolves to an empty digest down the same path as any other.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const value = content.trim() ? await digestOf(content) : "";
      if (!cancelled) setHash(value);
    })();
    return () => { cancelled = true; };
  }, [content]);

  const frozen = useMemo(
    () => (specifications.data?.items ?? []).filter((s) => s.state === "FROZEN"),
    [specifications.data]);

  if (!configResult.ok) return <ConfigProblem />;

  const blocker = sendBlocker(wallet, wrongNetwork);
  const running = tx.phase !== "idle" && tx.phase !== "failed" && tx.phase !== "finalized";
  const spec = specification.data;
  const ready = Boolean(specId && version.trim() && content.trim().length > 1
                        && spec?.state === "FROZEN");

  const submit = async () => {
    const result = await send(
      writes.submitAssessment(specId, version.trim(), content, hash));
    if (result.phase === "finalized" || result.phase === "accepted") {
      const { readClient, contractAddress, NON_FINAL } = await import("@/lib/genlayer/client");
      const listed = await readClient().readContract({
        address: contractAddress(), functionName: "list_specification_assessments",
        args: [specId, 0, 1], transactionHashVariant: NON_FINAL,
      } as never) as { items?: { assessment_id: string }[] };
      const latest = listed?.items?.[0]?.assessment_id;
      if (latest) router.push(`/assessments/${latest}`);
    }
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <p className="label">Assess</p>
        <h1>Put a proposed version to the panel</h1>
        <p className="lede">
          Every validator will read this document and the frozen baseline against each
          requirement, separately, and they have to agree before anything is recorded. This is
          one transaction and it takes a few minutes.
        </p>
      </header>

      {blocker ? <p className="panel p-4 text-sm text-[var(--slate)]">{blocker}</p> : null}

      <section className="panel grid gap-4 p-5">
        <div className="grid gap-1">
          <label className="label" htmlFor="specification">Against which specification</label>
          {specifications.loading ? (
            <p className="text-sm text-[var(--slate)]">Reading the registry&hellip;</p>
          ) : (
            <select id="specification" className="control" value={specId}
                    onChange={(e) => setSpecId(e.target.value)}>
              <option value="">Choose a frozen specification</option>
              {frozen.map((candidate) => (
                <option key={candidate.specification_id} value={candidate.specification_id}>
                  {candidate.name} ({specificationLabel(candidate.specification_id)}, baseline{" "}
                  {candidate.baseline_version})
                </option>
              ))}
            </select>
          )}
          {!specifications.loading && frozen.length === 0 ? (
            <p className="text-xs text-[var(--slate)]">
              Nothing is frozen yet. A specification can only be assessed once its criteria are
              fixed.
            </p>
          ) : null}
        </div>

        {spec && spec.state === "FROZEN" ? (
          <div className="rounded-[6px] bg-[var(--paper)] p-3">
            <p className="label">What it will be read against</p>
            <ul className="mt-2 grid gap-1.5">
              {(spec.requirements ?? []).map((requirement) => (
                <li key={requirement.requirement_id} className="flex gap-3 text-sm">
                  <span className="mono text-xs text-[var(--slate)]">
                    {requirement.requirement_id}
                  </span>
                  <span className="min-w-0 flex-1">{requirement.statement}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-1">
          <label className="label" htmlFor="version">Proposed version</label>
          <input id="version" className="control max-w-40 font-mono" value={version}
                 placeholder="2.5" onChange={(e) => setVersion(e.target.value)} />
        </div>

        <div className="grid gap-1">
          <label className="label" htmlFor="proposed">The proposed document</label>
          <textarea id="proposed" className="control" value={content}
                    placeholder="Paste the proposed specification"
                    onChange={(e) => setContent(e.target.value)} />
          <p className="text-xs text-[var(--slate)]">
            Stored whole and read by every validator. Anything in it that looks like an
            instruction is treated as part of the document, not as an instruction.
          </p>
        </div>

        {hash ? (
          <p className="text-xs text-[var(--slate)]">
            This hashes to <span className="mono">{shortDigest(hash)}</span>. The contract
            computes it again and refuses the submission if they differ.
          </p>
        ) : null}

        <div className="flex justify-end">
          <button type="button" className="btn btn-primary"
                  disabled={!ready || Boolean(blocker) || running}
                  onClick={() => void submit()}>
            {running ? "Adjudicating…" : "Submit for adjudication"}
          </button>
        </div>

        <TxPanel state={tx} done="Recorded. Opening the finding." />
        {specification.error ? <Problem message={specification.error} /> : null}
      </section>
    </div>
  );
}
