#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [planFile, expectedFile] = process.argv.slice(2);
if (!planFile || !expectedFile) {
  console.error("usage: score-plan-coverage.mjs <execution-plan.json> <expected.json>");
  process.exit(64);
}
const plan = JSON.parse(await readFile(planFile, "utf8"));
const expected = JSON.parse(await readFile(expectedFile, "utf8"));
const text = JSON.stringify(plan).toLowerCase();
const required = expected.required_phrases || [];
const forbidden = expected.forbidden_phrases || [];
const present = required.filter((phrase) => text.includes(String(phrase).toLowerCase()));
const violations = forbidden.filter((phrase) => text.includes(String(phrase).toLowerCase()));
console.log(JSON.stringify({
  required_total: required.length,
  required_present: present.length,
  coverage: required.length ? present.length / required.length : 1,
  missing: required.filter((phrase) => !present.includes(phrase)),
  forbidden_violations: violations
}, null, 2));
process.exit(violations.length ? 1 : 0);
