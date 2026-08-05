#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const reportFile = process.argv[2];
if (!reportFile) {
  console.error("usage: calculate-coverage.mjs <audit-report.json>");
  process.exit(64);
}
const report = JSON.parse(await readFile(reportFile, "utf8"));
const counts = { verified: 0, partial: 0, failed: 0, blocked: 0, missing_evidence: 0 };
for (const result of report.requirement_results || []) {
  if (Object.hasOwn(counts, result.status)) counts[result.status] += 1;
}
const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
console.log(JSON.stringify({
  total,
  counts,
  calculated_coverage: total ? counts.verified / total : 0,
  declared_coverage: report.requirement_coverage
}, null, 2));
