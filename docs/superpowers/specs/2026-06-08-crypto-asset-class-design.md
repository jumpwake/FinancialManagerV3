# Design: `crypto` asset class

**Date:** 2026-06-08
**Status:** Approved — ready for implementation plan

## Problem

The pipeline cannot classify FBTC (Fidelity Wise Origin Bitcoin Fund, a spot
bitcoin ETF). `classifyTickers` fails schema validation with "No matching
discriminator" because the AI classifier correctly recognizes FBTC as a
crypto/bitcoin product, but the `AssetClass` union has no crypto category. The
classifier returns an `asset_class` value outside the discriminated union, so
validation throws and `npm run analyze` (and therefore `publish`) exits 1.

`"unknown"` is not a viable fallback: `src/index.ts` throws on any holding with
`asset_class === "unknown"` and `market_value > 0`. FBTC needs a real class.

Retrying does not help — the failure is deterministic, not a transient API
hiccup. The model keeps wanting to call it crypto.

## Goal

Add a first-class `crypto` asset class so spot bitcoin/ether ETFs and ETPs
(FBTC, IBIT, ETHA, etc.) classify automatically and flow through allocation,
scoring, and the report without distorting equity exposure.

## Design decisions (settled during brainstorming)

1. **Allocation: crypto is its own sleeve.** Crypto is NOT part of
   `equity_weight` / `fixed_income_weight` / `cash`. A new `crypto_weight`
   aggregate reports it honestly so equity exposure is not inflated.
2. **Risk: neutral sleeve, rely on concentration.** No crypto-specific
   speculative penalty. An oversized crypto position is still caught by the
   `concentration` dimension, which is ticker-based (`top3_weight`).
3. **Diversification: score-neutral.** Crypto is NOT added as a rewarded
   diversification bucket — holding it neither raises nor lowers the bucket
   count. (Rationale: don't credit speculation as diversification.)
4. **Asset location: crypto counts as growth.** Crypto joins `GROWTH_CLASSES`,
   so it is rewarded in tax-free wrappers (Roth / HSA) and penalized in
   tax-deferred accounts. Rationale: high expected return + tax inefficiency
   makes a Roth the optimal home.
5. **No new dimension.** Adding a class but no dimension keeps the benchmarks
   `WEIGHTS` ↔ per-dimension `weight` sync invariant untouched.

## Changes by area

### 1. Schemas

- `src/types.ts` — add `"crypto"` to the `AssetClass` union.
- `src/intake/tickerClassifier.ts`:
  - Add `"crypto"` to `MINIMAL_SHAPE_ASSET_CLASSES`. This single constant feeds
    both `TickerEntrySchema` (file schema) and `ClassifyResponseEntrySchema`
    (AI response schema), so crypto gets the minimal shape:
    `asset_class + expense_ratio + classified_at + optional notes`. FBTC's
    ~0.25% expense ratio fits the `expense_ratio: number | null` field.
  - Add one line to `CLASSIFY_SYSTEM_PROMPT`: spot bitcoin/ether ETFs & ETPs
    (e.g. FBTC, IBIT, ETHA) → `crypto`.
- `src/intake/parsePortfolio.ts` — add `"crypto"` to `AssetClassSchema`
  (`z.enum`).
- `src/report/app/types.ts` — add `"crypto"` to the mirror `AssetClass` union.

### 2. Allocation aggregates

- `src/types.ts` — add `crypto_weight: number` to `PortfolioAggregates`.
- `src/report/app/types.ts` — mirror `crypto_weight: number`.
- `src/engine/aggregates.ts`:
  - Crypto stays OUT of `EQUITY_CLASSES`.
  - Accumulate `crypto_weight` = sum of crypto holdings' market_value / total.
  - Crypto is not equity, not FI, not cash, not balanced.

### 3. Scoring (`src/engine/dimensions.ts`)

- **Concentration** — no change. Ticker-based `top3_weight` already catches an
  oversized crypto position.
- **single_stock_risk** — no change. Crypto is not `individual_stock` and has no
  `stock_metrics`, so it is invisible here by design (neutral sleeve).
- **diversification** — no change to the buckets map. Crypto weight is simply
  absent from the bucket set, making it score-neutral.
- **asset_location** — add `"crypto"` to `GROWTH_CLASSES`. This yields the
  existing tax-free-growth bonus when crypto is held in a Roth/HSA, and the
  tax-deferred penalty when held in a pre-tax account.

### 4. Report

- `src/report/app/theme.ts` — add a `donut.crypto` color (bitcoin gold,
  e.g. `#e8a33d`).
- `src/report/app/sections/AllocationBreakdown.tsx` — add
  `crypto: { label: "Crypto", color: COLORS.donut.crypto }` to
  `ASSET_BUCKET_MAP`.

### 5. CLI

- `src/index.ts` — in the console summary's ALLOCATION block, print a
  `Crypto: X%` line when `aggregates.crypto_weight > 0` (mirrors the existing
  pending-cash conditional line).

## Tests (TDD, co-located)

- `src/intake/tickerClassifier.test.ts` — `ClassifyResponseEntrySchema` /
  `TickerEntrySchema` accept a `crypto` entry with the minimal shape.
- `src/intake/parsePortfolio.test.ts` — accepts a holding with
  `asset_class: "crypto"`.
- `src/engine/aggregates.test.ts` — a crypto holding contributes to
  `crypto_weight` and NOT to `equity_weight`.
- `src/engine/dimensions.test.ts`:
  - `scoreAssetLocation` gives the tax-free-growth bonus for a crypto holding in
    a `roth_ira` account.
  - `scoreConcentration` still fires when a crypto ticker is in the top 3.

Use the existing fixture builders (`makeHolding`, `makePortfolio`,
`makeMacro`) rather than raw literals.

## Verification

- `npx tsc --noEmit` (root tsconfig) — clean.
- `npx tsc --noEmit -p src/report/app/tsconfig.json` (React mirror) — clean.
- `npm test` — full vitest suite passing.
- `npm run analyze` (or the publish path) — FBTC classifies as `crypto`, the
  material-unknowns gate passes, and the run completes.

## Out of scope

- No crypto-specific dimension or speculative penalty (deferred; revisit if a
  neutral sleeve proves too lenient in practice).
- No per-coin granularity (BTC vs ETH) — a single `crypto` class matches the
  existing granularity (e.g. `us_equity_sector`).
- No changes to reference models / benchmarks.
