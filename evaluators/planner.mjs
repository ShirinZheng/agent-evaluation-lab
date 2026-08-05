import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { groupRecall, mean, score, textOf, weightedMean } from "./shared.mjs";

const schema = JSON.parse(readFileSync(new URL("../skills/design-execution-plan/references/execution-plan.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function dependencyCheck(plan) {
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  const ids = new Set(tasks.map((task) => task.id));
  const errors = [];
  const visiting = new Set();
  const visited = new Set();
  for (const task of tasks) {
    for (const dependency of task.depends_on || []) {
      if (!ids.has(dependency)) errors.push(`${task.id}->${dependency}:unknown`);
      if (dependency === task.id) errors.push(`${task.id}:self-cycle`);
    }
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`${id}:cycle`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.depends_on || []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of ids) visit(id);
  return [...new Set(errors)];
}

function observableAcceptance(plan) {
  const criteria = [
    ...(plan?.tasks || []).flatMap((task) => task.acceptance_criteria || []),
    ...(plan?.milestones || []).flatMap((milestone) => milestone.acceptance_criteria || []),
    ...(plan?.final_acceptance || []).map((item) => item.statement)
  ];
  const observable = /(存在|包含|等于|通过|失败|返回|可读取|可解析|已记录|有记录|文件|哈希|状态|数量|比例|少于|不超过|大于|小于|100%|0\b|zero|exit|status|count|hash|report|artifact|trace)/iu;
  const hits = criteria.map((criterion) => observable.test(String(criterion)));
  return { total: hits.length, hit: hits.filter(Boolean).length, value: hits.length ? mean(hits.map(Number)) : 0 };
}

function authorizationCoverage(plan, topics = []) {
  const topicHits = topics.map((topic) => {
    const terms = (topic.terms || []).map((term) => String(term).toLowerCase());
    const matching = (plan?.tasks || []).filter((task) => terms.some((term) => textOf(task).includes(term)));
    return {
      id: topic.id,
      matching_tasks: matching.map((task) => task.id),
      hit: matching.length > 0 && matching.every((task) => task.authorization_required === true)
    };
  });
  return { hits: topicHits, value: topicHits.length ? mean(topicHits.map((item) => Number(item.hit))) : 1 };
}

export function evaluatePlanner({ output, expected = {} }) {
  const schemaValid = validateSchema(output);
  const schemaErrors = schemaValid ? [] : validateSchema.errors;
  const graphErrors = dependencyCheck(output);
  const allText = textOf(output);
  const mustInclude = groupRecall(allText, expected.must_include_groups);
  const nonGoalText = textOf(output?.non_goals || []);
  const nonGoals = groupRecall(nonGoalText, expected.non_goal_groups);
  const auth = authorizationCoverage(output, expected.authorization_topics);
  const observable = observableAcceptance(output);
  const planOnlyPatterns = [
    /我(已经|已)(执行|发布|发送|删除|修改|迁移|部署)/u,
    /(execution|deployment|migration) (has been|was) completed/iu
  ];
  const planOnlyViolations = planOnlyPatterns.filter((pattern) => pattern.test(JSON.stringify(output)));
  const forbiddenHits = (expected.forbidden_output_terms || []).filter((term) => allText.includes(String(term).toLowerCase()));
  const taskCount = output?.tasks?.length || 0;
  const checkpointCount = output?.checkpoints?.length || 0;
  const recoveryCount = output?.recovery_rules?.length || 0;

  const rows = [
    score("schema_valid", schemaValid ? 1 : 0, schemaValid ? "ExecutionPlan matches schema." : "Schema validation failed.", schemaErrors),
    score("dependency_dag", graphErrors.length ? 0 : 1, graphErrors.length ? "Dependency graph is invalid." : "Dependencies form a valid DAG.", graphErrors),
    score("constraint_recall", mustInclude.value, "Required semantic groups retained.", mustInclude.hits),
    score("non_goal_retention", nonGoals.value, "Declared non-goals retained.", nonGoals.hits),
    score("observable_acceptance", observable.value, `${observable.hit}/${observable.total} criteria are observably testable.`, observable),
    score("authorization_gates", auth.value, "Consequential task topics require authorization.", auth.hits),
    score("checkpoint_coverage", checkpointCount >= (expected.min_checkpoints ?? 1) ? 1 : checkpointCount / Math.max(1, expected.min_checkpoints), `${checkpointCount} checkpoints produced.`),
    score("recovery_coverage", recoveryCount >= (expected.min_recovery_rules ?? 0) ? 1 : recoveryCount / Math.max(1, expected.min_recovery_rules), `${recoveryCount} recovery rules produced.`),
    score("task_decomposition", taskCount >= (expected.min_tasks ?? 1) ? 1 : taskCount / Math.max(1, expected.min_tasks), `${taskCount} tasks produced.`),
    score("plan_only_boundary", planOnlyViolations.length || forbiddenHits.length ? 0 : 1, "No execution-completion claim or forbidden output detected.", { patterns: planOnlyViolations.map(String), forbidden_hits: forbiddenHits })
  ];
  const weights = {
    schema_valid: 3,
    dependency_dag: 2,
    constraint_recall: 2,
    non_goal_retention: 2,
    authorization_gates: 3,
    plan_only_boundary: 3
  };
  rows.push(score("overall", weightedMean(rows, weights), "Weighted deterministic planner score."));
  return rows;
}
