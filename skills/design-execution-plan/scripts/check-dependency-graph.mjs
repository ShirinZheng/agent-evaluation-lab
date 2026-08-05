#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename) {
  console.error("usage: check-dependency-graph.mjs <execution-plan.json>");
  process.exit(64);
}
const plan = JSON.parse(await readFile(filename, "utf8"));
const tasks = new Map((plan.tasks || []).map((task) => [task.id, task]));
const eligible = [...tasks.values()].filter((task) => (task.depends_on || []).length === 0).map((task) => task.id);
const unknown = [];
for (const task of tasks.values()) {
  for (const dependency of task.depends_on || []) {
    if (!tasks.has(dependency)) unknown.push({ task: task.id, dependency });
  }
}
console.log(JSON.stringify({ task_count: tasks.size, initially_eligible: eligible, unknown_dependencies: unknown }, null, 2));
process.exit(unknown.length ? 1 : 0);
