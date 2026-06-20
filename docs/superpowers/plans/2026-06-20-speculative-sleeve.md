# Speculative Sleeve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user designate certain tickers (e.g. TSLA, NVDA) as a "speculative sleeve" that is exempt from the single-stock-risk penalty, has its per-name flags muted, and is excluded from AI trim/sell recommendations — while a single configurable guardrail flag fires if the combined sleeve weight grows past a threshold.

**Architecture:** A user-curated list lives in `user-context.json`. The engine stays pure: the list is parsed in intake and passed into `computeAggregates` (to compute the combined sleeve weight), `scoreSingleStockRisk` (to skip the penalty), and a new `src/engine/speculative.ts` post-pass that mutes per-name flags and appends the one sleeve-size flag — mirroring the existing `applyNoteSuppressions` pattern. Both AI prompt builders receive the list and a static rule instructing the model to leave the sleeve alone. The React report already renders `suppressed_by` flags as muted; we extend the suppression-source union and the label text.

**Tech Stack:** TypeScript 5.4 (strict), Vitest 1.x, zod ^3.22 (intake validation), React/Vite (report app). Two tsconfigs — root and `src/report/app/tsconfig.json`.

## Global Constraints

- Engine modules (`src/engine/*.ts`) must stay pure: no I/O, no `fs`, no API calls. The speculative list is passed in as a parameter, never read from disk inside the engine. (CLAUDE.md "Engine is pure math".)
- All shared types live in `src/types.ts`. The React app does **not** import `src/types.ts`; it has its own mirror at `src/report/app/types.ts` that must be updated in lockstep. (CLAUDE.md "Two tsconfigs".)
- Grades/text use Unicode minus `−` (U+2212), not ASCII `-`; AI prose avoids the words "robust" and "optimize". (CLAUDE.md conventions — relevant to Task 5 prompt text.)
- Ticker matching uses `canonicalTicker()` from `src/intake/tickerMetadata.ts` so `BRK B` ≡ `BRK-B`.
- TDD: write the failing test first for every engine/intake change. The CLI orchestrator (`src/index.ts`), AI prompt bodies, and React UI are verified manually per CLAUDE.md.
- After implementation, BOTH typechecks must pass: `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`.
- All work happens on the existing `feat/speculative-sleeve` branch.

**Design note (decided during planning):** the two new `PortfolioAggregates` fields are declared **optional** (`speculative_sleeve_weight?`, `speculative_sleeve_tickers?`). `computeAggregates` always populates them, but optional declarations avoid touching ~15 hand-built `PortfolioAggregates` fixture literals in `dimensions.test.ts` / `plan.test.ts` that would otherwise fail `tsc`. Consumers read them with `?? 0` / `?? []`.

---

### Task 1: Config types + parser

**Files:**
- Modify: `src/types.ts` (add `SpeculativeHold`; extend `UserContext`; widen `FlagSuppressionRef.source`)
- Modify: `src/intake/parseUserContext.ts` (schema + `emptyUserContext`)
- Test: `src/intake/parseUserContext.test.ts`

**Interfaces:**
- Produces: `interface SpeculativeHold { ticker: string; reason?: string; designated_at: string }`
- Produces: `UserContext` gains `speculative_holds: SpeculativeHold[]` and `speculative_sleeve_threshold: number`
- Produces: `FlagSuppressionRef.source` becomes `"note" | "situation" | "speculative_hold"`

- [ ] **Step 1: Write the failing test**

Add to `src/intake/parseUserContext.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseUserContext } from "./parseUserContext";

describe("parseUserContext — speculative sleeve", () => {
  const base = {
    version: 2,
    profile: null,
    situations: [],
    notes: [],
    chat_history: [],
  };

  it("parses speculative_holds", () => {
    const ctx = parseUserContext({
      ...base,
      speculative_holds: [
        { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
        { ticker: "NVDA", designated_at: "2026-06-20" },
      ],
      speculative_sleeve_threshold: 0.05,
    });
    expect(ctx.speculative_holds).toHaveLength(2);
    expect(ctx.speculative_holds[0].ticker).toBe("TSLA");
    expect(ctx.speculative_holds[1].reason).toBeUndefined();
    expect(ctx.speculative_sleeve_threshold).toBe(0.05);
  });

  it("defaults speculative_holds to [] and threshold to 0.05 when absent", () => {
    const ctx = parseUserContext(base);
    expect(ctx.speculative_holds).toEqual([]);
    expect(ctx.speculative_sleeve_threshold).toBe(0.05);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/intake/parseUserContext.test.ts -t "speculative sleeve"`
