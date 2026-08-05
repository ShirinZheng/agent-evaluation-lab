import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const definitions = {
  planner: {
    key: "planner",
    skillName: "design-execution-plan",
    skillPath: path.join(root, "skills", "design-execution-plan"),
    agentPath: path.join(root, "agents", "execution-planner-agent.md"),
    schemaPath: path.join(root, "skills", "design-execution-plan", "references", "execution-plan.schema.json"),
    datasetPath: path.join(root, "datasets", "planner.jsonl")
  },
  auditor: {
    key: "auditor",
    skillName: "audit-execution-evidence",
    skillPath: path.join(root, "skills", "audit-execution-evidence"),
    agentPath: path.join(root, "agents", "evidence-auditor-agent.md"),
    schemaPath: path.join(root, "skills", "audit-execution-evidence", "references", "audit-report.schema.json"),
    datasetPath: path.join(root, "datasets", "auditor.jsonl")
  }
};
