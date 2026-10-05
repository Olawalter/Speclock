# Security model

What SPECLOCK defends against, how, and -- more usefully -- what it does not
claim.

## Untrusted evidence

Both documents are input from whoever submitted them. A proposed specification
may well contain a line addressed to the reader rather than describing an API.

| Property | How |
| --- | --- |
| A document is quoted, not followed | both reach the reader inside named fences, after the protocol's own instructions, and the prompt says in as many words that text telling the reader what to conclude is part of the document being assessed |
| A document cannot close its own fence | anything matching three or more consecutive angle brackets is replaced **with a space** |
| Replaced, never removed | deleting the marks would join whatever sat either side into a word that was never in the document, which puts text in front of a reader that nobody wrote |
| Fields cannot carry a fence either | a name or description containing an angle-bracket run is refused at registration, because those reach the prompt too |

The injection case is exercised live, not only in mocks: one of the four
proposals in the end-to-end run instructs the reader to return `SATISFIED` for
every requirement. It is quoted, and the requirement it tried to protect is
recorded as violated with the document's own words as evidence.

## Grounding

A decisive answer must quote six consecutive words that really appear in one of
the two documents. Without it a reader can answer from how such APIs usually
behave and be confidently wrong about this one -- which is the failure mode that
matters here, because it produces a confident, well-formed, wrong record.

Comparison happens after both sides are normalised: markup, quotation marks and
the backslashes a reader uses when citing a JSON fragment are removed from both.
Underscores are kept, because the question is usually about one named field and
`transaction_id` must not quietly become `transactionid`.

An answer that cannot be grounded is held at `UNCLEAR` in both directions.

## Consensus

| Property | How |
| --- | --- |
| A validator does the work | it re-reads both documents against the frozen requirements and reaches its own findings, rather than inspecting the leader's answer for well-formedness |
| Only the decision is compared | the status against each requirement id. Prose is excluded, so honest disagreement about wording cannot fail a round and agreement about wording cannot pass one |
| A failed round writes nothing | the specification is untouched and anybody may ask again |
| The verdict is not a model output | it is derived in deterministic code from the agreed statuses |
| The agreed answer is checked again | after consensus, deterministically, and rejected rather than repaired if it does not hold up |

## What is frozen, and when

Freezing is the act that makes a later finding mean anything: the criteria were
fixed before the proposal that would be judged against them existed. After it,
the requirements, their statements, their severities and the baseline cannot
change, by anyone. There is no owner, no admin key and no upgrade path in this
contract, so there is no account that can change them later either.

## Content integrity, and its limits

A content hash establishes that the stored bytes are the bytes that were
assessed. That is genuinely useful and it is all it is.

It does **not** establish:

- that the named provider wrote or published either document;
- that a source URL is authentic, or that anything was published when it claims;
- that a document existed before it was submitted here.

The source reference is recorded as a reference. The authoritative artefact is
the document stored in the contract.

## No custody

SPECLOCK holds no funds. There is no bond, no escrow, no staking and no
slashing, so there is nothing to misdirect and no account whose balance this
protocol can get wrong. The economic layer is the network's own transaction and
consensus fees.

## No backend

There is no `/api/adjudicate`, because an adjudicator you host is an adjudicator
you can be asked to change. The browser talks to GenLayer directly; every claim
the console makes is recoverable by reloading the page against the chain.

## What a finalized result does not mean

It means: given these frozen requirements and this submitted evidence, GenLayer
reached a finalized consensus finding under the rules in
[protocol.md](protocol.md).

It is not evidence that a provider authored the specification, that the document
is legally binding, that a service behaves the way its specification says, or
that every compatibility problem has been found. A panel reading two documents
can miss something, and `COMPATIBLE` means no frozen requirement was
contradicted -- not that the change is safe.

## What has and has not been checked

There are 92 tests in Direct Mode against a stub where the validator genuinely
runs; a mutation sweep of 40 deliberate defects, each of which must break a test
or carry a written reason why it cannot; 30 tests over the console, including its
schemas against the reply the chain actually gave; and a live run on Studio Next
whose transaction hashes are published.

None of that is an audit, and a count of tests proves only that somebody tried.
Two findings in this repository came from the live network after the mocked
suite had agreed with itself, which is the honest argument for running both.

## Reporting

This is a build on a test network. If you find something wrong with it, open an
issue with the transaction hash or the test that shows it.
