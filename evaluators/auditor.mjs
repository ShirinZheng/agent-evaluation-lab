import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { mean, score, severityRank, weightedMean } from "./shared.mjs";

const schema = JSON.parse(readFileSync(new URL("../skills/audit-execution-evidence/references/audit-report.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

export function evaluateAuditor({ input, output, expected = {} }) {
  const schemaValid = validateSchema(output);
  const evidenceIds = new Set((input?.evidence || []).map((item) => item.id));
  const cited = [
    ...(output?.requirement_results || []).flatMap((item) => item.evidence_refs || []),
    ...(output?.findings || []).flatMap((item) => item.evidence_refs || [])
  ];
  const invalidRefs = [...new Set(cited.filter((id) => !evidenceIds.has(id)))];
  const results = new Map((output?.requirement_results || []).map((item) => [item.requirement_id, item]));
  const expectedStatuses = Object.entries(expected.requirement_statuses || {});
  const statusDetails = expectedStatuses.map(([id, status]) => ({ id, expected: status, actual: results.get(id)?.status, hit: results.get(id)?.status === status }));
  const verified = (output?.requirement_results || []).filter((item) => item.status === "verified").length;
  const total = output?.requirement_results?.length || 0;
  const calculatedCoverage = total ? verified / total : 0;
  const coverageDelta = Math.abs(calculatedCoverage - (output?.requirement_coverage ?? -1));
  const categories = new Set((output?.findings || []).map((item) => item.category));
  const categoryDetails = (expected.required_finding_categories || []).map((category) => ({ category, hit: categories.has(category) }));
  const severityDetails = (expected.minimum_severity_by_category || []).map(({ category, severity }) => {
    const actual = Math.max(0, ...(output?.findings || []).filter((item) => item.category === category).map((item) => severityRank[item.severity] || 0));
    return { category, expected: severity, hit: actual >= severityRank[severity], actual_rank: actual };
  });
  const positiveWithoutEvidence = (output?.requirement_results || []).filter((item) => item.status === "verified" && !(item.evidence_refs || []).length).map((item) => item.requirement_id);
  const completionHit = output?.completion_allowed === expected.completion_allowed;
  const verdictHit = !expected.verdicts || expected.verdicts.includes(output?.verdict);

  const rows = [
    score("schema_valid", schemaValid ? 1 : 0, schemaValid ? "AuditReport matches schema." : "Schema validation failed.", schemaValid ? [] : validateSchema.errors),
    score("evidence_reference_validity", invalidRefs.length || positiveWithoutEvidence.length ? 0 : 1, "All citations resolve and verified requirements cite evidence.", { invalid_refs: invalidRefs, verified_without_evidence: positiveWithoutEvidence }),
    score("coverage_consistency", coverageDelta <= 0.000001 ? 1 : 0, `Declared=${output?.requirement_coverage}; calculated=${calculatedCoverage}.`),
    score("requirement_status_accuracy", statusDetails.length ? mean(statusDetails.map((item) => Number(item.hit))) : 1, "Requirement states compared with seeded ground truth.", statusDetails),
    score("finding_category_recall", categoryDetails.length ? mean(categoryDetails.map((item) => Number(item.hit))) : 1, "Required finding categories detected.", categoryDetails),
    score("severity_floor", severityDetails.length ? mean(severityDetails.map((item) => Number(item.hit))) : 1, "Finding severities meet the seeded minimum.", severityDetails),
    score("completion_gate", completionHit ? 1 : 0, `Expected completion_allowed=${expected.completion_allowed}; actual=${output?.completion_allowed}.`),
    score("verdict_accuracy", verdictHit ? 1 : 0, `Expected one of ${JSON.stringify(expected.verdicts || [])}; actual=${output?.verdict}.`)
  ];
  const weights = {
    schema_valid: 3,
    evidence_reference_validity: 3,
    requirement_status_accuracy: 3,
    completion_gate: 4,
    verdict_accuracy: 2
  };
  rows.push(score("overall", weightedMean(rows, weights), "Weighted deterministic auditor score."));
  return rows;
}
