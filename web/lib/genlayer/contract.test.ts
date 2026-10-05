/**
 * The console's schemas, checked against what the chain actually answered.
 *
 * A schema written next to the contract and never run against a real reply is
 * a guess. These parse the record the live run left behind -- the same bytes
 * the deployed contract returned on Studio Next -- so the shapes this console
 * believes in are pinned to a reply that really happened. If the contract's
 * reply ever drifts from what the pages read, this fails here rather than on a
 * page rendering "undefined" in a product about verifiable claims.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assessmentSchema, FINDING_STATUSES, findingSchema, protocolInfoSchema,
  requirementSchema, SEVERITIES, specificationSchema, VERDICTS,
} from "./contract";

const live = JSON.parse(
  readFileSync(new URL("../../../docs/live.json", import.meta.url), "utf-8"));

describe("the live record parses as the console expects", () => {
  it("is a completed run", () => {
    // Said first and plainly: a run that failed part way writes what it got to
    // the same file, and every expectation below would then fail for a reason
    // that has nothing to do with the code being tested.
    expect(live.failed, `the committed live record is a failed run: ${live.failed}`)
      .toBeUndefined();
    expect(live.finished_at).toBeTruthy();
  });

  it("reads a draft specification and a frozen one", () => {
    const draft = specificationSchema.parse(live.specification.registered);
    const frozen = specificationSchema.parse(live.specification.frozen);

    expect(draft.state).toBe("DRAFT");
    expect(draft.criteria_digest).toBe("");
    expect(frozen.state).toBe("FROZEN");
    // Freezing is the act that makes a later finding mean anything, and the
    // digest is how a reader tells which criteria produced one.
    expect(frozen.criteria_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(frozen.frozen).toBe(true);
  });

  it("normalises counts whichever way the client sent them", () => {
    const frozen = specificationSchema.parse(live.specification.frozen);
    expect(typeof frozen.requirement_count).toBe("number");
    expect(typeof frozen.baseline_bytes).toBe("number");
    expect(frozen.requirement_count).toBe(frozen.requirements?.length);
  });

  it("accepts a count that arrives as a string, which clients differ about", () => {
    const asString = {
      ...live.specification.frozen, requirement_count: "3", baseline_bytes: "581",
    };
    const parsed = specificationSchema.parse(asString);
    expect(parsed.requirement_count).toBe(3);
    expect(parsed.baseline_bytes).toBe(581);
  });

  it("reads every requirement, with a severity this build has words for", () => {
    for (const raw of live.specification.frozen.requirements) {
      const requirement = requirementSchema.parse(raw);
      expect(SEVERITIES).toContain(requirement.severity);
      expect(requirement.frozen).toBe(true);
      expect(requirement.statement.length).toBeGreaterThan(0);
    }
  });

  it("reads all four assessments, each pointing back at the frozen criteria", () => {
    const frozen = specificationSchema.parse(live.specification.frozen);
    const keys = Object.keys(live.proposals);
    expect(keys.length).toBe(4);

    for (const key of keys) {
      const assessment = assessmentSchema.parse(live.proposals[key].assessment);
      expect(VERDICTS, key).toContain(assessment.verdict);
      expect(assessment.criteria_digest, key).toBe(frozen.criteria_digest);
      // One finding per frozen requirement, and nothing invented.
      expect(assessment.findings.length, key).toBe(frozen.requirement_count);
      const answered = assessment.findings.map((f) => f.requirement_id).sort();
      const asked = frozen.requirements!.map((r) => r.requirement_id).sort();
      expect(answered, key).toEqual(asked);
    }
  });

  it("reads each finding, and the verdict the record carries follows from them", () => {
    for (const key of Object.keys(live.proposals)) {
      const assessment = assessmentSchema.parse(live.proposals[key].assessment);
      const statuses = assessment.findings.map((raw) => {
        const finding = findingSchema.parse(raw);
        expect(FINDING_STATUSES, key).toContain(finding.effective_status);
        // A decisive answer must quote the documents; a held one must not be
        // presented as decisive.
        if (finding.held_for_grounding) expect(finding.effective_status).toBe("UNCLEAR");
        if (finding.effective_status !== "UNCLEAR") {
          expect(finding.evidence.length, `${key} ${finding.requirement_id}`)
            .toBeGreaterThan(0);
        }
        return finding.effective_status;
      });

      const derived = statuses.includes("VIOLATED") ? "BREAKING_CHANGE"
        : statuses.includes("UNCLEAR") ? "INCONCLUSIVE"
        : "COMPATIBLE";
      expect(assessment.verdict, key).toBe(derived);
    }
  });

  it("reads the protocol description the console shows instead of hardcoding it", () => {
    const info = protocolInfoSchema.parse(live.protocol_info);
    // The pages read the vocabulary off the chain; these constants exist to
    // name it, not to define it, so they must agree.
    expect(info.verdicts).toEqual([...VERDICTS]);
    expect(info.finding_statuses).toEqual([...FINDING_STATUSES]);
    expect(info.severities).toEqual([...SEVERITIES]);
    expect(Number(info.limits.max_requirements)).toBeGreaterThan(0);
  });
});

describe("a reply the console cannot trust", () => {
  it("fails with the field named rather than rendering undefined", () => {
    const { verdict: _dropped, ...missing } = live.proposals.breaking.assessment;
    const result = assessmentSchema.safeParse(missing);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("verdict");
  });

  it("refuses a finding whose held flag is not a flag", () => {
    const bent = { ...live.proposals.breaking.assessment.findings[0], held_for_grounding: "no" };
    expect(findingSchema.safeParse(bent).success).toBe(false);
  });
});
