# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: greenfield

The repo currently contains only `Documentation/DevelopmentDoc1.md` (v2.0, dated 2026-05-11). No `src/`, `package.json`, `data/`, or build config exists yet. **All implementation work flows from that spec** — read it before doing anything substantive. Section 15 of the spec defines the exact build order; follow it.

## What this project is

A weekly portfolio health analyzer. User drops a JSON file of holdings into `data/portfolio.json`, runs `npm run analyze` to produce `output/analysis.json`, then `npm run report` to view a React (Vite) report rendered into 8 sections (allocation, benchmark comparison, dimension scorecard, key findings, radar, additional takeaways, gaps, flags).

Stack: TypeScript / Node.js / React (Vite) / Anthropic SDK.

## Architecture (the big picture)

The pipeline is intentionally one-directional with a single AI call at the end:

```
portfolio.json + macro.json
        │
        ▼
  computeAggregates()          ← pure math, no I/O   (src/engine/aggregates.ts)
        │
        ▼
  scoreAllDimensions()         ← pure math, 10 dims  (src/engine/dimensions.ts)
        │
        ▼
  generateFlags / GapItems /   ← rule-based, no AI   (src/engine/plan.ts)
  generatePlanPhases
        │
        ▼
  generateNarratives()         ← ONE Anthropic call  (src/ai/narratives.ts)
        │
        ▼
  output/analysis.json
        │
        ▼
  React report reads JSON      (src/report/app/)
```

**Load-bearing invariants:**

- **Portfolio-level analysis only.** There are no per-holding metric scores. The old `metrics.json` scoring system (fund_core20, equity_core10) from prior versions is gone. Don't reintroduce it.
- **All scoring is pure math.** `engine/` modules must have no API calls, no `fs`, no side effects. They take inputs, return scored objects. This is what makes them testable.
- **Exactly one Anthropic API call per run** — in `narratives.ts`. The AI generates text only (headlines, strengths, gaps, takeaways). It does not score, rank, or compute. If you're tempted to add a second call, reconsider.
- **All types live in `src/types.ts`.** Import from there. Never redeclare interfaces inline. The spec lists the full type surface in Section 4.
- **`benchmarks.ts` is static data.** The 3 reference models (Boglehead 3-fund, All Weather, Classic 60/40) are the ruler. They don't change based on user portfolio.

## Commands (once scaffolded per spec §13)

```
npm run analyze   # ts-node src/index.ts — runs pipeline, writes output/analysis.json
npm run report    # vite src/report/app --open — opens React report
npm run build     # tsc && vite build src/report/app
```

The CLI requires `ANTHROPIC_API_KEY` in `.env` (used by `@anthropic-ai/sdk`).

No test runner is specified in the spec. If you add one, match the existing tooling era (ts-node + tsc, no bundler beyond Vite).

## Conventions from the spec worth honoring

- **AI narratives style** (from `narratives.ts` SYSTEM_PROMPT): use actual values not vague language (e.g. "25.4% cash", not "high cash"); grades formatted as `B−` with a Unicode minus, not `B-`; no words "robust" or "optimize"; tone is direct, CFA-to-colleague.
- **Pending vs. idle cash are separate concepts.** `is_pending_deployment: true` cash is excluded from the cash-drag penalty because it has an active plan. The scoring and the AI both rely on this distinction.
- **Model used in `narratives.ts`** is currently spec'd as `claude-sonnet-4-20250514`. If updating, confirm the model ID against the latest Anthropic model list before changing.

## What changed vs. FinancialManagerV2

V2 is a separate sibling directory (`../FinancialManagerV2/`) with docs + TDD only, no src. V3 is a clean restart of the same idea — same domain, simpler pipeline (one AI call, no per-holding scoring, portfolio-level only).
