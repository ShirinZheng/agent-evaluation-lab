#!/usr/bin/env node
import { LangfuseClient } from "@langfuse/client";
import { loadCases } from "./datasets.mjs";
import { checkLangfuse } from "./langfuse.mjs";

const health = await checkLangfuse();
if (!health.connected) throw new Error(`Langfuse unavailable: ${health.error}`);
const client = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || "http://localhost:3000"
});
const created = [];
for (const agent of ["planner", "auditor"]) {
  const cases = await loadCases(agent);
  for (const suite of ["smoke", "dev", "regression", "holdout"] ) {
    const items = cases.filter((item) => item.suites.includes(suite));
    if (!items.length) continue;
    const datasetName = `${agent}-${suite}-v1`;
    try {
      await client.api.datasets.create({
        name: datasetName,
        description: `Local ${agent} ${suite} dataset. Expected output is evaluator-only.`,
        metadata: { agent, suite, version: 1 }
      });
    } catch (error) {
      if (!/already|exist|conflict|409/iu.test(error.message)) throw error;
    }
    for (const item of items) {
      await client.dataset.createItem({
        datasetName,
        id: `${datasetName}:${item.id}`,
        input: item.input,
        expectedOutput: item.expected,
        metadata: { case_id: item.id, tags: item.tags, suites: item.suites }
      });
    }
    created.push({ dataset: datasetName, items: items.length });
  }
}
await client.shutdown();
console.log(JSON.stringify({ synced: created }, null, 2));
