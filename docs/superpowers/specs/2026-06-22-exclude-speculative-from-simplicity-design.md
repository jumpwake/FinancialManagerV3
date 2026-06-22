# Exclude speculative holds from Simplicity scoring

**Date:** 2026-06-22
**Status:** Approved design, ready for implementation plan

## Problem

The Simplicity dimension scores a portfolio on its "effective position" count via a
ladder (`scoreSimplicity` in `src/engine/dimensions.ts`). Speculative-sleeve tickers —
positions the user deliberately holds for fun outside normal scoring discipline — currently
count toward that number. This penalizes Simplicity for holdings the user has explicitly
designated as non-core.

Speculative holds are already excluded from **Single-Stock Risk** (`scoreSingleStockRisk`
skips any canonical ticker in the speculative set). This change extends the same philosophy
to Simplicity: speculative positions are a personal preference, not a core staple, and
should not inflate the effective-position count.

Concrete impact: a portfolio of 10 core names + 6 speculative names counts as 16 effective
positions today (score 4), but should count as ~10 (score 6).

## Goal

Speculative-sleeve tickers do not count toward the Simplicity effective-position count.

## Non-goals / out of scope

- No change to flags or gap items (the only Simplicity-related flag, `fund_overlap` in
  `plan.ts`, is driven by duplicate groups, not holding count — speculative single-stocks
  are not duplicates).
- No change to the aggregates schema, the React app, or the AI prompts.
- No change to Single-Stock Risk behavior.
- No retuning of the Simplicity ladder thresholds.

## Existing behavior (reference)

`scoreSimplicity(agg: PortfolioAggregates)` — `src/engine/dimensions.ts:32-60`:

```ts
const extraFromSameAccountDups = agg.duplicate_groups.reduce(
  (sum, g) => sum + (g.tickers.length - 1), 0,
);
const extraFromCrossAccount = agg.cross_account_groups.reduce(
  (sum, g) => sum + (g.tickers_by_account.length - 1), 0,
);
const effective = agg.holding_count - extraFromSameAccountDups - extraFromCrossAccount;

const score =
  effective <= 5  ? 10 :
  effective <= 8  ? 8 :
  effective <= 12 ? 6 :
  effective <= 16 ? 4 : 2;
```

Relevant facts already true today:

- **Cash is already excluded.** `holding_count = holdings.filter(h => !h.is_cash).length`
  (`aggregates.ts:66`), guarded by a regression test (`aggregates.test.ts:76`). No change
  needed for cash.
- **The speculative set already flows through the pipeline.** `src/index.ts` builds
  `speculativeTickerSet(userContext.speculative_holds)` and passes it to
  `scoreAllDimensions(...)`, which threads it into `scoreSingleStockRisk` today.
- **Aggregates already expose `speculative_sleeve_tickers`** — the distinct, canonical
  speculative tickers actually present in the portfolio (`aggregates.ts:168-173`).

## Design

### 1. Thread the speculative set into `scoreSimplicity`

Change the signature from `scoreSimplicity(agg)` to `scoreSimplicity(agg, speculative)`,
mirroring `scoreSingleStockRisk(s, macro, sp, speculative)`. Update the call site in
`scoreAllDimensions` (`dimensions.ts:307`) to pass the set it already holds.

### 2. Subtract speculative positions from the effective count

Reduce the effective count by the number of distinct speculative effective-positions
present in the portfolio. The intended result:

> `effective = count of distinct non-speculative effective positions`

### 3. Double-count guard

If a speculative ticker also sits in a duplicate group (rare, but possible), it must not be
subtracted twice — once as a duplicate-extra and once as speculative. The implementation
must compute effective such that each distinct effective position is counted at most once
and speculative positions are removed exactly once. The exact arithmetic will be verified
against the existing duplicate-collapse logic during implementation; the invariant to hold
is "effective = distinct non-speculative effective positions."

### 4. Display — silent exclusion (per user choice)

No new disclosure text. `display_value` keeps its current shape:

- `"N holdings"` when no collapsing occurs, or
- `"N effective positions (M across accounts)"` when duplicates collapse,

computed off the speculative-adjusted number. A viewer will not see any "speculative
excluded" callout. (This differs from Single-Stock Risk, which discloses excluded names —
intentional, per the user.)

### 5. Ladder unchanged

Same thresholds (≤5→10, ≤8→8, ≤12→6, ≤16→4, else→2) and weight (0.07). Only the input
number shrinks.

## Testing

Add cases to `src/engine/dimensions.test.ts`, mirroring the single-stock-risk exclusion
tests:

1. **Speculative names lower the effective count** — a portfolio whose raw count sits in one
   ladder band drops into a better band once speculative names are excluded.
2. **Double-count guard** — a speculative ticker that is also in a duplicate group is
   subtracted only once (effective count and score match the "distinct non-speculative
   positions" invariant).
3. **Regression** — empty speculative set produces behavior identical to today.

`tsc --noEmit` must stay clean for both tsconfigs. No React-app type mirror change is needed
(Simplicity output shape is unchanged).
