# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: implementation complete (engine + intake TDD, CLI, narratives, React UI)

The full stack is in place on the `tdd-engine-intake` branch (branched from `main`):

- **Engine + intake**: built test-first across 22 plan tasks + 3 normalization tasks. 174 vitest tests passing, `tsc --noEmit` clean.
- **CLI** (`src/index.ts`): runs the pipeline end-to-end against the 5 brokerage sample files. Writes `output/analysis.json` and prints a structured console summary.
- **Narratives** (`src/ai/narratives.ts`): single `claude-sonnet-4-6` call producing structured AI text via `messages.parse()` + Zod schema. Skipped gracefully if `ANTHROPIC_API_KEY` is unset.
- **React report** (`src/report/app/`): Vite + chart.js. Renders all 8 sections per dev doc §12.

The full TDD plan is at `docs/superpowers/plans/2026-05-11-tdd-portfolio-analyzer.md`. The dev doc (`Documentation/DevelopmentDoc1.md`) is the original spec — it's older than the actual implementation in several places (model ID, SDK version, scoreDiversification formula bug).

## Quick start

```sh
npm install
npm run analyze         # runs pipeline against data/SamplePortfolio/*.json, writes output/analysis.json
npm run report          # opens the React report at http://localhost:5173

# To enable AI narratives, create .env with:
#   ANTHROPIC_API_KEY=sk-ant-...
# Then re-run npm run analyze. Narratives are optional — the rest of the pipeline runs without them.
```

## Commands

```sh
npm test              # vitest run — engine + intake unit tests
npm run test:watch    # vitest in watch mode
npm run analyze       # tsx src/index.ts — runs full pipeline, writes output/analysis.json
npm run report        # vite src/report/app --open — serves the React report
npm run build         # tsc && vite build src/report/app
```

## Architecture

```
data/SamplePortfolio/*.json                       data/macro.json
        │ (raw brokerage exports)                          │
        ▼                                                  │
  normalizeFidelityAccounts / Empower / Vanguard           │
        │                                                  │
        ▼                                                  │
  consolidatePortfolio()  ← merge duplicates across brokers│
        │                                                  ▼
        ▼                                              parseMacro()
  parsePortfolio()  ← zod-validated Portfolio              │
        │                                                  │
        ├──────────────────────┬──────────────────────┬────┘
        ▼                      ▼                      ▼
  computeAggregates()    scoreAllDimensions()   (macro context flows through)
                                │
                                ▼
                generateFlags / generateGapItems / generatePlanPhases
                                │
                                ▼
                  generateNarratives() ← single Anthropic call (optional)
                                │
                                ▼
                       output/analysis.json
                                │
                                ▼
                     React report (8 sections)
```

## Load-bearing invariants

- **Portfolio-level analysis only.** No per-holding metric scoring — that approach was abandoned in V3. Don't reintroduce it.
- **Engine is pure math.** `src/engine/*.ts` modules must have no I/O, no API calls, no `fs`. Everything is deterministic in/out.
- **Exactly one Anthropic API call per run** — in `narratives.ts`. The AI generates text only. It does not score, rank, or compute. Adding a second call breaks the architecture; reconsider.
- **All shared types in `src/types.ts`.** The zod schemas in `src/intake/parsePortfolio.ts` and `parseMacro.ts` are validation only — they `import type` from `types.ts`, never re-export.
- **`benchmarks.ts`** derives `REFERENCE_MODELS[].score` and `.grade` from each model's `dimension_scores` via `computePortfolioScore` + `scoreToGrade`. The hardcoded weights map in benchmarks.ts must stay in sync with the per-dimension `weight` fields in `dimensions.ts` — there's a test that asserts this.
- **Pending vs. idle cash are separate concepts.** `is_pending_deployment: true` cash is excluded from the cash-drag penalty (it has an active plan). Scoring, flags, and gap items all depend on this distinction.
- **Account identity is preserved per holding** via `Holding.account_id`. `normalize.ts` attaches it from `data/accounts.json`. Aggregates split duplicates into `duplicate_groups` (same-account waste, penalized) and `cross_account_groups` (cross-broker equivalents, informational only).
- **Balanced and target-date holdings carry `underlying_composition`** that sums to 1.0. `aggregates.ts` uses this so that `equity_weight`, `international_weight`, and `fixed_income_weight` reflect the true exposure inside VWENX, target-date funds, etc.
- **Asset Location is the 11th dimension** at weight 0.08; reference models score neutral 7. The benchmarks WEIGHTS map and per-dimension `weight` fields must stay in sync — `benchmarks.test.ts` asserts this.

## Important conventions

- **AI narratives style** (`narratives.ts` SYSTEM_PROMPT): use actual values not vague language ("25.4% cash" not "high cash"); grades use Unicode minus `−` (U+2212), not ASCII `-`; no words "robust" or "optimize"; CFA-to-colleague tone.
- **Regime-aware text** in `plan.ts`: the FI target percentages (e.g. "18–30%") and adjectives (e.g. "late-cycle") in flag bodies and plan-phase action descriptions are derived from `macro.market_regime` via `FI_TARGETS_BY_REGIME` (exported from `dimensions.ts`). Don't hardcode "late-cycle" or "18–22%" anywhere.
- **Ticker canonicalization**: `BRK B` (Vanguard's format) → `BRK-B` via `canonicalTicker()` in `tickerMetadata.ts`. The ticker metadata lookup uses canonical keys.
- **Empower descriptive symbols**: funds like `"US Large Company Stocks Fund"` are keyed by their full label in `TICKER_METADATA` since they have no real ticker.

## TDD discipline

- Test files are co-located: `src/engine/aggregates.ts` ↔ `src/engine/aggregates.test.ts`
- Fixture builders live at `tests/fixtures/samplePortfolio.ts` and `tests/fixtures/sampleMacro.ts` — use `makeHolding`, `makePortfolio`, `makeStockMetrics`, `makeMacro` rather than raw literals
- Boundary tests are sparse — most score-ladder tests probe interior values. If you're adding a new ladder dimension, consider adding a boundary probe to prevent off-by-one regressions
- Engine + intake follow TDD. The CLI orchestrator (`src/index.ts`), narratives (`src/ai/narratives.ts`), and React UI (`src/report/app/`) are built without unit tests — verify them manually

## Stack & versions

- TypeScript 5.4, `"strict": true`, `"module": "ESNext"`, `"moduleResolution": "Bundler"`
- Vitest 1.x (tests), Vite 5.x (React app), tsx 4.x (CLI runner)
- `@anthropic-ai/sdk` ^0.95.0 — bumped from the dev doc's stale `^0.24.0`. Uses `client.messages.parse()` with `output_config.format` and a Zod schema. Adaptive thinking (`type: "adaptive"`).
- zod ^3.22 for runtime schema validation in intake/

## Two tsconfigs

There are two TypeScript projects:
- **Root** (`tsconfig.json`): covers `src/` and `tests/` — the engine, intake, CLI, narratives, fixtures.
- **React app** (`src/report/app/tsconfig.json`): covers only `src/report/app/`. The app **does not** import from `src/types.ts` directly; it has its own `src/report/app/types.ts` mirror. If you change a type in `src/types.ts` that the React app consumes, also update the mirror.

Always run both:
```sh
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

## What's still TODO

- The "Post-T3 projected weights" toggle in `AllocationBreakdown.tsx` is stubbed (TODO comment)
