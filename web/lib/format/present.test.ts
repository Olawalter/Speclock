/**
 * The presenter is the one place every value a person reads passes through, so
 * the thing worth testing is not that `COMPATIBLE` reads "Compatible". It is
 * that nothing the contract can return can reach a screen without a word, a
 * wash and a glyph -- the failure mode here is a raw enum shipping quietly,
 * which no page-level test notices because the page still renders.
 *
 * So the tables are driven off the contract's own constants. Add a status to
 * the contract, forget to name it, and this fails.
 */
import { describe, expect, it } from "vitest";

import {
  FINDING_STATUSES, SEVERITIES, SPEC_STATES, VERDICTS,
} from "../genlayer/contract";
import {
  byteSize, formatTime, outcomeSentence, relativeTime, SEVERITY_WORDS, shortAddress,
  shortDigest,
  SPEC_STATE_WORDS, STATUS_GLYPH, STATUS_WORDS, statusTone, VERDICT_GLYPH,
  VERDICT_WORDS, verdictTone, words,
} from "./present";

const SHOUTING = /^[A-Z0-9_]+$/;

describe("every value the contract can return has been given words", () => {
  it("names every verdict, and never shows the enum", () => {
    for (const verdict of VERDICTS) {
      expect(VERDICT_WORDS[verdict], verdict).toBeTruthy();
      expect(VERDICT_WORDS[verdict]).not.toMatch(SHOUTING);
      expect(VERDICT_WORDS[verdict]).not.toContain("_");
    }
  });

  it("names every finding status", () => {
    for (const status of FINDING_STATUSES) {
      expect(STATUS_WORDS[status], status).toBeTruthy();
      expect(STATUS_WORDS[status]).not.toMatch(SHOUTING);
    }
  });

  it("names every specification state and severity", () => {
    for (const state of SPEC_STATES) {
      expect(SPEC_STATE_WORDS[state], state).toBeTruthy();
      expect(SPEC_STATE_WORDS[state]).not.toMatch(SHOUTING);
    }
    for (const severity of SEVERITIES) {
      expect(SEVERITY_WORDS[severity], severity).toBeTruthy();
      expect(SEVERITY_WORDS[severity]).not.toMatch(SHOUTING);
    }
  });

  it("gives every verdict and status a glyph, so colour is never the only signal", () => {
    for (const verdict of VERDICTS) expect(VERDICT_GLYPH[verdict], verdict).toBeTruthy();
    for (const status of FINDING_STATUSES) expect(STATUS_GLYPH[status], status).toBeTruthy();
  });

  it("gives a tone to each verdict and status, and the same tone to the same meaning", () => {
    expect(verdictTone("COMPATIBLE")).toBe(statusTone("SATISFIED"));
    expect(verdictTone("BREAKING_CHANGE")).toBe(statusTone("VIOLATED"));
    expect(verdictTone("INCONCLUSIVE")).toBe(statusTone("UNCLEAR"));
    // Three outcomes, three washes: a product about findings cannot render two
    // different answers identically.
    expect(new Set(VERDICTS.map(verdictTone)).size).toBe(VERDICTS.length);
  });
});

describe("a value nobody anticipated", () => {
  it("is softened rather than shouted", () => {
    // If the contract one day answers with something this build has never
    // heard of, the page should read awkwardly, not shout an enum.
    expect(words(VERDICT_WORDS, "SOMETHING_NEW")).toBe("something new");
    expect(words(STATUS_WORDS, "PARTLY_SATISFIED")).toBe("partly satisfied");
  });
});

describe("identifiers", () => {
  it("shortens an address at both ends, so it can be checked against a wallet", () => {
    const address = "0x0229e176502e2359D0CFC91AEa75f3674f6f78F4";
    const short = shortAddress(address);
    expect(short.startsWith("0x0229")).toBe(true);
    expect(short.endsWith("78F4")).toBe(true);
    expect(short).toContain("…");
  });

  it("leaves something already short alone, and survives an empty value", () => {
    expect(shortAddress("0x0229")).toBe("0x0229");
    expect(shortAddress("")).toBe("");
    expect(shortDigest("")).toBe("");
  });

  it("shortens a digest from the front only, because that is how one is compared", () => {
    const digest = "668b357a1a6610badfc29f5937431a103825bd0dc245b857a59d8bbfb4d555bf";
    expect(shortDigest(digest)).toBe("668b357a1a66…");
  });
});

