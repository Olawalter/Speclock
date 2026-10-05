/**
 * Deploy SPECLOCK to Studio Next and prove the chain holds this source.
 *
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --verify 0x...   (checks an address, deploys nothing)
 *
 * Deploys the committed contract from a throwaway faucet-funded account, waits
 * for the transaction, then reads the contract back off the chain and compares
 * it byte for byte with the file that was sent. The record it writes names the
 * commit the bytes came from, so a reader can check the claim rather than take
 * it on trust.
 *
 * The deployer keeps nothing: SPECLOCK has no owner field and no privileged
 * account, so the address that deploys it can do no more afterwards than anyone.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { CHAIN_ID, EXPLORER, RPC, RUNNER, chain, client, fees, funded, refusal, rpc,
         votesOf, waitFor } from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SOURCE = join(ROOT, "contracts", "speclock.py");
const RECORD = join(ROOT, "docs", "deployment.json");

const say = (line) => process.stdout.write(`${line}\n`);

function commit() {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "";
  }
}

/** What the chain returns for gen_getContractCode: base64, not hex, not raw. */
function contractBytes(answer) {
  const text = String(answer ?? "");
  if (text.startsWith("0x")) return Buffer.from(text.slice(2), "hex");
  return Buffer.from(text, "base64");
}

/**
 * Check an address somebody else deployed, without deploying anything.
 *
 * This is the half of the claim that matters to a reader: the repository says
 * the chain holds these bytes, and this is how that is checked rather than
 * believed. It sends no transaction and needs no funded account, so anybody can
 * run it against the published address.
 */
async function verify(address, code, digest) {
  const raw = contractBytes(await rpc("gen_getContractCode", [address]));
  const onchain = createHash("sha256").update(raw).digest("hex");
  const identical = onchain === digest;
  say(`on-chain  ${raw.length} bytes  sha256 ${onchain}`);
  say(`verdict   ${identical ? "MATCH: the chain holds this source"
                             : "DIFFERENT: the chain holds something else"}`);

  const schema = await rpc("gen_getContractSchema", [address]);
  const methods = Object.keys(schema?.methods ?? {}).sort();
  say(`methods   ${methods.length}: ${methods.join(", ")}`);

  // A record that disagrees with the chain is worse than no record, so say so
  // rather than letting a stale file keep making a claim.
  try {
    const record = JSON.parse(readFileSync(RECORD, "utf-8"));
    if (record.contract_address?.toLowerCase() === address.toLowerCase()) {
      const agrees = record.onchain_sha256 === onchain;
      say(`record    ${relative(ROOT, RECORD)} ${agrees ? "agrees" : "DISAGREES with the chain"}`);
      if (!agrees) return 1;
    } else {
      say(`record    ${relative(ROOT, RECORD)} is about a different address`);
    }
  } catch {
    say("record    none to compare against");
  }
  return identical ? 0 : 1;
}

async function main() {
  // Normalised to LF before it is hashed or sent. A Windows checkout can hand
  // back the same file with CRLF, which deploys bytes that hash differently
  // from the ones in the repository -- so "byte-identical to the deployed
  // bytes" would hold on the machine that deployed it and nowhere else. The
  // repository pins this too (.gitattributes), and this is the second lock.
  const code = readFileSync(SOURCE, "utf-8").replace(/\r\n/g, "\n");
  const digest = createHash("sha256").update(code, "utf-8").digest("hex");
  const head = commit();
  say(`source    ${relative(ROOT, SOURCE)} @ ${head.slice(0, 12) || "uncommitted"}  `
      + `${Buffer.byteLength(code, "utf-8")} bytes  sha256 ${digest}`);

  const at = process.argv.indexOf("--verify");
  if (at > 0) {
    const address = process.argv[at + 1];
    if (!address?.startsWith("0x")) {
      say("pass an address: node deploy.mjs --verify 0x...");
      return 1;
    }
    say(`address   ${address} (verifying only; nothing is deployed)`);
    return verify(address, code, digest);
  }

  const pinned = code.split('"')[3];
  if (pinned !== RUNNER) {
    say(`the contract pins ${pinned}, but this network runs ${RUNNER}`);
    return 1;
  }

  const account = await funded("deployer");
  say(`deployer  ${account.address} (throwaway, faucet-funded, no privileges in the contract)`);

  const gl = client(account);
  const tx = await gl.deployContract({ code, args: [], fees: await fees(gl) });
  const hash = typeof tx === "string" ? tx : tx?.hash ?? String(tx);
  say(`submitted ${hash}`);

  const accepted = await waitFor(gl, hash, "decided", { interval: 5000, retries: 300 });
  const leader = accepted?.consensus_data?.leader_receipt?.[0] ?? {};
  const address = accepted?.data?.contract_address
    ?? accepted?.tx_data_decoded?.contract_address
    ?? accepted?.contract_address;
  say(`accepted  ${accepted?.status_name ?? accepted?.status} ${accepted?.result_name ?? ""}  `
      + `execution ${leader.execution_result ?? "?"}  votes ${JSON.stringify(votesOf(accepted))}`);
  if ((leader.execution_result && leader.execution_result !== "SUCCESS") || !address) {
    say(`the deployment was refused: ${refusal(accepted).slice(0, 300)}`);
    return 1;
  }
  say(`address   ${address}`);

  // The record says what was watched, not what was seen first: writing ACCEPTED
  // while this script has just watched the transaction finalize puts a weaker
  // claim in the file than the evidence supports.
  let finality = "ACCEPTED";
  try {
    await gl.waitForTransactionReceipt({ hash, waitUntil: "finalized", interval: 10000,
                                         retries: 120 });
    finality = "FINALIZED";
    say("finalized FINALIZED");
  } catch {
    say("finalized not yet; the address is usable and finality follows");
  }

  const raw = contractBytes(await rpc("gen_getContractCode", [address]));
  const onchain = createHash("sha256").update(raw).digest("hex");
  const identical = onchain === digest;
  say(`on-chain  ${raw.length} bytes  sha256 ${onchain}  ${identical ? "MATCH" : "DIFFERENT"}`);

  const schema = await rpc("gen_getContractSchema", [address]);
  const methods = Object.keys(schema?.methods ?? {}).sort();

  mkdirSync(dirname(RECORD), { recursive: true });
  writeFileSync(RECORD, `${JSON.stringify({
    network: "GenLayer Studio Next", chain_id: CHAIN_ID, rpc: RPC,
    explorer: `${EXPLORER}/address/${address}`,
    contract_address: address, deploy_tx: hash,
    deploy_status: finality, deploy_accepted_as: accepted?.status_name ?? null,
    deploy_consensus: accepted?.result_name ?? null,
    source: "contracts/speclock.py", source_commit: head,
    source_sha256: digest, source_bytes: Buffer.byteLength(code, "utf-8"),
    onchain_sha256: onchain, byte_identical: identical,
    genvm_runner: RUNNER, methods,
    deployed_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  }, null, 2)}\n`, "utf-8");
  say(`record    ${relative(ROOT, RECORD)}`);

  say("");
  say("console environment (web/.env.local):");
  say("NEXT_PUBLIC_GENLAYER_NETWORK=studio-next");
  say(`NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}`);
  say(`NEXT_PUBLIC_SPECLOCK_CONTRACT_ADDRESS=${address}`);
  return identical ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((problem) => {
  console.error(problem?.stack ?? String(problem));
  process.exit(1);
});
