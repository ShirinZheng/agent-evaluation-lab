import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerPath = path.join(root, "runner", "run-experiment.mjs");
const fakeCodexPath = path.join(root, "test-support", "fake-codex.mjs");

function byName(item, name) {
  return item.evaluations.find((score) => score.name === name);
}

async function runScenario(mode, assertion) {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), `agent-evaluation-${mode}-`));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      runnerPath,
      "--agent", "planner",
      "--suite", "smoke",
      "--limit", "1",
      "--langfuse", "off",
      "--timeout-ms", "1000",
      "--output-root", outputRoot
    ], {
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}`,
        CODEX_BIN: fakeCodexPath,
        FAKE_CODEX_MODE: mode
      },
      maxBuffer: 1024 * 1024,
      timeout: 15000
    });
    const commandResult = JSON.parse(stdout);
    const report = JSON.parse(await readFile(commandResult.report.jsonPath, "utf8"));
    const item = report.items[0];
    const processArtifact = JSON.parse(await readFile(path.join(item.process.artifact_directory, "process.json"), "utf8"));
    assert.deepEqual(processArtifact, item.process);
    await access(commandResult.report.markdownPath);
    await assertion({ commandResult, report, item });
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
}

test("runner records success and four failure paths", { timeout: 30000 }, async (t) => {
  await t.test("successful schema-valid output", async () => runScenario("success", async ({ report, item }) => {
    assert.equal(item.process.exit_code, 0);
    assert.equal(item.process.timed_out, false);
    assert.equal(item.process.parsed, true);
    assert.equal(report.summary.harness_valid, true);
    assert.equal(byName(item, "schema_valid").value, 1);
    assert.ok(byName(item, "overall").value > 0);
    assert.ok(byName(item, "constraint_recall"));
    await access(path.join(item.process.artifact_directory, "final.json"));
  }));

  await t.test("invalid JSON output", async () => runScenario("invalid-json", async ({ report, item }) => {
    assert.equal(item.process.exit_code, 0);
    assert.equal(item.process.timed_out, false);
    assert.equal(item.process.parsed, false);
    assert.equal(report.summary.harness_valid, false);
    assert.equal(byName(item, "overall").value, 0);
    assert.equal(byName(item, "schema_valid"), undefined);
    assert.equal(byName(item, "constraint_recall"), undefined);
  }));

  await t.test("schema-invalid JSON output", async () => runScenario("invalid-schema", async ({ report, item }) => {
    assert.equal(item.process.exit_code, 0);
    assert.equal(item.process.timed_out, false);
    assert.equal(item.process.parsed, true);
    assert.equal(report.summary.harness_valid, false);
    assert.equal(byName(item, "schema_valid").value, 0);
    assert.equal(byName(item, "overall").value, 0);
    assert.equal(byName(item, "constraint_recall"), undefined);
  }));

  await t.test("timed-out process", async () => runScenario("timeout", async ({ report, item }) => {
    assert.equal(item.process.exit_code, 143);
    assert.equal(item.process.timed_out, true);
    assert.equal(item.process.parsed, false);
    assert.equal(report.summary.harness_valid, false);
    assert.equal(byName(item, "within_timeout").value, 0);
    assert.equal(byName(item, "overall").value, 0);
    assert.equal(byName(item, "constraint_recall"), undefined);
  }));

  await t.test("nonzero process exit", async () => runScenario("nonzero", async ({ report, item }) => {
    assert.equal(item.process.exit_code, 7);
    assert.equal(item.process.timed_out, false);
    assert.equal(item.process.parsed, false);
    assert.equal(report.summary.harness_valid, false);
    assert.equal(byName(item, "process_success").value, 0);
    assert.equal(byName(item, "overall").value, 0);
    assert.equal(byName(item, "constraint_recall"), undefined);
  }));
});
