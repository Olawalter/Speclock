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

/**
 * Does this failure say anything about the request?
 *
 * A dropped socket, a gateway, a rate limiter: none of these are the chain's
 * answer, and the studio endpoint produces them often enough that a long run
 * will meet one. A real error -- a refusal, a bad argument -- is not in here,
 * because retrying until a contract agrees with you is not verification.
 */
const TRANSPORT =
  /fetch failed|other side closed|socket hang up|UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network error|rate limit|\b50[234]\b/i;

export function isTransport(problem) {
  const seen = [problem?.message, problem?.details, problem?.shortMessage,
                problem?.cause?.code, problem?.cause?.message,
                problem?.cause?.cause?.code, problem?.cause?.cause?.message];
  return TRANSPORT.test(seen.filter(Boolean).join(" "));
}

/** Retry a read-only call, but only while the failure says nothing about it. */
export async function resilient(label, work, attempts = 6) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (problem) {
      if (!isTransport(problem)) throw problem;
      last = problem;
      await sleep(4000 * (attempt + 1));
    }
  }
  throw new Error(`${label}: the transport kept failing: ${last?.message ?? last}`);
}

/**
 * Send a write, and retry a lost connection only when the chain shows the
 * previous attempt never arrived.
 *
 * A send that fails in transit is genuinely ambiguous: the request may have
 * reached the node. Blindly retrying would register a second specification or
 * submit a second assessment, so the account's nonce is read either side of the
 * failure. If it moved, the transaction landed and its hash is simply lost --
 * which is worth stopping for, because inventing a second one would put a
 * duplicate on chain and call it a retry.
 */
export async function sendWrite(gl, account, write) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const before = await nonce(account.address);
    try {
      return await gl.writeContract({ ...write, fees: await fees(gl, write) });
    } catch (problem) {
      if (!isTransport(problem)) throw problem;
      await sleep(5000);
      if (await nonce(account.address) !== before) {
        throw new Error(
          `the connection dropped while sending ${write.functionName} and the account's nonce `
          + "moved, so the transaction did reach the chain; its hash is lost. Retrying would "
          + "send it a second time, so this run stops here. Start it again.");
      }
    }
  }
  throw new Error(`${write.functionName}: the transport kept failing before the send landed`);
}

async function nonce(address) {
  return BigInt(await rpc("eth_getTransactionCount", [address, "latest"]) ?? 0);
}

/**
 * Wait for a transaction, in the words the SDK uses now.
 *
 * `decided` is consensus reaching an answer, which includes a refusal the
 * validators agreed about; `finalized` is that answer settling. They are
 * different facts and nothing here collapses them into one.
 */
export async function waitFor(gl, hash, until = "decided", { interval = 4000,
                                                             retries = 300 } = {}) {
  return resilient(`waiting for ${short(hash)} to be ${until}`,
                   () => gl.waitForTransactionReceipt({ hash, waitUntil: until,
                                                        interval, retries }));
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
