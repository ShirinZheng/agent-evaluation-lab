#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [reportFile, evidenceFile] = process.argv.slice(2);
if (!reportFile) {
  console.error("usage: validate-audit-report.mjs <audit-report.json> [evidence-index.json]");
  process.exit(64);
}

let report;
try {
  report = JSON.parse(await readFile(reportFile, "utf8"));
} catch (error) {
  console.error(JSON.stringify({ valid: false, errors: [`invalid-json: ${error.message}`] }));
  process.exit(1);
}

let evidenceIds = null;
if (evidenceFile) {
  const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
  evidenceIds = new Set((Array.isArray(evidence) ? evidence : evidence.items || []).map((item) => item.id));
}

const errors = [];
if (report.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
for (const key of ["audit_id", "plan_id"]) {
  if (typeof report[key] !== "string" || !report[key].trim()) errors.push(`${key} is required`);
}
if (!["complete", "partial", "failed", "blocked", "insufficient_evidence"].includes(report.verdict)) {
  errors.push("invalid verdict");
}
if (typeof report.requirement_coverage !== "number" || report.requirement_coverage < 0 || report.requirement_coverage > 1) {
  errors.push("requirement_coverage must be between 0 and 1");
}
for (const key of ["requirement_results", "findings", "unsupported_claims", "verified_artifacts", "blocked_items"]) {
  if (!Array.isArray(report[key])) errors.push(`${key} must be an array`);
}
if (typeof report.completion_allowed !== "boolean") errors.push("completion_allowed must be boolean");
if (report.completion_allowed && report.verdict !== "complete") {
  errors.push("completion_allowed requires verdict=complete");
}

const findingIds = new Set();
const cited = [];
for (const result of report.requirement_results || []) {
  if (!["verified", "partial", "failed", "blocked", "missing_evidence"].includes(result.status)) {
    errors.push(`requirement ${result.requirement_id || "?"} has invalid status`);
  }
  if (result.status === "verified" && (!Array.isArray(result.evidence_refs) || result.evidence_refs.length === 0)) {
    errors.push(`verified requirement ${result.requirement_id} needs evidence_refs`);
  }
  cited.push(...(result.evidence_refs || []));
}
for (const finding of report.findings || []) {
  if (findingIds.has(finding.finding_id)) errors.push(`duplicate finding_id ${finding.finding_id}`);
  findingIds.add(finding.finding_id);
  if (!["critical", "high", "medium", "low"].includes(finding.severity)) {
    errors.push(`finding ${finding.finding_id || "?"} has invalid severity`);
  }
  cited.push(...(finding.evidence_refs || []));
}
if (evidenceIds) {
  for (const id of cited) if (!evidenceIds.has(id)) errors.push(`unknown evidence ref ${id}`);
}
if (!report.next_experiment || typeof report.next_experiment !== "object") {
  errors.push("next_experiment is required");
} else {
  for (const key of ["hypothesis", "change", "expected_signal", "stop_condition"]) {
    if (typeof report.next_experiment[key] !== "string" || !report.next_experiment[key].trim()) {
      errors.push(`next_experiment.${key} is required`);
    }
  }
}

console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
