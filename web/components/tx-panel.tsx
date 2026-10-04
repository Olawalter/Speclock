"use client";

import { explorerTx } from "@/lib/config/env";
import { LIFECYCLE_WORDS, words } from "@/lib/format/present";
import { isRunning, type Phase, type TxState } from "@/lib/genlayer/transaction";

/**
 * What is happening to a transaction, told honestly.
 *
 * The ladder stops at `accepted` and `finalized` as two separate rungs, because
 * they are two separate facts. A console that collapses them tells somebody a
 * result is permanent while the network is still deciding, which is the one
 * claim this product cannot afford to get wrong.
 */
const LADDER: Phase[] = ["signing", "submitted", "pending", "accepted", "finalized"];

const EXPLAIN: Partial<Record<Phase, string>> = {
  pending: "Each validator is reading the documents against the frozen requirements on its own.",
  accepted: "The decision exists and can be read. Finality follows and is shown separately.",
  finalized: "Settled on the network. Reloading this page reads it back from the chain.",
};

export function TxPanel({ state, done }: { state: TxState; done?: string }) {
  if (state.phase === "idle") return null;

  const reached = LADDER.indexOf(state.phase === "finalizing" ? "accepted" : state.phase);
  const failed = state.phase === "failed";

  return (
    <div className="panel p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-[540]">
          {failed ? "This did not go through" : words(LIFECYCLE_WORDS, state.phase)}
        </span>
        {isRunning(state) ? (
          <span className="chip chip-pending">Working</span>
        ) : null}
        {state.hash ? (
          <a className="mono ml-auto text-xs underline decoration-dotted underline-offset-2"
             href={explorerTx(state.hash)} target="_blank" rel="noreferrer">
            {state.hash.slice(0, 12)}&hellip;
          </a>
        ) : null}
      </div>

      {!failed ? (
        <ol className="mt-3 grid gap-1.5">
          {LADDER.map((rung, index) => {
            const at = index === reached;
            const past = index < reached;
            return (
              <li key={rung} className="flex items-start gap-2 text-xs">
                <span aria-hidden="true"
                      className={past || at ? "text-[var(--graphite)]" : "text-[var(--border)]"}>
                  {past ? "✓" : at ? "•" : "○"}
                </span>
                <span className={past || at ? "" : "text-[var(--slate)]"}>
                  <span className={at ? "font-[540]" : ""}>
                    {words(LIFECYCLE_WORDS, rung)}
                  </span>
                  {at && EXPLAIN[rung] ? (
                    <span className="block text-[var(--slate)]">{EXPLAIN[rung]}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {state.votes && Object.keys(state.votes).length > 0 ? (
        <p className="mt-3 text-xs text-[var(--slate)]">
          Validators:{" "}
          {Object.entries(state.votes).map(([vote, count]) => `${count} ${vote}`).join(", ")}
        </p>
      ) : null}

      {state.refusal ? (
        <p className="mt-3 rounded-[6px] bg-[var(--breaking)] p-3 text-xs
                      text-[var(--breaking-ink)]">
          The contract refused this and the validators agreed about the refusal:{" "}
          <span className="mono">{state.refusal}</span>
        </p>
      ) : null}

      {state.message && !state.refusal ? (
        <p className={`mt-3 text-xs ${failed ? "text-[var(--breaking-ink)]"
                                             : "text-[var(--slate)]"}`}>
          {state.message}
        </p>
      ) : null}

      {state.phase === "finalized" && done ? (
        <p className="mt-3 text-xs text-[var(--compatible-ink)]">{done}</p>
      ) : null}
    </div>
  );
}
