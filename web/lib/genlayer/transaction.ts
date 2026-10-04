/**
 * The life of one write, as the protocol actually lives it.
 *
 * The states a transaction passes through on GenLayer and the answer an
 * assessment carries are different things, and this file never conflates them.
 * An accepted proposal is not a finalized one, and the interface says which it
 * is looking at.
 *
 *   wallet -> signing -> submitted -> pending -> accepted -> finalizing -> finalized
 *                                                                      -> failed
 *
 * `accepted` is a real resting place, not a loading state on the way to
 * `finalized`: the decision exists and can be read, and finality follows. The
 * console shows both, because telling somebody a result is permanent before it
 * is would be the one lie this product cannot afford.
 */
import { contractAddress, feesFor } from "@/lib/genlayer/client";
import type { Call } from "@/lib/genlayer/contract";

export type Phase =
  | "idle" | "wallet" | "signing" | "submitted" | "pending"
  | "accepted" | "finalizing" | "finalized" | "failed";

export type TxState = {
  phase: Phase;
  hash?: string;
  message?: string;
  /** The contract's own refusal, when it refused rather than failed. */
  refusal?: string;
  votes?: Record<string, number>;
};

export const initialTx: TxState = { phase: "idle" };

export const isRunning = (state: TxState) =>
  !["idle", "finalized", "failed"].includes(state.phase);

type Client = {
  writeContract: (args: Record<string, unknown>) => Promise<string>;
  waitForTransactionReceipt: (args: Record<string, unknown>) => Promise<Receipt>;
};

type Receipt = {
  status?: string;
  status_name?: string;
  result_name?: string;
  consensus_data?: { votes?: Record<string, string>;
                     leader_receipt?: { execution_result?: string; result?: unknown }[] };
};

function votesOf(receipt: Receipt): Record<string, number> {
  const votes = Object.values(receipt?.consensus_data?.votes ?? {});
  return votes.reduce<Record<string, number>>(
    (acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
}

function refusalOf(receipt: Receipt): string {
  const leader = receipt?.consensus_data?.leader_receipt?.[0];
  const payload = (leader?.result as { payload?: unknown })?.payload ?? leader?.result ?? "";
  return typeof payload === "string" ? payload : JSON.stringify(payload ?? "").slice(0, 300);
}

/**
 * Send one write and follow it the whole way.
 *
 * `onSettled` runs once the decision exists, so a page can show the answer
 * without waiting for finality; finality then arrives as a later phase.
 */
export async function runWrite(
  client: Client,
  call: Call,
  onPhase: (state: TxState) => void,
  options: { onSettled?: (hash: string) => Promise<void> | void } = {},
): Promise<TxState> {
  const address = contractAddress();
  const write = { address, functionName: call.functionName, args: call.args };

  let state: TxState = { phase: "wallet" };
  onPhase(state);

  try {
    const fees = await feesFor(client as never, write);
    state = { phase: "signing" };
    onPhase(state);

    const hash = await client.writeContract({ ...write, fees });
    state = { phase: "submitted", hash };
    onPhase(state);

    state = { ...state, phase: "pending" };
    onPhase(state);

    const accepted = await client.waitForTransactionReceipt({
      hash, status: "ACCEPTED", interval: 4000, retries: 300,
    });
    const execution = accepted?.consensus_data?.leader_receipt?.[0]?.execution_result;
    const votes = votesOf(accepted);

    if (execution && execution !== "SUCCESS") {
      // The contract refused, and the validators agreed about the refusal. That
      // is a recorded outcome, not a transport failure, and it is worth saying
      // so in those words.
      state = { phase: "failed", hash, votes, refusal: refusalOf(accepted),
                message: "The contract refused this, and the validators agreed." };
      onPhase(state);
      return state;
    }

    state = { phase: "accepted", hash, votes };
    onPhase(state);
    if (options.onSettled) await options.onSettled(hash);

    state = { phase: "finalizing", hash, votes };
    onPhase(state);
    try {
      await client.waitForTransactionReceipt({
        hash, status: "FINALIZED", interval: 8000, retries: 150,
      });
      state = { phase: "finalized", hash, votes };
    } catch {
      // Not a failure: the decision stands and finality follows. Saying
      // "finalized" here would be the one claim this product must not make.
      state = { phase: "accepted", hash, votes,
                message: "Accepted. Finality is still settling on the network." };
    }
    onPhase(state);
    return state;
  } catch (problem) {
    const text = String((problem as { message?: string })?.message ?? problem);
    const declined = /user rejected|4001/i.test(text);
    state = {
      phase: "failed",
      hash: state.hash,
      message: declined ? "You declined the transaction in your wallet." : text.slice(0, 300),
    };
    onPhase(state);
    return state;
  }
}
