import Link from "next/link";

export const metadata = { title: "SPECLOCK: how it works" };

/**
 * A server component on purpose: this page is prose and never reads the chain,
 * so it ships no client JavaScript at all.
 */
export default function Docs() {
  return (
    <article className="grid max-w-3xl gap-8">
      <header className="grid gap-2">
        <p className="label">The protocol</p>
        <h1>What SPECLOCK decides, and what it refuses to claim</h1>
      </header>

      <section className="grid gap-3">
        <h2>The question</h2>
        <p>
          What an integration depends on is rarely the document. It is a few sentences the
          document implies: this field is always present, a retry is idempotent, an error carries
          a stable code. Those are what break, and a new version of the document does not tell
          you whether they survived.
        </p>
        <p>
          A diff cannot answer it. <span className="mono">required</span> becoming{" "}
          <span className="mono">optional</span> is two words, and a document reorganised from
          top to bottom can change every line while keeping every promise. Deciding which
          happened is a reading.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>Why a chain, and why this one</h2>
        <p>
          A single model will answer the question. It will not produce an answer anybody should
          be bound by: whoever ran it chose the model, the prompt and the moment, and nothing
          stops them running it again until it agrees with them.
        </p>
        <p>
          Here the requirements are frozen before the proposal exists, several validators each
          read the same evidence against them separately, and none of it is written unless they
          reach the same decision. The accepted result becomes protocol state under GenLayer
          Optimistic Democracy rather than a row in a database somebody owns. That is the whole
          reason this is a chain application and not a web service with an API key.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>Who decides what</h2>
        <dl className="grid gap-3">
          <Split term="The contract, deterministically">
            who may register and freeze, what a well-formed requirement is, whether a submitted
            hash covers the document it claims to, whether an answer is structurally admissible,
            and the arithmetic from a set of findings to one verdict.
          </Split>
          <Split term="GenLayer consensus">
            whether each frozen requirement is preserved, violated, or not settled by the
            evidence. Agreed by a panel, not asserted by one node.
          </Split>
          <Split term="The model">
            reading two documents against one requirement and answering it, quoting words from
            what it was given.
          </Split>
          <Split term="This console">
            showing the record and composing transactions a wallet signs. It decides nothing.
          </Split>
        </dl>
      </section>

      <section className="grid gap-3">
        <h2>What the panel has to agree about</h2>
        <p>
          Two values for each requirement id: the status that was answered, and the status the
          grounding rule settles it to. The second is the one the verdict is derived from &mdash;
          a decisive answer the documents do not carry is held at Not settled &mdash; so two
          readers can answer with the same word and still be proposing different verdicts, and
          consensus has to be able to see that.
        </p>
        <p>
          Reasoning and the wording of quoted evidence are deliberately excluded: two honest
          readers never write the same sentence about the same clause, so making prose decisive
          would fail every round while making nothing safer. Two readers who both fail to ground
          an answer agree with each other, because what would be stored is the same.
        </p>
        <p>
          A validator that merely checked the leader answer parsed and carried a known status
          would have verified nothing. Each one re-reads the documents and reaches its own
          findings.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>How a verdict is reached</h2>
        <ul className="grid gap-2 text-sm">
          <Rule name="Compatible">every frozen requirement preserved.</Rule>
          <Rule name="Breaking change">at least one requirement the evidence contradicts.</Rule>
          <Rule name="Inconclusive">
            nothing contradicted, but at least one requirement the documents do not settle.
          </Rule>
        </ul>
        <p className="text-sm text-[var(--slate)]">
          The model never names a verdict. It answers requirements one at a time, and the
          contract derives the rest, so no wording in either document can reach the result.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>Evidence is quoted, never obeyed</h2>
        <p>
          A proposed specification is untrusted input. One of them may well carry a line telling
          the reader to return a particular answer. It reaches the reader inside a fence, as part
          of the document being assessed, and anything shaped like that fence is replaced rather
          than deleted, so a reader can see what was there.
        </p>
        <p>
          A decisive answer also has to quote words that are really in one of the two documents.
          Without that a reader can answer from how such APIs usually behave and be confidently
          wrong about this one. An answer that cannot be grounded is held as not settled, in both
          directions: an ungrounded pass cannot clear a change any more than an ungrounded
          failure can block one.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>When the panel does not agree</h2>
        <p>
          Nothing is written. The specification is left exactly as it was and anybody may ask
          again. That is a real outcome rather than an error, and this console will never show a
          verdict for a round that did not produce one.
        </p>
        <p>
          A transaction being finalized and an assessment being conclusive are different facts.
          An accepted proposal is not a finalized one, and nothing here labels it as such.
        </p>
      </section>

      <section className="grid gap-3">
        <h2>What a finalized result does not mean</h2>
        <p>
          It means: given these frozen requirements and this submitted evidence, GenLayer reached
          a finalized consensus finding under the rules above.
        </p>
        <p>It is not evidence that:</p>
        <ul className="grid gap-1 pl-4 text-sm text-[var(--slate)]">
          <li className="list-disc">a provider wrote or published either document;</li>
          <li className="list-disc">
            a URL is authentic, or that anything was published when it claims;
          </li>
          <li className="list-disc">the specification is legally binding;</li>
          <li className="list-disc">a service behaves the way its specification says;</li>
          <li className="list-disc">every compatibility problem has been found.</li>
        </ul>
        <p className="text-sm text-[var(--slate)]">
          A content hash establishes that the stored bytes are the bytes that were assessed. It
          establishes nothing about who wrote them.
        </p>
      </section>

      <footer className="rule pt-6">
        <Link href="/specifications/new" className="btn btn-primary">
          Register a specification
        </Link>
      </footer>
    </article>
  );
}

function Split({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <dt className="text-sm font-[540]">{term}</dt>
      <dd className="mt-1 text-sm text-[var(--slate)]">{children}</dd>
    </div>
  );
}

function Rule({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap gap-2">
      <span className="min-w-36 font-[540]">{name}</span>
      <span className="min-w-0 flex-1 text-[var(--slate)]">{children}</span>
    </li>
  );
}
