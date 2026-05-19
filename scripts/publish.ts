/**
 * Local publish flow: pull the server's user-context.json, run the analyze
 * pipeline, then push the resulting analysis.json back to the server.
 *
 * Usage:  npm run publish -- --user kevin
 *
 * Env (from .env / .env.<user>):
 *   PUBLISH_API_BASE   e.g. https://finance.bis-corp.com
 *   PUBLISH_PUSH_TOKEN the user's push token
 *   USER_CONTEXT_FILE  local path analyze reads the profile from
 *   OUTPUT_FILE        local path analyze writes analysis.json to
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadEnv } from "../src/loadEnv";

const { user } = loadEnv();
if (!user) {
  console.error("publish: pass --user <name> (e.g. npm run publish -- --user kevin)");
  process.exit(1);
}

const base = required("PUBLISH_API_BASE");
const token = required("PUBLISH_PUSH_TOKEN");
const contextFile = path.resolve(required("USER_CONTEXT_FILE"));
const outputFile = path.resolve(required("OUTPUT_FILE"));

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`publish: ${name} is not set (check .env.${user})`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  // 1. Pull the authoritative user-context.json so analyze sees the latest profile.
  console.log(`publish: pulling user-context for ${user}...`);
  const pull = await fetch(`${base}/api/user-context`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pull.ok) throw new Error(`pull failed: HTTP ${pull.status}`);
  fs.mkdirSync(path.dirname(contextFile), { recursive: true });
  fs.writeFileSync(contextFile, await pull.text());

  // 2. Run the existing analyze pipeline for this user.
  console.log("publish: running analyze...");
  const analyze = spawnSync(
    "npx",
    ["tsx", "src/index.ts", "--user", user!],
    { stdio: "inherit", shell: true },
  );
  if (analyze.status !== 0) throw new Error(`analyze exited ${analyze.status}`);

  // 3. Push the freshly written analysis.json.
  console.log("publish: pushing analysis.json...");
  const analysisJson = fs.readFileSync(outputFile, "utf-8");
  const push = await fetch(`${base}/api/analysis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: analysisJson,
  });
  if (!push.ok) throw new Error(`push failed: HTTP ${push.status}`);
  console.log(`publish: done — ${await push.text()}`);
}

main().catch((err) => {
  console.error("publish failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
