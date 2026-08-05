#!/usr/bin/env node
import path from "node:path";
import { definitions } from "./paths.mjs";
import { loadCases } from "./datasets.mjs";

const errors = [];
const ids = new Set();
for (const agent of Object.keys(definitions)) {
  const cases = await loadCases(agent);
  if (!cases.some((item) => item.suites?.includes("smoke"))) errors.push(`${agent}: no smoke case`);
  for (const item of cases) {
    if (!item.id) errors.push(`${agent}: item without id`);
    if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    ids.add(item.id);
    if (!item.input || typeof item.input !== "object") errors.push(`${item.id}: input must be object`);
    if (!item.expected || typeof item.expected !== "object") errors.push(`${item.id}: expected must be object`);
    if (!Array.isArray(item.suites) || item.suites.length === 0) errors.push(`${item.id}: suites required`);
    if (!Array.isArray(item.tags)) errors.push(`${item.id}: tags required`);
  }
}
console.log(JSON.stringify({ valid: errors.length === 0, case_count: ids.size, errors }, null, 2));
process.exitCode = errors.length ? 1 : 0;