describe("times", () => {
  it("never puts a raw ISO string in front of a reader", () => {
    const shown = formatTime("2026-10-04T19:18:56Z");
    expect(shown).not.toContain("T");
    expect(shown).not.toContain("Z");
    expect(shown).toContain("2026");
  });

  it("gives back what it was handed when that is not a time at all", () => {
    // Better an odd-looking string than the word "Invalid Date" on a page
    // whose whole subject is what the record actually says.
    expect(formatTime("not a time")).toBe("not a time");
    expect(formatTime("")).toBe("");
  });

  const now = Date.parse("2026-10-04T19:30:00Z");

  it("reads the recent past in the units somebody thinks in", () => {
    expect(relativeTime("2026-10-04T19:29:30Z", now)).toBe("30 seconds ago");
    expect(relativeTime("2026-10-04T19:20:00Z", now)).toBe("10 minutes ago");
    expect(relativeTime("2026-10-04T15:30:00Z", now)).toBe("4 hours ago");
    expect(relativeTime("2026-10-01T19:30:00Z", now)).toBe("3 days ago");
  });

  it("says one minute rather than 1 minutes", () => {
    expect(relativeTime("2026-10-04T19:28:00Z", now)).toBe("2 minutes ago");
    expect(relativeTime("2026-10-04T19:29:00Z", now)).toBe("60 seconds ago");
    expect(relativeTime("2026-10-04T19:30:01Z", now)).toBe("in 1 second");
  });

  it("does not claim the future is the past", () => {
    expect(relativeTime("2026-10-04T19:35:00Z", now)).toBe("in 5 minutes");
  });
});

describe("what an assessment came to, in a sentence", () => {
  const f = (...statuses: string[]) => statuses.map((effective_status) => ({ effective_status }));

  it("counts the contradicted ones in words, not in record shorthand", () => {
    const said = outcomeSentence("BREAKING_CHANGE", f("VIOLATED", "SATISFIED", "SATISFIED"));
    expect(said).toBe("One of three frozen requirements is contradicted.");
    // The contract's own summary reads "1 of 3 frozen requirement(s) violated",
    // which is the right shape for something being hashed and the wrong shape
    // for something being read.
    expect(said).not.toContain("(s)");
  });

  it("agrees with itself about number", () => {
    expect(outcomeSentence("BREAKING_CHANGE", f("VIOLATED", "VIOLATED", "SATISFIED")))
      .toBe("Two of three frozen requirements are contradicted.");
    expect(outcomeSentence("INCONCLUSIVE", f("UNCLEAR", "SATISFIED")))
      .toBe("One of two frozen requirements is not settled by this evidence.");
  });

  it("says preserved without counting what was not", () => {
    expect(outcomeSentence("COMPATIBLE", f("SATISFIED", "SATISFIED", "SATISFIED")))
      .toBe("All three frozen requirements are preserved.");
  });

  it("does not say 'one of one'", () => {
    expect(outcomeSentence("BREAKING_CHANGE", f("VIOLATED")))
      .toBe("The frozen requirement is contradicted.");
    expect(outcomeSentence("COMPATIBLE", f("SATISFIED")))
      .toBe("The frozen requirement is preserved.");
    expect(outcomeSentence("INCONCLUSIVE", f("UNCLEAR")))
      .toBe("The evidence does not settle the frozen requirement.");
  });

  it("has words for every requirement a specification can hold", () => {
    // Twelve is the contract's limit, so no reader should ever meet a digit.
    const twelve = f(...Array(12).fill("SATISFIED"));
    expect(outcomeSentence("COMPATIBLE", twelve))
      .toBe("All twelve frozen requirements are preserved.");
  });

  it("says so rather than inventing a count when there is nothing to report", () => {
    expect(outcomeSentence("COMPATIBLE", [])).toBe("Nothing was assessed.");
  });
});

describe("sizes", () => {
  it("counts bytes while that is still readable and then stops", () => {
    expect(byteSize(581)).toBe("581 bytes");
    expect(byteSize(20000)).toBe("19.5 kB");
  });
});
