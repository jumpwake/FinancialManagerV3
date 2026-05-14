# Multi-User Env Config — Design

**Status:** Approved (design phase)
**Date:** 2026-05-14
**Owner:** Kevin
**Goal:** Run the analyzer + report for any number of distinct users (Kevin, Luke, Kelly, …) without files-per-user clobbering each other, using per-user `.env` files.

## Problem

Today every user-specific path is hardcoded:

| What | Path | Configurable? |
|---|---|---|
| Raw broker snapshots | `data/SamplePortfolio/` | Yes — `PORTFOLIO_DIR` env var |
| Account config | `data/accounts.csv` | No |
| Situations + notes + chat history | `data/user-context.json` | No (passed as constructor arg in two places, both hardcoded) |
| Analyzer output (consumed by the React report) | `output/analysis.json` | No |

Running `npm run analyze` against Luke's data would clobber Kevin's `user-context.json`, write to Kevin's `output/analysis.json`, and silently mis-route based on Kevin's `accounts.csv` rows. There is no way to keep separate workspaces.

## Goals

- One env var per user-specific path, loaded from `.env.<user>` when `--user <name>` is passed.
- No flag → existing behavior preserved (loads `.env`, uses today's hardcoded defaults for any unset var). Kevin's current workflow doesn't change.
- All four touchpoints (analyze CLI, dev-server middleware, Vite static-serve, chat handler) honor the per-user paths.
- `--user typo` is a hard error — never silently falls back to the wrong user.

## Non-goals

- A user-selector inside the React UI. Switching users still happens at process start.
- Per-user `macro.json` (it's universal market state, shared).
- Per-user API keys (`ANTHROPIC_API_KEY` lives in `.env` and is shared; users can still override it in `.env.<user>` if needed).
- Output history snapshots per user.

## Architecture

### Env vars

| Var | Default | Consumers |
|---|---|---|
| `PORTFOLIO_DIR` | `data/SamplePortfolio` | `src/index.ts` |
| `ACCOUNTS_FILE` *(new)* | `data/accounts.csv` | `src/index.ts` |
| `USER_CONTEXT_FILE` *(new)* | `data/user-context.json` | `src/index.ts`, `src/server/vitePlugin.ts`, `src/report/app/vite.config.ts` |
| `OUTPUT_FILE` *(new)* | `output/analysis.json` | `src/index.ts`, `src/server/handlers/chat.ts`, `src/report/app/vite.config.ts` |

Per the user's confirmation: **all user-specific settings live in the user's `.env.<user>` file.** No values are hardcoded to user identity in any source file. New vars added in the future for user-specific concerns follow the same pattern.

### File layout

```
.env            # shared/default (today's setup)
.env.luke       # Luke's overrides — gitignored
.env.kelly
```

`.env.<user>` need only contain paths that differ from the defaults; `dotenv`'s `override: true` semantics layer it on top of `.env`. Universal values (`ANTHROPIC_API_KEY`) live once in `.env`.

### Invocation

```sh
npm run analyze                    # no flag → .env defaults (today's behavior)
npm run analyze -- --user luke     # loads .env, then .env.luke overrides
npm run report  -- --user luke     # same, for the dev server
```

The `--` is npm's pass-through separator; everything after is forwarded to the underlying script.

## Components

### 1. `src/loadEnv.ts` *(new)*

Single function used by every entry point. Replaces the bare `import "dotenv/config"`:

```ts
import { config } from "dotenv";
import * as fs from "node:fs";

export function loadEnv(): { user: string | null } {
  config(); // .env (no-op if missing)
  const idx = process.argv.indexOf("--user");
  const user = idx > -1 ? process.argv[idx + 1] ?? null : null;
  if (user) {
    const path = `.env.${user}`;
    if (!fs.existsSync(path)) {
      throw new Error(`--user ${user} but ${path} not found`);
    }
    config({ path, override: true });
  }
  return { user };
}
```

`existsSync` check is explicit because `config({ path })` with a missing file silently no-ops in some dotenv versions.

### 2. `src/index.ts`

Three changes:
- Replace `import "dotenv/config"` with `import { loadEnv } from "./loadEnv"; loadEnv();`
- Add env reads alongside existing `SAMPLE_DIR`:
  ```ts
  const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE ?? "data/accounts.csv";
  const USER_CONTEXT_FILE = process.env.USER_CONTEXT_FILE ?? "data/user-context.json";
  const OUTPUT_FILE = process.env.OUTPUT_FILE ?? "output/analysis.json";
  ```
- The `accounts.csv` vs `accounts.example.csv` fallback at lines 54–56 keeps working: when `ACCOUNTS_FILE` is unset and `data/accounts.csv` is missing, fall back to `data/accounts.example.csv`. When `ACCOUNTS_FILE` is set, always honor it (no example fallback — typos should fail loudly).

### 3. `src/server/vitePlugin.ts`

- Top of file: replace `import "dotenv/config"` with `import { loadEnv } from "../loadEnv"; loadEnv();`
- Update the default to honor the env var:
  ```ts
  const contextPath =
    opts.contextPath ?? process.env.USER_CONTEXT_FILE ?? path.resolve(process.cwd(), "data/user-context.json");
  ```

### 4. `src/server/handlers/chat.ts`

The `loadAnalysis()` helper at line 40 reads `output/analysis.json` literally:

```ts
const p = path.resolve(process.env.OUTPUT_FILE ?? "output/analysis.json");
```

### 5. `src/report/app/vite.config.ts`

This is where the React app gets `/analysis.json` from (via `publicDir`) and where the middleware plugin gets its `contextPath`. Both must come from env:

```ts
import { loadEnv } from "../../loadEnv";
loadEnv();

const outputFile = process.env.OUTPUT_FILE ?? path.resolve(__dirname, "../../../output/analysis.json");
const contextFile = process.env.USER_CONTEXT_FILE ?? path.resolve(__dirname, "../../../data/user-context.json");

export default defineConfig({
  plugins: [react(), userContextPlugin({ contextPath: contextFile })],
  publicDir: path.dirname(outputFile),
  server: { port: 5173 },
});
```

`publicDir` is `path.dirname(OUTPUT_FILE)` so the React app's `fetch("/analysis.json")` resolves to the user-specific output file (it's served as `/<basename>`). This means **the filename within `OUTPUT_FILE` must always be `analysis.json`** — the report's fetch URL is hardcoded. Documented as a constraint.

### 6. `scripts/report.ts` *(new launcher)*

`npm run report` currently calls `vite src/report/app --open` directly — that's a separate process where our env-loader code doesn't run unless we wrap it. The wrapper:

```ts
import { spawn } from "node:child_process";
import { loadEnv } from "../src/loadEnv";

loadEnv();
const child = spawn("npx", ["vite", "src/report/app", "--open"], {
  stdio: "inherit",
  env: process.env,
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
```

`package.json`:
```diff
- "report": "vite src/report/app --open",
+ "report": "tsx scripts/report.ts",
```

The Vite plugin's own `import { loadEnv }` (step 3) is still needed because Vite is often launched directly during development (`npx vite ...`) without going through `scripts/report.ts`. Double-loading is idempotent.

### 7. `.gitignore`

Verify `.env*` is already covered. If only `.env` is listed, add `.env.*` so `.env.luke`, `.env.kelly` are gitignored.

## Data flow

```
  npm run analyze -- --user luke
        │
        ▼
  loadEnv()
    ├── load .env
    └── load .env.luke (override)
        │
        ▼
  process.env now has Luke's paths
        │
        ├── ACCOUNTS_FILE         → parseAccountsCSV reads it
        ├── PORTFOLIO_DIR         → findLatestSnapshotFiles reads it
        ├── USER_CONTEXT_FILE     → loadUserContext reads it
        └── OUTPUT_FILE           → fs.writeFileSync writes here

  npm run report -- --user luke
        │
        ▼
  scripts/report.ts → loadEnv() → spawn vite (inherits env)
        │
        ▼
  vite.config.ts reads env, sets publicDir + contextPath
        │
        ├── /analysis.json     → served from path.dirname(OUTPUT_FILE)
        ├── /api/chat          → handleChatRoute(req, res, USER_CONTEXT_FILE)
        ├── /api/situations    → handleSituationsRoute(req, res, USER_CONTEXT_FILE)
        └── /api/notes         → handleNotesRoute(req, res, USER_CONTEXT_FILE)
```

## Failure modes

| Scenario | Behavior |
|---|---|
| `--user luke` and no `.env.luke` exists | Hard error from `loadEnv` with clear message |
| `.env.luke` exists but is missing some vars | Falls back to `.env` value (or hardcoded default if neither sets it) — intentional |
| `.env` doesn't exist and no `--user` | dotenv silently no-ops; hardcoded defaults take over (= today's first-run behavior) |
| `OUTPUT_FILE` points at a non-`analysis.json` basename | React app's `fetch("/analysis.json")` 404s. Documented constraint. |
| `OUTPUT_FILE` is in a directory that doesn't exist | `fs.writeFileSync` throws — same as today |
| Two `npm run report` instances against different users | Both serve on port 5173, second one fails to bind. Acceptable (user picks one at a time). |

