# Crypto Asset Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `crypto` asset class so spot bitcoin/ether ETFs (FBTC, IBIT, ETHA) classify automatically and flow through allocation, scoring, and the report.

**Architecture:** Crypto is its own allocation sleeve (a new `crypto_weight` aggregate), excluded from equity. It is score-neutral for risk and diversification (relying on the existing ticker-based concentration dimension), and treated as growth for asset location (rewarded in Roth/HSA, penalized in tax-deferred). No new scoring dimension, so the benchmarks weight-sync invariant is untouched.

**Tech Stack:** TypeScript 5.4 (strict), Zod 3, Vitest 1, two tsconfigs (root + `src/report/app`).

**Design spec:** `docs/superpowers/specs/2026-06-08-crypto-asset-class-design.md`

**Conventions to honor:**
- Engine modules (`src/engine/*.ts`) are pure math — no I/O.
- Co-located tests; use fixture builders `makeHolding` / `makePortfolio` / `makeAccount` from `tests/fixtures/samplePortfolio.ts`.
- Always run BOTH tsconfigs: `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`.
- The React app has its own type mirror at `src/report/app/types.ts` — keep it in sync with `src/types.ts`.
- AI narratives / React UI / CLI orchestrator are verified manually, not unit-tested.

---

### Task 1: Add `crypto` to the AssetClass enum and the ticker classifier

This is the actual unblock — once `crypto` is a valid discriminator, the AI classifier's FBTC response validates.

**Files:**
- Modify: `src/types.ts:1-16` (AssetClass union)
- Modify: `src/intake/tickerClassifier.ts:33-37` (MINIMAL_SHAPE_ASSET_CLASSES) and `:146-169` (CLASSIFY_SYSTEM_PROMPT)
- Test: `src/intake/tickerClassifier.test.ts`

The classifier's two Zod unions (`TickerEntrySchema` and `ClassifyResponseEntrySchema`) both build their minimal-shape branches from the shared `MINIMAL_SHAPE_ASSET_CLASSES` constant, so adding `"crypto"` there covers both. The exported `TickerMetadataFileSchema` (which wraps `TickerEntrySchema`) is the testable surface.

- [ ] **Step 1: Write the failing test**

Add to `src/intake/tickerClassifier.test.ts` inside the existing top-level (after the `loadTickerMetadata` describe block, or at end of file):

```typescript
describe("crypto asset class", () => {
  it("TickerMetadataFileSchema accepts a crypto entry (minimal shape)", () => {
    const parsed = TickerMetadataFileSchema.parse({
      version: 1,
      tickers: {
        FBTC: { asset_class: "crypto", expense_ratio: 0.0025, classified_at: "2026-06-08" },
      },
    });
    expect(parsed.tickers.FBTC.asset_class).toBe("crypto");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/intake/tickerClassifier.test.ts -t "crypto asset class"`
Expected: FAIL — Zod rejects `"crypto"` ("No matching discriminator" / invalid union).

- [ ] **Step 3: Add `crypto` to the AssetClass union**

In `src/types.ts`, add the line to the `AssetClass` union (after `"individual_stock"`):

```typescript
export type AssetClass =
  | "us_equity_total_market"
  | "us_equity_large_cap"
  | "us_equity_large_cap_growth"
  | "us_equity_small_mid"
  | "us_equity_sector"
  | "international_equity"
  | "us_bond_aggregate"
  | "us_bond_short"
  | "us_bond_tips"
  | "balanced"
  | "target_date"
  | "individual_stock"
  | "crypto"
  | "cash"
  | "cash_pending"
  | "unknown";
```

- [ ] **Step 4: Add `crypto` to the classifier's minimal-shape list**

In `src/intake/tickerClassifier.ts`, edit `MINIMAL_SHAPE_ASSET_CLASSES` (lines 33-37) to include `"crypto"`:

```typescript
const MINIMAL_SHAPE_ASSET_CLASSES = [
  "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
  "us_equity_small_mid", "international_equity", "us_bond_aggregate",
  "us_bond_short", "us_bond_tips", "target_date", "cash", "cash_pending",
  "crypto",
] as const;
```

- [ ] **Step 5: Tell the AI classifier about crypto**

