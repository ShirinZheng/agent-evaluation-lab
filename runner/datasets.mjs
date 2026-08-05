import { readJsonl } from "../lib/json.mjs";
import { definitions } from "./paths.mjs";

export async function loadCases(agent) {
  return (await readJsonl(definitions[agent].datasetPath)).map((item) => ({ ...item, agent }));
}

export async function selectCases({ agents, suite, caseId, limit, repeat }) {
  const selected = [];
  for (const agent of agents) {
    let cases = await loadCases(agent);
    if (caseId) cases = cases.filter((item) => item.id === caseId);
    else cases = cases.filter((item) => item.suites?.includes(suite));
    if (Number.isFinite(limit)) cases = cases.slice(0, limit);
    for (const item of cases) {
      for (let attempt = 1; attempt <= repeat; attempt += 1) {
        selected.push({ ...item, attempt, caseKey: `${agent}:${item.id}:${attempt}` });
      }
    }
  }
  return selected;
}