## Testing

- **Unit test `loadEnv`** in `src/loadEnv.test.ts`:
  - With `--user luke` and a temp `.env.luke` fixture, asserts env values come through.
  - With `--user typo` and no matching file, asserts it throws.
  - With no `--user`, asserts plain `.env` is loaded and no error.
- No engine tests change. The CLI orchestrator and Vite plugin remain manually verified per CLAUDE.md's "engine + intake follow TDD; CLI/UI manual".
- **Manual smoke**:
  - `npm run analyze` (no flag) — produces `output/analysis.json` as today.
  - `npm run analyze -- --user luke` against a `.env.luke` pointing at `Data_Luke` — produces `output/luke/analysis.json`, doesn't touch Kevin's files.
  - `npm run report -- --user luke` — report loads Luke's data, chat/situations/notes mutate `data/luke/user-context.json` (or wherever `.env.luke` points), Kevin's `data/user-context.json` is untouched.

## Migration

- No code path changes meaning for users running without `--user`. `data/accounts.csv`, `data/user-context.json`, and `output/analysis.json` remain the defaults.
- Onboarding a new user (Luke):
  1. Create `.env.luke` with the four paths.
  2. Create the directories those paths reference.
  3. Drop broker JSON into the configured `PORTFOLIO_DIR`.
  4. Create an `accounts.csv` at the configured `ACCOUNTS_FILE` (or rely on auto-fill if no exceptional accounts).
  5. Run `npm run analyze -- --user luke`.

## Out of scope (flagged, not doing)

- Per-user macro state (`macro.json` is shared).
- A multi-user selector inside the React UI.
- Sharing or comparing portfolios across users.
- Output history snapshots (e.g., `output/luke/2026-05-14/analysis.json`).
- A CLI helper to scaffold `.env.<user>` from a template.
