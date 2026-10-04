# Architecture

Written before the contract, and kept honest since. It records the decisions
that are expensive to reverse: what GenLayer is actually asked to decide, what
the validators compare, and what the protocol refuses to claim.

## The decision

Somebody integrates against an API. The thing they depend on is not the document
— it is a handful of sentences the document happens to imply:

```
PAY-001  transaction_id must be present in every successful payment response.
```

A new version of that document arrives. The question that matters is not whether
the text changed. Text changes constantly and means nothing. The question is
whether **this requirement survives the change**, and that is a reading, not a
diff.

SPECLOCK freezes the requirements first, then asks GenLayer to decide one thing
per requirement:

> Given these frozen requirements as the criteria, and the baseline and proposed
> specifications as evidence, is each requirement preserved, violated, or not
> determinable from what was supplied?

Everything else in this repository is bookkeeping around that question.

## Why this needs GenLayer rather than anything cheaper

The test is the one the GenLayer documentation itself proposes: could an oracle,
a deterministic contract, or a plain API call produce this answer?

A deterministic diff cannot. `required: true` becoming `required: false` is a
violation of PAY-001; the same two tokens in an unrelated field are not. Telling
those apart means reading the requirement against the document, and that is a
judgment about meaning.

A single LLM call can produce the answer, but not one anybody should be bound
by. It is one party's opinion with extra steps, and the party who ran it chose
the model, the prompt and the moment. Nothing stops them running it again.

What makes the answer worth something is that several validators evaluated the
same frozen criteria against the same evidence **separately**, had to arrive at
the same decision before anything was written, and that the accepted result
became shared protocol state under Optimistic Democracy rather than a row in
somebody's database. That is the whole reason this is a GenLayer application and
not a web service with an API key.

## The boundary

| Who | Decides |
| --- | --- |
| The contract, deterministically | who may register and freeze, what a well-formed requirement is, whether a submitted hash matches the content it claims to cover, whether a model's answer is structurally admissible, and the arithmetic from a set of findings to one verdict |
| GenLayer consensus | whether each frozen requirement is satisfied, violated, or undeterminable — agreed by a panel, not asserted by one node |
| The model | reading two documents against one requirement and answering it, with evidence quoted from what it was given |
| The console | showing the record and composing transactions a wallet signs |

The contract owns the protocol's semantics. The model never names a verdict:
it answers requirements one at a time, and `COMPATIBLE`, `BREAKING_CHANGE` or
`INCONCLUSIVE` is derived from those answers in ordinary deterministic code.
This matters because a model asked for a headline will reach for one, and a
model asked a narrow question about a specific sentence will usually answer it.

## What the validators compare

A validator that checks the leader's JSON parses, carries known statuses and has
non-empty prose has verified nothing. It has confirmed the leader can format
output. The leader's actual decision passes through untouched.

So the validator here re-runs the evaluation itself and compares what a
consequence depends on:

**Compared** — the set of requirement ids, and the status against each one.
Nothing else can change the verdict, and the verdict is the protocol state.

**Not compared** — reasoning, the wording of quoted evidence, ordering. Two
honest readers never write the same sentence about the same clause. Making prose
decisive would fail every round while making nothing safer, and would quietly
push the protocol toward whichever model phrases things most predictably.

```
PAY-001  leader VIOLATED   validator VIOLATED    agree
PAY-001  leader VIOLATED   validator SATISFIED   disagree, and nothing is written
```

## Where state is written

Nothing consensus-critical is written inside the non-deterministic block.

```
non-deterministic evaluation
        ↓
validators agree
        ↓
the contract re-checks the agreed result deterministically
        ↓
storage is written
```

Different validators observe different intermediate values inside a
non-deterministic block; writing from in there would record whichever one
happened to run. The accepted result is re-validated after consensus — shape,
exactly one finding per frozen requirement, no unknown or duplicate ids, known
statuses, bounded lengths — and a result that fails is rejected rather than
repaired.

## When consensus does not happen

A round where the validators do not agree writes nothing. The assessment stays
exactly as it was and anybody may ask again. This is a real outcome, not an
error path: it is what the protocol does when a question is genuinely contested,
and the interface says so rather than showing a verdict.

The states a transaction passes through on GenLayer and the states an assessment
passes through in SPECLOCK are different things, and the console keeps them
apart. A transaction can be finalized while the assessment it carried is
`INCONCLUSIVE`. An accepted proposal is not a finalized one, and the interface
never labels it as such.

## Why there is no backend

There is no `/api/adjudicate`, because an adjudicator you host is an adjudicator
you can be asked to change. The browser talks to GenLayer directly through
GenLayerJS; the contract is the only authority, and every claim the interface
makes is recoverable by reloading the page against the chain.

There is also no bond, no escrow and no custody of anyone's funds. The protocol
holds nothing, so there is nothing to misdirect, and the economic layer is the
network's own transaction and consensus fees.

## What a finalized result does not mean

It means: given these frozen requirements and this submitted evidence, GenLayer
reached a finalized consensus finding under the adjudication rules written here.

It does not mean the provider wrote the specification, that a URL is authentic,
that the document is legally binding, that the provider's service behaves the
way the document says, or that every compatibility problem has been found. A
content hash establishes that the stored bytes are the bytes that were assessed.
It establishes nothing about who published them or when.

[docs/protocol.md](protocol.md) has the state machine and the aggregation rules;
[docs/security.md](security.md) has the threat model and the limits in full.
