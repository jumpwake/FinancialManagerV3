# Multi-User Env Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `npm run analyze -- --user luke` (and `npm run report -- --user luke`) load Luke-specific paths from `.env.luke` so multiple users can be processed without clobbering each other.

**Architecture:** A single `src/loadEnv.ts` helper layers `.env.<user>` over `.env` (via dotenv's `override: true`) when `--user` is on argv. Four user-specific paths become env vars (`ACCOUNTS_FILE`, `USER_CONTEXT_FILE`, `OUTPUT_FILE` are new; `PORTFOLIO_DIR` exists). Every entry point (analyze CLI, Vite dev server, Vite static-serve config, chat handler) reads through env. A small `scripts/report.ts` wrapper loads env before spawning Vite so the dev server inherits user-specific paths.

**Tech Stack:** TypeScript 5.4 (ESM), `dotenv` (already a dependency), `tsx` runner, `vitest` for the loader test.

**Spec:** `Documentation/superpowers/specs/2026-05-14-multi-user-env-config-design.md`

---

## File Map

### New files
- `src/loadEnv.ts` — env loader function
- `src/loadEnv.test.ts` — three tests for the loader
- `scripts/report.ts` — wrapper that calls `loadEnv()` then spawns Vite

### Modified files
- `src/index.ts` — replace `import "dotenv/config"` with `loadEnv()`; add three env-var reads (lines 25–28)
- `src/server/vitePlugin.ts` — replace `import "dotenv/config"` with `loadEnv()`; have the default `contextPath` honor `USER_CONTEXT_FILE`
- `src/server/handlers/chat.ts` — `loadAnalysis()` reads from `OUTPUT_FILE` env var (line 40)
- `src/report/app/vite.config.ts` — load env, derive `publicDir` and `contextPath` from env
- `package.json` — change `"report"` script to `tsx scripts/report.ts`
- `.gitignore` — ensure `.env.*` is covered

---

## Task 1: Build `loadEnv` with TDD

**Files:**
- Create: `src/loadEnv.ts`
- Test: `src/loadEnv.test.ts`

The loader takes optional `cwd` and `argv` for testability; production calls use the defaults (real cwd, real argv).

- [ ] **Step 1: Write the failing tests**

Create `src/loadEnv.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadEnv } from "./loadEnv";

describe("loadEnv", () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loadenv-"));
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      process.env[k] = v;
    }
  });

  it("returns user=null and loads .env when no --user is passed", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "LOADENV_TEST=base\n");
    const result = loadEnv({ cwd: tmpDir, argv: ["node", "script.js"] });
    expect(result.user).toBeNull();
    expect(process.env.LOADENV_TEST).toBe("base");
  });

  it("layers .env.<user> over .env when --user is passed", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "LOADENV_TEST=base\nLOADENV_SHARED=keep\n",
    );
    fs.writeFileSync(path.join(tmpDir, ".env.luke"), "LOADENV_TEST=luke\n");
    const result = loadEnv({
      cwd: tmpDir,
      argv: ["node", "script.js", "--user", "luke"],
    });
    expect(result.user).toBe("luke");
    expect(process.env.LOADENV_TEST).toBe("luke");
    expect(process.env.LOADENV_SHARED).toBe("keep");
  });

  it("throws when --user names a missing .env.<user> file", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "");
    expect(() =>
      loadEnv({
        cwd: tmpDir,
        argv: ["node", "script.js", "--user", "ghost"],
      }),
    ).toThrow(/--user ghost/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/loadEnv.test.ts`
Expected: FAIL with "Failed to load url ./loadEnv" or "cannot find module".

- [ ] **Step 3: Write the minimal implementation**

Create `src/loadEnv.ts`:

```ts
import { config } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LoadEnvOptions {
  /** Working directory to look up `.env` / `.env.<user>` against. Defaults to `process.cwd()`. */
  cwd?: string;
  /** argv to scan for `--user <name>`. Defaults to `process.argv`. */
  argv?: string[];
}

export interface LoadEnvResult {
  user: string | null;
}

/**
 * Load `.env`, then `.env.<user>` on top of it when `--user <name>` is on argv.
 * Throws if `--user <name>` is given but `.env.<name>` does not exist — a typo
 * should never silently fall back to a different user's context.
 */
export function loadEnv(opts: LoadEnvOptions = {}): LoadEnvResult {
  const cwd = opts.cwd ?? process.cwd();
  const argv = opts.argv ?? process.argv;

  config({ path: path.join(cwd, ".env") });

  const idx = argv.indexOf("--user");
  const user = idx > -1 ? argv[idx + 1] ?? null : null;
  if (user) {
    const envPath = path.join(cwd, `.env.${user}`);
    if (!fs.existsSync(envPath)) {
      throw new Error(`--user ${user} but ${envPath} not found`);
    }
    config({ path: envPath, override: true });
  }
  return { user };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/loadEnv.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/loadEnv.ts src/loadEnv.test.ts
git commit -m "feat(env): add loadEnv helper that layers .env.<user> over .env"
```

---

## Task 2: Wire `loadEnv` into the analyze CLI

**Files:**
- Modify: `src/index.ts` (lines 1, 25–28, 54–56)

Replace `dotenv/config` with `loadEnv()`, and turn the three remaining hardcoded paths into env reads while preserving today's defaults.

- [ ] **Step 1: Replace the dotenv import with loadEnv**

Open `src/index.ts`. Replace line 1:

```ts
import "dotenv/config";
```

with:

```ts
import { loadEnv } from "./loadEnv";
```

Then, immediately after the import block (before `const SAMPLE_DIR = …`), insert:

```ts
loadEnv();
```

(`loadEnv()` must run before the `const … = process.env.…` declarations below; placing it as the first statement of the module body guarantees that.)

- [ ] **Step 2: Add the three new env-var reads**

Replace the existing block at lines 25–28:

```ts
const SAMPLE_DIR = process.env.PORTFOLIO_DIR ?? "data/SamplePortfolio";
const MACRO_FILE = "data/macro.json";
const OUTPUT_FILE = "output/analysis.json";
const USER_CONTEXT_FILE = "data/user-context.json";
```

with:

```ts
const SAMPLE_DIR = process.env.PORTFOLIO_DIR ?? "data/SamplePortfolio";
const MACRO_FILE = "data/macro.json";
const OUTPUT_FILE = process.env.OUTPUT_FILE ?? "output/analysis.json";
const USER_CONTEXT_FILE = process.env.USER_CONTEXT_FILE ?? "data/user-context.json";
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE ?? "data/accounts.csv";
```

- [ ] **Step 3: Update the accounts-file fallback**

Find the block at roughly lines 54–56 that selects between `data/accounts.csv` and `data/accounts.example.csv`:

```ts
const accountsFile = fs.existsSync("data/accounts.csv")
  ? "data/accounts.csv"
  : "data/accounts.example.csv";
```

Replace with:

```ts
// When ACCOUNTS_FILE is explicitly set, honor it (typos should fail loudly).
// Only when unset do we fall back from data/accounts.csv → data/accounts.example.csv
// for first-run usability.
const accountsFile = process.env.ACCOUNTS_FILE
  ? ACCOUNTS_FILE
  : fs.existsSync(ACCOUNTS_FILE)
    ? ACCOUNTS_FILE
    : "data/accounts.example.csv";
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Backwards-compat smoke test**

Run: `npm run analyze`
Expected: pipeline runs to completion as before, writes `output/analysis.json`, prints the console summary. No errors about missing env vars.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat(env): make analyze CLI honor ACCOUNTS_FILE, USER_CONTEXT_FILE, OUTPUT_FILE"
```

---

## Task 3: Make the Vite dev-server middleware honor `USER_CONTEXT_FILE`

**Files:**
- Modify: `src/server/vitePlugin.ts` (lines 1, 16–17)

The plugin currently hardcodes `data/user-context.json` as the default and has its own `import "dotenv/config"`. Move it to the same `loadEnv` and read the env var.

- [ ] **Step 1: Swap the dotenv import for loadEnv**

Open `src/server/vitePlugin.ts`. Replace line 1:

```ts
import "dotenv/config";
```

with:

```ts
import { loadEnv } from "../loadEnv";

loadEnv();
```

- [ ] **Step 2: Honor USER_CONTEXT_FILE in the default**

Replace lines 16–17:

```ts
const contextPath =
  opts.contextPath ?? path.resolve(process.cwd(), "data/user-context.json");
```

with:

```ts
const contextPath =
  opts.contextPath ??
  process.env.USER_CONTEXT_FILE ??
  path.resolve(process.cwd(), "data/user-context.json");
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/server/vitePlugin.ts
git commit -m "feat(env): vitePlugin honors USER_CONTEXT_FILE env var"
```

---

## Task 4: Make the chat handler honor `OUTPUT_FILE`

**Files:**
- Modify: `src/server/handlers/chat.ts` (line 40)

The `loadAnalysis()` helper currently hardcodes `output/analysis.json`. The chat tool needs to read the per-user analysis file.

- [ ] **Step 1: Make the path env-aware**

Open `src/server/handlers/chat.ts`. Find the `loadAnalysis` function near line 39:

```ts
function loadAnalysis(): unknown {
  const p = path.resolve("output/analysis.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
```

Replace `path.resolve("output/analysis.json")` with `path.resolve(process.env.OUTPUT_FILE ?? "output/analysis.json")`:

```ts
function loadAnalysis(): unknown {
  const p = path.resolve(process.env.OUTPUT_FILE ?? "output/analysis.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/server/handlers/chat.ts
git commit -m "feat(env): chat handler honors OUTPUT_FILE env var"
```

---

## Task 5: Update the React app's Vite config

**Files:**
- Modify: `src/report/app/vite.config.ts`

Both `publicDir` (which serves `/analysis.json`) and the plugin's `contextPath` must come from env. `publicDir` is derived as `path.dirname(OUTPUT_FILE)` — the React app fetches `/analysis.json`, so the basename must remain `analysis.json` (documented in the spec).

- [ ] **Step 1: Replace the config file**

Open `src/report/app/vite.config.ts`. Replace its full contents with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { loadEnv } from "../../loadEnv";
import { userContextPlugin } from "../../server/vitePlugin";

loadEnv();

// Project root is src/report/app/. The CLI writes OUTPUT_FILE (default
// output/analysis.json) at the repo root. Point Vite's static-serve directory
// at the OUTPUT_FILE's parent so /analysis.json resolves to the user-specific
// output without copying. The basename within OUTPUT_FILE must be
// analysis.json — see spec 2026-05-14-multi-user-env-config-design.md.
const outputFile = process.env.OUTPUT_FILE
  ? path.resolve(process.env.OUTPUT_FILE)
  : path.resolve(__dirname, "../../../output/analysis.json");

const contextFile = process.env.USER_CONTEXT_FILE
  ? path.resolve(process.env.USER_CONTEXT_FILE)
  : path.resolve(__dirname, "../../../data/user-context.json");

export default defineConfig({
  plugins: [
    react(),
    userContextPlugin({ contextPath: contextFile }),
  ],
  publicDir: path.dirname(outputFile),
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 2: Type-check the React project**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no output.

- [ ] **Step 3: Type-check the root project**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/vite.config.ts
git commit -m "feat(env): React app's vite config reads OUTPUT_FILE and USER_CONTEXT_FILE"
```

---

## Task 6: Add the `npm run report` launcher

**Files:**
- Create: `scripts/report.ts`
- Modify: `package.json`

`npm run report` currently calls `vite` directly as a child process. To get `loadEnv` to run before Vite starts (and to have Vite inherit the per-user env), wrap it in a tsx script.

- [ ] **Step 1: Confirm the `scripts/` directory exists**

Run: `ls scripts 2>/dev/null || mkdir scripts`
Expected: either the directory listing prints, or the directory is created.

- [ ] **Step 2: Create the launcher**

Create `scripts/report.ts`:

```ts
import { spawn } from "node:child_process";
import { loadEnv } from "../src/loadEnv";

loadEnv();

const child = spawn(
  "npx",
  ["vite", "src/report/app", "--open"],
  {
    stdio: "inherit",
    env: process.env,
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
```

- [ ] **Step 3: Update the npm script**

Open `package.json`. Find the `"report"` script under `"scripts"`. Currently:

```json
"report": "vite src/report/app --open",
```

Replace with:

```json
"report": "tsx scripts/report.ts",
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. If TS reports that `scripts/report.ts` isn't part of the project, that's fine — `tsx` runs it directly without needing tsconfig inclusion.

- [ ] **Step 5: Backwards-compat smoke test**

Run: `npm run report` in one terminal. Wait for "Local:   http://localhost:5173/" to print, open the URL in a browser, confirm the report loads as today. Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add scripts/report.ts package.json
git commit -m "feat(env): wrap npm run report in tsx launcher that calls loadEnv"
```

---

## Task 7: Update `.gitignore` to cover per-user env files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Check current state**

Run: `grep -n env .gitignore || echo "no .env line"`
Expected: shows the current `.env` line(s) — typical pattern is `.env` on its own line.

- [ ] **Step 2: Ensure both `.env` and `.env.*` are ignored**

Open `.gitignore`. If you see only `.env` (no glob), add a sibling line so the file now contains:

```
.env
.env.*
```

If `.env*` is already present (matches both), no change needed — skip to step 4.

- [ ] **Step 3: Verify no per-user files are tracked**

Run: `git status --ignored | grep -E "\.env(\.|$)"`
Expected: any `.env`, `.env.luke`, etc. appear under "Ignored files" (or no output if none exist yet).

- [ ] **Step 4: Commit (if .gitignore changed)**

```bash
git add .gitignore
git commit -m "chore: gitignore per-user .env.* files"
```

If `.gitignore` already covered the pattern, skip the commit.

---

## Task 8: End-to-end multi-user smoke test

**Files:**
- Create: `.env.smoke` (temporary, deleted at end of task)

The earlier tasks did per-task smoke testing without `--user`. This task exercises the per-user path end-to-end with a throwaway `.env.smoke`.

- [ ] **Step 1: Note the current timestamp of Kevin's files**

Run: `ls -la data/user-context.json output/analysis.json`
Expected: prints two file lines. Note the timestamps — they'll be compared against in step 5.

- [ ] **Step 2: Create the smoke scratch directory**

Run: `mkdir -p output/smoke`
Expected: directory created (or already exists).

- [ ] **Step 3: Create a throwaway .env.smoke**

Create `.env.smoke` at the repo root:

```
PORTFOLIO_DIR=data/SamplePortfolio
ACCOUNTS_FILE=data/accounts.csv
USER_CONTEXT_FILE=output/smoke/user-context.json
OUTPUT_FILE=output/smoke/analysis.json
```

(Reusing the real PORTFOLIO_DIR and ACCOUNTS_FILE so the pipeline has data to chew on; redirecting only user-context and output into the scratch directory.)

- [ ] **Step 4: Run analyze with --user smoke**

Run: `npm run analyze -- --user smoke`
Expected: pipeline runs to completion. The console summary mentions writing to `output/smoke/analysis.json` (not `output/analysis.json`).

- [ ] **Step 5: Verify per-user routing took effect**

Run: `ls -la output/smoke/analysis.json output/analysis.json data/user-context.json`
Expected:
- `output/smoke/analysis.json` exists with a recent timestamp.
- `output/analysis.json` timestamp matches what you noted in step 1 (Kevin's file untouched).
- `data/user-context.json` timestamp matches what you noted in step 1 (Kevin's context untouched).

- [ ] **Step 6: Negative test — typo should hard-fail**

Run: `npm run analyze -- --user nonsense`
Expected: process exits non-zero with error message matching `--user nonsense but .env.nonsense not found`.

- [ ] **Step 7: Clean up the throwaway**

Run:

```bash
rm .env.smoke
rm -rf output/smoke
```

Expected: files removed. No commit (these were always throwaway).

---

## Self-review checklist

After all 8 tasks complete:

- [ ] `npx tsc --noEmit` clean
- [ ] `npx tsc --noEmit -p src/report/app/tsconfig.json` clean
- [ ] `npx vitest run` — `src/loadEnv.test.ts` 3/3 pass; the 5 pre-existing failures in `src/intake/normalize.test.ts` (looking for `20260509_FidelityRetirement.json`) are unchanged
- [ ] `npm run analyze` (no flag) still works against Kevin's setup
- [ ] `npm run report` (no flag) still works against Kevin's setup
- [ ] Spec requirements from `2026-05-14-multi-user-env-config-design.md` — every component listed in §"Components" has a corresponding task

---

## Out of scope (per spec)

- Per-user `macro.json`
- User selector inside the React UI
- Output history snapshots per user
- A CLI helper to scaffold `.env.<user>` from a template
