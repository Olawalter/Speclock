"""Deploy SPECLOCK to Studio Next and prove the chain holds this source.

    python deploy/deploy.py

Deploys the committed contract from a throwaway faucet-funded account, waits for
the transaction, then reads the contract back off the chain and compares it byte
for byte with the file that was sent. The record it writes says which commit the
bytes came from, so a reader can check the claim rather than take it.

The deployer keeps nothing. SPECLOCK has no owner field and no privileged
account: the address that deploys it can do no more afterwards than anybody else.
"""
import base64
import hashlib
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import network                                                      # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "speclock.py"
RECORD = ROOT / "docs" / "deployment.json"


def say(line: str) -> None:
    print(line, flush=True)


def commit() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
                             text=True, check=True)
        return out.stdout.strip()
    except Exception:
        return ""


def contract_bytes(answer) -> bytes:
    """What the chain returns for gen_getContractCode.

    Studio hands this back base64, not hex and not raw. A comparison that skips
    this decodes nothing and reports a correct deployment as different.
    """
    if isinstance(answer, (bytes, bytearray)):
        return bytes(answer)
    text = str(answer or "")
    if text.startswith("0x"):
        return bytes.fromhex(text[2:])
    return base64.b64decode(text)


def main() -> int:
    from eth_account import Account
    from genlayer_py import create_client
    from genlayer_py.types import TransactionStatus

    code = SOURCE.read_text(encoding="utf-8")
    digest = hashlib.sha256(code.encode("utf-8")).hexdigest()
    head = commit()
    say(f"source    {SOURCE.relative_to(ROOT)} @ {head[:12] or 'uncommitted'}  "
        f"{len(code.encode('utf-8'))} bytes  sha256 {digest}")

    runner = code.split('"')[3]
    if runner != network.RUNNER:
        say(f"the contract pins {runner}, but this network runs {network.RUNNER}")
        return 1

    account = Account.create()
    say(f"deployer  {account.address} (throwaway, faucet-funded, no privileges in the contract)")
    network.fund(account.address)
    client = create_client(chain=network.chain(), account=account)

    tx = client.deploy_contract(code=code, args=[])
    tx_hex = tx if isinstance(tx, str) else "0x" + bytes(tx).hex()
    say(f"submitted {tx_hex}")

    receipt = client.wait_for_transaction_receipt(transaction_hash=tx,
                                                  status=TransactionStatus.ACCEPTED,
                                                  interval=5000, retries=300)
    leader = ((receipt.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
    execution = leader.get("execution_result")
    address = (receipt.get("data") or {}).get("contract_address") or receipt.get("contract_address")
    if not address:
        address = ((receipt.get("tx_data_decoded") or {}).get("contract_address"))
    say(f"accepted  {receipt.get('result_name')}  execution {execution}  address {address}")
    if execution not in (None, "SUCCESS") or not address:
        print(f"the deployment was refused: {str(leader.get('result'))[:300]}", file=sys.stderr)
        return 1

    # The record says what was watched, not what was seen first: writing
    # ACCEPTED while the script has just watched the transaction finalize puts a
    # weaker claim in the file than the evidence supports.
    finality = "ACCEPTED"
    try:
        client.wait_for_transaction_receipt(transaction_hash=tx,
                                            status=TransactionStatus.FINALIZED,
                                            interval=10000, retries=120)
        finality = "FINALIZED"
        say("finalized FINALIZED")
    except Exception:
        say("finalized not yet; the address is usable and finality follows")

    raw = contract_bytes(network.rpc("gen_getContractCode", [address]))
    onchain = hashlib.sha256(raw).hexdigest()
    identical = onchain == digest
    say(f"on-chain  {len(raw)} bytes  sha256 {onchain}  {'MATCH' if identical else 'DIFFERENT'}")

    schema = network.rpc("gen_getContractSchema", [address])
    methods = sorted((schema or {}).get("methods", {}).keys()) if isinstance(schema, dict) else []

    RECORD.parent.mkdir(parents=True, exist_ok=True)
    RECORD.write_text(json.dumps({
        "network": network.NAME, "chain_id": network.CHAIN_ID, "rpc": network.RPC,
        "explorer": f"{network.EXPLORER}/address/{address}",
        "contract_address": address, "deploy_tx": tx_hex,
        "deploy_status": finality, "deploy_accepted_as": receipt.get("status_name"),
        "deploy_consensus": receipt.get("result_name"),
        "source": "contracts/speclock.py", "source_commit": head,
        "source_sha256": digest, "source_bytes": len(code.encode("utf-8")),
        "onchain_sha256": onchain, "byte_identical": identical,
        "genvm_runner": runner, "methods": methods,
        "deployed_at": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ",
                                                   __import__("time").gmtime()),
    }, indent=2) + "\n", encoding="utf-8")
    say(f"record    {RECORD.relative_to(ROOT)}")

    say("")
    say("frontend environment (web/.env.local):")
    say("NEXT_PUBLIC_GENLAYER_NETWORK=studio-next")
    say(f"NEXT_PUBLIC_CHAIN_ID={network.CHAIN_ID}")
    say(f"NEXT_PUBLIC_SPECLOCK_CONTRACT_ADDRESS={address}")
    return 0 if identical else 1


if __name__ == "__main__":
    sys.exit(main())