Expected: FAIL — `ctx.speculative_holds` is `undefined` / property does not exist on type.

- [ ] **Step 3a: Add types to `src/types.ts`**

Replace the `FlagSuppressionRef` interface (currently at `src/types.ts:168`):

```typescript
export interface FlagSuppressionRef {
  source: "note" | "situation" | "speculative_hold";
  id: string;
  body: string;
}
```

Add a new `SpeculativeHold` interface immediately above the `UserContext` interface (currently at `src/types.ts:338`):

```typescript
export interface SpeculativeHold {
  ticker: string;
  reason?: string;
  designated_at: string;
}
```

Replace the `UserContext` interface body to add the two fields:

```typescript
export interface UserContext {
  version: 2;
  profile: UserProfile | null;  // null = not yet captured
  situations: Situation[];
  notes: Note[];
  chat_history: ChatMessage[];
  speculative_holds: SpeculativeHold[];
  speculative_sleeve_threshold: number;
}
```

- [ ] **Step 3b: Update the parser in `src/intake/parseUserContext.ts`**

Add a schema after `NoteSchema` (around line 60):

```typescript
const SpeculativeHoldSchema = z.object({
  ticker: z.string().min(1),
  reason: z.string().optional(),
  designated_at: z.string(),
});
```

Extend `UserContextSchema` (currently lines 96-102) to:

```typescript
export const UserContextSchema = z.object({
  version: z.literal(2),
  profile: UserProfileSchema.nullable(),
  situations: z.array(SituationSchema),
  notes: z.array(NoteSchema),
  chat_history: z.array(ChatMessageSchema),
  speculative_holds: z.array(SpeculativeHoldSchema).default([]),
  speculative_sleeve_threshold: z.number().default(0.05),
});
```

Update `emptyUserContext` (currently lines 120-122):

```typescript
export function emptyUserContext(): UserContext {
  return {
    version: 2,
    profile: null,
    situations: [],
    notes: [],
    chat_history: [],
    speculative_holds: [],
    speculative_sleeve_threshold: 0.05,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/intake/parseUserContext.test.ts`
Expected: PASS (the new tests and all pre-existing ones).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/types.ts src/intake/parseUserContext.ts src/intake/parseUserContext.test.ts
git commit -m "feat(intake): parse speculative_holds + sleeve threshold in user context"
```

---

### Task 2: Combined sleeve weight in aggregates

**Files:**
- Modify: `src/types.ts` (`PortfolioAggregates` — two optional fields)
- Modify: `src/report/app/types.ts` (mirror the two optional fields)
- Modify: `src/engine/aggregates.ts` (`computeAggregates` param + computation)
- Test: `src/engine/aggregates.test.ts`

**Interfaces:**
- Consumes: `canonicalTicker` from `src/intake/tickerMetadata.ts`
- Produces: `computeAggregates(portfolio, accounts?, speculativeTickers?: string[])` — third param defaults to `[]`
- Produces: `PortfolioAggregates` gains `speculative_sleeve_weight?: number` and `speculative_sleeve_tickers?: string[]`

- [ ] **Step 1: Write the failing test**

Add to `src/engine/aggregates.test.ts`:

```typescript
describe("computeAggregates — speculative sleeve", () => {
  test("sums combined weight of speculative tickers and lists those present", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 150, asset_class: "individual_stock" }),
        makeHolding({ ticker: "NVDA", market_value: 50, asset_class: "individual_stock" }),
      ],
    });
    const agg = computeAggregates(portfolio, undefined, ["TSLA", "NVDA", "AAPL"]);
    // (150 + 50) / 1000 = 0.20
    expect(agg.speculative_sleeve_weight).toBeCloseTo(0.20, 6);
    // Only tickers actually present are listed; AAPL is absent.
    expect(agg.speculative_sleeve_tickers).toEqual(["TSLA", "NVDA"]);
  });

  test("defaults to zero weight / empty list when no speculative tickers given", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.speculative_sleeve_weight).toBe(0);
    expect(agg.speculative_sleeve_tickers).toEqual([]);
  });
});
```

(`makeHolding` / `makePortfolio` are already imported at the top of this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/aggregates.test.ts -t "speculative sleeve"`
Expected: FAIL — `agg.speculative_sleeve_weight` is `undefined`.

