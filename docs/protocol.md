# The protocol

The states, the rules, and the exact point at which each thing becomes
unchangeable.

## A specification

```
DRAFT ──add_requirement──▶ REGISTERED ──freeze_specification──▶ FROZEN
```

| State | Means | What can still change |
| --- | --- | --- |
| `DRAFT` | registered, with a baseline and no requirements yet | everything except the baseline and its hash |
| `REGISTERED` | carries at least one requirement | requirements can be added |
| `FROZEN` | the criteria are fixed | nothing |

The baseline is stored whole at registration, not just hashed. A URL serves
whatever it serves tomorrow, so an assessment pinned to one would be measuring
something nobody can recover afterwards. The submitted hash is checked against
the stored content rather than taken on trust: a caller who submits the digest
of something else has described a document the contract does not hold.

Freezing records a **criteria digest** over the baseline hash, every requirement
id, statement and severity, and the aggregation rules. Every assessment points
back at it, so a reader can tell which criteria produced a finding and notice if
they are looking at a different set.

## A requirement

```
PAY-001   The transaction_id field must be present in every successful
          payment response.                                     BLOCKING
```

An id matches `[A-Z][A-Z0-9]{1,11}-[0-9]{1,4}`. The shape exists so ids are
unambiguous in a digest and on a screen, not to enforce a house style: `PAY-1`
is as valid as `PAY-001`.

Severity is recorded and displayed. **It does not weight the verdict.** A
`MINOR` requirement that the evidence contradicts produces `BREAKING_CHANGE`
exactly as a `BLOCKING` one does, because the protocol has no basis for deciding
that somebody else's minor is minor to you. Severity is there for the people
reading, and this document says so rather than letting a reviewer assume.

A specification holds at most twelve. The limit is about keeping each round
answerable, not about anything deeper.

## An assessment

Submission and evaluation are one transaction. There is deliberately no state in
which an assessment exists without an answer: a round the validators do not
agree about writes nothing at all, the specification is left exactly as it was,
and anybody may ask again.

That is why the contract has no `PROPOSAL_PENDING` or `FINALIZATION_PENDING`
state of its own. Those are facts about a **transaction**, which the console
reads from the receipt, and inventing contract-side copies of them would be a
second consensus system pretending to be the first.

## How a verdict is derived

The model answers one requirement at a time and never names a verdict. The
contract works it out:

```
any VIOLATED                       ──▶  BREAKING_CHANGE
no VIOLATED, any UNCLEAR           ──▶  INCONCLUSIVE
all SATISFIED                      ──▶  COMPATIBLE
```

A violation outranks an unsettled requirement on purpose. Resolving the
unsettled one cannot make the change compatible, so calling the whole thing
inconclusive would throw away something the evidence actually settled.

### The grounding rule, applied before aggregation

A `SATISFIED` or `VIOLATED` answer must quote six consecutive words that really
appear in one of the two documents, compared after both sides have had their
markup, quotation marks and escapes normalised away. Underscores are kept: an
API specification is mostly `snake_case` identifiers and the question is usually
about one named field.

It looks for a run rather than demanding the whole citation be contiguous,
because the most useful answer this product can give cites both documents --
"the baseline says X, the proposal says Y" -- and that is never a contiguous
span of either.

An answer that cannot be grounded becomes `UNCLEAR` **in both directions**. A
held pass cannot clear a change any more than a held failure can block one, and
a floor that caught only one direction would quietly favour whoever benefits
from the other.

## What the validators compare

Two values per requirement id: **the status that was answered**, and **the
status the grounding rule settles it to**.

The second is there because it is the one the verdict is derived from. The
grounding rule holds a decisive answer the evidence does not carry, so these are
not the same value:

```
answered SATISFIED, grounded      ->  settles to SATISFIED
answered SATISFIED, not grounded  ->  settles to UNCLEAR
```

Two nodes can therefore answer a requirement with the same word and be
proposing two different verdicts. Consensus has to be able to see that. It
matters which way round it happens, too: the result that gets stored is the
leader's, so a validator that settled differently and could not say so would
simply be overwritten.

Excluded deliberately: reasoning, the wording of quoted evidence, and ordering.
Two honest readers never write the same sentence about the same clause, so
making prose decisive would fail every round while making nothing safer, and
would push the protocol toward whichever model phrases things most predictably.
Two readers who both fail to ground an answer agree with each other, because
what would be stored is the same.

```
                      answered    grounded   settled
PAY-001  leader       VIOLATED    yes        VIOLATED    agree
         validator    VIOLATED    yes        VIOLATED

PAY-001  leader       VIOLATED    yes        VIOLATED    nothing is written
         validator    VIOLATED    no         UNCLEAR

PAY-001  leader       VIOLATED    no         UNCLEAR     agree
         validator    VIOLATED    no         UNCLEAR
```

Grounding is not something a model reports. It is computed in the contract from
the words the model quoted and the two documents it was given, so what is being
compared is a value each node derived for itself.

A validator that merely checked the leader's answer parsed and carried a known
status would have verified nothing. Each one re-reads both documents against the
frozen requirements and reaches its own findings.

### When the leader fails rather than answers

The validator does the work and compares failures, rather than refusing every
leader failure on principle:

| The leader | This node | Outcome |
| --- | --- | --- |
| refused deterministically | refuses the same way | agree, and the round fails with that reason |
| returned unreadable output | anything | disagree, so another leader tries |
| failed | reached an answer | disagree |

The distinction matters to whoever is reading the failure. "The validators did
not agree" and "this finding is not one the contract will accept" call for
completely different things.

## After consensus

Nothing consensus-critical is written inside the non-deterministic block.

```
non-deterministic evaluation
        ↓
validators agree
        ↓
the contract re-checks the agreed answer deterministically
        ↓
storage is written
```

The re-check is the last gate: shape, exactly one finding per frozen
requirement, no unknown or duplicate ids, known statuses, bounded lengths, and
the agreed digest re-derived from the findings. An answer that fails is rejected
rather than repaired, because a repaired answer is one nobody evaluated.

## Error classes

The console reads these prefixes rather than matching prose, so wording can
change without breaking anything that depends on the kind.

| Class | Raised when |
| --- | --- |
| `[EXPECTED]` | a rule of the protocol said no |
| `[INVALID_INPUT]` | a field is missing, too long, or carries a fence |
| `[INVALID_REQUIREMENT]` | a requirement id, statement or severity the contract will not take |
| `[INVALID_FINDING]` | an answer the contract will not record |
| `[HASH_MISMATCH]` | a submitted digest does not cover the content it claims |
| `[FROZEN_SPECIFICATION]` | an attempt to change frozen criteria |
| `[UNAUTHORIZED]` | somebody other than the creator |
| `[LLM_ERROR]` | the model returned something unreadable |
