#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashDirectory, hashFile, hashObject } from "../lib/hash.mjs";
import { definitions, root } from "./paths.mjs";

function timestamp() {
  return new Date().toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

export async function createSnapshot({ persist = true } = {}) {
  const objects = {};
  for (const [key, definition] of Object.entries(definitions)) {
    objects[key] = {
      skill_hash: await hashDirectory(definition.skillPath),
      agent_hash: await hashFile(definition.agentPath)
    };
  }
  const evaluator_hash = await hashDirectory(path.join(root, "evaluators"));
  const dataset_hash = await hashDirectory(path.join(root, "datasets"));
  const shortHash = hashObject({ objects, evaluator_hash, dataset_hash }).slice(0, 12);
  const snapshotId = `${timestamp()}-${shortHash}`;
  const directory = path.join(root, "snapshots", snapshotId);
  const manifest = {
    schema_version: "1.0.0",
    snapshot_id: snapshotId,
    created_at: new Date().toISOString(),
    objects,
    evaluator_hash,
    dataset_hash
  };
  if (persist) {
    await mkdir(directory, { recursive: true });
    await mkdir(path.join(directory, "skills"), { recursive: true });
    await mkdir(path.join(directory, "agents"), { recursive: true });
    for (const [key, definition] of Object.entries(definitions)) {
      await cp(definition.skillPath, path.join(directory, "skills", definition.skillName), { recursive: true });
      await cp(definition.agentPath, path.join(directory, "agents", path.basename(definition.agentPath)));
      manifest.objects[key].skill_path = path.join(directory, "skills", definition.skillName);
      manifest.objects[key].agent_path = path.join(directory, "agents", path.basename(definition.agentPath));
    }
    await writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return { manifest, directory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const { manifest } = await createSnapshot();
  console.log(JSON.stringify(manifest, null, 2));
}
