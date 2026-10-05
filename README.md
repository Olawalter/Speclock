<img src="docs/mark.svg" alt="SPECLOCK" width="420">

# SPECLOCK

**Semantic change adjudication for software specifications.**

> Freeze the requirements an integration depends on. Submit a proposed version.
> Let GenLayer validators decide, separately and then together, whether it still
> holds.

| | |
| --- | --- |
| Network | GenLayer Studio Next, chain `61997` |
| Contract | [`0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9`](https://explorer-studio-dev.genlayer.com/address/0x6744F203A6D17B6Ae2D1d3fE944F5a3e02Bfe2E9) |
| Source | [`contracts/speclock.py`](contracts/speclock.py), byte-identical to the deployed bytes ([record](docs/deployment.json)) |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` |
| Console | `web/`, Next.js App Router, wallet-signed writes, no server of its own |

## The problem

What an integration depends on is rarely the document. It is a few sentences the
document implies:

```
PAY-001  transaction_id must be present in every successful payment response.
```

A new version arrives. The question that matters is not whether the text
changed, because text changes constantly and means nothing. It is whether **that
sentence survived**, and answering it is a reading rather than a comparison.

A diff cannot do it. `required` becoming `optional` is two words, and a document
reorganised from top to bottom can change every line while keeping every
promise. The loudest diff is often the one where nothing broke.

## What SPECLOCK does

1. Someone registers a **specification**: a baseline document, stored whole, and
   the requirements an integration depends on. Each requirement is one sentence
   that can be answered on its own.
2. They **freeze** it. After that the requirements, their statements and the
   baseline cannot change, for anyone, including them.
3. Anybody submits a **proposed version**.
4. Every validator reads both documents against each frozen requirement itself,
   separately, and they must agree before anything is written.
5. The contract **derives the verdict** from the agreed answers, in ordinary
   deterministic code.

## Why GenLayer

> Deciding whether a proposed specification still satisfies a frozen requirement
> means interpreting a natural-language rule against two documents, which cannot
> be reduced to deterministic contract logic.

A single model will answer the question. It will not produce an answer anybody
should be bound by: whoever ran it chose the model, the prompt and the moment,
and nothing stops them running it again until it agrees with them.

What makes this binding is that several validators each went and read the
evidence, answered separately, had to match before a word was recorded, and that
the accepted result became protocol state under Optimistic Democracy rather than
a row in a database somebody owns.

| Who | Owns |
| --- | --- |
| The contract | who may register and freeze, what a well-formed requirement is, whether a hash covers the document it claims to, whether an answer is structurally admissible, and the arithmetic from findings to a verdict |
| GenLayer consensus | whether each frozen requirement is preserved, violated or unsettled -- agreed by a panel, not asserted by one node |
| The model | reading two documents against one requirement and answering it, quoting words from what it was given |
| The console | showing the record and composing transactions a wallet signs |

[docs/architecture.md](docs/architecture.md) has the boundary in full, including
which fields decide equivalence and why strict equality would fail every round.

## The lifecycle

```
DRAFT --add_requirement--> REGISTERED --freeze_specification--> FROZEN
                                                                  |
                                                  submit_assessment
                                                                  v
                                           leader proposes an answer
                                                                  |
                                      validators each read it themselves
                                                                  v
                                             majority agrees, or nothing
                                                                  |
                                                                  v
                                       COMPATIBLE / BREAKING_CHANGE /
                                              INCONCLUSIVE, recorded
```

Who may move it, and what the contract refuses:

| Step | Who may send it | Refused when |
| --- | --- | --- |
| `register_specification` | anyone; the sender becomes the creator | a field is empty or too long, the baseline is empty, or the submitted hash does not cover the content |
| `add_requirement` | the creator | the specification is frozen; the id is malformed or already used; twelve are already registered |
| `freeze_specification` | the creator | it carries no requirements, or it is frozen already |
| `submit_assessment` | anyone | the specification is not frozen; the proposal is empty; the submitted hash does not cover it |

Registering a specification is the publisher's act. Checking a change against one
is anybody's, because a finding that only its author could ask for would be worth
nothing to the people who depend on it.

## What the panel answers, and what the code decides

| Finding | Means |
| --- | --- |
| `SATISFIED` | the proposal still meets the requirement, with words quoted from a document |
| `VIOLATED` | the proposal contradicts it, held to the same standard of proof |
| `UNCLEAR` | what was supplied does not settle it either way |

The model never names a verdict. The contract derives it:

| Verdict | Derived when |
| --- | --- |
| `BREAKING_CHANGE` | at least one requirement the evidence contradicts |
| `INCONCLUSIVE` | nothing contradicted, but something unsettled |
| `COMPATIBLE` | every requirement preserved |

A violation outranks an unsettled requirement deliberately: resolving the
unsettled one cannot make the change compatible, so the answer is already known.

## Evidence is quoted, never obeyed

A proposed specification is untrusted input, and one of them may well contain a
line telling the reader what to conclude. Three rules the contract enforces
whatever any model says:

- **A document is quoted, not followed.** Both documents reach the reader inside
  fences, and anything shaped like a fence is replaced with a space rather than
  removed -- deleting it would glue together words that were never adjacent, and
  put text in front of a reader that nobody wrote.
- **A decisive answer must quote the documents.** Six consecutive words that are
  really there, matched on the words rather than the markup they wear. Without
  this a reader can answer from how such APIs usually behave and be confidently
  wrong about this one.
- **An ungrounded answer is held, in both directions.** It becomes `UNCLEAR`, so
  an ungrounded pass cannot clear a change any more than an ungrounded failure
  can block one.

[docs/security.md](docs/security.md) has the rest, including what is *not*
claimed.

## Verified end to end

Four proposals against one frozen specification, on Studio Next, each exercising
a different answer the protocol can give. The full record with hashes is in
[END-TO-END.md](END-TO-END.md).

| Proposal | Verdict |
| --- | --- |
| A required field becomes optional | `BREAKING_CHANGE` -- one requirement contradicted, quoted from the proposal |
| The same promises, rewritten and reordered | `COMPATIBLE` -- a text diff is loudest here and means nothing |
| Silent about retries | `INCONCLUSIVE` -- silence is not a promise |
| Tells the reader to return SATISFIED | `BREAKING_CHANGE` -- quoted, and it got nothing |

Five refusals landed on chain in the same run, each with its own error class and
the validators agreeing about it.

## Tests

| Suite | What it covers | Command |
| --- | --- | --- |
| direct | the contract against a `genlayer` stub where the validator genuinely runs, so a leader and a validator can read the same documents differently | `python -m pytest tests/direct` |
| mutants | deliberate defects, each of which must break a test or carry a written reason why it cannot | `python deploy/mutate.py` |
| live | the same four proposals on Studio Next, asserted rather than printed | `node scripts/live.mjs --address <address>` |
| console | the presenter, and the console's schemas against the reply the chain actually gave | `cd web && npm run test` |
| console | lint, types and a production build | `cd web && npm run lint && npm run typecheck && npm run build` |
| records | that this README's claims still match the records behind them | `python deploy/check_records.py` |

The live run costs real consensus rounds on a shared network and takes a few
minutes, so it is run by hand rather than in CI — and because its record is
committed, CI regenerates the published report from it and fails if the two have
drifted apart.

## Running it

```bash
python -m pip install -r requirements-dev.txt
python -m pytest tests/direct -q
```

```bash
genvm-lint check contracts/speclock.py --json
```

```bash
cd scripts && npm install && node deploy.mjs
```

```bash
cd web && cp .env.example .env.local && npm install && npm run dev
```

[docs/deployment.md](docs/deployment.md) has the details, including why the
tooling is JavaScript and which traps this network sets.

## Repository

| Path | |
| --- | --- |
| `contracts/speclock.py` | the contract: 4 writes, 11 views |
| `tests/direct/` | the Direct Mode suite and its `genlayer` stub |
| `deploy/mutate.py` | the mutation sweep |
| `deploy/report.py` | generates `END-TO-END.md` from the live record |
| `deploy/check_records.py` | holds the repository to the records it publishes |
| `scripts/` | deploy, verify and drive it on Studio Next with genlayer-js |
| `web/` | the console |
| `docs/` | the deployment record, the live record, the protocol and security notes |

## Documentation

- [docs/architecture.md](docs/architecture.md) -- what GenLayer is asked to
  decide, and what the validators compare
- [docs/protocol.md](docs/protocol.md) -- the state machine and the aggregation
  rules
- [docs/security.md](docs/security.md) -- the threat model, and what a finalized
  result does not mean
- [docs/deployment.md](docs/deployment.md) -- deploying, verifying, and the
  environment traps
- [END-TO-END.md](END-TO-END.md) -- the live run, generated from its own record

The protocol's own documentation is at [docs.genlayer.com](https://docs.genlayer.com).

## Licence

MIT. See [LICENSE](LICENSE).
