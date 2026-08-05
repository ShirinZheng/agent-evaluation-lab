#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LangfuseClient } from "@langfuse/client";
import { evaluatePlanner } from "../evaluators/planner.mjs";
import { evaluateAuditor } from "../evaluators/auditor.mjs";
import { evaluateRun } from "../evaluators/run-level.mjs";
import { score } from "../evaluators/shared.mjs";
import { hashObject } from "../lib/hash.mjs";
import { selectCases } from "./datasets.mjs";
import { asLangfuseScores, checkLangfuse, startLangfuseTracing } from "./langfuse.mjs";
import { root } from "./paths.mjs";
import { writeReport, summarize } from "./report.mjs";
import { createSnapshot } from "./snapshot-sut.mjs";
import { spawnAgent } from "./spawn-agent.mjs";

function parseArgs(argv) {
  const result = {
    agents: ["planner", "auditor"],
    suite: "smoke",
    caseId: null,
    limit: Number.POSITIVE_INFINITY,
    repeat: 1,
    langfuseMode: process.env.LANGFUSE_MODE || "optional",
    model: process.env.CODEX_MODEL || "",
    timeoutMs: Number(process.env.CASE_TIMEOUT_MS || 300000)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => argv[++index];
    if (value === "--agent") {
      const agent = next();
      result.agents = agent === "all" ? ["planner", "auditor"] : [agent];
    } else if (value === "--suite") result.suite = next();
    else if (value === "--case") result.caseId = next();
    else if (value === "--limit") result.limit = Number(next());
    else if (value === "--repeat") result.repeat = Number(next());
    else if (value === "--langfuse") result.langfuseMode = next();
    else if (value === "--model") result.model = next();
    else if (value === "--timeout-ms") result.timeoutMs = Number(next());
    else if (value === "--help") {
      console.log("usage: run-experiment.mjs [--agent planner|auditor|all] [--suite smoke|dev|regression|holdout] [--case id] [--limit n] [--repeat n] [--langfuse off|optional|required] [--model id]");
      process.exit(0);
    } else throw new Error(`unknown argument: ${value}`);
  }
  if (!result.agents.every((agent) => ["planner", "auditor"].includes(agent))) throw new Error("invalid --agent");
  if (!Number.isInteger(result.repeat) || result.repeat < 1) throw new Error("--repeat must be a positive integer");
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 1000) throw new Error("--timeout-ms must be >= 1000");
  if (!["off", "optional", "required"].includes(result.langfuseMode)) throw new Error("invalid --langfuse mode");
  return result;
}

function runId() {
  return `run-${new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z")}-${Math.random().toString(36).slice(2, 8)}`;
}

