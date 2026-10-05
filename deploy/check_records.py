"""Hold the repository to the records it publishes.

    python deploy/check_records.py

The claims in README.md and END-TO-END.md are strong ones: these bytes are on
that chain, those hashes came from that run. A claim like that decays silently
-- the contract gets one more fix, the record keeps describing the version
before it, and nothing fails. This is what notices.

It touches no network. It only checks that the files agree with each other:

- the deployment record describes the contract that is in the repository now;
- the live record is about the contract the deployment record names;
- the published report is still what the live record generates;
- the address the console ships with is the deployed one.
"""
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def main():
    problems = []
    deployment = read("docs/deployment.json")

    source = (ROOT / deployment["source"]).read_bytes()
    digest = hashlib.sha256(source).hexdigest()
    if digest != deployment["source_sha256"]:
        problems.append(
            f"{deployment['source']} hashes to {digest[:16]}..., but the deployment record "
            f"says {deployment['source_sha256'][:16]}...: the contract has changed since it "
            f"was deployed, so nothing may claim the chain holds this source")
    if b"\r\n" in source:
        # Said separately because the hash mismatch above would otherwise be the
        # only clue, and "the contract has changed" is the wrong diagnosis when
        # nothing about it changed except who checked it out.
        problems.append(
            f"{deployment['source']} has CRLF line endings in this checkout, so it hashes "
            f"differently from the LF bytes that were deployed. .gitattributes pins this; "
            f"a working copy created before it was added needs re-checking out")
    if deployment["onchain_sha256"] != digest:
        problems.append(
            "the deployment record's on-chain hash is not this source's hash")
    if not deployment.get("byte_identical"):
        problems.append("the deployment record says the deployment is not byte-identical")

    address = deployment["contract_address"]
    live = read("docs/live.json")
    if live["contract"].lower() != address.lower():
        problems.append(
            f"the live record is about {live['contract']}, but the deployed contract is "
            f"{address}: the published run did not exercise what is deployed")
    if live["chain_id"] != deployment["chain_id"]:
        problems.append("the live record and the deployment record disagree about the chain")

    env = (ROOT / "web" / ".env.example").read_text(encoding="utf-8")
    if address not in env:
        problems.append(
            f"web/.env.example does not carry {address}, so the console ships pointed at "
            f"a different contract")

    # The report is generated. A hash edited by hand in a published report is
    # exactly the kind of quiet falsehood this product exists to catch.
    drift = subprocess.run([sys.executable, str(ROOT / "deploy" / "report.py"), "--check"],
                           cwd=ROOT, capture_output=True, text=True)
    if drift.returncode != 0:
        problems.append(drift.stdout.strip() or "END-TO-END.md has drifted from docs/live.json")

    for problem in problems:
        print(f"PROBLEM  {problem}")
    if problems:
        return 1
    print(f"the records agree: {deployment['source']} is byte-identical to {address} "
          f"on chain {deployment['chain_id']}, and the published report is generated from "
          f"the run against it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
