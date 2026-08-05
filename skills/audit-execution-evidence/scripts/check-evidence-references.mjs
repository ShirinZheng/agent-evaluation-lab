#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [reportFile, evidenceFile] = process.argv.slice(2);
if (!reportFile || !evidenceFile) {
  console.error("usage: check-evidence-references.mjs <audit-report.json> <evidence-index.json>");
  process.exit(64);
}
const report = JSON.parse(await readFile(reportFile, "utf8"));
const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
const evidenceIds = new Set((Array.isArray(evidence) ? evidence : evidence.items || []).map((item) => item.id));
const refs = [];
for (const result of report.requirement_results || []) refs.push(...(result.evidence_refs || []));
for (const finding of report.findings || []) refs.push(...(finding.evidence_refs || []));
const missing = [...new Set(refs.filter((id) => !evidenceIds.has(id)))];
console.log(JSON.stringify({ cited: refs.length, unique_cited: new Set(refs).size, missing }, null, 2));
process.exit(missing.length ? 1 : 0);
