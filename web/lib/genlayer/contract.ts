/**
 * Every call this console makes, and the shape it expects back.
 *
 * The schemas are not documentation. They run: a contract that answers with
 * something else fails here, with the field named, rather than leaving a page
 * rendering "undefined" in a product about verifiable claims.
 *
 * Large integers arrive as a number from one client and a string from another,
 * so anything counted accepts both and is normalised once, here.
 */
import { z } from "zod";

const count = z.union([z.number(), z.string()]).transform((v) => Number(v));
const seconds = z.union([z.number(), z.string()]).transform((v) => Number(v));

export const FINDING_STATUSES = ["SATISFIED", "VIOLATED", "UNCLEAR"] as const;
export const VERDICTS = ["COMPATIBLE", "BREAKING_CHANGE", "INCONCLUSIVE"] as const;
export const SPEC_STATES = ["DRAFT", "REGISTERED", "FROZEN"] as const;
export const SEVERITIES = ["BLOCKING", "MAJOR", "MINOR"] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type Verdict = (typeof VERDICTS)[number];

export const requirementSchema = z.object({
  requirement_id: z.string(),
  specification_id: z.string(),
  statement: z.string(),
  severity: z.string(),
  frozen: z.boolean(),
  added_at: z.string(),
});

export const specificationSchema = z.object({
  specification_id: z.string(),
  creator: z.string(),
  name: z.string(),
  description: z.string(),
  baseline_version: z.string(),
  baseline_hash: z.string(),
  baseline_bytes: count,
  source_reference: z.string(),
  state: z.string(),
  frozen: z.boolean(),
  requirement_count: count,
  assessment_count: count,
  created_at: z.string(),
  updated_at: z.string(),
  frozen_at: z.string(),
  criteria_digest: z.string(),
  rules: z.string(),
  requirements: z.array(requirementSchema).optional(),
});

export const findingSchema = z.object({
  requirement_id: z.string(),
  statement: z.string(),
  status: z.string(),
  effective_status: z.string(),
  held_for_grounding: z.boolean(),
  evidence: z.string(),
  reasoning: z.string(),
});

export const assessmentSchema = z.object({
  assessment_id: z.string(),
  specification_id: z.string(),
  specification_name: z.string(),
  criteria_digest: z.string(),
  baseline_version: z.string(),
  baseline_hash: z.string(),
  proposed_version: z.string(),
  proposed_hash: z.string(),
  proposed_bytes: count,
  submitted_by: z.string(),
  submitted_at: z.string(),
  verdict: z.string(),
  summary: z.string(),
  findings: z.array(findingSchema),
  decisive_digest: z.string(),
  scope: z.string(),
  rules: z.string(),
  schema: z.string(),
});

export const findingsSchema = z.object({
  assessment_id: z.string(),
  verdict: z.string(),
  summary: z.string(),
  items: z.array(findingSchema),
  criteria_digest: z.string(),
  decisive_digest: z.string(),
});

export const documentSchema = z.object({
  content: z.string(),
}).passthrough();

export const protocolInfoSchema = z.object({
  rules: z.string(),
  schema: z.string(),
  scope: z.string(),
  specification_states: z.array(z.string()),
  finding_statuses: z.array(z.string()),
  verdicts: z.array(z.string()),
  severities: z.array(z.string()),
  specification_count: count,
  assessment_count: count,
  limits: z.record(z.string(), z.unknown()),
});

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: count,
    offset: count,
    limit: count,
  });

export type Specification = z.infer<typeof specificationSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ProtocolInfo = z.infer<typeof protocolInfoSchema>;

/** A read, named and shaped in one place. */
export type Read<T> = { functionName: string; args: (string | number)[]; schema: z.ZodType<T> };

