import test from "node:test";
import assert from "node:assert/strict";
import { loadCases, selectCases } from "../runner/datasets.mjs";

test("both datasets have stable unique cases", async () => {
  const planner = await loadCases("planner");
  const auditor = await loadCases("auditor");
  assert.equal(planner.length, 6);
  assert.equal(auditor.length, 6);
  assert.equal(new Set([...planner, ...auditor].map((item) => item.id)).size, 12);
});

test("limit is applied per agent and repeat creates isolated case keys", async () => {
  const selected = await selectCases({
    agents: ["planner", "auditor"],
    suite: "smoke",
    caseId: null,
    limit: 1,
    repeat: 2
  });
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map((item) => item.caseKey)).size, 4);
});
