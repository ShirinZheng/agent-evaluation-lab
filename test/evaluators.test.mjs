import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlanner } from "../evaluators/planner.mjs";
import { evaluateAuditor } from "../evaluators/auditor.mjs";

function byName(scores, name) {
  return scores.find((item) => item.name === name);
}

function validPlan() {
  return {
    schema_version: "1.0.0",
    plan_id: "PLAN-TEST",
    objective: "在本地生成可复现报告，不执行外部发布。",
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
}

function validAudit() {
  return {
    schema_version: "1.0.0",
    audit_id: "AUDIT-TEST",
    plan_id: "PLAN-TEST",
    verdict: "complete",
    requirement_coverage: 1,
    requirement_results: [
      { requirement_id: "R1", status: "verified", evidence_refs: ["E1"], reason: "E1 directly records success." },
      { requirement_id: "R2", status: "verified", evidence_refs: ["E2"], reason: "E2 directly records the row count." }
    ],
    findings: [],
    unsupported_claims: [],
    verified_artifacts: ["report.csv"],
    blocked_items: [],
    next_experiment: {
      hypothesis: "The result remains valid until the artifact changes.",
      change: "Re-run validators after the next artifact change.",
      expected_signal: "Both requirements remain verified.",
      stop_condition: "Stop after one changed-artifact validation."
    },
    completion_allowed: true
  };
}

test("planner evaluator accepts a contract-valid plan", () => {
  const scores = evaluatePlanner({
    output: validPlan(),
    expected: {
      min_tasks: 1,
      min_checkpoints: 1,
      min_recovery_rules: 1,
      must_include_groups: [{ id: "local", terms: ["本地"] }],
      non_goal_groups: [{ id: "no-public", terms: ["不发布"] }]
    }
  });
  assert.equal(byName(scores, "schema_valid").value, 1);
  assert.equal(byName(scores, "dependency_dag").value, 1);
  assert.equal(byName(scores, "plan_only_boundary").value, 1);
  assert.equal(byName(scores, "overall").value, 1);
});

test("planner evaluator rejects dependency cycles", () => {
  const plan = validPlan();
  plan.tasks[0].depends_on = ["T1"];
  assert.equal(byName(evaluatePlanner({ output: plan }), "dependency_dag").value, 0);
});

test("auditor evaluator accepts evidence-complete report", () => {
  const input = { evidence: [{ id: "E1" }, { id: "E2" }] };
  const expected = {
    requirement_statuses: { R1: "verified", R2: "verified" },
    required_finding_categories: [],
    completion_allowed: true,
    verdicts: ["complete"]
  };
  const scores = evaluateAuditor({ input, output: validAudit(), expected });
  assert.equal(byName(scores, "schema_valid").value, 1);
  assert.equal(byName(scores, "evidence_reference_validity").value, 1);
  assert.equal(byName(scores, "completion_gate").value, 1);
  assert.equal(byName(scores, "overall").value, 1);
});

test("auditor evaluator detects invented evidence references", () => {
  const report = validAudit();
  report.requirement_results[0].evidence_refs = ["E-INVENTED"];
  const scores = evaluateAuditor({
    input: { evidence: [{ id: "E1" }, { id: "E2" }] },
    output: report,
    expected: { completion_allowed: true, verdicts: ["complete"] }
  });
  assert.equal(byName(scores, "evidence_reference_validity").value, 0);
});