- [ ] **Step 3a: Add optional fields to `PortfolioAggregates` in `src/types.ts`**

Insert into the `PortfolioAggregates` interface (after `balanced_weight: number;` at `src/types.ts:162`):

```typescript
  speculative_sleeve_weight?: number;
  speculative_sleeve_tickers?: string[];
```

- [ ] **Step 3b: Mirror in the React app types `src/report/app/types.ts`**

Insert into the app's `PortfolioAggregates` interface (after `balanced_weight: number;` near `src/report/app/types.ts:139`):

```typescript
  speculative_sleeve_weight?: number;
  speculative_sleeve_tickers?: string[];
```

- [ ] **Step 3c: Compute the values in `src/engine/aggregates.ts`**

Add the import at the top of the file (after the existing type import block, lines 1-11):

```typescript
import { canonicalTicker } from "../intake/tickerMetadata";
```

Change the signature (currently lines 46-49):

```typescript
export function computeAggregates(
  portfolio: Portfolio,
  accounts?: AccountConfig,
  speculativeTickers: string[] = [],
): PortfolioAggregates {
```

Add the computation just before the `return {` (after `balanced_weight` is computed, around line 164):

```typescript
  const specSet = new Set(speculativeTickers.map(canonicalTicker));
  const specHoldings = holdings.filter(h => specSet.has(canonicalTicker(h.ticker)));
  const speculative_sleeve_weight = specHoldings.reduce((sum, h) => sum + w(h), 0);
  const speculative_sleeve_tickers = [
    ...new Set(specHoldings.map(h => canonicalTicker(h.ticker))),
  ];
```

Add the two fields to the returned object literal (after `balanced_weight,`):

```typescript
    speculative_sleeve_weight,
    speculative_sleeve_tickers,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/aggregates.test.ts`