In `src/intake/tickerClassifier.ts`, add a bullet to `CLASSIFY_SYSTEM_PROMPT` immediately after the `us_equity_sector` rule line (the line starting `- For asset_class "us_equity_sector":`):

```
- For asset_class "crypto": use for spot bitcoin/ether ETFs and ETPs (e.g. FBTC, IBIT, ETHA, FETH, GBTC). Provide the published expense_ratio. No sector_tag or stock_metrics.
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/intake/tickerClassifier.test.ts -t "crypto asset class"`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors). The React mirror is updated in Task 5; root tsconfig does not include `src/report/app`.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/intake/tickerClassifier.ts src/intake/tickerClassifier.test.ts
git commit -m "feat(intake): add crypto asset class to classifier schema + prompt"
```

---

### Task 2: Accept `crypto` in the portfolio validator

**Files:**
- Modify: `src/intake/parsePortfolio.ts:3-16` (AssetClassSchema z.enum)
- Test: `src/intake/parsePortfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/intake/parsePortfolio.test.ts` (use the existing imports in that file; it already imports `parsePortfolio`). Add a new test:

```typescript
it("accepts a holding with asset_class crypto", () => {
  const portfolio = {
    snapshot_date: "2026-06-08",
    account_label: "All Accounts",
    holdings: [
      {
        ticker: "FBTC",
        label: "Fidelity Wise Origin Bitcoin Fund",
        market_value: 5000,
        asset_class: "crypto",
        account_id: "fid_roth",
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: 0.0025,
      },
    ],
  };
  const result = parsePortfolio(portfolio);
  expect(result.holdings[0].asset_class).toBe("crypto");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/intake/parsePortfolio.test.ts -t "asset_class crypto"`
Expected: FAIL — `AssetClassSchema` enum rejects `"crypto"`.

- [ ] **Step 3: Add `crypto` to AssetClassSchema**

In `src/intake/parsePortfolio.ts`, add `"crypto"` to the `z.enum([...])` array (keep it in the same order as the `AssetClass` union — after `"individual_stock"`):

```typescript
  "individual_stock",
  "crypto",
  "cash",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/intake/parsePortfolio.test.ts -t "asset_class crypto"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/intake/parsePortfolio.ts src/intake/parsePortfolio.test.ts
git commit -m "feat(intake): accept crypto asset_class in parsePortfolio validator"
```

---

### Task 3: Add the `crypto_weight` allocation sleeve

Crypto is excluded from equity and reported as its own weight.

**Files:**
- Modify: `src/types.ts:143-164` (PortfolioAggregates interface)
- Modify: `src/engine/aggregates.ts:154-197` (compute + return crypto_weight)
- Test: `src/engine/aggregates.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/engine/aggregates.test.ts` (it already imports `computeAggregates`, `makeHolding`, `makePortfolio` — match the existing import style at the top of that file):

```typescript
describe("crypto sleeve", () => {
  it("counts crypto in crypto_weight and excludes it from equity_weight", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      makeHolding({ ticker: "FBTC", market_value: 200, asset_class: "crypto", expense_ratio: 0.0025 }),
    ]});
    const agg = computeAggregates(p);
    expect(agg.crypto_weight).toBeCloseTo(0.2, 5);
    expect(agg.equity_weight).toBeCloseTo(0.8, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/aggregates.test.ts -t "crypto sleeve"`
Expected: FAIL — `agg.crypto_weight` is `undefined` (property does not exist).

- [ ] **Step 3: Add `crypto_weight` to the PortfolioAggregates interface**

In `src/types.ts`, add the field to `PortfolioAggregates` after `individual_stock_weight`:

```typescript
  individual_stock_weight: number;
  crypto_weight: number;                      // NEW — crypto sleeve (not part of equity_weight)
  balanced_weight: number;
```

- [ ] **Step 4: Compute and return `crypto_weight`**

In `src/engine/aggregates.ts`, after the `individual_stock_weight` block (around line 156), add:

```typescript
  const crypto_weight = holdings
    .filter(h => h.asset_class === "crypto")
    .reduce((sum, h) => sum + w(h), 0);
```

Then add `crypto_weight` to the returned object (after `individual_stock_weight,` near line 192):

```typescript
    individual_stock_weight,
    crypto_weight,
    balanced_weight,
```

Note: `crypto` is NOT in `EQUITY_CLASSES` (`aggregates.ts:13-15`) or `BOND_CLASSES`, and has no `underlying_composition`, so the equity/FI/intl loop at lines 109-122 already skips it. No change needed there — verify by reading those lines.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engine/aggregates.test.ts -t "crypto sleeve"`
Expected: PASS

- [ ] **Step 6: Run the full engine suite (catch any aggregates consumers)**

Run: `npx vitest run src/engine`
Expected: PASS (all existing tests still green).

- [ ] **Step 7: Typecheck root**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/engine/aggregates.ts src/engine/aggregates.test.ts
git commit -m "feat(engine): add crypto_weight allocation sleeve (excluded from equity)"
```

---

### Task 4: Treat crypto as growth for asset location

Crypto joins `GROWTH_CLASSES`, so the existing asset-location logic rewards it in tax-free wrappers and penalizes it in tax-deferred.

**Files:**
- Modify: `src/engine/dimensions.ts:311-314` (GROWTH_CLASSES set)
- Test: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/engine/dimensions.test.ts` inside the existing `describe("scoreAssetLocation", ...)` block (ends at line 795), before its closing `});`:

```typescript
  it("rewards crypto placed in Roth over the same crypto in pre-tax", () => {
    const pBad = makePortfolio({ holdings: [
      makeHolding({ ticker: "FBTC", market_value: 1000, asset_class: "crypto", expense_ratio: 0.0025, account_id: "fid_401k" }),
    ]});
    const pGood = makePortfolio({ holdings: [
      makeHolding({ ticker: "FBTC", market_value: 1000, asset_class: "crypto", expense_ratio: 0.0025, account_id: "vng_roth" }),
    ]});
    const accounts = {
      accounts: [
        makeAccount({ id: "fid_401k", account_type: "pretax_ira" }),
        makeAccount({ id: "vng_roth", account_type: "roth_ira" }),
      ],
    };
    const bad = scoreAssetLocation(pBad, accounts).score;
    const good = scoreAssetLocation(pGood, accounts).score;
    expect(good).toBeGreaterThan(bad);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/dimensions.test.ts -t "rewards crypto placed in Roth"`
Expected: FAIL — with crypto absent from `GROWTH_CLASSES`, neither holding triggers a bonus/penalty, so `good === bad` (both clamp to the same score) and `toBeGreaterThan` fails.

- [ ] **Step 3: Add `crypto` to GROWTH_CLASSES**

In `src/engine/dimensions.ts`, edit the `GROWTH_CLASSES` set (lines 311-314):

```typescript
const GROWTH_CLASSES = new Set<string>([
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
  "crypto",
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/dimensions.test.ts -t "rewards crypto placed in Roth"`
Expected: PASS

- [ ] **Step 5: Run the full engine suite (GROWTH_CLASSES is also read by asset-location penalties)**

Run: `npx vitest run src/engine`
Expected: PASS (no regressions in existing asset-location / dimension tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): treat crypto as growth for asset location (reward in Roth)"
```

---

### Task 5: Wire crypto into the React report mirror and CLI summary

No unit tests here (React UI + CLI are verified manually, per repo convention). This keeps the second tsconfig clean and surfaces the sleeve visually.

**Files:**
- Modify: `src/report/app/types.ts:19-23` (AssetClass mirror) and `:135-138` (PortfolioAggregates mirror)
- Modify: `src/report/app/theme.ts:14-26` (donut palette)
- Modify: `src/report/app/sections/AllocationBreakdown.tsx:16-29` (ASSET_BUCKET_MAP)
- Modify: `src/index.ts:412-421` (CLI allocation summary)

- [ ] **Step 1: Mirror `crypto` in the React AssetClass union**

In `src/report/app/types.ts`, add `"crypto"` to the `AssetClass` union (after `"individual_stock"`, line 23):

```typescript
  | "balanced" | "target_date" | "individual_stock" | "crypto" | "cash" | "cash_pending" | "unknown";
```

- [ ] **Step 2: Mirror `crypto_weight` in the React PortfolioAggregates**

In `src/report/app/types.ts`, add the field after `individual_stock_weight` (line 137):

```typescript
  individual_stock_weight: number;
  crypto_weight: number;
  balanced_weight: number;
```

- [ ] **Step 3: Add a donut color for crypto**

In `src/report/app/theme.ts`, add a `crypto` color to the `donut` palette (after `individual_stock`, line 19):

```typescript
    individual_stock: "#a05030",
    crypto: "#e8a33d",
```

- [ ] **Step 4: Add the crypto bucket to the allocation donut map**

In `src/report/app/sections/AllocationBreakdown.tsx`, add an entry to `ASSET_BUCKET_MAP` (after the `individual_stock` line, line 28):

```typescript
  individual_stock:           { label: "Individual Stocks",        color: COLORS.donut.individual_stock },
  crypto:                     { label: "Crypto",                   color: COLORS.donut.crypto },
```

- [ ] **Step 5: Print the crypto sleeve in the CLI summary**

In `src/index.ts`, in the ALLOCATION block, add a conditional line after the `Balanced` line (line 416) so it mirrors the pending-cash pattern:

```typescript
  console.log(`  Balanced:      ${fmtPct(aggregates.balanced_weight)}`);
  if (aggregates.crypto_weight > 0) {
    console.log(`  Crypto:        ${fmtPct(aggregates.crypto_weight)}`);
  }
  console.log(`  Cash (idle):   ${fmtPct(aggregates.idle_cash_weight)}`);
```

- [ ] **Step 6: Typecheck BOTH tsconfigs**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: clean (the mirror now matches).

- [ ] **Step 7: Commit**

```bash
git add src/report/app/types.ts src/report/app/theme.ts src/report/app/sections/AllocationBreakdown.tsx src/index.ts
git commit -m "feat(report): surface crypto sleeve in donut + CLI allocation summary"
```

---

### Task 6: Full verification and live unblock

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests PASS (previous baseline + the new crypto tests).

- [ ] **Step 2: Typecheck both projects**

Run: `npx tsc --noEmit`
Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: both clean.

- [ ] **Step 3: Run the pipeline against the real data that triggered the bug**

Run the same path that failed (the publish/analyze run that hit FBTC). For Kevin:

`npm run analyze -- --user kevin` (or `npm run publish:kevin` once analyze is confirmed)

Expected: the console logs `Classifying 1 new ticker(s): FBTC`, FBTC is written to the ticker-metadata file with `asset_class: "crypto"`, the material-unknowns gate passes, and the run completes with a `Crypto: X%` line in the ALLOCATION block.

If the AI classifier is unavailable (no `ANTHROPIC_API_KEY`), instead hand-add the entry to the relevant `ticker-metadata.json` to confirm the rest of the pipeline:

```json
"FBTC": { "asset_class": "crypto", "expense_ratio": 0.0025, "classified_at": "2026-06-08" }
```

- [ ] **Step 4: Verify the report renders the crypto bucket (manual)**

Run: `npm run report` (or `npm run report -- --user kevin`)
Expected: the Allocation Breakdown donut shows a "Crypto" slice in bitcoin gold.

- [ ] **Step 5: Final confirmation**

Confirm: no `git status` surprises, both tsconfigs clean, `npm test` green. The feature is complete.

---

## Self-review notes (author)

- **Spec coverage:** schemas (Tasks 1, 2, 5), crypto_weight sleeve (Task 3), asset_location growth (Task 4), report + CLI (Task 5), verification incl. both tsconfigs and live re-run (Task 6). Concentration/single_stock_risk/diversification require NO code change by design (neutral sleeve) — verified in Task 3/4 full-suite runs.
- **No new dimension** ⇒ benchmarks weight-sync untouched; no benchmarks task needed (matches spec "Out of scope").
- **Type consistency:** field name `crypto_weight` used identically in `src/types.ts`, `src/engine/aggregates.ts`, `src/report/app/types.ts`, and `src/index.ts`. Enum member `"crypto"` identical across `types.ts`, `parsePortfolio.ts`, `tickerClassifier.ts`, and the React mirror.
