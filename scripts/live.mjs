/**
 * SPECLOCK end to end on Studio Next, asserted rather than printed.
 *
 *   node scripts/live.mjs --address 0x...
 *
 * Four proposals against one frozen specification, each exercising a different
 * answer the protocol can give, plus every refusal the contract is supposed to
 * make. Everything is checked against what the contract returns afterwards, and
 * the run writes docs/live.json, which the end-to-end document is generated
 * from. A hash typed by hand is a claim; a hash written by the run is a record.
 *
 * This costs real consensus rounds on a shared network and takes a while.
 */
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { CHAIN_ID, EXPLORER, RPC, chain, client, funded, refusal, resilient, rpc, sendWrite,
         sleep, votesOf, waitFor } from "./lib.mjs";
import { BASELINE, DESCRIPTION, NAME, PROPOSALS, REQUIREMENTS, SOURCE_REFERENCE, VERSION }
  from "./fixtures.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RECORD = join(ROOT, "docs", "live.json");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ADDRESS = arg("--address") ?? process.env.SPECLOCK_CONTRACT_ADDRESS;
const ROUND_ATTEMPTS = 3;

const say = (line) => process.stdout.write(`${line}\n`);
const sha256 = (text) => createHash("sha256").update(text, "utf-8").digest("hex");

const record = {
  network: "GenLayer Studio Next", chain_id: CHAIN_ID, rpc: RPC, contract: ADDRESS,
  started_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  accounts: {}, transactions: [], specification: {}, proposals: {}, walls: {},
};