Expected: PASS (new and existing tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors in either.

```bash
git add src/types.ts src/report/app/types.ts src/engine/aggregates.ts src/engine/aggregates.test.ts
git commit -m "feat(engine): compute combined speculative-sleeve weight in aggregates"
```

---

### Task 3: Speculative suppression + sleeve-size flag

**Files:**
- Create: `src/engine/speculative.ts`
- Test: `src/engine/speculative.test.ts`

**Interfaces:**
- Consumes: `Flag`, `SpeculativeHold` from `src/types.ts`; `canonicalTicker` from `src/intake/tickerMetadata.ts`; `buildFindingKey` from `src/engine/findingKeys.ts`
- Produces: `speculativeTickerSet(holds: SpeculativeHold[]): Set<string>` — canonicalized ticker set
- Produces: `applySpeculativeSuppressions(flags: Flag[], holds: SpeculativeHold[], sleeveWeight: number, threshold: number): Flag[]` — returns a new array: per-ticker flags whose ticker is in the set are annotated `suppressed_by {source:"speculative_hold"}`; one sleeve flag (`finding_key: "speculative_sleeve:over_threshold"`) is appended iff `sleeveWeight > threshold`.

- [ ] **Step 1: Write the failing test**

Create `src/engine/speculative.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { speculativeTickerSet, applySpeculativeSuppressions } from "./speculative";
import type { Flag, SpeculativeHold } from "../types";

const holds: SpeculativeHold[] = [
  { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
  { ticker: "NVDA", designated_at: "2026-06-20" },
];

const tslaFlag: Flag = {
  ticker: "TSLA", severity: "red", title: "TSLA — extreme valuation",
  body: "P/E 410×.", finding_key: "valuation:extreme_overvaluation:TSLA",
};
const macroFlag: Flag = {
  ticker: "MACRO", severity: "yellow", title: "LEI declining",
  body: "...", finding_key: "macro_alignment:lei_decline",
};

describe("speculativeTickerSet", () => {
  it("canonicalizes tickers", () => {
    const set = speculativeTickerSet([{ ticker: "BRK B", designated_at: "2026-06-20" }]);
    expect(set.has("BRK-B")).toBe(true);
  });
});

describe("applySpeculativeSuppressions", () => {
  it("annotates a speculative ticker's flag with its reason and leaves others untouched", () => {
    const out = applySpeculativeSuppressions([tslaFlag, macroFlag], holds, 0.036, 0.05);
    const tsla = out.find(f => f.finding_key === "valuation:extreme_overvaluation:TSLA")!;
    expect(tsla.suppressed_by).toEqual({
      source: "speculative_hold",
      id: "TSLA",
      body: "Long-term personal hold",
    });
    const macro = out.find(f => f.finding_key === "macro_alignment:lei_decline")!;
    expect(macro.suppressed_by).toBeUndefined();
  });

  it("falls back to a default body when no reason is given", () => {
    const nvdaFlag: Flag = {
      ticker: "NVDA", severity: "yellow", title: "NVDA — high beta",
      body: "Beta 2.24.", finding_key: "macro_alignment:high_beta:NVDA",
    };
    const out = applySpeculativeSuppressions([nvdaFlag], holds, 0, 0.05);
    expect(out[0].suppressed_by?.body).toBe("Held as a speculative-sleeve position");
  });

  it("does NOT append a sleeve flag when weight is at or below threshold", () => {
    const out = applySpeculativeSuppressions([], holds, 0.05, 0.05);
    expect(out.find(f => f.finding_key === "speculative_sleeve:over_threshold")).toBeUndefined();
  });

  it("appends exactly one sleeve flag when weight exceeds threshold", () => {
    const out = applySpeculativeSuppressions([], holds, 0.061, 0.05);
    const sleeve = out.filter(f => f.finding_key === "speculative_sleeve:over_threshold");
    expect(sleeve).toHaveLength(1);
    expect(sleeve[0].severity).toBe("yellow");
    expect(sleeve[0].body).toContain("6.1%");
    expect(sleeve[0].body).toContain("5%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/speculative.test.ts`
Expected: FAIL — cannot find module `./speculative`.

- [ ] **Step 3: Implement `src/engine/speculative.ts`**

```typescript
import type { Flag, SpeculativeHold } from "../types";
import { canonicalTicker } from "../intake/tickerMetadata";
import { buildFindingKey } from "./findingKeys";

/** Canonicalized set of speculative tickers for membership checks. */
export function speculativeTickerSet(holds: SpeculativeHold[]): Set<string> {
  return new Set(holds.map(h => canonicalTicker(h.ticker)));
}

/**
 * Mutes per-name flags for speculative-sleeve tickers (annotating, not dropping,
 * to mirror applyNoteSuppressions) and appends a single sleeve-size flag when the
 * combined sleeve weight exceeds the configured threshold.
 */
export function applySpeculativeSuppressions(
  flags: Flag[],
  holds: SpeculativeHold[],
  sleeveWeight: number,
  threshold: number,
): Flag[] {
  const reasonByTicker = new Map(holds.map(h => [canonicalTicker(h.ticker), h.reason]));

  const annotated: Flag[] = flags.map(f => {
    const reason = reasonByTicker.get(canonicalTicker(f.ticker));
    if (reason === undefined && !reasonByTicker.has(canonicalTicker(f.ticker))) return f;
    return {
      ...f,
      suppressed_by: {
        source: "speculative_hold" as const,
        id: f.ticker,
        body: reason ?? "Held as a speculative-sleeve position",
      },
    };
  });

  if (sleeveWeight > threshold) {
    const tickers = [...reasonByTicker.keys()].join(", ");
    annotated.push({
      ticker: "SPECULATIVE",
      severity: "yellow",
      title: `Speculative sleeve at ${(sleeveWeight * 100).toFixed(1)}% of portfolio`,
      body: `Combined speculative-sleeve weight (${tickers}) is ${(sleeveWeight * 100).toFixed(1)}%, above your ${(threshold * 100).toFixed(0)}% threshold. These names are exempt from per-position scoring — re-confirm the sleeve is still intentionally sized.`,
      finding_key: buildFindingKey({ dimension: "speculative_sleeve", type: "over_threshold" }),
    });
  }

  return annotated;
}
```

Note: the membership check uses `reasonByTicker.has(...)` so a hold whose `reason` is `undefined` is still treated as speculative (the `Map` returns `undefined` for both "absent" and "present-with-no-reason", so `.has()` disambiguates).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/speculative.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/engine/speculative.ts src/engine/speculative.test.ts
git commit -m "feat(engine): speculative-sleeve flag suppression + size guardrail"
```

---

### Task 4: Exempt speculative tickers from single-stock-risk

**Files:**
- Modify: `src/engine/dimensions.ts` (`scoreSingleStockRisk` + `scoreAllDimensions`)
- Test: `src/engine/dimensions.test.ts`

**Interfaces:**
- Consumes: `canonicalTicker` from `src/intake/tickerMetadata.ts`
- Produces: `scoreSingleStockRisk(portfolio, agg, sp?, speculative?: Set<string>)` — fourth param defaults to `new Set()`
- Produces: `scoreAllDimensions(portfolio, agg, macro, accounts?, scoringProfile?, speculative?: Set<string>)` — sixth param defaults to `new Set()`, threaded into `scoreSingleStockRisk`

- [ ] **Step 1: Write the failing test**

Add to `src/engine/dimensions.test.ts` inside the existing `describe("scoreSingleStockRisk", ...)` block (the imports it needs — `makeHolding`, `makePortfolio`, `makeStockMetrics`, `computeAggregates` — are already present):

```typescript
  test("excludes a speculative ticker from the penalty and discloses it", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio, undefined, ["TSLA"]);
    const s = scoreSingleStockRisk(portfolio, agg, undefined, new Set(["TSLA"]));
    expect(s.score).toBe(10);
    expect(s.display_value).not.toContain("TSLA");
    expect(s.note).toContain("speculative");
  });

  test("still penalizes a non-speculative risky stock when another is exempt", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
        makeHolding({
          ticker: "PLTR", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio, undefined, ["TSLA"]);
    const s = scoreSingleStockRisk(portfolio, agg, undefined, new Set(["TSLA"]));
    expect(s.score).toBeLessThan(10);
    expect(s.display_value).toContain("PLTR");
    expect(s.display_value).not.toContain("TSLA");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/dimensions.test.ts -t "speculative"`
Expected: FAIL — TSLA still penalized (score < 10), or `note` lacks "speculative".

- [ ] **Step 3a: Add the import to `src/engine/dimensions.ts`**

Add after the existing imports (lines 1-3):

```typescript
import { canonicalTicker } from "../intake/tickerMetadata";
```

- [ ] **Step 3b: Update `scoreSingleStockRisk`**

Change the signature (currently `src/engine/dimensions.ts:203-207`):

```typescript
export function scoreSingleStockRisk(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
  speculative: Set<string> = new Set(),
): DimensionScore {
```

Inside the `for (const s of stocks)` loop, add an early `continue` for speculative tickers as the first statement of the loop body (before `const m = s.stock_metrics!;` at line 226):

```typescript
  for (const s of stocks) {
    if (speculative.has(canonicalTicker(s.ticker))) continue;
    const m = s.stock_metrics!;
```

Replace the final `return { ... }` block (lines 246-254) so the `note` discloses any exclusions:

```typescript
  const excluded = stocks
    .map(s => s.ticker)
    .filter(t => speculative.has(canonicalTicker(t)));
  const baseNote = "Penalizes stocks with P/E > 100, negative EPS growth, high beta, or declining revenue";
  const note = excluded.length > 0
    ? `${baseNote}. ${excluded.length} position(s) excluded as speculative sleeve (${excluded.join(", ")})`
    : baseNote;

  return {
    id: "single_stock_risk",
    label: "Single-stock risk",
    score,
    rating: toRating(score),
    display_value: flaggedTickers.length > 0 ? `${flaggedTickers.join(", ")} flagged` : "No flags",
    note,
    weight: 0.12,
  };
```

- [ ] **Step 3c: Thread the set through `scoreAllDimensions`**

Change the signature (currently `src/engine/dimensions.ts:278-284`):

```typescript
export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
  scoringProfile?: ScoringProfile,
  speculative: Set<string> = new Set(),
): DimensionScore[] {
```

Update the `scoreSingleStockRisk` call inside the `all` array (currently line 294):

```typescript
    scoreSingleStockRisk(portfolio, agg, sp, speculative),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/dimensions.test.ts`
Expected: PASS (new tests and all pre-existing single-stock-risk tests, which pass `new Set()` implicitly).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): exempt speculative-sleeve tickers from single-stock-risk"
```

---

### Task 5: Teach the AI advisors the speculative rule

**Files:**
- Modify: `src/ai/tacticalAdvisor.ts` (`TacticalInputContext`, `SYSTEM_PROMPT`, `renderTacticalInput`)
- Modify: `src/ai/narratives.ts` (`NarrativesInput`, `SYSTEM_PROMPT`, user content)
- Test: `src/ai/tacticalAdvisor.prompt.test.ts`

**Interfaces:**
- Consumes: `SpeculativeHold` from `src/types.ts`
- Produces: `TacticalInputContext` gains `speculative_holds?: SpeculativeHold[]`; `renderTacticalInput` includes `speculative_holds` in its JSON payload
- Produces: `NarrativesInput` gains `speculative_holds?: SpeculativeHold[]`; user content includes `speculative_holds`

The rule is static text; the actual tickers flow through the input JSON's `speculative_holds` field, so the prompt stays constant and testable.

- [ ] **Step 1: Write the failing test**

Edit the existing assertion block in `src/ai/tacticalAdvisor.prompt.test.ts`. Add `speculative_holds` to the `renderTacticalInput({...})` call argument (place it after `open_situations: []`, around line 47):

```typescript
      open_situations: [],
      speculative_holds: [
        { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
      ],
```

Add an assertion after the existing `expect(...)` calls (after line 54):

```typescript
    expect(parsed.speculative_holds).toHaveLength(1);
    expect(parsed.speculative_holds[0].ticker).toBe("TSLA");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ai/tacticalAdvisor.prompt.test.ts`
Expected: FAIL — `parsed.speculative_holds` is `undefined`.

- [ ] **Step 3a: Update `src/ai/tacticalAdvisor.ts`**

Add `SpeculativeHold` to the type import block (lines 4-15):

```typescript
import type {
  Portfolio,
  MacroContext,
  PortfolioAggregates,
  DimensionScore,
  Flag,
  GapItem,
  AccountConfig,
  Situation,
  TacticalAdvisorOutput,
  UserProfile,
  SpeculativeHold,
} from "../types";
```

Append the rule to `SYSTEM_PROMPT` (replace the existing template ending at line 25 — add the paragraph before the closing backtick/`.trim()`):

```typescript
Every move must cite (a) specific dollars, (b) target account by label, (c) which scenarios it addresses, (d) which dimension scores it lifts.

SPECULATIVE SLEEVE: The input includes a "speculative_holds" array — tickers the user holds deliberately, for personal/long-term reasons, OUTSIDE the metrics discipline. Do NOT recommend trimming, selling, rebalancing, or reducing these positions on valuation, beta, growth, or single-stock-risk grounds. Treat them as fixed. You MAY reference the sleeve only if a flag with finding_key "speculative_sleeve:over_threshold" is present, in which case you may note the sleeve has grown beyond its size budget.`.trim();
```

Add the field to `TacticalInputContext` (after `profile?: UserProfile | null;` at line 71):

```typescript
  speculative_holds?: SpeculativeHold[];
```

Include it in `renderTacticalInput`'s payload object (after `profile: ctx.profile ?? null,` at line 87):

```typescript
      speculative_holds: ctx.speculative_holds ?? [],
```

- [ ] **Step 3b: Update `src/ai/narratives.ts`**

Add `SpeculativeHold` to the type import block (lines 4-13):

```typescript
import type {
  AINarratives,
  Portfolio,
  MacroContext,
  PortfolioAggregates,
  DimensionScore,
  ReferenceModel,
  Flag,
  UserProfile,
  SpeculativeHold,
} from "../types";
```

Append the rule to `narratives.ts` `SYSTEM_PROMPT` (add as a final bullet before the closing backtick/`.trim()` at line 58):

```typescript
- Speculative sleeve: the input may include a "speculative_holds" array — tickers the user holds deliberately outside the metrics discipline. Do not raise them as gaps or recommend trimming/selling them on valuation, beta, or growth grounds; treat them as fixed positions.`.trim();
```

Add the field to `NarrativesInput` (after `profile?: UserProfile | null;` at line 69):

```typescript
  speculative_holds?: SpeculativeHold[];
```

Include it in the `userContent` JSON object (after `profile: input.profile ?? null,` at line 90):

```typescript
    speculative_holds: input.speculative_holds ?? [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ai/tacticalAdvisor.prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/ai/tacticalAdvisor.ts src/ai/narratives.ts src/ai/tacticalAdvisor.prompt.test.ts
git commit -m "feat(ai): instruct advisor + narratives to leave speculative sleeve untouched"
```

---

### Task 6: Wire the pipeline + seed Kevin's sleeve + verify end-to-end

**Files:**
- Modify: `data/kevin/user-context.json` (seed `speculative_holds` + threshold)
- Modify: `src/index.ts` (build set, thread into aggregates/scoring/suppression/AI)

No unit test — `src/index.ts` is the orchestrator (verified manually per CLAUDE.md). Verification is the end-to-end run in Step 4.

**Interfaces:**
- Consumes: `speculativeTickerSet`, `applySpeculativeSuppressions` (Task 3); `computeAggregates` 3rd param (Task 2); `scoreAllDimensions` 6th param (Task 4); `TacticalInputContext.speculative_holds`, `NarrativesInput.speculative_holds` (Task 5)

- [ ] **Step 1: Seed the speculative sleeve in `data/kevin/user-context.json`**

Add two top-level keys to the object (alongside `version`, `profile`, `situations`, `notes`, `chat_history`). Insert after the `"notes": []` / `"chat_history": [...]` entries:

```json
  "speculative_holds": [
    { "ticker": "TSLA", "reason": "Long-term personal hold, owned many years", "designated_at": "2026-06-20" },
    { "ticker": "NVDA", "reason": "Speculative AI position", "designated_at": "2026-06-20" }
  ],
  "speculative_sleeve_threshold": 0.05
```

(Use the Edit tool: locate the closing of `chat_history` and add a comma + the two keys before the file's final `}`.)

- [ ] **Step 2: Add imports to `src/index.ts`**

Update the suppression import (line 26) and add the speculative module import directly below it:

```typescript
import { applyNoteSuppressions } from "./engine/suppression";
import { speculativeTickerSet, applySpeculativeSuppressions } from "./engine/speculative";
```

- [ ] **Step 3a: Build the set and thread it into the engine**

After `const effectedPortfolio = applyPortfolioEffects(...)` (line 245), add:

```typescript
  const speculativeSet = speculativeTickerSet(userContext.speculative_holds);
```

Update the `computeAggregates` call (line 248):

```typescript
  const aggregates = computeAggregates(effectedPortfolio, accounts, [...speculativeSet]);
```

Update the `scoreAllDimensions` call (line 249):

```typescript
  const dimension_scores = scoreAllDimensions(effectedPortfolio, aggregates, macro, accounts, scoringProfile, speculativeSet);
```

- [ ] **Step 3b: Apply speculative suppression after note suppression**

Replace the suppression block (currently lines 255-258):

```typescript
  // Apply Note suppressions (cosmetic — flags retain finding_key, annotated with suppressed_by)
  const suppressed = applyNoteSuppressions(rawFlags, rawGapItems, userContext.notes);
  const flags = applySpeculativeSuppressions(
    suppressed.flags,
    userContext.speculative_holds,
    aggregates.speculative_sleeve_weight ?? 0,
    userContext.speculative_sleeve_threshold,
  );
  const gap_items = suppressed.gaps;
```

- [ ] **Step 3c: Pass the holds to both AI calls**

In the `generateNarratives({...})` call (around lines 270-280), add after `flags,`:

```typescript
        speculative_holds: userContext.speculative_holds,
```

In the `runTacticalAdvisor({...})` call (around lines 354-366), add after `open_situations: userContext.situations,`:

```typescript
        speculative_holds: userContext.speculative_holds,
```

- [ ] **Step 4: Verify end-to-end**

Run the pipeline for Kevin (offline — skips the macro network refresh; AI steps run only if `ANTHROPIC_API_KEY` is set, which also validates the prompt rule):

Run: `npx tsx src/index.ts --user kevin --no-refresh`
Expected console: completes without error; single-stock-risk line shows a higher score than the prior 7.6.

Then inspect the written `analysis.json` (path comes from `.env.kevin`'s `OUTPUT_FILE`, i.e. `data/kevin/analysis.json`):

```bash
node -e "const a=require('./data/kevin/analysis.json'); \
  const s=a.dimension_scores.find(d=>d.id==='single_stock_risk'); \
  console.log('single_stock_risk score:', s.score, '| note:', s.note); \
  console.log('sleeve weight:', a.aggregates.speculative_sleeve_weight, a.aggregates.speculative_sleeve_tickers); \
  console.log('TSLA/NVDA flags suppressed_by:', a.flags.filter(f=>['TSLA','NVDA'].includes(f.ticker)).map(f=>[f.ticker, f.suppressed_by?.source]));"
```

Expected:
- `single_stock_risk score` is ~10 (was 7.63), and `note` contains "speculative sleeve (TSLA, NVDA)".
- `sleeve weight` ≈ 0.036, tickers `[ 'TSLA', 'NVDA' ]` — below 0.05, so **no** `speculative_sleeve:over_threshold` flag.
- Each TSLA/NVDA flag shows `suppressed_by.source === 'speculative_hold'`.
- If the AI ran: no `tactical_advisor` move trims TSLA/NVDA; no narrative gap targets them.

- [ ] **Step 5: Commit**

```bash
git add data/kevin/user-context.json src/index.ts
git commit -m "feat: wire speculative sleeve through pipeline + seed Kevin's TSLA/NVDA"
```

---

### Task 7: React report — source-aware suppression label + sleeve summary

**Files:**
- Modify: `src/report/app/sections/Flags.tsx`

(The app `types.ts` mirror — `FlagSuppressionRef.source` and the two `PortfolioAggregates` fields — was already updated in Tasks 1 & 2. Verify those edits are present before starting; if `FlagSuppressionRef.source` in `src/report/app/types.ts` still reads `"note" | "situation"`, widen it to include `"speculative_hold"` now.)

No unit test (React UI — verified manually per CLAUDE.md). Verification is the typecheck + visual check.

- [ ] **Step 1: Make the suppression label source-aware**

In `src/report/app/sections/Flags.tsx`, replace the suppressed-by footer block (currently lines 135-139):

```tsx
      {isSuppressed && flag.suppressed_by && (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          {flag.suppressed_by.source === "speculative_hold"
            ? `Speculative-sleeve hold — excluded from scoring${flag.suppressed_by.body ? `: "${flag.suppressed_by.body}"` : ""}`
            : `Suppressed by your note: "${flag.suppressed_by.body}"`}
        </div>
      )}
```

- [ ] **Step 2: Add a sleeve summary line above the flag list**

In `src/report/app/sections/Flags.tsx`, the component returns either the "No critical flags" card or the flag list. Add a sleeve banner at the top of the populated-list return. Replace the opening of the final `return` (currently lines 32-33):

```tsx
  const sleeveWeight = data.aggregates.speculative_sleeve_weight ?? 0;
  const sleeveTickers = data.aggregates.speculative_sleeve_tickers ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sleeveTickers.length > 0 && (
        <div style={{
          fontSize: 12,
          color: "#888",
          padding: "6px 10px",
          border: "1px dashed #444",
          borderRadius: 6,
        }}>
          Speculative sleeve: {(sleeveWeight * 100).toFixed(1)}% — {sleeveTickers.join(", ")} (excluded from risk scoring)
        </div>
      )}
```

(The existing `{flags.map(...)}` and closing `</div>` stay as-is below this.)

- [ ] **Step 3: Typecheck and visual check**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors.

Run: `npm run report` and confirm the Flags section shows the dashed "Speculative sleeve: 3.6% — TSLA, NVDA" line and that the TSLA/NVDA flags render muted (dashed border, ~60% opacity) with the new "Speculative-sleeve hold — excluded from scoring" footer. (Requires `data/kevin/analysis.json` from Task 6 as the loaded report data.)

- [ ] **Step 4: Commit**

```bash
git add src/report/app/sections/Flags.tsx
git commit -m "feat(report): label speculative-sleeve flags + sleeve weight summary"
```

---

## Final verification

- [ ] **Full test suite**

Run: `npx vitest run`
Expected: all tests pass (baseline 174+ plus the new speculative tests).

- [ ] **Both typechecks**

Run: `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors in either.

---

## Self-review (completed during planning)

**Spec coverage:**
- Data model & config (`speculative_holds`, threshold default 0.05, `FlagSuppressionRef` source, aggregates fields, by-ticker canonical matching) → Tasks 1, 2.
- `scoreSingleStockRisk` exemption + disclosed note → Task 4.
- Per-name flags annotated `suppressed_by` (generate-then-annotate) → Task 3 + wired in Task 6.
- New sleeve-size flag above threshold → Task 3 + wired in Task 6.
- Suppression wiring after note suppression → Task 6 Step 3b.
- `index.ts` orchestration (thread list into aggregates/scoring/AI) → Task 6.
- AI advisor + narratives rule → Task 5.
- React mirror types + muted rendering + sleeve summary → Tasks 1, 2, 7.
- Seed TSLA + NVDA → Task 6 Step 1.
- TDD co-located tests; both tsconfigs → every task + final verification.

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `speculativeTickerSet` / `applySpeculativeSuppressions` signatures match between Task 3 (definition) and Task 6 (call sites). `computeAggregates` 3rd param is `string[]` (Task 2) and Task 6 passes `[...speculativeSet]`. `scoreAllDimensions` 6th param is `Set<string>` (Task 4) and Task 6 passes `speculativeSet`. `suppressed_by.source` value `"speculative_hold"` is consistent across types (Task 1), engine (Task 3), and React (Task 7).
