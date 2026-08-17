import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePlanner } from "../evaluators/planner.mjs";

function byName(scores, name) {
  return scores.find((item) => item.name === name);
}

function basePlan() {
  return {
    schema_version: "1.0.0",
    plan_id: "PLAN-CALIBRATION",
    objective: "生成一份可验证的执行报告。",
    constraints: [],
    non_goals: [],
    assumptions: [],
    milestones: [{
      id: "M1",
      outcome: "报告通过验证。",
      task_ids: ["T1"],
      acceptance_criteria: ["validator exit code 等于 0。"]
    }],
    tasks: [{
      id: "T1",
      objective: "生成执行报告。",
      depends_on: [],
      inputs: ["输入数据"],
      outputs: ["report.json"],
      acceptance_criteria: ["report.json 可解析。"],
      risk_level: "low",
      authorization_required: false
    }],
    checkpoints: [{ id: "CP1", after_task_ids: ["T1"], durable_state: "report.json", validation: "记录文件 hash。" }],
    recovery_rules: [{ id: "RR1", trigger: "进程中断", preserved_state: "report.json", next_action: "验证 hash 后继续", retry_limit: 1 }],
    stop_conditions: [{ id: "S1", statement: "validator exit code 等于 0 时停止。" }],
    final_acceptance: [{ id: "FA1", statement: "report.json 存在。" }]
  };
}

function constraintScore(plan) {
  return byName(evaluatePlanner({
    output: plan,
    expected: { must_include_groups: [{ id: "local-only", terms: ["本地", "localhost"] }] }
  }), "constraint_recall").value;
}

function observableScore(criterion) {
  const plan = basePlan();
  plan.milestones[0].acceptance_criteria = [criterion];
  plan.tasks[0].acceptance_criteria = [criterion];
  plan.final_acceptance[0].statement = criterion;
  return byName(evaluatePlanner({ output: plan }), "observable_acceptance").value;
}

const authorizationTopic = [{ id: "production-switch", terms: ["正式切换", "切换流量"] }];

function authorizationScore(plan) {
  return byName(evaluatePlanner({ output: plan, expected: { authorization_topics: authorizationTopic } }), "authorization_gates").value;
}

test("constraint recall accepts an explicit constraint", () => {
  const plan = basePlan();
  plan.constraints = [{ id: "C1", statement: "所有工作只能在本地完成。" }];
  assert.equal(constraintScore(plan), 1);
});

test("constraint recall rejects a missing constraint", () => {
  const plan = basePlan();
  plan.constraints = [{ id: "C1", statement: "所有工作在隔离环境完成。" }];
  assert.equal(constraintScore(plan), 0);
});

test("constraint recall accepts a configured boundary synonym", () => {
  const plan = basePlan();
  plan.constraints = [{ id: "C1", statement: "预览服务只能绑定 localhost。" }];
  assert.equal(constraintScore(plan), 1);
});

test("constraint recall rejects keywords dumped into an unrelated field", () => {
  const plan = basePlan();
  plan.assumptions = [{ id: "A1", statement: "评分词占位：本地。", validation: "删除占位内容。" }];
  assert.equal(constraintScore(plan), 0);
});

test("observable acceptance accepts a measurable process result", () => {
  assert.equal(observableScore("validator exit code 等于 0。"), 1);
});

test("observable acceptance rejects an unmeasurable quality claim", () => {
  assert.equal(observableScore("整体质量通过评审，体验优秀。"), 0);
});

test("observable acceptance accepts a boundary accessibility statement", () => {
  assert.equal(observableScore("每个核心页面均能打开。"), 1);
});

test("observable acceptance rejects a list of scoring keywords", () => {
  assert.equal(observableScore("列出 report、artifact、trace、hash、status 这些评分关键词。"), 0);
});

test("authorization gates accept a gated consequential task", () => {
  const plan = basePlan();
  plan.tasks[0].objective = "获得批准后正式切换生产流量。";
  plan.tasks[0].authorization_required = true;
  assert.equal(authorizationScore(plan), 1);
});

test("authorization gates reject an ungated consequential task", () => {
  const plan = basePlan();
  plan.tasks[0].objective = "正式切换生产流量。";
  assert.equal(authorizationScore(plan), 0);
});

test("authorization gates ignore topic mentions outside task objectives", () => {
  const plan = basePlan();
  plan.tasks = [
    { ...plan.tasks[0], id: "T1", objective: "评估生产变更风险。", inputs: ["正式切换申请"] },
    { ...plan.tasks[0], id: "T2", objective: "获得批准后正式切换生产流量。", authorization_required: true }
  ];
  plan.milestones[0].task_ids = ["T1", "T2"];
  assert.equal(authorizationScore(plan), 1);
});

test("authorization gates reject keywords dumped into gated task outputs", () => {
  const plan = basePlan();
  plan.tasks[0].objective = "编写风险说明。";
  plan.tasks[0].outputs = ["正式切换关键词清单"];
  plan.tasks[0].authorization_required = true;
  assert.equal(authorizationScore(plan), 0);
});
