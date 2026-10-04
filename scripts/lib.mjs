/**
 * Chain settings, a JSON-RPC transport, and the throwaway accounts every
 * SPECLOCK script runs as.
 *
 * genlayer-py 0.16.3 cannot deploy to Studio Next -- it fails with an
 * undetailed "Transaction failed" even for a minimal contract -- so the command
 * line tooling uses genlayer-js, the same SDK the console uses. That is an
 * improvement rather than a workaround: the scripts and the browser now agree
 * about the chain, the transaction lifecycle and what a receipt means.
 */
import { createClient, createAccount } from "genlayer-js";
import { studioDevnet } from "genlayer-js/chains";

export const RPC = process.env.GENLAYER_RPC_URL ?? "https://studio-dev.genlayer.com/api";
export const CHAIN_ID = 61997;
export const EXPLORER = "https://explorer-studio-dev.genlayer.com";
export const RUNNER = "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng";

export const chain = {
  ...studioDevnet,
  id: CHAIN_ID,
  name: "GenLayer Studio Next",
  rpcUrls: { default: { http: [RPC] } },
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One JSON-RPC call. Transport failures and the rate limiter are retried
 * because neither says anything about the request; a real answer, including a
 * real error, comes back as it is. Retrying until a contract agrees with you is
 * not verification.
 */
export async function rpc(method, params) {
  let last;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(RPC, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // not decoration: the studio endpoints answer some requests
          // differently without a browser-like agent
          "user-agent": "Mozilla/5.0 speclock-scripts",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const text = await response.text();
      if (text.trimStart().startsWith("<")) throw new Error(`HTTP ${response.status} returned html`);
      const json = JSON.parse(text);
      if (json?.error?.code === -32029 || /rate limit/i.test(json?.error?.message ?? "")) {
        await sleep(20000);
        continue;
      }
      if (json?.error) throw new Error(`${method}: ${JSON.stringify(json.error).slice(0, 300)}`);
      return json.result;
    } catch (problem) {
      last = problem;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw last ?? new Error(`${method}: gave up`);
}

/** A funded throwaway account. Nothing here depends on a wallet only the author holds. */
export async function funded(label = "account") {
  const account = createAccount();
  await rpc("sim_fundAccount", [account.address, 1000000000000000000n.toString()]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const balance = await rpc("eth_getBalance", [account.address, "latest"]);
    if (BigInt(balance ?? 0) > 0n) return account;
    await sleep(1500);
  }
  throw new Error(`${label} was never funded`);
}

/**
 * A fee the network will accept, measured rather than invented.
 *
 * The estimate is the real mechanism and it is what gets used. The floor exists
 * because Studio Next prices consensus at zero, so an honest estimate can come
 * back as zero feeValue and the chain then refuses the transaction with
 * FeeValueMustBeNonZero -- a correct estimate producing an unsendable
 * transaction. The floor is the smallest value that clears that, and it never
 * replaces a real estimate that is larger.
 */
export const FEE_FLOOR = 10n ** 15n;

export async function fees(gl, write) {
  let estimate = null;
  if (write) {
    try {
      estimate = await gl.estimateTransactionFeesForWrite(write);
    } catch (problem) {
      // A write the contract would refuse cannot be simulated, so the estimate
      // fails with "execution failed". That write still goes out, on plain
      // fees, and its refusal is recorded on chain like any other.
      const text = `${problem?.details ?? ""} ${problem?.message ?? problem}`;
      if (!/execution failed/i.test(text)) throw problem;
    }
  }
  if (!estimate) estimate = await gl.estimateTransactionFees();
  const feeValue = estimate.feeValue > FEE_FLOOR ? estimate.feeValue : FEE_FLOOR;
  const out = { distribution: estimate.distribution, feeValue };
  if (estimate.messageAllocations?.length) out.messageAllocations = estimate.messageAllocations;
  return out;
}

export function client(account) {
  return createClient({ chain, account });
}

export const short = (value) => `${String(value).slice(0, 10)}...`;

/** Pull the readable reason out of a refused transaction. */
export function refusal(receipt) {
  const leader = receipt?.consensus_data?.leader_receipt?.[0] ?? {};
  const payload = leader?.result?.payload ?? leader?.result ?? "";
  return typeof payload === "string" ? payload : JSON.stringify(payload ?? "").slice(0, 300);
}

export function votesOf(receipt) {
  const votes = Object.values(receipt?.consensus_data?.votes ?? {});
  return votes.reduce((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
}
