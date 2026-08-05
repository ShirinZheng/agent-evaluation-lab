import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { stableJson } from "./json.mjs";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashObject(value) {
  return sha256(stableJson(value));
}

export async function hashFile(filename) {
  return sha256(await readFile(filename));
}

export async function hashDirectory(directory) {
  const rows = [];
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) rows.push([path.relative(directory, full), await hashFile(full)]);
    }
  }
  await visit(directory);
  return hashObject(rows);
}
