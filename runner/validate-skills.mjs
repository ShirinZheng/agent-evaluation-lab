#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { definitions } from "./paths.mjs";

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/u);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([a-z_]+):\s*(.+)$/u);
    if (pair) values[pair[1]] = pair[2].trim().replace(/^(["'])(.*)\1$/u, "$2");
  }
  return values;
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

const errors = [];
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const definition of Object.values(definitions)) {
  const markdownPath = path.join(definition.skillPath, "SKILL.md");
  const agentMetadataPath = path.join(definition.skillPath, "agents", "openai.yaml");
  const markdown = await readFile(markdownPath, "utf8");
  const frontmatter = parseFrontmatter(markdown);
  if (!frontmatter) errors.push(`${definition.skillName}: missing YAML frontmatter`);
  if (frontmatter?.name !== definition.skillName) errors.push(`${definition.skillName}: frontmatter name must match directory`);
  if (!frontmatter?.description || frontmatter.description.length < 40) errors.push(`${definition.skillName}: description is missing or too short`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(frontmatter?.name || "")) errors.push(`${definition.skillName}: name must be kebab-case`);
  if (markdown.split("\n").length > 500) errors.push(`${definition.skillName}: SKILL.md exceeds 500 lines`);

  for (const match of markdown.matchAll(/\]\(((?:references|scripts)\/[^)#]+)(?:#[^)]+)?\)/gu)) {
    const linked = path.join(definition.skillPath, match[1]);
    if (!(await exists(linked))) errors.push(`${definition.skillName}: missing linked file ${match[1]}`);
  }

  if (!(await exists(agentMetadataPath))) {
    errors.push(`${definition.skillName}: missing agents/openai.yaml`);
  } else {
    const metadata = await readFile(agentMetadataPath, "utf8");
    for (const field of ["display_name", "short_description", "default_prompt"]) {
      if (!new RegExp(`^\\s*${field}:`, "mu").test(metadata)) errors.push(`${definition.skillName}: openai.yaml missing ${field}`);
    }
    if (!metadata.includes(`$${definition.skillName}`)) errors.push(`${definition.skillName}: default_prompt must name $${definition.skillName}`);
  }

  try {
    const schema = JSON.parse(await readFile(definition.schemaPath, "utf8"));
    ajv.compile(schema);
  } catch (error) {
    errors.push(`${definition.skillName}: invalid output schema (${error.message})`);
  }
}

console.log(JSON.stringify({ valid: errors.length === 0, skill_count: Object.keys(definitions).length, errors }, null, 2));
if (errors.length) process.exitCode = 1;
