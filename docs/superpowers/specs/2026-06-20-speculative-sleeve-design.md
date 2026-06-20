# Speculative Sleeve carve-out — design

**Date:** 2026-06-20
**Status:** approved, ready for implementation plan

## Problem

The "hardcore analysis" (single-stock-risk scoring, flags, and the AI tactical
advisor + narratives) targets individual stocks like TSLA and NVDA for trimming
on valuation, beta, and growth grounds. Some of these are small, deliberately-held
speculative positions — owned for personal/long-term reasons, not as
metrics-driven investments. The user wants to carve them out of the metrics
discipline without hiding them.

Current targeting of TSLA/NVDA happens in three places:

1. `scoreSingleStockRisk` (`src/engine/dimensions.ts:203`) — numeric penalty that
   drags single-stock-risk to ~7.6 and flows into the portfolio grade.
2. Flags (`src/engine/plan.ts:generateFlags`) — e.g.
   `valuation:extreme_overvaluation:TSLA`, `macro_alignment:high_beta:TSLA`,
   `macro_alignment:high_beta:NVDA`.
3. AI advisor + narratives (`src/ai/tacticalAdvisor.ts`, `src/ai/narratives.ts`) —
   e.g. tactical move `t7_001` "Trim TSLA from $45,408 to ~$22,500".

## Goal

Introduce a **Speculative Sleeve**: a user-designated set of tickers held outside
the metrics discipline. Members are exempt from per-name penalties, flags, and AI
trade recommendations — but shown transparently as a labeled sleeve, and the
**combined** sleeve weight is watched against a configurable threshold so a
"small" position can't quietly grow into an unmanaged one.

Chosen behavior: **Hybrid with transparency** — exempt from the penalty and the
trim recommendations, but keep the per-name flags visible in a muted form and
surface the sleeve's combined weight. The only speculative "nag" that can fire is
a single sleeve-size flag when the combined weight exceeds the threshold.

## Non-goals

- No per-account or per-lot granularity — matching is by ticker across all accounts.
- No change to how non-speculative holdings are scored or flagged.
- No automatic detection of "speculative" positions — the list is user-curated.

## Data model & config

Speculative holds live in `data/<user>/user-context.json`, alongside `situations`
and `notes`, so they persist across re-runs and can be edited without code changes.

```jsonc
"speculative_holds": [
  { "ticker": "TSLA", "reason": "Long-term personal hold, owned many years", "designated_at": "2026-06-20" },
  { "ticker": "NVDA", "reason": "Speculative AI position", "designated_at": "2026-06-20" }
],
"speculative_sleeve_threshold": 0.05   // optional; defaults to 0.05 (5% of total portfolio)
```

Type changes in `src/types.ts`:

- New `SpeculativeHold` interface: `{ ticker: string; reason?: string; designated_at: string }`.
- `UserContext` gains `speculative_holds: SpeculativeHold[]` and
  `speculative_sleeve_threshold: number` (parser fills the default).
- `FlagSuppressionRef.source` union gains `"speculative_hold"` (joins
  `"note" | "situation"`).
- `PortfolioAggregates` gains `speculative_sleeve_weight: number` and
  `speculative_sleeve_tickers: string[]`.

`src/intake/parseUserContext.ts`:

- Validate `speculative_holds` (zod array; `ticker` required, `reason` optional,
  `designated_at` required string).
- Validate `speculative_sleeve_threshold`; default to `0.05` when absent.
- Tickers are compared using the existing canonicalization (`canonicalTicker`)
  so `BRK B` / `BRK-B` style variants match consistently.

Seed the initial list for the current user with **TSLA** and **NVDA**.

## Engine behavior

Matching: a holding is "speculative" when its canonical ticker is in
`speculative_holds`. Helper (e.g. `isSpeculative(ticker, holds)`) shared across
modules.

### `aggregates.ts`

- Compute `speculative_sleeve_weight` = sum of `market_value` for speculative
  holdings ÷ `total_value`.
- Compute `speculative_sleeve_tickers` = distinct canonical tickers present.
- `computeAggregates` needs access to the speculative list — thread it in as a
  parameter (mirrors how it already receives `accounts`).

### `dimensions.ts` — `scoreSingleStockRisk`

- Skip the penalty loop for holdings whose ticker is speculative (they contribute
  zero penalty and are not added to `flaggedTickers`).
- Update `note` / `display_value` to disclose the exemption, e.g.
  "2 positions excluded as speculative sleeve (TSLA, NVDA)".
