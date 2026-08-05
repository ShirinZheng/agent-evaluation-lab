import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./paths.mjs";

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function summarize(items) {
  const scoreNames = [...new Set(items.flatMap((item) => item.evaluations.map((score) => score.name)))].sort();
  const averages = Object.fromEntries(scoreNames.map((name) => {
    const values = items.flatMap((item) => item.evaluations.filter((score) => score.name === name).map((score) => score.value));
    return [name, Number(average(values).toFixed(6))];
  }));
  const byAgent = {};
  for (const agent of [...new Set(items.map((item) => item.agent))]) {
    const agentItems = items.filter((item) => item.agent === agent);
    byAgent[agent] = {
      count: agentItems.length,
      overall: Number(average(agentItems.flatMap((item) => item.evaluations.filter((score) => score.name === "overall").map((score) => score.value))).toFixed(6))
    };
  }
  return {
    item_count: items.length,
    harness_valid: items.length > 0 && items.every((item) => item.process.exit_code === 0 && item.process.parsed && !item.process.timed_out),
    successful_processes: items.filter((item) => item.process.exit_code === 0 && !item.process.timed_out).length,
    parsed_outputs: items.filter((item) => item.process.parsed).length,
    averages,
    by_agent: byAgent
  };
}

function markdown(report) {
  const lines = [
    `# Experiment ${report.run_id}`,
    "",
    `- Mode: ${report.langfuse.mode}`,
    `- Langfuse connected: ${report.langfuse.connected}`,
    `- Snapshot: ${report.snapshot.snapshot_id}`,
    `- Cases: ${report.summary.item_count}`,
    `- Parsed: ${report.summary.parsed_outputs}/${report.summary.item_count}`,
    "",
    "## Agent scores",
    "",
    "| Agent | Cases | Overall |",
    "|---|---:|---:|"
  ];
  for (const [agent, summary] of Object.entries(report.summary.by_agent)) {
    lines.push(`| ${agent} | ${summary.count} | ${summary.overall.toFixed(3)} |`);
  }
  lines.push("", "## Lowest cases", "", "| Case | Agent | Overall | Exit |", "|---|---|---:|---:|");
  const sorted = [...report.items].sort((a, b) => {
    const av = a.evaluations.find((item) => item.name === "overall")?.value ?? -1;
    const bv = b.evaluations.find((item) => item.name === "overall")?.value ?? -1;
    return av - bv;
  });
  for (const item of sorted.slice(0, 10)) {
    lines.push(`| ${item.case_id} | ${item.agent} | ${(item.evaluations.find((score) => score.name === "overall")?.value ?? 0).toFixed(3)} | ${item.process.exit_code} |`);
  }
  if (report.langfuse.error) lines.push("", "## Langfuse note", "", report.langfuse.error);
  return `${lines.join("\n")}\n`;
}

export async function writeReport(report) {
  const reportsDirectory = path.join(root, "reports");
  await mkdir(reportsDirectory, { recursive: true });
  const jsonPath = path.join(reportsDirectory, `${report.run_id}.json`);
  const markdownPath = path.join(reportsDirectory, `${report.run_id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, markdown(report));
  return { jsonPath, markdownPath };
}