function codexVersion() {
  try {
    return execFileSync(process.env.CODEX_BIN || "codex", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function evaluateCase(testCase, envelope) {
  const runRows = evaluateRun({
    exitCode: envelope.process.exit_code,
    timedOut: envelope.process.timed_out,
    parsed: envelope.process.parsed,
    durationMs: envelope.process.duration_ms
  });
  if (!envelope.process.parsed || envelope.process.exit_code !== 0 || envelope.process.timed_out) {
    return [...runRows, score("overall", 0, "Semantic evaluation skipped because the isolated agent process did not produce a valid result.")];
  }
  const semanticRows = testCase.agent === "planner"
    ? evaluatePlanner({ output: envelope.agent_output, expected: testCase.expected })
    : evaluateAuditor({ input: testCase.input, output: envelope.agent_output, expected: testCase.expected });
  return [
    ...runRows,
    ...semanticRows
  ];
}

const options = parseArgs(process.argv.slice(2));
const cases = await selectCases(options);
if (cases.length === 0) throw new Error("no cases selected");
const id = runId();
const artifactRoot = path.join(root, "artifacts", id);
await mkdir(artifactRoot, { recursive: true });
const snapshot = await createSnapshot({ persist: true });
const metadata = {
  run_id: id,
  suite: options.suite,
  agents: options.agents,
  snapshot_id: snapshot.manifest.snapshot_id,
  dataset_hash: snapshot.manifest.dataset_hash,
  evaluator_hash: snapshot.manifest.evaluator_hash,
  model: options.model || "codex-default",
  codex_version: codexVersion()
};
await writeFile(path.join(artifactRoot, "run-manifest.json"), `${JSON.stringify({ ...metadata, cases: cases.map((item) => item.caseKey) }, null, 2)}\n`);

const caseMap = new Map(cases.map((item) => [item.caseKey, item]));
async function execute(testCase) {
  const caseDirectory = path.join(artifactRoot, testCase.agent, testCase.id, `attempt-${testCase.attempt}`);
  await mkdir(caseDirectory, { recursive: true });
  const spawned = await spawnAgent({
    testCase,
    artifactDirectory: caseDirectory,
    snapshot,
    timeoutMs: options.timeoutMs,
    model: options.model
  });
  return { agent_output: spawned.output, process: spawned.process };
}

let health = { connected: false, error: "Langfuse disabled." };
if (options.langfuseMode !== "off") health = await checkLangfuse();
if (options.langfuseMode === "required" && !health.connected) {
  throw new Error(`Langfuse is required but unavailable: ${health.error}`);
}

let itemReports = [];
let langfuseExperimentId = null;
let tracing = null;
let client = null;
if (health.connected) {
  tracing = startLangfuseTracing(snapshot.manifest.snapshot_id);
  client = new LangfuseClient({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL || "http://localhost:3000",
    timeout: 10
  });
  const experimentName = `${process.env.EXPERIMENT_PREFIX || "local-skill-agent"}/${options.suite}/${snapshot.manifest.snapshot_id}`;
  const result = await client.experiment.run({
    name: experimentName,
    runName: id,
    description: "Isolated local evaluation of independent Planner and Auditor Skill/Agent pairs.",
    metadata,
    maxConcurrency: 1,
    data: cases.map((testCase) => ({
      input: testCase.input,
      expectedOutput: testCase.expected,
      metadata: {
        case_key: testCase.caseKey,
        case_id: testCase.id,
        agent: testCase.agent,
        attempt: testCase.attempt,
        tags: testCase.tags,
        input_hash: hashObject(testCase.input)
      }
    })),
    task: async ({ metadata: itemMetadata }) => execute(caseMap.get(itemMetadata.case_key)),
    evaluators: [async ({ input, output, expectedOutput, metadata: itemMetadata }) => {
      const testCase = caseMap.get(itemMetadata.case_key);
      return asLangfuseScores(evaluateCase({ ...testCase, input, expected: expectedOutput }, output));
    }],
    runEvaluators: [async ({ itemResults }) => {
      const values = itemResults.flatMap((item) => item.evaluations.filter((score) => score.name === "overall").map((score) => Number(score.value)));
      return { name: "mean_overall", value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0 };
    }]
  });
  langfuseExperimentId = result.experimentId;
  itemReports = result.itemResults.map((item) => ({
    case_id: item.item.metadata.case_id,
    case_key: item.item.metadata.case_key,
    agent: item.item.metadata.agent,
    tags: item.item.metadata.tags,
    trace_id: item.traceId,
    output: item.output.agent_output,
    process: item.output.process,
    evaluations: item.evaluations.map((score) => ({ name: score.name, value: Number(score.value), comment: score.comment, details: score.metadata?.details }))
  }));
  await client.shutdown();
  await tracing.processor.forceFlush();
  await tracing.provider.shutdown();
} else {
  for (const testCase of cases) {
    const envelope = await execute(testCase);
    itemReports.push({
      case_id: testCase.id,
      case_key: testCase.caseKey,
      agent: testCase.agent,
      tags: testCase.tags,
      trace_id: null,
      output: envelope.agent_output,
      process: envelope.process,
      evaluations: evaluateCase(testCase, envelope)
    });
  }
}

const report = {
  schema_version: "1.0.0",
  run_id: id,
  created_at: new Date().toISOString(),
  options,
  snapshot: snapshot.manifest,
  langfuse: {
    mode: options.langfuseMode,
    connected: health.connected,
    base_url: process.env.LANGFUSE_BASE_URL || "http://localhost:3000",
    experiment_id: langfuseExperimentId,
    error: health.connected ? null : health.error
  },
  summary: summarize(itemReports),
  items: itemReports
};
const paths = await writeReport(report);
console.log(JSON.stringify({ run_id: id, report: paths, summary: report.summary, langfuse: report.langfuse }, null, 2));
