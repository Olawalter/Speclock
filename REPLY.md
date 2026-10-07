# Reply to the steward request

> "Please make validator consensus cover each grounded or effective status used
> to derive the stored verdict, and add a test proving that equal raw statuses
> cannot finalize when leader and validator grounding would produce different
> effective statuses."

The request was correct. The gap was real, it was reproduced before anything was
changed, and it is fixed, deployed and proven on chain.

| | |
| --- | --- |
| Fix | [`0ae7810`](https://github.com/Olawalter/Speclock/commit/0ae7810b16e9) |
| Contract | [`0x68da43F1a1136cde798E1D11aDaEb1eBd1c134DC`](https://explorer-studio-dev.genlayer.com/address/0x68da43F1a1136cde798E1D11aDaEb1eBd1c134DC) |
| Network | GenLayer Studio Next, chain `61997` |
| Deployment | [`0x9cb23e2b`](https://explorer-studio-dev.genlayer.com/tx/0x9cb23e2bb22af702e0a4b2665c697c8eb55d8062abe54ca628b02167a2d3cef8), FINALIZED, byte-identical to `contracts/speclock.py` |

## What was wrong

`_decisive()` -- the value validators compared -- committed to the **answered**
status against each requirement id. The contract does not store that. It stores
what the grounding rule makes of it:

```
stored verdict  <- _verdict(settled)
                <- effective_status, from _settle()
                <- answered status + grounded
                <- _grounds(evidence, baseline + proposed)
```

`_settle()` holds a decisive answer the documents do not carry at `UNCLEAR`. So
two nodes could answer a requirement with the same word and be proposing two
different verdicts:

```
                    answered    grounded   settled      verdict
leader              VIOLATED    yes        VIOLATED     BREAKING_CHANGE
validator           VIOLATED    no         UNCLEAR      INCONCLUSIVE
                    --------    identical digests, consensus satisfied
```

Because the accepted result is the leader's, the validator's settled reading was
discarded with nothing to notice. The GenLayer documentation states this
directly:

> The accepted leader result is the value your contract receives and can store.
> Validators verify or reject that leader result; their independent intermediate
> answers are not automatically persisted on-chain.
>
> -- [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)

### Reproduced before the fix

Against the unmodified contract, a round where both nodes answered `VIOLATED`
for `PAY-001` -- the leader quoting the proposal, the validator quoting
something in neither document -- was **accepted**, and stored:

```
verdict BREAKING_CHANGE | raw VIOLATED | effective VIOLATED | held False
```

while that validator's own reading of the same two documents settled at
`UNCLEAR`, which is `INCONCLUSIVE`.

## The fix

One function. `_decisive()` now settles the findings itself and commits to
`(requirement id, answered status, settled status)`:

```python
settled = _settle(findings)
return _sha256_hex(_canon([[f["requirement_id"], f["status"], f["effective_status"]]
                           for f in sorted(settled, key=lambda x: x["requirement_id"])])
                   .encode("utf-8"))
```

- **The settled status** is there because it is the value the verdict is derived
  from. That is the steward's request.
- **The answered status** stays because the record publishes it, and between
  them the two pin whether a finding was held -- every derived field a reader
  gets. Dropping it would have widened what consensus accepts, which the request
  did not ask for.
- **Settling inside `_decisive`** rather than at the call sites means there is no
  way to commit to the unsettled form by accident.
- **Prose is still excluded.** Evidence wording, reasoning and arrival order stay
  out: two readers who both fail to ground an answer still agree, because what
  would be stored is the same.

Grounding is not model output. It is computed in the contract by `_grounds()`
from the words the model quoted and the two stored documents, and each node
computes its own, so what is compared is a value each node derived for itself.
No leader-supplied field is trusted.

### The invariant now enforced

> For every frozen requirement, consensus accepts only if the leader and the
> validator agree on both the status answered and the status the grounding rule
> settles it to. Differences that cannot change what is stored -- wording,
> reasoning, ordering -- do not fail a round.

Nothing about the consensus mechanism changed: still
`gl.vm.run_nondet(leader_fn, validator_fn)`, with every validator re-reading both
documents itself. The fix is the documented *partial field matching* pattern
applied to the field that is actually the decision.

## The test that proves it

`tests/direct/test_adjudication.py`, through the real
`leader_fn -> validator_fn -> acceptance` path in the Direct Mode harness, where
the validator genuinely runs:

| Test | Covers |
| --- | --- |
| `test_equal_statuses_cannot_finalize_when_grounding_would_differ` | both status directions: `SATISFIED` and `VIOLATED`, leader grounded, validator not |
| `test_and_the_same_holds_when_it_is_the_leader_that_is_ungrounded` | the reverse, which is the one whose answer would have been stored |
| `test_two_readers_who_both_ground_nothing_still_agree` | the other half: equal settled status must still pass |
| `test_two_readers_who_disagree_about_the_answer_fail_even_when_it_is_held` | the answered status is covered too |

Each adversarial case asserts `[NO_MAJORITY]` **and** that the assessment count
is unchanged: it fails closed, storing neither verdict.

**All four adversarial cases fail on the pre-fix contract** -- `expected a
[NO_MAJORITY] refusal and nothing was raised` -- and pass after it. The mutation
sweep carries a mutant that reverts the fix (`what the panel compares ignores
what grounding settled`); it is killed.

## Validation

| Check | Result |
| --- | --- |
| `python -m pytest tests/direct -q` | 98 passed |
| `genvm-lint check contracts/speclock.py --json` | lint ok, validate ok, 15 methods |
| `python deploy/mutate.py` (in slices) | 41 mutants, 39 killed, 2 documented equivalents, 0 undocumented |
| determinism probe | order-independent, prose-independent, grounding-sensitive, answered-status-sensitive |
| `node scripts/live.mjs` | 14 transactions, 5 refusals, 4 adjudications, every assertion passing |
| `python deploy/check_records.py` | the records agree |
| CI | green across all seven jobs |

The live run against the redeployed contract reached the same four verdicts as
before -- `BREAKING_CHANGE`, `COMPATIBLE`, `INCONCLUSIVE`, and `BREAKING_CHANGE`
for the document that instructs the reader to pass it -- so the narrower
acceptance did not cost a legitimate round. The record is in
[END-TO-END.md](END-TO-END.md), generated from `docs/live.json`.

## Documentation

Updated to describe the boundary as it now is, rather than as it was:
[`docs/architecture.md`](docs/architecture.md),
[`docs/protocol.md`](docs/protocol.md), [`docs/security.md`](docs/security.md),
and the console's own protocol page.

## What this does not claim

- Grounding is a floor, not a proof of relevance: a quote that coincidentally
  matches six consecutive words in either document grounds. That floor predates
  this request and is unchanged.
- One mutant remains a documented equivalent (`what the panel compares ignores
  which requirement`): findings are sorted by requirement id before the digest,
  so position already encodes identity. The id stays in the tuple against the
  day somebody changes the sort.
- Consensus covers what the contract stores. It does not make a model's reading
  correct; it makes a reading that several validators did not independently
  reach unable to become protocol state.
