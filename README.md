# Portfolio Analyzer V3

Multi-user portfolio analysis: raw brokerage exports → scored analysis → hosted React report.

Three user configs live side by side — **kevin**, **luke**, **carly**. Everything that
varies per user is driven by env files; the code is identical for all three.

For architecture and engine invariants, see [CLAUDE.md](CLAUDE.md).

## How a config is selected

Every entry point (`src/index.ts`, `scripts/report.ts`, `scripts/publish.ts`) calls
`loadEnv()` ([src/loadEnv.ts](src/loadEnv.ts)), which layers env files — later wins:

| Order | File | Loaded when | Holds |
|---|---|---|---|
| 1 | `.env` | always | `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `FRED_API_KEY`, `PUBLISH_API_BASE` (prod URL) |
| 2 | `.env.<user>` | `--user <name>` on argv | `PORTFOLIO_DIR`, `ACCOUNTS_FILE`, `USER_CONTEXT_FILE`, `OUTPUT_FILE`, `PUBLISH_PUSH_TOKEN` |
| 3 | `.env.development` | `--dev` on argv | `PUBLISH_API_BASE=http://localhost:5000` and other local overrides |

A typo fails loudly: `--user bob` with no `.env.bob` throws rather than silently
falling back to another user's context. All `.env*` files are gitignored.

Per-user paths currently configured:

| User | `PORTFOLIO_DIR` (raw broker JSON) | Repo-local files |
|---|---|---|
| kevin | `C:\Users\kevin\repos\FinancialManager\Data` | `data/kevin/{accounts.csv, user-context.json, analysis.json}` |
| luke | `C:\Users\bowde\source\repos\FinancialManager\Data_Luke` | `data/luke/…` |
| carly | `C:\Users\bowde\source\repos\FinancialManager\Data_Carly` | `data/carly/…` |

> The luke and carly `PORTFOLIO_DIR` paths point at a `C:\Users\bowde\…` profile that
> does not exist on this machine. Analyze will fail for those two until the paths are
> repointed at wherever their broker exports actually live.

`PORTFOLIO_DIR` must contain dated broker snapshots named `YYYYMMDD_<Broker>.json`.
Only the **latest** date prefix is read; older snapshots in the folder are ignored.

## Run the analyzer

Writes `OUTPUT_FILE` (`data/<user>/analysis.json`) and prints a full console summary.

```sh
npm run analyze:kevin
npm run analyze:luke
npm run analyze:carly
```

Useful flags (append after `--`, e.g. `npm run analyze:kevin -- --no-refresh`, or use `npx tsx src/index.ts --user kevin --no-refresh`):

- `--no-refresh` — skip the live FRED + AI macro refresh and use `data/macro.json` as-is
  (offline runs, or when you want deterministic scoring).
- `--dev` — layer `.env.development` on top.

Notes:

- There is no bare `npm run analyze` / `npm run report`; always use a per-user alias. Running
  `src/index.ts` without `--user` reads only `.env` and falls back to
  `PORTFOLIO_DIR=data/SamplePortfolio`, which is not in this repo — it will fail.
- `ANTHROPIC_API_KEY` is optional. Without it the engine still runs; AI narratives,
  situation pulse-checks, and the tactical advisor are skipped.
- If a holding's ticker can't be classified, the run aborts and tells you to add it to
  `data/ticker-metadata.json`.

## View the report locally

The React app reads its data from the ASP.NET API, not from `analysis.json` on disk, so
the API must be running. **Which user's report you see is decided by who you log in as,
not by the script suffix** — `report:luke` and `report` differ only in which env file is
layered into the Vite process.

Two ways to run it:

```sh
# A. API serving the built app — one process, no HMR
npm run serve                       # builds React → wwwroot, runs the API on :5000
# open http://localhost:5000

# B. Vite dev server with HMR, proxying /api → :5000
dotnet run --project api/PortfolioReport.Api   # terminal 1 (or `npm run serve`)
npm run report:luke                            # terminal 2 → http://localhost:5173
```

On the landing page in Development, a **Test login — local only** block appears with a
one-click button per allowlisted user, or hit `/dev-login?user=kevin` directly. That
bypass is not mapped in Production.

Local API data lives in `api/PortfolioReport.Api/App_Data/<user>/`. To get a user's
analysis in front of the local API, publish to it in dev mode (below).

## Publish to the server

`publish` pulls the server's authoritative `user-context.json`, runs analyze for that
user, then pushes the resulting `analysis.json` back.

```sh
npm run publish:kevin          # → PUBLISH_API_BASE from .env (prod)
npm run publish:luke
npm run publish:carly

npm run publish:kevin:dev      # → http://localhost:5000 via .env.development
npm run publish:luke:dev
npm run publish:carly:dev
```

Always use the per-user aliases. `npm run publish -- --user kevin` works in bash but
**not** in Windows PowerShell, which drops the `--` so `--user` never reaches the script.

Each user's `PUBLISH_PUSH_TOKEN` in `.env.<user>` must match that user's `PushToken` in
the server's `Allowlist` config.

## Build, test, deploy

```sh
npm test                  # vitest — engine + intake unit tests
npm run test:watch

npx tsc --noEmit                                  # root project (src/, tests/)
npx tsc --noEmit -p src/report/app/tsconfig.json  # React app (separate tsconfig)

npm run build             # tsc + vite build
npm run build:api         # dotnet publish w/ React bundle → api/.../bin/Release/net8.0/publish
npm run deploy:whatif     # msdeploy dry run to Winhost
npm run deploy            # real deploy
```

Deployment details, IIS/Winhost setup, and the server-side allowlist are documented in
[docs/runbooks/winhost-deploy.md](docs/runbooks/winhost-deploy.md).

## Adding a fourth config

1. `data/<name>/accounts.csv` — copy the shape of [data/accounts.example.csv](data/accounts.example.csv).
2. `data/<name>/user-context.json` — copy [data/user-context.example.json](data/user-context.example.json).
3. `.env.<name>` — set `PORTFOLIO_DIR`, `ACCOUNTS_FILE`, `USER_CONTEXT_FILE`,
   `OUTPUT_FILE`, `PUBLISH_PUSH_TOKEN`.
4. Add the user to the server's `Allowlist` (email, user, push token) and restart the API.
5. Optionally add `analyze:<name>` / `report:<name>` / `publish:<name>` aliases to
   [package.json](package.json).