export const reads = {
  info: { functionName: "get_protocol_info", args: [], schema: protocolInfoSchema },
  specifications: (offset: number, limit: number) => ({
    functionName: "list_specifications", args: [offset, limit],
    schema: pageOf(specificationSchema),
  }),
  byCreator: (creator: string, offset: number, limit: number) => ({
    functionName: "list_by_creator", args: [creator, offset, limit],
    schema: pageOf(specificationSchema),
  }),
  specification: (id: string) => ({
    functionName: "get_specification", args: [id], schema: specificationSchema,
  }),
  baseline: (id: string) => ({
    functionName: "get_baseline", args: [id], schema: documentSchema,
  }),
  requirements: (id: string) => ({
    functionName: "get_requirements", args: [id],
    schema: z.object({ specification_id: z.string(), frozen: z.boolean(),
                       items: z.array(requirementSchema) }),
  }),
  assessments: (offset: number, limit: number) => ({
    functionName: "list_assessments", args: [offset, limit], schema: pageOf(assessmentSchema),
  }),
  specificationAssessments: (id: string, offset: number, limit: number) => ({
    functionName: "list_specification_assessments", args: [id, offset, limit],
    schema: pageOf(assessmentSchema),
  }),
  assessment: (id: string) => ({
    functionName: "get_assessment", args: [id], schema: assessmentSchema,
  }),
  findings: (id: string) => ({
    functionName: "get_findings", args: [id], schema: findingsSchema,
  }),
  proposed: (id: string) => ({
    functionName: "get_proposed", args: [id], schema: documentSchema,
  }),
};

/** A write the person's wallet will be asked to sign. */
export type Call = { functionName: string; args: unknown[] };

export const writes = {
  registerSpecification: (name: string, description: string, baselineVersion: string,
                          baselineContent: string, baselineHash: string,
                          sourceReference: string): Call => ({
    functionName: "register_specification",
    args: [name, description, baselineVersion, baselineContent, baselineHash, sourceReference],
  }),
  addRequirement: (specificationId: string, requirementId: string, statement: string,
                   severity: string): Call => ({
    functionName: "add_requirement",
    args: [specificationId, requirementId, statement, severity],
  }),
  freezeSpecification: (specificationId: string): Call => ({
    functionName: "freeze_specification", args: [specificationId],
  }),
  submitAssessment: (specificationId: string, proposedVersion: string, proposedContent: string,
                     proposedHash: string): Call => ({
    functionName: "submit_assessment",
    args: [specificationId, proposedVersion, proposedContent, proposedHash],
  }),
};

/** How many arguments each method takes, as the deployed contract reports it. */
export const ARITY: Record<string, number> = {
  register_specification: 6,
  add_requirement: 4,
  freeze_specification: 1,
  submit_assessment: 4,
  get_protocol_info: 0,
  get_specification: 1,
  get_baseline: 1,
  get_requirements: 1,
  get_assessment: 1,
  get_findings: 1,
  get_proposed: 1,
  list_specifications: 2,
  list_by_creator: 3,
  list_assessments: 2,
  list_specification_assessments: 3,
};

/**
 * Check this console against a deployed contract's own schema.
 *
 * Returns a list of problems, empty when they agree. A console pointed at an
 * older deployment should say so, not fail when somebody signs.
 */
export function checkSchema(schema: { methods?: Record<string, { params?: unknown[] }> }) {
  const methods = schema?.methods ?? {};
  const problems: string[] = [];
  const used = [
    ...Object.values(reads).map((r) => (typeof r === "function" ? null : r.functionName)),
    "list_specifications", "list_by_creator", "get_specification", "get_baseline",
    "get_requirements", "list_assessments", "list_specification_assessments",
    "get_assessment", "get_findings", "get_proposed",
    ...Object.keys(ARITY).filter((name) => name.startsWith("register_")
      || name.startsWith("add_") || name.startsWith("freeze_") || name.startsWith("submit_")),
  ].filter(Boolean) as string[];

  for (const name of new Set(used)) {
    const method = methods[name];
    if (!method) {
      problems.push(`the deployment has no method ${name}`);
      continue;
    }
    const expected = ARITY[name];
    const actual = (method.params ?? []).length;
    if (expected !== undefined && expected !== actual) {
      problems.push(`${name} takes ${actual} argument(s) here and this console sends ${expected}`);
    }
  }
  return problems;
}
