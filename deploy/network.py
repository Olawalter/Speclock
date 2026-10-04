"""Studio Next, described once so nothing else has to guess.

genlayer-py 0.16.3 ships localnet, studionet and the two asimov/bradbury
testnets, but not Studio Next, so the chain is built here from the values the
network itself reports rather than from memory. `python deploy/network.py`
checks those values against the live endpoint and says so either way.

The two studio networks are easy to confuse and they are not interchangeable:
they serve different GenVM runner generations, and a contract built for one is
refused by the other with `invalid_contract`.
"""
import json
import sys
import time
import urllib.error
import urllib.request

CHAIN_ID = 61997
RPC = "https://studio-dev.genlayer.com/api"
EXPLORER = "https://explorer-studio-dev.genlayer.com"
NAME = "GenLayer Studio Next"

# Pinned, and checked against the deployed bytes on every deploy. Studio Next
# runs the v0.3 generation; the v0.2 runner that StudioNet 61999 serves is
# refused here, and the reverse is also true.
RUNNER = "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"

# A browser user-agent is not decoration: the studio endpoints answer some
# requests differently without one.
HEADERS = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}

RATE_LIMIT = -32029


def rpc(method: str, params: list, *, timeout: int = 90, tries: int = 6):
    """One JSON-RPC call, patient about the rate limiter and nothing else.

    A transport failure is retried because it says nothing about the request. A
    real answer -- including a real error -- is returned as it came, because
    retrying until a contract agrees with you is not verification.
    """
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    last = None
    for attempt in range(tries):
        request = urllib.request.Request(RPC, data=body, headers=HEADERS)
        try:
            answer = json.loads(urllib.request.urlopen(request, timeout=timeout).read())
        except (urllib.error.URLError, TimeoutError, ConnectionError) as problem:
            last = problem
            time.sleep(2 + attempt * 3)
            continue
        error = answer.get("error")
        if isinstance(error, dict) and error.get("code") == RATE_LIMIT:
            time.sleep(10 + attempt * 10)
            continue
        if error:
            raise RuntimeError(f"{method} failed: {error}")
        return answer.get("result")
    raise RuntimeError(f"{method} never answered: {last}")


def chain():
    """The genlayer-py chain object for Studio Next."""
    from genlayer_py.chains import studionet
    import copy
    out = copy.deepcopy(studionet)
    out.id = CHAIN_ID
    out.name = NAME
    out.rpc_urls = {"default": {"http": [RPC]}}
    return out


def fund(address: str, amount: int = 10 ** 18) -> None:
    """Top up a throwaway account from the studio faucet."""
    rpc("sim_fundAccount", [address, amount])


def main() -> int:
    reported = rpc("eth_chainId", [])
    seen = int(str(reported), 16) if str(reported).startswith("0x") else int(reported)
    ok = seen == CHAIN_ID
    print(f"{NAME}")
    print(f"  rpc        {RPC}")
    print(f"  chain id   {seen} ({'matches' if ok else 'DOES NOT MATCH'} the configured {CHAIN_ID})")
    print(f"  runner     {RUNNER}")
    print(f"  explorer   {EXPLORER}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