function check(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/** Send one write and record what the network did with it. */
async function send(who, functionName, args, { step, expectRefusal = false } = {}) {
  const write = { address: ADDRESS, functionName, args };
  const hash = await sendWrite(who.gl, who, write);
  const receipt = await waitFor(who.gl, hash, "decided");
  const leader = receipt?.consensus_data?.leader_receipt?.[0] ?? {};
  const execution = leader.execution_result ?? null;
  const refused = execution !== null && execution !== "SUCCESS";
  const entry = {
    step: step ?? functionName, function: functionName, caller: who.label, tx: hash,
    status: receipt?.status_name ?? receipt?.status ?? null,
    consensus: receipt?.result_name ?? null, execution, votes: votesOf(receipt), refused,
  };
  if (refused) entry.refusal = refusal(receipt).slice(0, 220);
  record.transactions.push(entry);
  say(`  ${entry.step.padEnd(44)} ${String(hash).slice(0, 16)}...  ${entry.status} `
      + `${entry.consensus} ${execution} ${JSON.stringify(entry.votes)}`
      + (refused ? `  REFUSED: ${entry.refusal.slice(0, 90)}` : ""));
  if (!expectRefusal) check(!refused, `${entry.step} was refused: ${entry.refusal ?? ""}`);
  return entry;
}

/**
 * Read the contract.
 *
 * `final` chooses which state to ask for, and the difference is not cosmetic.
 * A run that has just written something and wants to check it must read the
 * newest state, because the write is accepted long before it is finalized and
 * the finalized view does not contain it yet. Durable claims -- what the
 * end-to-end document reports -- are read finalized at the end, once the
 * transactions that produced them have settled.
 */
async function read(functionName, args, { final = false } = {}) {
  const gl = client(undefined);
  return resilient(`reading ${functionName}`, () => gl.readContract({
    address: ADDRESS, functionName, args,
    transactionHashVariant: final ? "latest-final" : "latest-nonfinal" }));
}

/**
 * Submit a proposal, asking again if the panel reaches no majority.
 *
 * A round the validators do not agree about writes nothing and is a real
 * outcome, not an error: it is what the protocol does when a reading is
 * genuinely contested. Anybody may ask again, so this does, a bounded number of
 * times, and keeps every attempt in the record either way.
 */
async function assess(who, specId, proposal) {
  const attempts = [];
  for (let attempt = 1; attempt <= ROUND_ATTEMPTS; attempt += 1) {
    const suffix = attempt === 1 ? "" : `, attempt ${attempt}`;
    const entry = await send(who, "submit_assessment",
                             [specId, proposal.version, proposal.content,
                              sha256(proposal.content)],
                             { step: `submit_assessment [${proposal.key}]${suffix}`,
                               expectRefusal: true });
    attempts.push({ tx: entry.tx, consensus: entry.consensus, votes: entry.votes,
                    refused: entry.refused });
    if (!entry.refused && entry.consensus === "MAJORITY_AGREE") {
      return { entry, attempts };
    }
    if (entry.refused) {
      check(false, `[${proposal.key}] was refused outright: ${entry.refusal}`);
    }
    say(`    -> no majority (${entry.consensus}); nothing was written, asking again`);
    await sleep(4000);
  }
  check(false, `[${proposal.key}]: the panel did not agree in ${ROUND_ATTEMPTS} rounds`);
  return null;
}

async function main() {
  check(ADDRESS, "pass --address 0x... or set SPECLOCK_CONTRACT_ADDRESS");
  say(`SPECLOCK live run against ${ADDRESS}`);

  const publisher = await funded("publisher");
  const integrator = await funded("integrator");
  const stranger = await funded("stranger");
  const parties = {
    publisher: { label: "publisher", gl: client(publisher), address: publisher.address },
    integrator: { label: "integrator", gl: client(integrator), address: integrator.address },
    stranger: { label: "stranger", gl: client(stranger), address: stranger.address },
  };
  record.accounts = Object.fromEntries(
    Object.entries(parties).map(([k, v]) => [k, v.address]));
  say(`  publisher  ${publisher.address}`);
  say(`  integrator ${integrator.address}`);
  say(`  stranger   ${stranger.address}`);

  // ── register and freeze ────────────────────────────────────────────────
  say("\nPHASE register and freeze");
  const registered = await send(parties.publisher, "register_specification",
                                [NAME, DESCRIPTION, VERSION, BASELINE, sha256(BASELINE),
                                 SOURCE_REFERENCE],
                                { step: "register_specification" });
  const listed = await read("list_specifications", [0, 50]);
  const mine = listed.items.filter(
    (row) => String(row.creator).toLowerCase() === publisher.address.toLowerCase());
  check(mine.length === 1, "the publisher's specification was not listed exactly once");
  const specId = mine[0].specification_id;
  say(`  specification ${specId}`);
  record.specification.registered = await read("get_specification", [specId]);
  check(record.specification.registered.baseline_hash === sha256(BASELINE),
        "the contract computed a different baseline hash");

  record.walls.stranger_adds = await send(parties.stranger, "add_requirement",
                                          [specId, "PAY-001", REQUIREMENTS[0][1], "BLOCKING"],
                                          { step: "a stranger adds a requirement (refused)",
                                            expectRefusal: true });
  check(record.walls.stranger_adds.refused, "a stranger was allowed to add a requirement");

  record.walls.hash_mismatch = await send(parties.publisher, "register_specification",
                                          [NAME, DESCRIPTION, VERSION, BASELINE, "0".repeat(64),
                                           SOURCE_REFERENCE],
                                          { step: "register with a hash of something else "
                                                  + "(refused)", expectRefusal: true });
  check(record.walls.hash_mismatch.refused, "a baseline hash that covers nothing was accepted");

  for (const [rid, statement, severity] of REQUIREMENTS) {
    await send(parties.publisher, "add_requirement", [specId, rid, statement, severity],
               { step: `add_requirement ${rid}` });
  }

  record.walls.assess_unfrozen = await send(parties.integrator, "submit_assessment",
                                            [specId, "2.5", PROPOSALS[0].content,
                                             sha256(PROPOSALS[0].content)],
                                            { step: "assess before freezing (refused)",
                                              expectRefusal: true });
  check(record.walls.assess_unfrozen.refused, "an unfrozen specification was assessed");

  record.walls.stranger_freezes = await send(parties.stranger, "freeze_specification", [specId],
                                             { step: "a stranger freezes it (refused)",
                                               expectRefusal: true });
  check(record.walls.stranger_freezes.refused, "a stranger was allowed to freeze");

  await send(parties.publisher, "freeze_specification", [specId],
             { step: "freeze_specification" });
  record.specification.frozen = await read("get_specification", [specId]);
  check(record.specification.frozen.state === "FROZEN", "the specification did not freeze");
  check(record.specification.frozen.criteria_digest.length === 64, "no criteria digest");
  check(record.specification.frozen.requirements.every((r) => r.frozen),
        "a requirement was left unfrozen");

  record.walls.add_after_freeze = await send(parties.publisher, "add_requirement",
                                             [specId, "PAY-009", "A late addition.", "MAJOR"],
                                             { step: "add a requirement after freezing (refused)",
                                               expectRefusal: true });
  check(record.walls.add_after_freeze.refused, "a requirement was added after freezing");

  // ── the proposals ──────────────────────────────────────────────────────
  say("\nPHASE adjudicate");
  for (const proposal of PROPOSALS) {
    const { entry, attempts } = await assess(parties.integrator, specId, proposal);
    const assessments = await read("list_specification_assessments", [specId, 0, 50]);
    const latest = assessments.items[0];
    const findings = await read("get_findings", [latest.assessment_id]);
    say(`    -> ${findings.verdict}: ${findings.summary}`);
    record.proposals[proposal.key] = {
      assessment_id: latest.assessment_id, tx: entry.tx, attempts,
      expected: proposal.expect, assessment: latest, findings,
    };
    check(findings.verdict === proposal.expect,
          `[${proposal.key}] expected ${proposal.expect} and the panel reached ${findings.verdict}`);
    check(findings.items.length === REQUIREMENTS.length,
          `[${proposal.key}] answered ${findings.items.length} of ${REQUIREMENTS.length} `
          + "requirements");
    check(latest.criteria_digest === record.specification.frozen.criteria_digest,
          `[${proposal.key}] points at different criteria than the ones that were frozen`);
    check(latest.proposed_hash === sha256(proposal.content),
          `[${proposal.key}] stored a hash that does not cover the proposal`);
  }

  // ── what the record keeps ──────────────────────────────────────────────
  say("\nPHASE check the record");
  const breaking = record.proposals.breaking;
  check(breaking.findings.items.some((f) => f.effective_status === "VIOLATED"),
        "the breaking change produced no violated requirement");
  const violated = breaking.findings.items.find((f) => f.effective_status === "VIOLATED");
  check((violated.evidence ?? "").length > 0, "a violation was recorded with no evidence");

  const injection = record.proposals.injection;
  check(injection.findings.verdict !== "COMPATIBLE",
        "a document that told the reader what to conclude got what it asked for");

  const proposed = await read("get_proposed", [breaking.assessment_id]);
  check(proposed.content === PROPOSALS.find((p) => p.key === "breaking").content,
        "the proposed document did not come back whole");

  const info = await read("get_protocol_info", []);
  record.protocol_info = info;
  check(info.specification_count >= 1 && info.assessment_count >= PROPOSALS.length,
        "the counters do not reflect this run");

  record.finished_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  mkdirSync(dirname(RECORD), { recursive: true });
  writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  say(`\nrecord    docs/live.json`);
  say(`explorer  ${EXPLORER}/address/${ADDRESS}`);
  say(`\n${record.transactions.length} transactions, `
      + `${Object.keys(record.walls).length} refusals, `
      + `${Object.keys(record.proposals).length} adjudications, every assertion passed`);
  return 0;
}

main().then((code) => process.exit(code)).catch((problem) => {
  record.failed = String(problem?.message ?? problem);
  try {
    mkdirSync(dirname(RECORD), { recursive: true });
    writeFileSync(RECORD, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  } catch { /* the failure matters more than the record of it */ }
  console.error(`\n${problem?.stack ?? String(problem)}`);
  process.exit(1);
});
