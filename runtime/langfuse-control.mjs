#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../runner/paths.mjs";

const runtimeDirectory = path.join(root, ".runtime", "langfuse");
const composePath = path.join(runtimeDirectory, "docker-compose.yml");
const environmentPath = path.join(root, ".env.langfuse.local");
const environmentExample = path.join(root, ".env.langfuse.example");
const sourceUrl = "https://raw.githubusercontent.com/langfuse/langfuse/production/docker-compose.yml";

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}

async function bootstrap() {
  await mkdir(runtimeDirectory, { recursive: true });
  if (!(await exists(composePath))) {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`cannot download official Langfuse compose: HTTP ${response.status}`);
    const body = await response.text();
    await writeFile(composePath, body);
    await writeFile(path.join(runtimeDirectory, "source.json"), `${JSON.stringify({
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
      sha256: createHash("sha256").update(body).digest("hex")
    }, null, 2)}\n`);
  }
  if (!(await exists(environmentPath))) await copyFile(environmentExample, environmentPath);
  return { composePath, environmentPath };
}

async function dockerCompose(args, { capture = false } = {}) {
  await bootstrap();
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["compose", "--env-file", environmentPath, "-f", composePath, "-p", "agent-evaluation-langfuse", ...args], {
      cwd: runtimeDirectory,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(stderr || `docker compose exited ${code}`)));
  });
}

const command = process.argv[2] || "status";
if (command === "bootstrap") {
  console.log(JSON.stringify(await bootstrap(), null, 2));
} else if (command === "start") {
  await dockerCompose(["up", "-d"]);
  console.log("Langfuse containers started. Run `npm run langfuse:status` until the web service is healthy.");
} else if (command === "status") {
  const result = await dockerCompose(["ps"], { capture: true });
  process.stdout.write(result.stdout);
  try {
    const response = await fetch("http://localhost:3000/api/public/health", { signal: AbortSignal.timeout(3000) });
    console.log(`HTTP health: ${response.status} ${await response.text()}`);
  } catch (error) {
    console.log(`HTTP health: unavailable (${error.message})`);
  }
} else if (command === "stop") {
  await dockerCompose(["down"]);
  console.log("Langfuse containers stopped; named volumes were preserved.");
} else {
  throw new Error("usage: langfuse-control.mjs bootstrap|start|status|stop");
}
