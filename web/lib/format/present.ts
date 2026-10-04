/**
 * Every value a person reads passes through here.
 *
 * Nothing in the interface prints a raw enum, a bare address or an ISO
 * timestamp. Identifiers and digests do appear, but only where they are the
 * point -- a verification view where somebody needs to check one against a
 * chain -- and never as the label on something.
 */

export const VERDICT_WORDS: Record<string, string> = {
  COMPATIBLE: "Compatible",
  BREAKING_CHANGE: "Breaking change",
  INCONCLUSIVE: "Inconclusive",
};

export const STATUS_WORDS: Record<string, string> = {
  SATISFIED: "Preserved",
  VIOLATED: "Violated",
  UNCLEAR: "Not settled",
};

export const SPEC_STATE_WORDS: Record<string, string> = {
  DRAFT: "Draft",
  REGISTERED: "Ready to freeze",
  FROZEN: "Frozen",
};

export const SEVERITY_WORDS: Record<string, string> = {
  BLOCKING: "Blocking",
  MAJOR: "Major",
  MINOR: "Minor",
};

/**
 * What the transaction is doing, as distinct from what the assessment says.
 * Merging these two is how a console ends up calling an accepted proposal
 * finalized.
 */
export const LIFECYCLE_WORDS: Record<string, string> = {
  idle: "Ready",
  wallet: "Waiting for the wallet",
  signing: "Waiting for a signature",
  submitted: "Submitted",
  pending: "Validators are deciding",
  accepted: "Accepted, not yet final",
  finalizing: "Waiting for finality",
  finalized: "Finalized",
  failed: "Failed",
};

export const words = (table: Record<string, string>, key: string) =>
  table[key] ?? key.toLowerCase().replace(/_/g, " ");

export const shortAddress = (value: string) =>
  value && value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value || "";

export const shortDigest = (value: string) =>
  value ? `${value.slice(0, 12)}…` : "";

export const specificationLabel = (id: string) => `Specification ${id.replace(/^S/, "")}`;
export const assessmentLabel = (id: string) => `Assessment ${id.replace(/^A/, "")}`;

/** A time somebody can read, in the reader's own zone, never a raw ISO string. */
export function formatTime(iso: string): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function relativeTime(iso: string, now: number): string {
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return "";
  const seconds = Math.round((when - now) / 1000);
  const past = seconds < 0;
  const n = Math.abs(seconds);
  const [value, unit] =
    n < 90 ? [n, "second"]
    : n < 5400 ? [Math.round(n / 60), "minute"]
    : n < 129600 ? [Math.round(n / 3600), "hour"]
    : [Math.round(n / 86400), "day"];
  const plural = value === 1 ? unit : `${unit}s`;
  return past ? `${value} ${plural} ago` : `in ${value} ${plural}`;
}

export const byteSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;

/** Which wash a verdict gets. Never the only signal: a word always goes with it. */
export function verdictTone(verdict: string): string {
  if (verdict === "COMPATIBLE") return "chip-compatible";
  if (verdict === "BREAKING_CHANGE") return "chip-breaking";
  return "chip-neutral";
}

export function statusTone(status: string): string {
  if (status === "SATISFIED") return "chip-compatible";
  if (status === "VIOLATED") return "chip-breaking";
  return "chip-neutral";
}

/**
 * A glyph for every status, so the result survives being read by somebody who
 * cannot tell the washes apart, or printed in black and white.
 */
export const VERDICT_GLYPH: Record<string, string> = {
  COMPATIBLE: "✓",
  BREAKING_CHANGE: "✕",
  INCONCLUSIVE: "—",
};

export const STATUS_GLYPH: Record<string, string> = {
  SATISFIED: "✓",
  VIOLATED: "✕",
  UNCLEAR: "—",
};

/** sha-256 of a string, for showing what a document hashes to before sending it. */
export async function digestOf(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
