/**
 * Two clients, kept apart on purpose.
 *
 * A read client needs no wallet, so anybody can browse finalized specifications
 * and assessments without connecting anything. A write client is built around
 * the wallet the person chose, only when they ask to send something.
 *
 * `LATEST_FINAL` and `LATEST_NONFINAL` are not interchangeable and the
 * difference is not cosmetic. A write is accepted long before it is finalized,
 * so a page following something the person just sent has to read the newest
 * state or it will not see it. Anything presented as settled is read finalized.
 * Getting this backwards once cost a live run here.
 */
import { createClient } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

import { configResult } from "@/lib/config/env";

export const RPC = "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = 61997;

export const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [RPC] } },
};

/** What a read is asking for. */
export const FINAL = "latest-final" as const;
export const NON_FINAL = "latest-nonfinal" as const;

let reader: ReturnType<typeof createClient> | undefined;

export function readClient() {
  if (!reader) reader = createClient({ chain });
  return reader;
}

/** A client bound to the wallet the person connected. Built per use. */
export function writeClient(provider: unknown) {
  return createClient({ chain, account: undefined, provider } as never);
}

export const contractAddress = () =>
  configResult.ok ? configResult.config.contractAddress : "0x";

/**
 * A fee the network will accept, measured and then floored.
 *
 * The estimate is the mechanism and it is used whenever it is larger. The floor
 * is here because Studio Next prices consensus at zero, so an honest estimate
 * returns zero and the chain then refuses the transaction outright with
 * FeeValueMustBeNonZero -- a correct estimate producing an unsendable
 * transaction.
 */
export const FEE_FLOOR = 10n ** 15n;

type Estimate = { distribution?: unknown; feeValue: bigint; messageAllocations?: unknown[] };

export async function feesFor(
  client: ReturnType<typeof createClient>,
  write?: { address: string; functionName: string; args: unknown[] },
) {
  let estimate: Estimate | undefined;
  if (write) {
    try {
      estimate = (await (client as never as {
        estimateTransactionFeesForWrite: (w: unknown) => Promise<Estimate>;
      }).estimateTransactionFeesForWrite(write));
    } catch (problem) {
      // A write the contract would refuse cannot be simulated, so the estimate
      // fails with "execution failed". That write still goes out, on plain
      // fees, and its refusal is recorded on chain like any other.
      const text = String((problem as { message?: string })?.message ?? problem);
      if (!/execution failed/i.test(text)) throw problem;
    }
  }
  if (!estimate) {
    estimate = await (client as never as {
      estimateTransactionFees: () => Promise<Estimate>;
    }).estimateTransactionFees();
  }
  const feeValue = estimate.feeValue > FEE_FLOOR ? estimate.feeValue : FEE_FLOOR;
  const out: Record<string, unknown> = { distribution: estimate.distribution, feeValue };
  if (estimate.messageAllocations?.length) out.messageAllocations = estimate.messageAllocations;
  return out;
}
