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

### 1. Read the speculative count from aggregates (no signature change)

`scoreSimplicity(agg)` keeps its single-argument signature. It reads
`agg.speculative_sleeve_tickers` — which `computeAggregates` already populates from the
speculative set passed in `src/index.ts`.

Reading the aggregate is preferred over threading the raw `Set<string>` (the approach used
by `scoreSingleStockRisk`) for two reasons:

- **Pre-filtered to holdings present.** `speculative_sleeve_tickers` is the distinct,
  canonical speculative tickers *actually held* (`aggregates.ts:168-173`). The raw
  speculative set can contain tickers the user designated but does not currently hold;
  `scoreSimplicity` has no `Portfolio` to filter against, so threading the raw set would
  over-subtract.
- **Distinct + canonical already.** The list is de-duplicated by canonical ticker, so its
  `.length` is exactly the number of distinct speculative effective-positions — which gives
  the double-count guard (below) for free.

`speculative_sleeve_tickers` is an optional field (`types.ts:164`), so it must be read
optional-safely: `agg.speculative_sleeve_tickers?.length ?? 0`. This also keeps every
existing test (whose aggregate fixtures omit the field) passing unchanged.

### 2. Subtract speculative positions from the effective count

Reduce the effective count by `speculativeCount = agg.speculative_sleeve_tickers?.length ?? 0`:

```ts
const effective =
  agg.holding_count - extraFromSameAccountDups - extraFromCrossAccount - speculativeCount;
```

The intended result is the invariant:

> `effective = count of distinct non-speculative effective positions`

### 3. Double-count guard

A speculative ticker can also sit in a duplicate group (e.g. the same speculative stock held
in two accounts → a cross-account group). This is handled correctly by construction, not by
special-casing:

- The N copies of that ticker contribute `+N` to `holding_count`.
- The duplicate-collapse subtracts `N-1` (collapsing the copies to one effective position).
- `speculative_sleeve_tickers` lists the ticker **once** (distinct), so the speculative
  subtraction removes that one remaining effective position — net contribution `0`.

Because `speculative_sleeve_tickers` is distinct, a duplicated speculative ticker is never
subtracted more than once beyond its duplicate-collapse. A test locks this in.

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
