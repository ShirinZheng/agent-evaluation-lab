#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("fake-codex 1.0.0");
  process.exit(0);
}

for await (const _chunk of process.stdin) {
  // Consume the prompt before producing the configured result.
}

const mode = process.env.FAKE_CODEX_MODE || "success";
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

if (mode === "timeout") {
  process.on("SIGTERM", () => process.exit(143));
  setInterval(() => {}, 1000);
} else if (mode === "nonzero") {
  console.error("fake codex configured to fail");
  process.exit(7);
} else {
  if (!outputPath) throw new Error("--output-last-message is required");
  const validPlan = {
    schema_version: "1.0.0",
    plan_id: "PLAN-FAKE",
    objective: "在本地生成可复现报告。",
    constraints: [{ id: "C1", statement: "所有工作只在本地完成。" }],
    non_goals: ["不发布到公网。"],
    assumptions: [],
    milestones: [{
      id: "M1",
      outcome: "本地报告通过验证。",
      task_ids: ["T1"],
      acceptance_criteria: ["validator exit code 等于 0。"]
    }],
    tasks: [{
      id: "T1",
      objective: "生成本地报告。",
      depends_on: [],
      inputs: ["输入数据"],
      outputs: ["report.json"],
      acceptance_criteria: ["report.json 可解析且 validator exit code 等于 0。"],
      risk_level: "low",
      authorization_required: false
    }],
    checkpoints: [{ id: "CP1", after_task_ids: ["T1"], durable_state: "report.json", validation: "记录文件 hash。" }],
    recovery_rules: [{ id: "RR1", trigger: "进程中断", preserved_state: "report.json", next_action: "验证 hash 后继续", retry_limit: 1 }],
    stop_conditions: [{ id: "S1", statement: "validator exit code 等于 0 时停止。" }],
    final_acceptance: [{ id: "FA1", statement: "report.json 存在且 validator exit code 等于 0。" }]
  };
  const content = mode === "invalid-json"
    ? "{not-json"
    : JSON.stringify(mode === "invalid-schema" ? { schema_version: "1.0.0" } : validPlan);
  writeFileSync(outputPath, content);
  console.log(JSON.stringify({ type: "fake.completed", mode }));
}
