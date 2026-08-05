#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeClient } from "./langfuse.mjs";
import { root } from "./paths.mjs";

function usage() {
  return "usage: verify-langfuse.mjs <report.json> [report.json ...]";
}

function resolveReport(value) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function sameNumber(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 1e-6;
}

function compareScores(expected, actual) {
  const actualByName = new Map(actual.map((item) => [item.name, Number(item.value)]));
  const expectedByName = new Map(expected.map((item) => [item.name, Number(item.value)]));
  const missing = [...expectedByName.keys()].filter((name) => !actualByName.has(name));
  const extra = [...actualByName.keys()].filter((name) => !expectedByName.has(name));
  const mismatched = [...expectedByName.entries()].flatMap(([name, value]) => {
    if (!actualByName.has(name) || sameNumber(value, actualByName.get(name))) return [];
    return [{ name, expected: value, actual: actualByName.get(name) }];
  });
  return { missing, extra, mismatched };
}

async function fetchTrace(client, traceId, attempts = 5) {
  let latest = { observations: [], scores: [] };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const [observations, scores] = await Promise.all([
      client.api.observations.getMany({ traceId, fields: "core,basic,trace_context", limit: 100 }),
      client.api.scoresV3.getManyV3({ traceId, fields: "details,subject", limit: 100 })
    ]);
    latest = { observations: observations.data || [], scores: scores.data || [] };
    if (latest.observations.length > 0 && latest.scores.length > 0) return latest;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
  return latest;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log(usage());
  process.exit(args.includes("--help") ? 0 : 2);
}

const client = makeClient();
const results = [];
let valid = true;
try {
  for (const value of args) {
    const reportPath = resolveReport(value);
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    const itemResults = [];
    for (const item of report.items || []) {
      if (!item.trace_id) {
        valid = false;
        itemResults.push({ case_id: item.case_id, valid: false, errors: ["report has no trace_id"] });
        continue;
      }
      const remote = await fetchTrace(client, item.trace_id);
      const comparison = compareScores(item.evaluations || [], remote.scores);
      const errors = [];
      if (remote.observations.length === 0) errors.push("trace has no observations");
      if (comparison.missing.length) errors.push(`missing scores: ${comparison.missing.join(", ")}`);
      if (comparison.extra.length) errors.push(`unexpected scores: ${comparison.extra.join(", ")}`);
      if (comparison.mismatched.length) errors.push(`score mismatches: ${JSON.stringify(comparison.mismatched)}`);
      const itemValid = errors.length === 0;
      valid &&= itemValid;
      itemResults.push({
        case_id: item.case_id,
        trace_id: item.trace_id,
        valid: itemValid,
        observation_count: remote.observations.length,
        expected_score_count: (item.evaluations || []).length,
        langfuse_score_count: remote.scores.length,
        errors
      });
    }
    results.push({
      report: reportPath,
      run_id: report.run_id,
      experiment_id: report.langfuse?.experiment_id || null,
      valid: itemResults.every((item) => item.valid),
      items: itemResults
    });
  }
} finally {
  await client.shutdown().catch(() => {});
}

console.log(JSON.stringify({ valid, reports: results }, null, 2));
if (!valid) process.exitCode = 1;