- With TSLA + NVDA excluded, single-stock-risk rises from ~7.6 toward 10.

### `plan.ts` — `generateFlags`

- Per-name flags for speculative tickers are **still generated** but annotated
  `suppressed_by: { source: "speculative_hold", id: <ticker>, body: <reason or default> }`.
  This matches the existing Note-suppression pattern (generate-then-annotate, not
  drop), so the report can show them muted.
- New **sleeve-size flag**: if `speculative_sleeve_weight` exceeds the threshold,
  emit exactly one flag, e.g.
  `finding_key: "speculative_sleeve:over_threshold"`, body
  "Speculative sleeve at X% of portfolio (threshold 5%) — TSLA, NVDA". Severity
  yellow. This is the only speculative nag that can fire.
- Today TSLA (1.7%) + NVDA (1.9%) ≈ 3.6% < 5% → no sleeve flag.

### Suppression wiring

- Extend suppression handling so speculative annotation is applied to the raw
  flags. Either add an `applySpeculativeSuppressions(flags, gaps, speculativeHolds)`
  in `src/engine/suppression.ts` (sibling to `applyNoteSuppressions`) or fold the
  annotation into a combined pass. `index.ts` applies both note and speculative
  suppression before assembling output.

### `index.ts` orchestration

- Read `speculative_holds` / threshold from parsed user context.
- Pass the list into `computeAggregates`, `scoreSingleStockRisk`/`scoreAllDimensions`,
  `generateFlags`, the suppression pass, and the two AI calls.

## AI advisor & narratives

Both `runTacticalAdvisor` and `generateNarratives` receive the speculative ticker
list and an explicit prompt rule (the suppressed flags flow through `flags`
automatically, but the prompts still see raw `portfolio` metrics, so the rule
prevents the model from re-deriving a trim):

> The following are user-designated speculative-sleeve holds: TSLA, NVDA. Do **not**
> recommend trimming, selling, or rebalancing these on valuation, beta, or growth
> grounds — the user holds them deliberately and outside the metrics discipline.
> You **may** reference the sleeve only if the sleeve-size flag is active (combined
> weight over threshold).

Effects:

- Tactical advisor no longer emits the TSLA trim move (`t7_001`-style).
- Narratives no longer surface TSLA's P/E as a gap bullet.
- The AI remains free to recommend on everything else (cash deployment,
  simplicity, international, asset location, etc.).

Prompt-snapshot tests (`tacticalAdvisor.prompt.test.ts`, narratives prompt tests)
update to cover the new rule text.

## Report (React app)

- Mirror the new types in `src/report/app/types.ts` (the app does not import
  `src/types.ts` directly).
- Render suppressed per-name flags **muted**, grouped under a labeled
  **"Speculative sleeve"** section showing combined weight, e.g.
  "Speculative sleeve: 3.6% — TSLA, NVDA".
- When the sleeve-size flag is active, it renders as a normal (non-muted) flag.

## Surfaces touched

`src/types.ts`, `src/intake/parseUserContext.ts`, `src/engine/aggregates.ts`,
`src/engine/dimensions.ts`, `src/engine/plan.ts`, `src/engine/suppression.ts`,
`src/index.ts`, `src/ai/tacticalAdvisor.ts`, `src/ai/narratives.ts`,
`src/report/app/types.ts` + flag rendering, and `data/kevin/user-context.json`
(seed list).

## Testing

Per CLAUDE.md TDD discipline — co-located vitest tests for each engine/intake
change:

- `parseUserContext.test.ts` — parses `speculative_holds`, applies threshold default.
- `aggregates.test.ts` — `speculative_sleeve_weight` / tickers computed correctly.
- `dimensions.test.ts` — speculative tickers excluded from single-stock penalty;
  score rises; note discloses exemption; a probe with a non-speculative risky
  stock still penalizes.
- `plan.test.ts` — speculative per-name flags annotated `suppressed_by`
  `speculative_hold`; sleeve flag fires only when combined weight exceeds threshold
  (boundary probe around the threshold).
- `suppression.test.ts` — speculative annotation applied; coexists with note
  suppression.
- Prompt-snapshot tests updated for the new AI rule.

Run both tsconfigs after implementation:

```sh
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

## Invariants preserved

- Engine stays pure math (no I/O) — the speculative list is passed in, not read
  from disk inside engine modules.
- All shared types in `src/types.ts`; React app mirror updated separately.
- AI generates text/recommendations only; the sleeve weight and threshold check
  are computed in the engine, not by the model.
