# Exclude Speculative Holds from Simplicity Scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop speculative-sleeve tickers from inflating the Simplicity dimension's effective-position count, mirroring the exclusion already applied to Single-Stock Risk.

**Architecture:** A single pure-function change in `src/engine/dimensions.ts`. `scoreSimplicity` already receives `PortfolioAggregates`, which already carries `speculative_sleeve_tickers` (distinct, canonical, present-in-portfolio). Subtract that count from the effective-position total. No new aggregate fields, no signature change, no call-site change, no React-app or AI-prompt change.

**Tech Stack:** TypeScript 5.4 (strict), Vitest 1.x. Engine modules are pure math — no I/O.

## Global Constraints

- **Engine is pure math.** `src/engine/*.ts` must have no I/O, no API calls, no `fs`. Deterministic in/out. (CLAUDE.md "Load-bearing invariants")
- **All shared types live in `src/types.ts`.** Do not redefine `PortfolioAggregates` or `DimensionScore` locally.
- **`speculative_sleeve_tickers` is optional** on `PortfolioAggregates` (`types.ts:164` — `speculative_sleeve_tickers?: string[]`). Always read it optional-safely: `agg.speculative_sleeve_tickers?.length ?? 0`.
- **Simplicity ladder and weight are unchanged:** `≤5→10, ≤8→8, ≤12→6, ≤16→4, else→2`, weight `0.07`.
- **Display stays silent about speculative** (per spec / user choice): keep the existing `display_value` shape; do not add any "speculative excluded" text.
- **Run both tsconfigs** after engine changes:
  - `npx tsc --noEmit`
  - `npx tsc --noEmit -p src/report/app/tsconfig.json`
- **TDD discipline:** test files are co-located (`dimensions.ts` ↔ `dimensions.test.ts`). Write the failing test first.

---

### Task 1: Exclude speculative positions from the Simplicity effective count

**Files:**
- Modify: `src/engine/dimensions.ts:32-60` (`scoreSimplicity`)
- Test: `src/engine/dimensions.test.ts` (add cases to the existing `describe("scoreSimplicity", ...)` block, which ends at line 128)

**Interfaces:**
- Consumes: `PortfolioAggregates` from `src/types.ts`, specifically the existing fields `holding_count: number`, `duplicate_groups: DuplicateGroup[]`, `cross_account_groups: CrossAccountGroup[]`, and the optional `speculative_sleeve_tickers?: string[]`.
- Produces: `scoreSimplicity(agg: PortfolioAggregates): DimensionScore` — **signature unchanged**. Only the internal `effective` calculation changes. `scoreAllDimensions` call site (`dimensions.ts:307`, `scoreSimplicity(agg)`) is unchanged.

The existing test helper already supports the new cases without modification — `aggForSimplicity(overrides: Partial<PortfolioAggregates>)` (`dimensions.test.ts:67-90`) spreads `overrides`, and `speculative_sleeve_tickers` is an optional `PortfolioAggregates` field, so it can be passed directly in `overrides`.

---

- [ ] **Step 1: Write the failing tests**

Add these four tests inside the existing `describe("scoreSimplicity", () => { ... })` block in `src/engine/dimensions.test.ts`, immediately before its closing `});` (currently line 128). They reuse the existing `aggForSimplicity` helper.

```ts
  test("excludes speculative-sleeve names from the effective count", () => {
    // 14 raw holdings would score 4; excluding 4 speculative names → 10 effective → score 6.
    const agg = aggForSimplicity({
      holding_count: 14,
      speculative_sleeve_tickers: ["GME", "AMC", "BB", "KOSS"],
    });
    expect(scoreSimplicity(agg).score).toBe(6);
  });

  test("counts a duplicated speculative ticker only once (no double-subtraction)", () => {
    // 9 core stocks + the same speculative stock GME held in 2 accounts = 11 raw holdings.
    // Cross-account collapse removes 1; speculative removes the remaining GME position.
    // effective = 11 - 0 - 1 - 1 = 9 → score 6.
    // A naive "subtract every speculative holding" bug would give 11 - 1 - 2 = 8 → score 8.
    const agg = aggForSimplicity({
      holding_count: 11,
      cross_account_groups: [
        {
          asset_class: "individual_stock",
          label: "GME",
          tickers_by_account: [
            { account_id: "a1", ticker: "GME" },
            { account_id: "a2", ticker: "GME" },
          ],
          combined_weight: 0.1,
        },
      ],
      speculative_sleeve_tickers: ["GME"],
    });
    expect(scoreSimplicity(agg).score).toBe(6);
  });

  test("empty speculative sleeve leaves the score unchanged", () => {
    const agg = aggForSimplicity({ holding_count: 10, speculative_sleeve_tickers: [] });
    expect(scoreSimplicity(agg).score).toBe(6);
  });

  test("display_value reflects the speculative-adjusted effective count without naming speculative", () => {
    const agg = aggForSimplicity({
      holding_count: 12,
      speculative_sleeve_tickers: ["GME", "AMC"],
    });
    const result = scoreSimplicity(agg);
    expect(result.display_value).toBe("10 effective positions (12 across accounts)");
    expect(result.display_value).not.toMatch(/speculativ/i);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/engine/dimensions.test.ts -t "scoreSimplicity"`

