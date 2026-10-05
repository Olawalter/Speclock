# Deploying and verifying

What is deployed, how to deploy it again, how to check the chain holds this
source, and the four traps this environment sets. Each trap below cost real
time to find; none of them is in any document you would read first.

## What is deployed now

| | |
| --- | --- |
| Network | GenLayer Studio Next, chain `61997` |
| RPC | `https://studio-dev.genlayer.com/api` |
| Contract | `0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9` |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| Bytes on chain | `sha256:e18a2b6dbfa4be84…`, identical to `contracts/speclock.py` |

The machine-readable record is [deployment.json](deployment.json), written by
the deploy script rather than typed.

## The trap worth reading first: the runner is per network

Two GenLayer networks that look interchangeable are not. They serve different
runner generations, and a contract pinned to one is refused by the other with
`invalid_contract` -- not a version warning, a flat refusal.

| Network | Chain | Runner | API |
| --- | --- | --- | --- |
| Studio Next | `61997` | `py-genlayer:5jycge4q…g2qng` | v0.3: `gl.contract.Contract`, `gl.storage.TreeMap`, `gl.public.view` |
| StudioNet | `61999` | `py-genlayer:1jb45aa8…09h6` | v0.2: `from genlayer import *`, bare `TreeMap`, `gl.Contract` |

SPECLOCK targets Studio Next and is written against v0.3. The deploy script
reads the pin out of the contract's own first line and refuses to send bytes
pinned to a runner the configured chain does not serve, because a contract that
deploys and then cannot execute is a worse outcome than a refusal.

## Prerequisites

```bash
python -m pip install -r requirements-dev.txt
python -m pip install --user --force-reinstall --no-deps genvm-linter==0.11.1rc2
```

```bash
cd scripts && npm install
```

Node 22.12 or newer. Python 3.11 or newer.

## Lint, then test, then deploy

```bash
genvm-lint check contracts/speclock.py --json
python -m pytest tests/direct -q
python deploy/mutate.py
```

```bash
cd scripts && node deploy.mjs
```

The deploy script funds a throwaway account from the simulator faucet, sends the
committed source, waits for the receipt, then reads the contract back off the
chain with `gen_getContractCode` and compares it byte for byte with the file it
sent. It writes `docs/deployment.json` naming the commit the bytes came from, so
the claim can be checked rather than believed.

Nothing in SPECLOCK depends on a key only the author holds. The deployer keeps
nothing: there is no owner field, no admin role and no upgrade path, so the
address that deploys the contract can do no more afterwards than anybody else.
No private key is read from a file, committed, or printed.

## Verifying a deployment you did not do

```bash
cd scripts && node deploy.mjs --verify 0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9
```

```bash
genlayer code --address 0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9 --rpc https://studio-dev.genlayer.com/api
genlayer schema --address 0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9 --rpc https://studio-dev.genlayer.com/api
```

The first proves the deployed bytes hash to what this repository contains. The
second lists the methods the chain will actually answer, which is the honest way
to check that a console is not reading a contract that no longer exists.

## Driving it end to end

```bash
cd scripts && node live.mjs --address 0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9
```

Three funded accounts -- a publisher, an integrator and a stranger -- register a
specification, fail to subvert it, freeze it, and submit four proposed versions.
The suite **asserts**: a wrong verdict, a missing refusal, a finding against a
requirement that was not frozen or a decisive answer with nothing quoted behind
it fails the run. It writes `docs/live.json`, and
[END-TO-END.md](../END-TO-END.md) is generated from that record:

```bash
python deploy/report.py
```

It costs real consensus rounds on a shared network, so expect a few minutes.

## The console

```bash
cd web && npm install && npm run dev
```

No setup step: `web/.env` is committed and already names the deployed contract.

```
NEXT_PUBLIC_GENLAYER_NETWORK=studio-next
NEXT_PUBLIC_CHAIN_ID=61997
NEXT_PUBLIC_SPECLOCK_CONTRACT_ADDRESS=0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9
```

None of that is a secret -- the address is in the README and in the deployment
record -- and a console that needs an undocumented step before it shows anything
is a console nobody runs. To point it somewhere else, put the same names in
`web/.env.local`, or set them as real environment variables; both take
precedence and neither is committed. `deploy/check_records.py` fails if the
committed default stops naming the contract the deployment record describes, so
it cannot quietly go stale.

There is no server-side secret and no backend, so there is nothing else to set.
A missing or malformed address is reported as a configuration problem on the
page rather than producing an empty list that looks like an empty chain.

Deploying the console somewhere: the address is read at **build** time, so a new
contract means committing the new default (or setting the variable in the host)
and rebuilding. A redeploy that skips the rebuild serves a console pointed at
the previous contract, which looks exactly like a working console answering
about nothing.

## The remaining traps

### genlayer-py cannot deploy to Studio Next

Version 0.16.3 fails with an undetailed `Transaction failed` -- the same message
for a minimal contract as for this one, which is what makes it expensive to
diagnose. The command-line tooling therefore uses **genlayer-js 2.0.0-rc.1**,
the same SDK the console uses, so the scripts and the browser agree about the
chain, the transaction lifecycle and what a receipt means.

Use the release candidate deliberately: stable 1.1.8 has no `studioDevnet`
export at all, so there is no chain definition to start from.

### An honest fee estimate is refused

Studio Next prices consensus at zero, so `estimateTransactionFees` can legally
return `feeValue: 0` -- and the chain then refuses the transaction with
`FeeValueMustBeNonZero`. A correct estimate produces an unsendable transaction.

The estimate is still the mechanism; `scripts/lib.mjs` floors it at `10^15` wei
and never replaces a larger real estimate with the floor.

### genvm-linter 0.11.0 cannot see a v0.6 bundle

It looks for a per-runner `.tar` and genvm-manager v0.6 bundles ship `.zip`, so
`validate` fails for a runner the bundle demonstrably contains. Install
`0.11.1rc2`, and note that a plain `pip install` silently keeps the old version
-- it needs `--force-reinstall --no-deps`.

While there: the linter's `E010` says every `gl.nondet.*` call must be reachable
from an entry-point block, and its call graph follows `self.method()` but not a
sibling closure. That is why evaluation is a method on the contract rather than
a nested function.

### A Windows checkout deploys different bytes

Git converts line endings on checkout, so the same commit can produce a file
with CRLF on one machine and LF on another. The deploy script reads the file and
sends exactly what it read, which means "byte-identical to the deployed bytes"
can hold on the machine that deployed it and nowhere else — and it fails, loudly
and correctly, the first time anybody checks it out on Linux.

Pinned in two places on purpose: `.gitattributes` keeps every text file LF in
the working tree on every platform, and the deploy script normalises line
endings before it hashes or sends anything. `deploy/check_records.py` says so by
name rather than reporting a hash mismatch and letting somebody conclude the
contract changed.

### `latest-final` does not contain what you just wrote

A write is accepted long before it is finalized, so reading the finalized state
immediately after one shows nothing and looks like a failed write. Every read in
the console and the scripts says which it wants:

- `latest-nonfinal` -- the newest accepted state, for anything just submitted;
- `latest-final` -- settled, for the one place that claims finality.

The console asks both for the same assessment and derives the "Finalized" chip
from whether the finalized view answers, which is the only honest way to show it:
the contract cannot record the hash of the transaction that created its own
record.

## Rate limits

The studio RPC rate-limits `gen_call` per IP, and that budget is shared with
transaction sends. The scripts retry transport failures and rate limits -- which
say nothing about the request -- and never retry a real answer, including a real
error. Retrying until a contract agrees with you is not verification.
