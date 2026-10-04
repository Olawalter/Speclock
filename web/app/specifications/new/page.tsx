"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { configResult } from "@/lib/config/env";
import { SEVERITIES, writes } from "@/lib/genlayer/contract";
import { useSend, sendBlocker } from "@/lib/genlayer/send";
import { digestOf, shortDigest } from "@/lib/format/present";
import { useWallet } from "@/components/wallet/wallet-provider";
import { ConfigProblem } from "@/components/config-problem";
import { TxPanel } from "@/components/tx-panel";

type Draft = {
  name: string;
  description: string;
  baselineVersion: string;
  baselineContent: string;
  sourceReference: string;
};

type RequirementDraft = { id: string; statement: string; severity: string };

const STAGES = ["Describe", "Baseline", "Requirements", "Freeze"] as const;
type Stage = (typeof STAGES)[number];

const REQUIREMENT_ID = /^[A-Z][A-Z0-9]{1,11}-[0-9]{1,4}$/;

export default function NewSpecification() {
  const router = useRouter();
  const { wallet, wrongNetwork } = useWallet();
  const { tx, send } = useSend();

  const [stage, setStage] = useState<Stage>("Describe");
  const [draft, setDraft] = useState<Draft>({
    name: "", description: "", baselineVersion: "", baselineContent: "", sourceReference: "",
  });
  const [requirements, setRequirements] = useState<RequirementDraft[]>([
    { id: "", statement: "", severity: "BLOCKING" },
  ]);
  const [specId, setSpecId] = useState<string>();
  const [added, setAdded] = useState<string[]>([]);
  const [hash, setHash] = useState("");

  // The hash is shown before anything is sent, so the person can see what their
  // document comes to and check it themselves. One async set, never a
  // synchronous one on the way in.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const value = draft.baselineContent.trim() ? await digestOf(draft.baselineContent) : "";
      if (!cancelled) setHash(value);
    })();
    return () => { cancelled = true; };
  }, [draft.baselineContent]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const problems = useMemo(() => {
    const found: Record<string, string> = {};
    if (!draft.name.trim()) found.name = "Give it a name";
    if (!draft.description.trim()) found.description = "Say what this specification covers";
    if (!draft.baselineVersion.trim()) found.baselineVersion = "Name the baseline version";
    if (draft.baselineContent.trim().length < 2) found.baselineContent = "Paste the baseline";
    const ids = new Set<string>();
    requirements.forEach((r, i) => {
      const id = r.id.trim().toUpperCase();
      if (!id && !r.statement.trim()) return;
      if (!REQUIREMENT_ID.test(id)) found[`req${i}`] = "An id looks like PAY-001";
      else if (ids.has(id)) found[`req${i}`] = "That id is already used here";
      else ids.add(id);
      if (!r.statement.trim()) found[`req${i}s`] = "Say what must hold";
    });
    const filled = requirements.filter((r) => r.id.trim() && r.statement.trim());
    if (filled.length === 0) found.requirements = "Add at least one requirement";
    return found;
  }, [draft, requirements]);

  if (!configResult.ok) return <ConfigProblem />;
  const blocker = sendBlocker(wallet, wrongNetwork);
  const running = tx.phase !== "idle" && tx.phase !== "failed" && tx.phase !== "finalized";

  const register = async () => {
    const result = await send(
      writes.registerSpecification(draft.name.trim(), draft.description.trim(),
                                   draft.baselineVersion.trim(), draft.baselineContent,
                                   hash, draft.sourceReference.trim()),
    );
    if (result.phase === "finalized" || result.phase === "accepted") {
      // The id is read back from the chain rather than guessed from a counter
      // this browser kept: the contract assigns it, so the contract is asked.
      const { readClient, contractAddress, NON_FINAL } = await import("@/lib/genlayer/client");
      const listed = await readClient().readContract({
        address: contractAddress(), functionName: "list_by_creator",
        args: [wallet ? await currentAccount(wallet.provider) : "", 0, 50],
        transactionHashVariant: NON_FINAL,
      } as never) as { items?: { specification_id: string }[] };
      const mine = listed?.items ?? [];
      if (mine.length > 0) setSpecId(mine[0].specification_id);
      setStage("Requirements");
    }
  };

  const addRequirement = async (requirement: RequirementDraft) => {
    if (!specId) return;
    const id = requirement.id.trim().toUpperCase();
    const result = await send(
      writes.addRequirement(specId, id, requirement.statement.trim(), requirement.severity));
    if (result.phase === "finalized" || result.phase === "accepted") {
      setAdded((list) => [...list, id]);
    }
  };

  const freeze = async () => {
    if (!specId) return;
    const result = await send(writes.freezeSpecification(specId));
    if (result.phase === "finalized" || result.phase === "accepted") {
      router.push(`/specifications/${specId}`);
    }
  };

  const filled = requirements.filter((r) => r.id.trim() && r.statement.trim());
  const outstanding = filled.filter((r) => !added.includes(r.id.trim().toUpperCase()));

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <p className="label">Register</p>
        <h1>Write down what must stay true</h1>
        <p className="lede">
          Four steps, and the last one is the point: once this is frozen the requirements, their
          statements and the baseline cannot change, by anyone, including you. That is what lets
          a later finding mean something.
        </p>
      </header>

      <ol className="flex flex-wrap gap-1" aria-label="Progress">
        {STAGES.map((name, index) => {
          const done = STAGES.indexOf(stage) > index;
          const at = stage === name;
          return (
            <li key={name}>
              <span className={`flex items-center gap-2 rounded-[6px] border px-3 py-1.5 text-xs ${
                at ? "border-[var(--graphite)] bg-white"
                   : done ? "border-[var(--border)] text-[var(--slate)]"
                          : "border-[var(--border)] text-[var(--slate)]"}`}>
                <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                {name}
                {done ? <span aria-hidden="true">&#10003;</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {blocker ? (
        <p className="panel p-4 text-sm text-[var(--slate)]">{blocker}</p>
      ) : null}

      {stage === "Describe" ? (
        <section className="panel grid gap-4 p-5">
          <Field label="Name" problem={problems.name}>
            <input className="control" value={draft.name} placeholder="Payments API"
                   onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="What this specification covers" problem={problems.description}>
            <textarea className="control min-h-24 font-sans text-sm"
                      value={draft.description}
                      placeholder="The public payments interface that merchant integrations settle against."
                      onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Where it is published" hint="Optional, and recorded as a reference only.
                       A URL proves nothing about what was assessed; the document below does.">
            <input className="control" value={draft.sourceReference}
                   placeholder="https://docs.example.com/payments/v2"
                   onChange={(e) => set("sourceReference", e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary"
                    disabled={Boolean(problems.name || problems.description)}
                    onClick={() => setStage("Baseline")}>
              Next
            </button>
          </div>
        </section>
      ) : null}

      {stage === "Baseline" ? (
        <section className="panel grid gap-4 p-5">
          <Field label="Baseline version" problem={problems.baselineVersion}>
            <input className="control max-w-40 font-mono" value={draft.baselineVersion}
                   placeholder="2.4" onChange={(e) => set("baselineVersion", e.target.value)} />
          </Field>
          <Field label="The baseline document" problem={problems.baselineContent}
                 hint="Stored whole, not just its hash. A URL serves whatever it serves tomorrow;
                       what is stored here is what every assessment is read against.">
            <textarea className="control" value={draft.baselineContent}
                      placeholder="Paste the specification as it stands today"
                      onChange={(e) => set("baselineContent", e.target.value)} />
          </Field>
          {hash ? (
            <p className="text-xs text-[var(--slate)]">
              This hashes to <span className="mono">{shortDigest(hash)}</span>. The contract
              computes it again and refuses the registration if they differ.
            </p>
          ) : null}
          <div className="flex justify-between">
            <button type="button" className="btn" onClick={() => setStage("Describe")}>Back</button>
            <button type="button" className="btn btn-primary"
                    disabled={Boolean(blocker || problems.baselineContent
                                      || problems.baselineVersion) || running}
                    onClick={() => void register()}>
              {specId ? "Registered" : "Register the specification"}
            </button>
          </div>
          <TxPanel state={tx} done="Registered. Now add the requirements." />
        </section>
      ) : null}

      {stage === "Requirements" ? (
        <section className="grid gap-3">
          <p className="text-sm text-[var(--slate)]">
            Each requirement is judged on its own, so write one testable sentence per line of
            dependence. These are the criteria a proposed change will be read against.
          </p>
          {requirements.map((requirement, index) => {
            const id = requirement.id.trim().toUpperCase();
            const isAdded = added.includes(id);
            return (
              <div key={index} className="panel grid gap-3 p-4">
                <div className="flex flex-wrap gap-3">
                  <Field label="Id" problem={problems[`req${index}`]}>
                    <input className="control max-w-36 font-mono" value={requirement.id}
                           placeholder="PAY-001" disabled={isAdded}
                           onChange={(e) => setRequirements((list) => list.map((r, i) =>
                             i === index ? { ...r, id: e.target.value } : r))} />
                  </Field>
                  <Field label="Severity">
                    <select className="control max-w-40" value={requirement.severity}
                            disabled={isAdded}
                            onChange={(e) => setRequirements((list) => list.map((r, i) =>
                              i === index ? { ...r, severity: e.target.value } : r))}>
                      {SEVERITIES.map((value) => (
                        <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>
                      ))}
                    </select>
                  </Field>
                  {isAdded ? (
                    <span className="chip chip-compatible self-end">
                      <span aria-hidden="true">&#10003;</span> On the record
                    </span>
                  ) : null}
                </div>
                <Field label="What must hold" problem={problems[`req${index}s`]}>
                  <textarea className="control min-h-20 font-sans text-sm"
                            value={requirement.statement} disabled={isAdded}
                            placeholder="The transaction_id field must be present in every successful payment response."
                            onChange={(e) => setRequirements((list) => list.map((r, i) =>
                              i === index ? { ...r, statement: e.target.value } : r))} />
                </Field>
                {!isAdded && id && requirement.statement.trim() ? (
                  <div className="flex justify-end">
                    <button type="button" className="btn"
                            disabled={Boolean(blocker) || running || !specId}
                            onClick={() => void addRequirement(requirement)}>
                      Add this requirement
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className="btn"
                    onClick={() => setRequirements((list) => [...list,
                      { id: "", statement: "", severity: "MAJOR" }])}>
              Another requirement
            </button>
            <button type="button" className="btn btn-primary"
                    disabled={added.length === 0 || outstanding.length > 0 || running}
                    onClick={() => setStage("Freeze")}>
              {outstanding.length > 0
                ? `${outstanding.length} still to add`
                : `Freeze ${added.length} requirement${added.length === 1 ? "" : "s"}`}
            </button>
          </div>
          <TxPanel state={tx} />
        </section>
      ) : null}

      {stage === "Freeze" ? (
        <section className="panel grid gap-4 p-5">
          <div>
            <h2>Freeze the criteria</h2>
            <p className="lede mt-1 text-sm">
              After this, {added.length} requirement{added.length === 1 ? "" : "s"} and the
              baseline are fixed. Nothing can edit them: not this console, not the contract
              owner, because there is not one.
            </p>
          </div>
          <ul className="grid gap-2">
            {added.map((id) => {
              const requirement = requirements.find((r) => r.id.trim().toUpperCase() === id);
              return (
                <li key={id} className="flex gap-3 rounded-[6px] bg-[var(--paper)] p-3 text-sm">
                  <span className="mono text-xs">{id}</span>
                  <span className="min-w-0 flex-1">{requirement?.statement}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between">
            <button type="button" className="btn" onClick={() => setStage("Requirements")}>
              Back
            </button>
            <button type="button" className="btn btn-primary"
                    disabled={Boolean(blocker) || running || !specId}
                    onClick={() => void freeze()}>
              Freeze it
            </button>
          </div>
          <TxPanel state={tx} done="Frozen. This specification can now be assessed." />
        </section>
      ) : null}
    </div>
  );
}

async function currentAccount(provider: { request: (a: { method: string }) => Promise<unknown> }) {
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  return accounts?.[0] ?? "";
}

function Field({ label, hint, problem, children }: {
  label: string; hint?: string; problem?: string; children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--slate)]">{hint}</span> : null}
      {problem ? (
        <span className="text-xs text-[var(--breaking-ink)]">{problem}</span>
      ) : null}
    </div>
  );
}