Expected: the first, second, and fourth new tests FAIL (current code ignores `speculative_sleeve_tickers`, so it computes effective = 14→score 4, 10→score 6, 12→display "12 holdings"). The "empty speculative sleeve" test passes (it already matches today's behavior). Concretely you should see assertion failures like `expected 4 to be 6` and a `display_value` mismatch.

- [ ] **Step 3: Write the minimal implementation**

Replace the body of `scoreSimplicity` in `src/engine/dimensions.ts:32-60` with the version below. The only change is adding `speculativeCount` and subtracting it in `effective`; everything else (ladder, return shape, display, note, weight) is byte-for-byte identical to today.

```ts
export function scoreSimplicity(agg: PortfolioAggregates): DimensionScore {
  const extraFromSameAccountDups = agg.duplicate_groups.reduce(
    (sum, g) => sum + (g.tickers.length - 1),
    0,
  );
  const extraFromCrossAccount = agg.cross_account_groups.reduce(
    (sum, g) => sum + (g.tickers_by_account.length - 1),
    0,
  );
  const speculativeCount = agg.speculative_sleeve_tickers?.length ?? 0;
  const effective =
    agg.holding_count - extraFromSameAccountDups - extraFromCrossAccount - speculativeCount;

  const score =
    effective <= 5  ? 10 :
    effective <= 8  ? 8 :
    effective <= 12 ? 6 :
    effective <= 16 ? 4 : 2;

  return {
    id: "simplicity",
    label: "Simplicity",
    score,
    rating: toRating(score),
    display_value: effective !== agg.holding_count
      ? `${effective} effective positions (${agg.holding_count} across accounts)`
      : `${effective} holdings`,
    note: "Cross-broker duplicates (FSKAX≡VTSAX, XLV in two accounts, etc.) count once",
    weight: 0.07,
  };
}
```

- [ ] **Step 4: Run the Simplicity tests to verify they pass**

Run: `npx vitest run src/engine/dimensions.test.ts -t "scoreSimplicity"`

Expected: PASS — all `scoreSimplicity` tests green, including the pre-existing ladder/duplicate/display tests (lines 92-127) and the four new ones.

- [ ] **Step 5: Run the full suite and both type checks**

Run: `npx vitest run`
Expected: all tests PASS (no regressions). The sample portfolio used by the CLI/snapshot tests has no designated speculative holds, so `speculative_sleeve_tickers` is `[]` there and no AI-prompt snapshot changes. If a snapshot unexpectedly fails, stop and inspect the diff before updating it.

Run: `npx tsc --noEmit`
Expected: clean (no output, exit 0).

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: clean (no output, exit 0). (No React-app change was made; this confirms the engine edit didn't break the app build.)

- [ ] **Step 6: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): exclude speculative holds from Simplicity effective count

Speculative-sleeve tickers no longer inflate the Simplicity dimension's
effective-position count, mirroring the existing Single-Stock Risk exclusion.
Reads the pre-filtered, distinct agg.speculative_sleeve_tickers; a duplicated
speculative ticker is counted once.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- "Read speculative count from aggregates (no signature change)" → Task 1, Step 3 (`agg.speculative_sleeve_tickers?.length ?? 0`, signature unchanged). ✓
- "Subtract from effective count" → Task 1, Step 3 (`effective = ... - speculativeCount`). ✓
- "Double-count guard" → Task 1, Step 1 test #2 + Step 3 (distinct list handles it by construction). ✓
- "Display silent" → Task 1, Step 1 test #4 + Step 3 (display logic unchanged). ✓
- "Ladder unchanged" → Step 3 (identical ladder). ✓
- "Tests: lower count across boundary / double-count / regression" → Step 1 tests #1, #2, #3. ✓
- "tsc clean both tsconfigs" → Step 5. ✓
- Out of scope (flags, gap items, aggregates schema, React, AI prompts, Single-Stock Risk) → no tasks touch them. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — all steps contain concrete code and exact commands. ✓

**Type consistency:** `scoreSimplicity(agg: PortfolioAggregates): DimensionScore` referenced identically in interfaces and implementation. `speculative_sleeve_tickers?: string[]` read optional-safely everywhere. Test fixtures use the existing `aggForSimplicity` helper with `Partial<PortfolioAggregates>` overrides. ✓
