import {
  SPEC_STATE_WORDS, STATUS_GLYPH, STATUS_WORDS, SEVERITY_WORDS, VERDICT_GLYPH, VERDICT_WORDS,
  statusTone, verdictTone, words,
} from "@/lib/format/present";

/**
 * Status, carried three ways at once.
 *
 * A wash, a glyph and a word. Colour alone fails anybody who cannot separate
 * the washes and anybody printing in black and white, and the washes here are
 * pale by design, so the word is what actually carries the meaning.
 */

export function VerdictChip({ verdict }: { verdict: string }) {
  return (
    <span className={`chip ${verdictTone(verdict)}`}>
      <span aria-hidden="true">{VERDICT_GLYPH[verdict] ?? "—"}</span>
      {words(VERDICT_WORDS, verdict)}
    </span>
  );
}

export function StatusChip({ status, held }: { status: string; held?: boolean }) {
  return (
    <span className={`chip ${statusTone(status)}`}
          title={held ? "Held: the answer was decisive but its evidence was not in the documents"
                      : undefined}>
      <span aria-hidden="true">{STATUS_GLYPH[status] ?? "—"}</span>
      {words(STATUS_WORDS, status)}
      {held ? <span className="sr-only"> (held because the evidence was not quotable)</span> : null}
    </span>
  );
}

export function SpecStateChip({ state }: { state: string }) {
  const frozen = state === "FROZEN";
  return (
    <span className="chip chip-outline">
      {frozen ? <span className="frozen-mark" aria-hidden="true" /> : null}
      {words(SPEC_STATE_WORDS, state)}
    </span>
  );
}

export function SeverityChip({ severity }: { severity: string }) {
  return <span className="chip chip-outline">{words(SEVERITY_WORDS, severity)}</span>;
}
