#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename) {
  console.error("usage: validate-plan.mjs <execution-plan.json>");
  process.exit(64);
}

let plan;
try {
  plan = JSON.parse(await readFile(filename, "utf8"));
} catch (error) {
  console.error(JSON.stringify({ valid: false, errors: [`invalid-json: ${error.message}`] }));
  process.exit(1);
}

const errors = [];
const requiredArrays = [
  "constraints", "non_goals", "assumptions", "milestones", "tasks", "checkpoints",
  "recovery_rules", "stop_conditions", "final_acceptance"
];

if (plan.schema_version !== "1.0.0") errors.push("schema_version must be 1.0.0");
for (const key of ["plan_id", "objective"]) {
  if (typeof plan[key] !== "string" || !plan[key].trim()) errors.push(`${key} is required`);
}
for (const key of requiredArrays) {
  if (!Array.isArray(plan[key])) errors.push(`${key} must be an array`);
}

function uniqueIds(items, label) {
  if (!Array.isArray(items)) return new Set();
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id) {
      errors.push(`${label} contains an item without id`);
      continue;
    }
    if (ids.has(item.id)) errors.push(`${label} contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

uniqueIds(plan.constraints, "constraints");
uniqueIds(plan.assumptions, "assumptions");
uniqueIds(plan.stop_conditions, "stop_conditions");
uniqueIds(plan.final_acceptance, "final_acceptance");
const milestoneIds = uniqueIds(plan.milestones, "milestones");
const taskIds = uniqueIds(plan.tasks, "tasks");
uniqueIds(plan.checkpoints, "checkpoints");
uniqueIds(plan.recovery_rules, "recovery_rules");

if (milestoneIds.size === 0) errors.push("at least one milestone is required");
if (taskIds.size === 0) errors.push("at least one task is required");
if (Array.isArray(plan.final_acceptance) && plan.final_acceptance.length === 0) {
  errors.push("final_acceptance must not be empty");
}

const graph = new Map();
for (const task of plan.tasks || []) {
  if (!task || !task.id) continue;
  if (!Array.isArray(task.depends_on)) errors.push(`task ${task.id} depends_on must be an array`);
  if (!Array.isArray(task.outputs) || task.outputs.length === 0) errors.push(`task ${task.id} needs outputs`);
  if (!Array.isArray(task.acceptance_criteria) || task.acceptance_criteria.length === 0) {
    errors.push(`task ${task.id} needs acceptance_criteria`);
  }
  if (!["low", "medium", "high", "critical"].includes(task.risk_level)) {
    errors.push(`task ${task.id} has invalid risk_level`);
  }
  if (typeof task.authorization_required !== "boolean") {
    errors.push(`task ${task.id} authorization_required must be boolean`);
  }
  graph.set(task.id, task.depends_on || []);
  for (const dependency of task.depends_on || []) {
    if (!taskIds.has(dependency)) errors.push(`task ${task.id} has unknown dependency ${dependency}`);
    if (dependency === task.id) errors.push(`task ${task.id} depends on itself`);
  }
}

for (const milestone of plan.milestones || []) {
  if (!Array.isArray(milestone.task_ids) || milestone.task_ids.length === 0) {
    errors.push(`milestone ${milestone.id || "?"} needs task_ids`);
  }
  for (const taskId of milestone.task_ids || []) {
    if (!taskIds.has(taskId)) errors.push(`milestone ${milestone.id} has unknown task ${taskId}`);
  }
}

for (const checkpoint of plan.checkpoints || []) {
  for (const taskId of checkpoint.after_task_ids || []) {
    if (!taskIds.has(taskId)) errors.push(`checkpoint ${checkpoint.id} has unknown task ${taskId}`);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(id) {
  if (visiting.has(id)) {
    errors.push(`dependency cycle includes ${id}`);
    return;
  }
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of graph.get(id) || []) visit(dependency);
  visiting.delete(id);
  visited.add(id);
}
for (const id of graph.keys()) visit(id);

console.log(JSON.stringify({ valid: errors.length === 0, errors }, null, 2));
process.exit(errors.length === 0 ? 0 : 1);
