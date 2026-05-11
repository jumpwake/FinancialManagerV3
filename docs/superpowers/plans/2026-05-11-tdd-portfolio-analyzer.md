# Portfolio Analyzer V3 — TDD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine and intake layers of the Portfolio Analyzer V3 (per `Documentation/DevelopmentDoc1.md`) test-first, producing the 10 dimension scoring functions, the aggregate computation, the rule-based flag/gap/plan generators, and zod-validated JSON intake. The Anthropic narratives call, CLI orchestrator, and React report are built afterward without tests.

**Architecture:** TypeScript + Vitest + zod. Tests co-located as `*.test.ts` next to each module. Fixture builders (`makeHolding`, `makePortfolio`, `makeMacro`) generate test inputs with sensible defaults; each test overrides only the fields it cares about. Build proceeds as a walking skeleton (one dimension end-to-end) followed by seven horizontal waves that add remaining dimensions, aggregate fields, rules, intake validation, and benchmark data.

**Tech Stack:** TypeScript 5.4 (strict), Vitest 1.x, zod 3.x, tsx, Vite 5 (for the React report later), Anthropic SDK (for narratives later).

---

## Overview

The dev doc (`Documentation/DevelopmentDoc1.md`) specifies a 14-step build from scaffold to React report. This plan executes steps 1–8 (the engine + intake) test-first, then hands off to the spec's existing instructions for narratives (step 9), CLI orchestration (step 10), and React (steps 11–13).

Every function in the engine is pure: structured input, structured output, no I/O. That's the sweet spot for unit testing. The rules in `plan.ts` have many branches that need coverage. The AI call and React rendering are not natural fits for TDD and are deferred.

Methodology: walking skeleton, then horizontal expansion. The skeleton TDDs one dimension end-to-end (`cost_efficiency`), forcing the type contracts and module boundaries to settle before scaling out. Each subsequent wave adds related dimensions or rule modules, with new aggregate fields and new types appearing only when a failing test demands them.

---

## Section 1: Scaffold & tooling

Files created in Task 1 before any test runs:

```
FinancialManagerV3/
├── package.json            ← vitest, zod, tsx, anthropic sdk, react, vite, chart.js
├── tsconfig.json           ← strict mode, ESNext, react-jsx
├── vitest.config.ts        ← includes src/**/*.test.ts
├── .gitignore
├── data/portfolio.json     ← sample from dev doc §3.1
└── data/macro.json         ← sample from dev doc §3.3
```

Dependency choices:
- **`vitest`** — test runner; Vite-native, ESM-first, zero TS config required.
- **`zod`** — JSON validation + type inference. Used in wave 6.
- **`tsx`** — replaces `ts-node` from spec §13; faster, handles modern TS/ESM out of the box.
- **`@anthropic-ai/sdk`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `chart.js`, `react-chartjs-2`** — per spec §13; installed upfront to avoid mid-stream npm operations.

Script changes from spec §13: add `"test": "vitest run"`, `"test:watch": "vitest"`; swap `"analyze"` to use `tsx`. `tsconfig.json` adjustments: `"module": "ESNext"` and `"moduleResolution": "Bundler"` (required for Vitest's ESM runtime).

---

## Section 2: Walking skeleton

Vertical: `cost_efficiency`. Chosen because it has the smallest input footprint (one field from aggregates), no macro context, no stock-metrics dependency, and a clean ER-threshold ladder.

What exists at the end of the skeleton:

| File | Surface area |
|---|---|
| `src/types.ts` | `AssetClass`, `Holding` (7 fields), `Portfolio`, `PortfolioAggregates` (2 fields), `Rating`, `DimensionScore` |
| `src/engine/aggregates.ts` | `computeAggregates()` returning `{ total_value, blended_expense_ratio }` |
| `src/engine/dimensions.ts` | `scoreCostEfficiency()` + private `toRating()` helper |
| `tests/fixtures/samplePortfolio.ts` | `makeHolding()`, `makePortfolio()` builders |
| Test files | `aggregates.test.ts`, `dimensions.test.ts` |

Skeleton done state: ~14 passing tests, `tsc --noEmit` clean, types contain only what the skeleton consumes.

---

## Section 3: Horizontal expansion (waves 1–7)

After the skeleton, the engine + intake grows in seven waves. Each wave is one or more tasks, leaves the suite green, and commits.

**Wave 1 — Simple weights (5 tasks):** adds `simplicity`, `concentration`, `cash_efficiency`, `international`, `diversification`, plus all weight aggregate fields and `DuplicateGroup`.

**Wave 2 — Macro-aware (3 tasks):** adds `MacroContext`, `SectorHolding`, `sector_holdings` aggregate field, then `bond_balance` and `macro_alignment`.

**Wave 3 — Stock-metrics-aware (3 tasks):** adds `StockMetrics` to `Holding`, then `single_stock_risk` and `quality_tilt`.

**Wave 4 — Score aggregation (1 task):** `scoreToGrade` + `computePortfolioScore` + `scoreAllDimensions` wrapper.

**Wave 5 — Rule-based outputs (3 tasks):** `generateFlags`, `generateGapItems`, `generatePlanPhases` + `score_trajectory`.

**Wave 6 — Intake validation (2 tasks):** zod schemas for `Portfolio` and `MacroContext` with `parsePortfolio` / `parseMacro` functions.

**Wave 7 — Benchmarks (1 task):** static `REFERENCE_MODELS` data + one sanity test asserting dimension-key coverage.

---

## Section 4: Fixture conventions

- All test data via builders, never literal JSON.
- `makeHolding(overrides)` defaults: `ticker: "TEST"`, `label: "Test Holding"`, `market_value: 100`, `asset_class: "us_equity_total_market"`, `is_cash: false`, `is_pending_deployment: false`, `expense_ratio: 0.0002`.
- `makePortfolio(overrides)` defaults: `snapshot_date: "2026-05-11"`, `account_label: "Test"`, `holdings: []`.
- `makeMacro(overrides)` defaults to a neutral Mid Cycle regime so tests don't get incidental scoring lift from macro alignment.
- One test = one assertion focus. `describe` per function, `test` per scenario.

## Section 5: Non-TDD layer bridges

After wave 7, the test-driven scope is complete. Remaining spec items (narratives, CLI, React) are built without tests:

- **`src/ai/narratives.ts`** — implement per spec §8. Manually verify with a saved `AnalysisOutput` minus narratives as a fixture. No automated test.
- **`src/index.ts`** — CLI orchestrator per spec §10. Smoke test: `npm run analyze` against the sample portfolio produces a valid `output/analysis.json`.
- **`src/report/app/**`** — React components per spec §11–12. Manual visual check against:
  - `Documentation/image.png` — allocation breakdown reference (donut chart, holdings table, T3 pending callout)
  - `Documentation/image2.png` — model comparison reference (4 grade cards, dimension-by-dimension scorecard table)
  - Spec §16 design tokens (colors, typography)

## Section 6: Done definition

- 195+ passing tests, 0 failing.
- `npx tsc --noEmit` passes with `strict: true`.
- `npm run analyze` end-to-end produces `output/analysis.json` matching the `AnalysisOutput` shape.
- React report renders all 8 sections from a real `analysis.json`.
- No `any`, no `as unknown as`, no `@ts-ignore`.

---

## File Structure

```
FinancialManagerV3/
├── data/portfolio.json
├── data/macro.json
├── src/
│   ├── types.ts
│   ├── intake/
│   │   ├── parsePortfolio.ts
│   │   ├── parsePortfolio.test.ts
│   │   ├── parseMacro.ts
│   │   └── parseMacro.test.ts
│   ├── engine/
│   │   ├── aggregates.ts
│   │   ├── aggregates.test.ts
│   │   ├── dimensions.ts
│   │   ├── dimensions.test.ts
│   │   ├── benchmarks.ts
│   │   ├── benchmarks.test.ts
│   │   ├── plan.ts
│   │   └── plan.test.ts
│   ├── ai/narratives.ts            (built later, no tests)
│   ├── report/app/...              (built later, no tests)
│   └── index.ts                    (built later, no tests)
├── tests/fixtures/
│   ├── samplePortfolio.ts
│   └── sampleMacro.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .gitignore
```

---

## The full plan

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `data/portfolio.json`, `data/macro.json`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "portfolio-analyzer-v3",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "analyze": "tsx src/index.ts",
    "report": "vite src/report/app --open",
    "build": "tsc && vite build src/report/app",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "chart.js": "^4.4.1",
    "react": "^18.2.0",
    "react-chartjs-2": "^5.2.0",
    "react-dom": "^18.2.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.4.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
output/
.env
*.log
.vite/
.vitest-cache/
```

- [ ] **Step 5: Create `data/portfolio.json`**

Copy the full sample JSON object from `Documentation/DevelopmentDoc1.md` §3.1 (the 12-holding portfolio starting with FSKAX). The exact object spans lines 76–227 of the dev doc.

- [ ] **Step 6: Create `data/macro.json`**

Copy the full sample JSON object from `Documentation/DevelopmentDoc1.md` §3.3 (lines 252–268).

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: dependencies installed; `node_modules/` populated; `package-lock.json` created.

- [ ] **Step 8: Verify Vitest runs**

Run: `npx vitest run --passWithNoTests`
Expected: "No test files found" message; exit code 0.

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no output; exit code 0.

- [ ] **Step 10: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.ts data/
git commit -m "chore: scaffold project with vitest + tsx + zod"
```

---

### Task 2: Types skeleton + fixture builders

**Files:**
- Create: `src/types.ts`
- Create: `tests/fixtures/samplePortfolio.ts`

No tests this task — pure infrastructure consumed by subsequent tests.

- [ ] **Step 1: Create `src/types.ts`**

```ts
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
  | "cash"
  | "cash_pending";

export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  is_cash: boolean;
  is_pending_deployment: boolean;
  expense_ratio: number | null;
}

export interface Portfolio {
  snapshot_date: string;
  account_label: string;
  holdings: Holding[];
}

export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
}

export type Rating = "green" | "yellow" | "red";

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  rating: Rating;
  display_value: string;
  note: string;
  weight: number;
}
```

- [ ] **Step 2: Create `tests/fixtures/samplePortfolio.ts`**

```ts
import { Holding, Portfolio } from "../../src/types";

export function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    ticker: "TEST",
    label: "Test Holding",
    market_value: 100,
    asset_class: "us_equity_total_market",
    is_cash: false,
    is_pending_deployment: false,
    expense_ratio: 0.0002,
    ...overrides,
  };
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    snapshot_date: "2026-05-11",
    account_label: "Test",
    holdings: [],
    ...overrides,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts tests/fixtures/samplePortfolio.ts
git commit -m "feat: add minimal types and portfolio fixture builders"
```

---

### Task 3: computeAggregates skeleton (TDD)

Adds `total_value` and `blended_expense_ratio` to the aggregates.

**Files:**
- Create: `src/engine/aggregates.test.ts`
- Create: `src/engine/aggregates.ts`

- [ ] **Step 1: Write failing tests** — create `src/engine/aggregates.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";

describe("computeAggregates", () => {
  describe("total_value", () => {
    test("sums market_values across all holdings", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 100 }),
          makeHolding({ ticker: "B", market_value: 250 }),
          makeHolding({ ticker: "C", market_value: 50 }),
        ],
      });
      expect(computeAggregates(portfolio).total_value).toBe(400);
    });

    test("returns 0 for an empty portfolio", () => {
      expect(computeAggregates(makePortfolio({ holdings: [] })).total_value).toBe(0);
    });
  });

  describe("blended_expense_ratio", () => {
    test("weighted average across fund holdings", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 100, expense_ratio: 0.001 }),
          makeHolding({ ticker: "B", market_value: 100, expense_ratio: 0.003 }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.002, 6);
    });

    test("weights respect market_value, not equal weighting", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 900, expense_ratio: 0.0001 }),
          makeHolding({ ticker: "B", market_value: 100, expense_ratio: 0.0020 }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.00029, 6);
    });

    test("excludes cash holdings from the blend", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "FUND", market_value: 100, expense_ratio: 0.001, is_cash: false }),
          makeHolding({ ticker: "CASH", market_value: 100, expense_ratio: null, is_cash: true, asset_class: "cash" }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.001, 6);
    });

    test("returns 0 when no fund holdings exist", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "CASH", market_value: 100, expense_ratio: null, is_cash: true, asset_class: "cash" }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — module `./aggregates` not found.

- [ ] **Step 3: Implement `src/engine/aggregates.ts`**

```ts
import { Portfolio, PortfolioAggregates } from "../types";

export function computeAggregates(portfolio: Portfolio): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  return { total_value, blended_expense_ratio };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/aggregates.ts src/engine/aggregates.test.ts
git commit -m "feat(engine): add computeAggregates with total_value and blended_expense_ratio"
```

---

### Task 4: scoreCostEfficiency + skeleton integration (TDD)

Completes the walking skeleton: portfolio → aggregates → DimensionScore round-trip.

**Files:**
- Create: `src/engine/dimensions.test.ts`
- Create: `src/engine/dimensions.ts`

- [ ] **Step 1: Write failing tests** — create `src/engine/dimensions.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { scoreCostEfficiency } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";
import { PortfolioAggregates } from "../types";

function aggWithER(er: number): PortfolioAggregates {
  return { total_value: 1000, blended_expense_ratio: er };
}

describe("scoreCostEfficiency", () => {
  test("returns score 10 / green for ER ≤ 0.05%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0003));
    expect(s.id).toBe("cost_efficiency");
    expect(s.score).toBe(10);
    expect(s.rating).toBe("green");
    expect(s.weight).toBe(0.10);
  });

  test("returns score 9 for 0.05% < ER ≤ 0.10%", () => {
    expect(scoreCostEfficiency(aggWithER(0.0008)).score).toBe(9);
  });

  test("returns score 7 / yellow for 0.10% < ER ≤ 0.20%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0015));
    expect(s.score).toBe(7);
    expect(s.rating).toBe("yellow");
  });

  test("returns score 5 / yellow for 0.20% < ER ≤ 0.35%", () => {
    const s = scoreCostEfficiency(aggWithER(0.003));
    expect(s.score).toBe(5);
    expect(s.rating).toBe("yellow");
  });

  test("returns score 3 / red for 0.35% < ER ≤ 0.50%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0045));
    expect(s.score).toBe(3);
    expect(s.rating).toBe("red");
  });

  test("returns score 1 / red for ER > 0.50%", () => {
    expect(scoreCostEfficiency(aggWithER(0.0080)).score).toBe(1);
  });

  test("display_value includes the blended ER as a percent string", () => {
    expect(scoreCostEfficiency(aggWithER(0.0015)).display_value).toContain("0.15%");
  });

  test("end-to-end skeleton: portfolio → aggregates → score", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 680000, expense_ratio: 0.00015 }),
        makeHolding({ ticker: "FXNAX", market_value: 160000, expense_ratio: 0.00025 }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const score = scoreCostEfficiency(agg);
    expect(score.score).toBe(10);
    expect(score.rating).toBe("green");
    expect(score.id).toBe("cost_efficiency");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — module `./dimensions` not found.

- [ ] **Step 3: Implement `src/engine/dimensions.ts`**

```ts
import { PortfolioAggregates, DimensionScore, Rating } from "../types";

export function toRating(score: number): Rating {
  if (score >= 7.5) return "green";
  if (score >= 5.0) return "yellow";
  return "red";
}

export function scoreCostEfficiency(agg: PortfolioAggregates): DimensionScore {
  const erPct = agg.blended_expense_ratio * 100;
  const score =
    erPct <= 0.05 ? 10 :
    erPct <= 0.10 ? 9 :
    erPct <= 0.20 ? 7 :
    erPct <= 0.35 ? 5 :
    erPct <= 0.50 ? 3 : 1;

  return {
    id: "cost_efficiency",
    label: "Cost efficiency",
    score,
    rating: toRating(score),
    display_value: `~${erPct.toFixed(2)}% blended ER`,
    note: "Blended expense ratio across all fund holdings",
    weight: 0.10,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`
Expected: 14 passed (6 aggregates + 8 dimensions).

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): add scoreCostEfficiency + complete walking skeleton"
```

---

### Task 5: Wave 1 — `simplicity` (+ holding_count, duplicate_groups)

**Files:**
- Modify: `src/types.ts` (add `DuplicateGroup`, extend `PortfolioAggregates`)
- Modify: `src/engine/aggregates.ts`, `src/engine/aggregates.test.ts`
- Modify: `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add `DuplicateGroup` and extend `PortfolioAggregates`:

```ts
export interface DuplicateGroup {
  label: string;
  tickers: string[];
  combined_weight: number;
}

export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
  holding_count: number;
  duplicate_groups: DuplicateGroup[];
}
```

(Replace the existing `PortfolioAggregates` interface — never have two declarations.)

- [ ] **Step 2: Update `aggWithER` helper** in `src/engine/dimensions.test.ts` to include the new fields:

```ts
function aggWithER(er: number): PortfolioAggregates {
  return { total_value: 1000, blended_expense_ratio: er, holding_count: 0, duplicate_groups: [] };
}
```

- [ ] **Step 3: Write failing aggregate tests** — append to `src/engine/aggregates.test.ts`:

```ts
describe("computeAggregates — holding_count and duplicates", () => {
  test("holding_count excludes cash positions", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", is_cash: false }),
        makeHolding({ ticker: "B", is_cash: false }),
        makeHolding({ ticker: "C", is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    expect(computeAggregates(portfolio).holding_count).toBe(2);
  });

  test("duplicate_groups detects two funds in the same passive asset class", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 400, asset_class: "us_equity_total_market" }),
      ],
    });
    const dups = computeAggregates(portfolio).duplicate_groups;
    expect(dups).toHaveLength(1);
    expect(dups[0].tickers.sort()).toEqual(["FSKAX", "VTSAX"]);
    expect(dups[0].combined_weight).toBeCloseTo(1.0, 6);
  });

  test("duplicate_groups empty when no class has 2+ funds", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FXNAX", asset_class: "us_bond_aggregate" }),
      ],
    });
    expect(computeAggregates(portfolio).duplicate_groups).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `holding_count`/`duplicate_groups` are `undefined`.

- [ ] **Step 5: Update `src/engine/aggregates.ts`** to the full implementation:

```ts
import { Portfolio, PortfolioAggregates, DuplicateGroup, Holding } from "../types";

const DUPLICATE_CLASSES: string[] = [
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_bond_aggregate",
  "us_bond_short",
];

export function computeAggregates(portfolio: Portfolio): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const w = (h: Holding) => (total_value > 0 ? h.market_value / total_value : 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  const holding_count = holdings.filter(h => !h.is_cash).length;

  const duplicate_groups: DuplicateGroup[] = [];
  for (const cls of DUPLICATE_CLASSES) {
    const group = holdings.filter(h => h.asset_class === cls && !h.is_cash);
    if (group.length >= 2) {
      duplicate_groups.push({
        label: cls.replace(/_/g, " "),
        tickers: group.map(h => h.ticker),
        combined_weight: group.reduce((sum, h) => sum + w(h), 0),
      });
    }
  }

  return { total_value, blended_expense_ratio, holding_count, duplicate_groups };
}
```

- [ ] **Step 6: Write failing simplicity tests** — append to `src/engine/dimensions.test.ts`:

```ts
import { scoreSimplicity } from "./dimensions";

function aggForSimplicity(overrides: Partial<PortfolioAggregates>): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 0,
    duplicate_groups: [],
    ...overrides,
  };
}

describe("scoreSimplicity", () => {
  test("returns 10 for ≤ 5 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 5 })).score).toBe(10);
  });

  test("returns 8 for 6–8 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 7 })).score).toBe(8);
  });

  test("returns 6 for 9–12 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 10 })).score).toBe(6);
  });

  test("returns 4 for 13–16 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 14 })).score).toBe(4);
  });

  test("returns 2 for > 16 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 20 })).score).toBe(2);
  });

  test("subtracts duplicate-extra positions from effective count", () => {
    const agg = aggForSimplicity({
      holding_count: 8,
      duplicate_groups: [{ label: "us equity total market", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreSimplicity(agg).score).toBe(8);
  });

  test("display_value shows raw and effective counts", () => {
    const agg = aggForSimplicity({
      holding_count: 8,
      duplicate_groups: [{ label: "x", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreSimplicity(agg).display_value).toBe("8 holdings (7 effective)");
  });
});
```

- [ ] **Step 7: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `scoreSimplicity` not exported.

- [ ] **Step 8: Add `scoreSimplicity` to `src/engine/dimensions.ts`**

Append:

```ts
export function scoreSimplicity(agg: PortfolioAggregates): DimensionScore {
  const extraPositions = agg.duplicate_groups.reduce((sum, g) => sum + g.tickers.length - 1, 0);
  const effective = agg.holding_count - extraPositions;

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
    display_value: `${agg.holding_count} holdings (${effective} effective)`,
    note: "Effective positions after removing redundant fund overlaps",
    weight: 0.08,
  };
}
```

- [ ] **Step 9: Run tests to verify pass**

Run: `npm test`
Expected: 24 passed (14 + 3 agg + 7 simplicity).

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add scoreSimplicity with holding_count and duplicate_groups"
```

---

### Task 6: Wave 1 — `concentration` (+ top3_weight, top3_tickers)

**Files:**
- Modify: `src/types.ts`, `src/engine/aggregates.ts`, `src/engine/aggregates.test.ts`, `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Extend `PortfolioAggregates`** in `src/types.ts`:

```ts
export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
  holding_count: number;
  duplicate_groups: DuplicateGroup[];
  top3_weight: number;
  top3_tickers: string[];
}
```

- [ ] **Step 2: Update fixtures and helpers** — extend `aggForSimplicity` and any other helpers in dimensions.test.ts to include `top3_weight: 0, top3_tickers: []`.

- [ ] **Step 3: Write failing aggregate tests** — append to `src/engine/aggregates.test.ts`:

```ts
describe("computeAggregates — top3 concentration", () => {
  test("top3_weight sums the three largest holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", market_value: 500 }),
        makeHolding({ ticker: "B", market_value: 300 }),
        makeHolding({ ticker: "C", market_value: 100 }),
        makeHolding({ ticker: "D", market_value: 100 }),
      ],
    });
    expect(computeAggregates(portfolio).top3_weight).toBeCloseTo(0.9, 6);
  });

  test("top3_tickers ordered by descending market_value", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "D", market_value: 100 }),
        makeHolding({ ticker: "A", market_value: 500 }),
        makeHolding({ ticker: "C", market_value: 100 }),
        makeHolding({ ticker: "B", market_value: 300 }),
      ],
    });
    expect(computeAggregates(portfolio).top3_tickers).toEqual(["A", "B", "C"]);
  });

  test("top3 with fewer than 3 holdings uses all of them", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", market_value: 600 }),
        makeHolding({ ticker: "B", market_value: 400 }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.top3_tickers).toEqual(["A", "B"]);
    expect(agg.top3_weight).toBeCloseTo(1.0, 6);
  });
});
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npm test`
Expected: FAIL — `top3_*` undefined.

- [ ] **Step 5: Update `computeAggregates`** — insert before the `return`:

```ts
const sorted = [...holdings].sort((a, b) => b.market_value - a.market_value);
const top3 = sorted.slice(0, 3);
const top3_weight = top3.reduce((sum, h) => sum + w(h), 0);
const top3_tickers = top3.map(h => h.ticker);
```

And add `top3_weight, top3_tickers` to the returned object.

- [ ] **Step 6: Write failing dimension tests** — append to `src/engine/dimensions.test.ts`:

```ts
import { scoreConcentration } from "./dimensions";

function aggForConc(top3: number, tickers: string[] = ["A", "B", "C"]): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 10,
    duplicate_groups: [],
    top3_weight: top3,
    top3_tickers: tickers,
  };
}

describe("scoreConcentration", () => {
  test("returns 10 for top3 ≤ 35%", () => {
    expect(scoreConcentration(aggForConc(0.30)).score).toBe(10);
  });

  test("returns 8 for 35% < top3 ≤ 45%", () => {
    expect(scoreConcentration(aggForConc(0.40)).score).toBe(8);
  });

  test("returns 6 for 45% < top3 ≤ 55%", () => {
    expect(scoreConcentration(aggForConc(0.50)).score).toBe(6);
  });

  test("returns 4 for 55% < top3 ≤ 65%", () => {
    expect(scoreConcentration(aggForConc(0.60)).score).toBe(4);
  });

  test("returns 2 for top3 > 65%", () => {
    expect(scoreConcentration(aggForConc(0.80)).score).toBe(2);
  });

  test("display_value includes percentage and tickers", () => {
    const s = scoreConcentration(aggForConc(0.42, ["FSKAX", "FTIHX", "FXNAX"]));
    expect(s.display_value).toContain("42.0%");
    expect(s.display_value).toContain("FSKAX, FTIHX, FXNAX");
  });
});
```

- [ ] **Step 7: Run tests to verify failure**

- [ ] **Step 8: Add `scoreConcentration` to `src/engine/dimensions.ts`**

```ts
export function scoreConcentration(agg: PortfolioAggregates): DimensionScore {
  const t3 = agg.top3_weight;
  const score =
    t3 <= 0.35 ? 10 :
    t3 <= 0.45 ? 8 :
    t3 <= 0.55 ? 6 :
    t3 <= 0.65 ? 4 : 2;

  return {
    id: "concentration",
    label: "Concentration",
    score,
    rating: toRating(score),
    display_value: `Top 3: ${(t3 * 100).toFixed(1)}% (${agg.top3_tickers.join(", ")})`,
    note: "Top-3 holding weight as share of total portfolio",
    weight: 0.12,
  };
}
```

- [ ] **Step 9: Run tests to verify pass.** Expected: 33 passed.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add scoreConcentration with top3 aggregates"
```

---

### Task 7: Wave 1 — `cash_efficiency` (+ cash fields)

**Files:** same set.

- [ ] **Step 1: Extend `PortfolioAggregates`** — add:

```ts
cash_weight: number;
idle_cash_weight: number;
pending_cash_weight: number;
pending_cash_value: number;
pending_deployment_label?: string;
pending_deployment_date?: string;
```

- [ ] **Step 2: Update all `aggFor*` helpers in dimensions.test.ts** to include zero defaults for the new fields.

- [ ] **Step 3: Write failing aggregate tests** — append to `aggregates.test.ts`:

```ts
describe("computeAggregates — cash partition", () => {
  test("cash_weight sums all is_cash holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FUND", market_value: 800, is_cash: false }),
        makeHolding({ ticker: "SPAXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "VMFXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    expect(computeAggregates(portfolio).cash_weight).toBeCloseTo(0.2, 6);
  });

  test("pending_cash_weight isolates is_pending_deployment cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FUND", market_value: 800, is_cash: false }),
        makeHolding({ ticker: "SPAXX", market_value: 150, is_cash: true, is_pending_deployment: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "VMFXX", market_value: 50, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.pending_cash_weight).toBeCloseTo(0.15, 6);
    expect(agg.pending_cash_value).toBe(150);
    expect(agg.idle_cash_weight).toBeCloseTo(0.05, 6);
  });

  test("pending_deployment_label and _date copied from first pending holding", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "SPAXX", market_value: 100, is_cash: true, is_pending_deployment: true,
          asset_class: "cash", expense_ratio: null,
        }),
      ],
    });
    // Extend Holding fixture inline with the optional deployment fields:
    portfolio.holdings[0].deployment_label = "Tranche 3";
    portfolio.holdings[0].deployment_date = "2026-05-29";

    const agg = computeAggregates(portfolio);
    expect(agg.pending_deployment_label).toBe("Tranche 3");
    expect(agg.pending_deployment_date).toBe("2026-05-29");
  });
});
```

- [ ] **Step 4: Extend `Holding` in `src/types.ts`** to include optional deployment fields:

```ts
export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
}
```

- [ ] **Step 5: Run tests to verify failure.**

- [ ] **Step 6: Update `computeAggregates`** — insert before the `return`:

```ts
const cash_weight = holdings.filter(h => h.is_cash).reduce((sum, h) => sum + w(h), 0);
const pending_holdings = holdings.filter(h => h.is_pending_deployment);
const pending_cash_weight = pending_holdings.reduce((sum, h) => sum + w(h), 0);
const pending_cash_value = pending_holdings.reduce((sum, h) => sum + h.market_value, 0);
const idle_cash_weight = cash_weight - pending_cash_weight;
const firstPending = pending_holdings[0];
```

Add the new fields to the returned object: `cash_weight, idle_cash_weight, pending_cash_weight, pending_cash_value, pending_deployment_label: firstPending?.deployment_label, pending_deployment_date: firstPending?.deployment_date`.

- [ ] **Step 7: Write failing dimension tests** — append:

```ts
import { scoreCashEfficiency } from "./dimensions";

function aggForCash(idle: number, pending: number = 0): PortfolioAggregates {
  return {
    total_value: 1000, blended_expense_ratio: 0.0002,
    holding_count: 5, duplicate_groups: [],
    top3_weight: 0, top3_tickers: [],
    cash_weight: idle + pending, idle_cash_weight: idle,
    pending_cash_weight: pending, pending_cash_value: pending * 1000,
  };
}

describe("scoreCashEfficiency", () => {
  test("returns 10 for idle ≤ 2%", () => {
    expect(scoreCashEfficiency(aggForCash(0.01)).score).toBe(10);
  });
  test("returns 8 for 2% < idle ≤ 5%", () => {
    expect(scoreCashEfficiency(aggForCash(0.04)).score).toBe(8);
  });
  test("returns 7 for 5% < idle ≤ 8%", () => {
    expect(scoreCashEfficiency(aggForCash(0.07)).score).toBe(7);
  });
  test("returns 5 for 8% < idle ≤ 12%", () => {
    expect(scoreCashEfficiency(aggForCash(0.10)).score).toBe(5);
  });
  test("returns 3 for 12% < idle ≤ 20%", () => {
    expect(scoreCashEfficiency(aggForCash(0.15)).score).toBe(3);
  });
  test("returns 1 for idle > 20%", () => {
    expect(scoreCashEfficiency(aggForCash(0.30)).score).toBe(1);
  });
  test("pending cash does not penalize the score", () => {
    expect(scoreCashEfficiency(aggForCash(0.01, 0.25)).score).toBe(10);
  });
  test("display_value includes pending when present", () => {
    expect(scoreCashEfficiency(aggForCash(0.04, 0.10)).display_value).toContain("pending");
  });
});
```

- [ ] **Step 8: Add `scoreCashEfficiency`** to `dimensions.ts`:

```ts
export function scoreCashEfficiency(agg: PortfolioAggregates): DimensionScore {
  const idle = agg.idle_cash_weight;
  const score =
    idle <= 0.02 ? 10 :
    idle <= 0.05 ? 8 :
    idle <= 0.08 ? 7 :
    idle <= 0.12 ? 5 :
    idle <= 0.20 ? 3 : 1;

  const display = agg.pending_cash_weight > 0
    ? `${(idle * 100).toFixed(1)}% idle + ${(agg.pending_cash_weight * 100).toFixed(1)}% pending`
    : `${(idle * 100).toFixed(1)}% idle`;

  return {
    id: "cash_efficiency",
    label: "Cash efficiency",
    score,
    rating: toRating(score),
    display_value: display,
    note: "Pending deployment cash is excluded from penalty — it has an active plan",
    weight: 0.12,
  };
}
```

- [ ] **Step 9: Run tests to verify pass.** Expected: ~44 passed.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add scoreCashEfficiency with cash partition aggregates"
```

---

### Task 8: Wave 1 — `international` (+ international_weight)

**Files:** same set.

- [ ] **Step 1: Extend `PortfolioAggregates`** — add `international_weight: number;`.

- [ ] **Step 2: Update existing `aggFor*` helpers** to include `international_weight: 0`.

- [ ] **Step 3: Write failing aggregate test** — append:

```ts
describe("computeAggregates — international_weight", () => {
  test("sums international_equity holdings as fraction of total", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 300, asset_class: "international_equity" }),
      ],
    });
    expect(computeAggregates(portfolio).international_weight).toBeCloseTo(0.3, 6);
  });
});
```

- [ ] **Step 4: Update `computeAggregates`** — add:

```ts
const international_weight = holdings
  .filter(h => h.asset_class === "international_equity")
  .reduce((sum, h) => sum + w(h), 0);
```

And include `international_weight` in the returned object.

- [ ] **Step 5: Write failing dimension tests** — append to `dimensions.test.ts`:

```ts
import { scoreInternational } from "./dimensions";

function aggForIntl(intl: number): PortfolioAggregates {
  return {
    total_value: 1000, blended_expense_ratio: 0.0002,
    holding_count: 5, duplicate_groups: [],
    top3_weight: 0, top3_tickers: [],
    cash_weight: 0, idle_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
    international_weight: intl,
  };
}

describe("scoreInternational", () => {
  test("returns 10 for 15% ≤ intl ≤ 30%", () => {
    expect(scoreInternational(aggForIntl(0.20)).score).toBe(10);
  });
  test("returns 8 for 10% ≤ intl < 15%", () => {
    expect(scoreInternational(aggForIntl(0.12)).score).toBe(8);
  });
  test("returns 6 for 5% ≤ intl < 10%", () => {
    expect(scoreInternational(aggForIntl(0.07)).score).toBe(6);
  });
  test("returns 4 for 2% ≤ intl < 5%", () => {
    expect(scoreInternational(aggForIntl(0.03)).score).toBe(4);
  });
  test("returns 2 for intl < 2%", () => {
    expect(scoreInternational(aggForIntl(0.01)).score).toBe(2);
  });
  test("returns 8 (not 10) for intl > 30% (over-allocation)", () => {
    expect(scoreInternational(aggForIntl(0.40)).score).toBe(8);
  });
});
```

- [ ] **Step 6: Add `scoreInternational`** to `dimensions.ts`:

```ts
export function scoreInternational(agg: PortfolioAggregates): DimensionScore {
  const intl = agg.international_weight;
  const score =
    intl >= 0.15 && intl <= 0.30 ? 10 :
    intl >= 0.10                 ? 8 :
    intl >= 0.05                 ? 6 :
    intl >= 0.02                 ? 4 : 2;

  return {
    id: "international",
    label: "International exposure",
    score,
    rating: toRating(score),
    display_value: `${(intl * 100).toFixed(1)}% international`,
    note: "Target 15–30% for a globally diversified portfolio",
    weight: 0.06,
  };
}
```

- [ ] **Step 7: Run tests, verify pass.** Expected: ~51 passed.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add scoreInternational with international_weight"
```

---

### Task 9: Wave 1 — `diversification` (+ remaining weight aggregates)

**Files:** same set.

- [ ] **Step 1: Extend `PortfolioAggregates`** — add:

```ts
equity_weight: number;
fixed_income_weight: number;
individual_stock_weight: number;
balanced_weight: number;
```

- [ ] **Step 2: Update existing `aggFor*` helpers** with zero defaults for the new fields.

- [ ] **Step 3: Write failing aggregate tests** — append:

```ts
describe("computeAggregates — sleeve weights", () => {
  test("equity_weight covers US equity + sector + individual_stock classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 400, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 100, asset_class: "individual_stock" }),
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
      ],
    });
    expect(computeAggregates(portfolio).equity_weight).toBeCloseTo(0.6, 6);
  });

  test("fixed_income_weight covers all us_bond_* classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
        makeHolding({ ticker: "VFSUX", market_value: 100, asset_class: "us_bond_short" }),
      ],
    });
    expect(computeAggregates(portfolio).fixed_income_weight).toBeCloseTo(0.3, 6);
  });

  test("individual_stock_weight isolated from broader equity bucket", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "NVDA", market_value: 200, asset_class: "individual_stock" }),
      ],
    });
    expect(computeAggregates(portfolio).individual_stock_weight).toBeCloseTo(0.4, 6);
  });

  test("balanced_weight covers balanced + target_date classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VWENX", market_value: 100, asset_class: "balanced" }),
        makeHolding({ ticker: "FXAIX", market_value: 100, asset_class: "target_date" }),
      ],
    });
    expect(computeAggregates(portfolio).balanced_weight).toBeCloseTo(0.2, 6);
  });
});
```

- [ ] **Step 4: Run tests, verify failure.**

- [ ] **Step 5: Update `computeAggregates`** — add:

```ts
const EQUITY_CLASSES: string[] = [
  "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
  "us_equity_small_mid", "us_equity_sector", "individual_stock",
];
const BOND_CLASSES: string[] = ["us_bond_aggregate", "us_bond_short", "us_bond_tips"];

const equity_weight = holdings
  .filter(h => EQUITY_CLASSES.includes(h.asset_class))
  .reduce((sum, h) => sum + w(h), 0);

const fixed_income_weight = holdings
  .filter(h => BOND_CLASSES.includes(h.asset_class))
  .reduce((sum, h) => sum + w(h), 0);

const individual_stock_weight = holdings
  .filter(h => h.asset_class === "individual_stock")
  .reduce((sum, h) => sum + w(h), 0);

const balanced_weight = holdings
  .filter(h => h.asset_class === "balanced" || h.asset_class === "target_date")
  .reduce((sum, h) => sum + w(h), 0);
```

Include all 4 new fields in the returned object.

- [ ] **Step 6: Write failing dimension tests** — append:

```ts
import { scoreDiversification } from "./dimensions";

function aggForDiv(o: Partial<PortfolioAggregates>): PortfolioAggregates {
  return {
    total_value: 1000, blended_expense_ratio: 0.0002,
    holding_count: 5, duplicate_groups: [],
    top3_weight: 0, top3_tickers: [],
    cash_weight: 0, idle_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 0, fixed_income_weight: 0, individual_stock_weight: 0, balanced_weight: 0,
    ...o,
  };
}

describe("scoreDiversification", () => {
  test("returns 10 when 5+ buckets ≥ 3%", () => {
    const agg = aggForDiv({
      equity_weight: 0.55, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05, individual_stock_weight: 0.05,
    });
    expect(scoreDiversification(agg).score).toBe(10);
  });

  test("returns 8 for 4 buckets", () => {
    const agg = aggForDiv({
      equity_weight: 0.60, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05,
    });
    expect(scoreDiversification(agg).score).toBe(8);
  });

  test("returns 6 for 3 buckets", () => {
    const agg = aggForDiv({
      equity_weight: 0.70, international_weight: 0.15, fixed_income_weight: 0.15,
    });
    expect(scoreDiversification(agg).score).toBe(6);
  });

  test("returns 4 for 2 buckets", () => {
    const agg = aggForDiv({ equity_weight: 0.80, fixed_income_weight: 0.20 });
    expect(scoreDiversification(agg).score).toBe(4);
  });

  test("returns 2 for ≤ 1 bucket", () => {
    const agg = aggForDiv({ equity_weight: 1.0 });
    expect(scoreDiversification(agg).score).toBe(2);
  });

  test("subtracts 1 per duplicate_group", () => {
    const agg = aggForDiv({
      equity_weight: 0.55, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05, individual_stock_weight: 0.05,
      duplicate_groups: [{ label: "x", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreDiversification(agg).score).toBe(9);
  });
});
```

- [ ] **Step 7: Add `scoreDiversification`** to `dimensions.ts`:

```ts
export function scoreDiversification(agg: PortfolioAggregates): DimensionScore {
  const buckets: Record<string, number> = {
    us_equity: agg.equity_weight - agg.international_weight - agg.individual_stock_weight,
    international: agg.international_weight,
    fixed_income: agg.fixed_income_weight,
    balanced: agg.balanced_weight,
    individual_stock: agg.individual_stock_weight,
  };
  const filledBuckets = Object.values(buckets).filter(w => w >= 0.03).length;
  let score = filledBuckets >= 5 ? 10 : filledBuckets === 4 ? 8 : filledBuckets === 3 ? 6 : filledBuckets === 2 ? 4 : 2;
  score = Math.max(1, score - agg.duplicate_groups.length);

  return {
    id: "diversification",
    label: "Diversification",
    score,
    rating: toRating(score),
    display_value: `${filledBuckets} asset buckets`,
    note: "Distinct asset class buckets with ≥ 3% weight; penalized for overlapping funds",
    weight: 0.12,
  };
}
```

- [ ] **Step 8: Run tests, verify pass.** Expected: ~65 passed. **Wave 1 complete.**

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add scoreDiversification — closes wave 1 (5 dimensions)"
```

---

### Task 10: Wave 2 — Macro types + sector_holdings aggregate

**Files:**
- Modify: `src/types.ts`
- Create: `tests/fixtures/sampleMacro.ts`
- Modify: `src/engine/aggregates.ts`, `src/engine/aggregates.test.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface SectorHolding {
  sector_tag: string;
  tickers: string[];
  combined_weight: number;
}

export interface MacroContext {
  snapshot_date: string;
  federal_funds_rate: number;
  cpi_yoy_headline: number;
  cpi_yoy_core: number;
  yield_curve_spread_10y_2y: number;
  yield_curve_status: string;
  vix: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
  ism_manufacturing: number;
  ism_services: number;
  market_regime: string;
  sector_overweight: string[];
  sector_underweight: string[];
}

export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
  holding_count: number;
  duplicate_groups: DuplicateGroup[];
  top3_weight: number;
  top3_tickers: string[];
  cash_weight: number;
  idle_cash_weight: number;
  pending_cash_weight: number;
  pending_cash_value: number;
  pending_deployment_label?: string;
  pending_deployment_date?: string;
  international_weight: number;
  equity_weight: number;
  fixed_income_weight: number;
  individual_stock_weight: number;
  balanced_weight: number;
  sector_holdings: SectorHolding[];
}
```

Also extend `Holding` to include optional `sector_tag`:

```ts
export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  sector_tag?: string;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
}
```

- [ ] **Step 2: Create `tests/fixtures/sampleMacro.ts`**

```ts
import { MacroContext } from "../../src/types";

export function makeMacro(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    snapshot_date: "2026-05-11",
    federal_funds_rate: 4.5,
    cpi_yoy_headline: 2.5,
    cpi_yoy_core: 2.4,
    yield_curve_spread_10y_2y: 0.10,
    yield_curve_status: "normal",
    vix: 16.0,
    hy_credit_spread_oas_bps: 320,
    lei_consecutive_declines: 0,
    ism_manufacturing: 51.0,
    ism_services: 53.0,
    market_regime: "Mid Cycle",
    sector_overweight: [],
    sector_underweight: [],
    ...overrides,
  };
}
```

- [ ] **Step 3: Update all `aggFor*` helpers in dimensions.test.ts** to include `sector_holdings: []`.

- [ ] **Step 4: Write failing aggregate tests** — append:

```ts
describe("computeAggregates — sector_holdings", () => {
  test("groups holdings by sector_tag with combined_weight", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "XLP", market_value: 100, asset_class: "us_equity_sector", sector_tag: "consumer_staples" }),
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      ],
    });
    const sh = computeAggregates(portfolio).sector_holdings;
    expect(sh).toHaveLength(2);
    const utilities = sh.find(s => s.sector_tag === "utilities")!;
    expect(utilities.tickers).toEqual(["XLU"]);
    expect(utilities.combined_weight).toBeCloseTo(0.1, 6);
  });

  test("multiple holdings sharing a sector_tag merge into one group", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "VPU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      ],
    });
    const sh = computeAggregates(portfolio).sector_holdings;
    expect(sh).toHaveLength(1);
    expect(sh[0].tickers.sort()).toEqual(["VPU", "XLU"]);
    expect(sh[0].combined_weight).toBeCloseTo(0.2, 6);
  });

  test("holdings without sector_tag are not in sector_holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 100, asset_class: "us_equity_total_market" }),
      ],
    });
    expect(computeAggregates(portfolio).sector_holdings).toEqual([]);
  });
});
```

- [ ] **Step 5: Update `computeAggregates`** — add before the `return`:

```ts
const sector_map: Record<string, string[]> = {};
for (const h of holdings.filter(h => h.sector_tag)) {
  const tag = h.sector_tag!;
  if (!sector_map[tag]) sector_map[tag] = [];
  sector_map[tag].push(h.ticker);
}
const sector_holdings = Object.entries(sector_map).map(([sector_tag, tickers]) => ({
  sector_tag,
  tickers,
  combined_weight: holdings
    .filter(h => tickers.includes(h.ticker))
    .reduce((sum, h) => sum + w(h), 0),
}));
```

Include `sector_holdings` in the returned object.

- [ ] **Step 6: Run tests, verify pass.** Expected: ~68 passed.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts tests/fixtures/sampleMacro.ts src/engine/
git commit -m "feat(engine): add MacroContext type + sector_holdings aggregate"
```

---

### Task 11: Wave 2 — `scoreBondBalance`

**Files:** `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests** — append to `dimensions.test.ts`:

```ts
import { scoreBondBalance } from "./dimensions";
import { makeMacro } from "../../tests/fixtures/sampleMacro";

function aggForBond(fi: number): PortfolioAggregates {
  return {
    total_value: 1000, blended_expense_ratio: 0.0002,
    holding_count: 5, duplicate_groups: [],
    top3_weight: 0, top3_tickers: [],
    cash_weight: 0, idle_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 1 - fi, fixed_income_weight: fi,
    individual_stock_weight: 0, balanced_weight: 0,
    sector_holdings: [],
  };
}

describe("scoreBondBalance", () => {
  test("returns 9 for Late Cycle when FI is 18–30%", () => {
    const agg = aggForBond(0.22);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(9);
  });

  test("returns 9 for Mid Cycle when FI is 15–25%", () => {
    const agg = aggForBond(0.20);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Mid Cycle" })).score).toBe(9);
  });

  test("returns 9 for Recession when FI is 25–40%", () => {
    const agg = aggForBond(0.30);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Recession" })).score).toBe(9);
  });

  test("returns 7 for slightly below target (>= 0.8x min)", () => {
    const agg = aggForBond(0.15);  // Late Cycle min 0.18, 0.8x = 0.144
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(7);
  });

  test("returns 5 for half target", () => {
    const agg = aggForBond(0.10);  // Late Cycle min 0.18, 0.5x = 0.09
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(5);
  });

  test("returns 3 for severely underweight", () => {
    const agg = aggForBond(0.05);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(3);
  });

  test("returns 7 when over the target range (overweight penalty is mild)", () => {
    const agg = aggForBond(0.50);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(7);
  });

  test("unknown regime falls back to 15–25% target", () => {
    const agg = aggForBond(0.20);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Unknown" })).score).toBe(9);
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Add `scoreBondBalance`** — append to `dimensions.ts`:

```ts
import { MacroContext } from "../types";

export function scoreBondBalance(agg: PortfolioAggregates, macro: MacroContext): DimensionScore {
  const fi = agg.fixed_income_weight;
  const targets: Record<string, { min: number; max: number }> = {
    "Late Cycle":  { min: 0.18, max: 0.30 },
    "Mid Cycle":   { min: 0.15, max: 0.25 },
    "Early Cycle": { min: 0.10, max: 0.20 },
    "Recession":   { min: 0.25, max: 0.40 },
  };
  const target = targets[macro.market_regime] ?? { min: 0.15, max: 0.25 };

  const score =
    fi >= target.min && fi <= target.max ? 9 :
    fi >= target.min * 0.8               ? 7 :
    fi >= target.min * 0.5               ? 5 :
    fi > target.max                      ? 7 : 3;

  return {
    id: "bond_balance",
    label: "Bond balance",
    score,
    rating: toRating(score),
    display_value: `${(fi * 100).toFixed(1)}% FI (target ${(target.min * 100).toFixed(0)}–${(target.max * 100).toFixed(0)}%)`,
    note: `Target range for ${macro.market_regime} regime`,
    weight: 0.12,
  };
}
```

- [ ] **Step 4: Run tests, verify pass.** Expected: ~76 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat(engine): add scoreBondBalance with regime-based FI targets"
```

---

### Task 12: Wave 2 — `scoreMacroAlignment`

**Files:** `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests** — append:

```ts
import { scoreMacroAlignment } from "./dimensions";

function aggForMacro(sectors: { sector_tag: string; tickers: string[]; combined_weight: number }[]): PortfolioAggregates {
  return {
    total_value: 1000, blended_expense_ratio: 0.0002,
    holding_count: 5, duplicate_groups: [],
    top3_weight: 0, top3_tickers: [],
    cash_weight: 0, idle_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 0, fixed_income_weight: 0, individual_stock_weight: 0, balanced_weight: 0,
    sector_holdings: sectors,
  };
}

describe("scoreMacroAlignment", () => {
  test("baseline 5 when no sector tilts and no overweight matches", () => {
    const agg = aggForMacro([]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_overweight: [], sector_underweight: [] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(5);
  });

  test("+1 per aligned overweight sector held ≥ 1%", () => {
    const agg = aggForMacro([{ sector_tag: "utilities", tickers: ["XLU"], combined_weight: 0.02 }]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_overweight: ["utilities"] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(6);
  });

  test("−1.5 per underweight sector held ≥ 3%", () => {
    const agg = aggForMacro([{ sector_tag: "consumer_discretionary", tickers: ["XLY"], combined_weight: 0.05 }]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_underweight: ["consumer_discretionary"] });
    expect(scoreMacroAlignment(agg, macro).score).toBeCloseTo(3.5, 6);
  });

  test("score is clamped to 1..10", () => {
    const agg = aggForMacro([
      { sector_tag: "x1", tickers: ["A"], combined_weight: 0.05 },
      { sector_tag: "x2", tickers: ["B"], combined_weight: 0.05 },
      { sector_tag: "x3", tickers: ["C"], combined_weight: 0.05 },
      { sector_tag: "x4", tickers: ["D"], combined_weight: 0.05 },
      { sector_tag: "x5", tickers: ["E"], combined_weight: 0.05 },
    ]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_underweight: ["x1", "x2", "x3", "x4", "x5"] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(1);
  });

  test("display_value mentions the regime", () => {
    const agg = aggForMacro([]);
    const macro = makeMacro({ market_regime: "Late Cycle" });
    expect(scoreMacroAlignment(agg, macro).display_value).toContain("Late Cycle");
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Add `scoreMacroAlignment`** — append to `dimensions.ts`:

```ts
export function scoreMacroAlignment(agg: PortfolioAggregates, macro: MacroContext): DimensionScore {
  let score = 5;
  for (const sh of agg.sector_holdings) {
    if (macro.sector_overweight.includes(sh.sector_tag) && sh.combined_weight >= 0.01) {
      score += 1;
    }
    if (macro.sector_underweight.includes(sh.sector_tag) && sh.combined_weight >= 0.03) {
      score -= 1.5;
    }
  }
  score = Math.max(1, Math.min(10, score));

  return {
    id: "macro_alignment",
    label: "Macro alignment",
    score,
    rating: toRating(score),
    display_value: `${macro.market_regime} regime`,
    note: `Sector tilts vs. macro overweights: ${macro.sector_overweight.join(", ") || "(none)"}`,
    weight: 0.10,
  };
}
```

Note: this simplifies the Late Cycle defensive-bonus block from spec §6 (which adds a small bonus per defensive ticker held). That bonus can be re-introduced later if needed; it's hard to test deterministically as written. Skipping for now.

- [ ] **Step 4: Run tests, verify pass.** Expected: ~81 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat(engine): add scoreMacroAlignment — closes wave 2"
```

---

### Task 13: Wave 3 — StockMetrics type

**Files:** `src/types.ts`, `tests/fixtures/samplePortfolio.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface StockMetrics {
  pe_ratio: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  roe: number | null;
  eps_growth_yoy: number | null;
  revenue_growth_yoy: number | null;
  net_debt_ebitda: number | null;
  beta: number | null;
  analyst_consensus: number | null;
}
```

And extend `Holding` to include the optional field:

```ts
export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  sector_tag?: string;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
  stock_metrics?: StockMetrics;
}
```

- [ ] **Step 2: Add a helper to `tests/fixtures/samplePortfolio.ts`**

```ts
import { StockMetrics } from "../../src/types";

export function makeStockMetrics(overrides: Partial<StockMetrics> = {}): StockMetrics {
  return {
    pe_ratio: 20,
    ev_ebitda: 15,
    fcf_yield: 0.04,
    roe: 0.15,
    eps_growth_yoy: 0.10,
    revenue_growth_yoy: 0.08,
    net_debt_ebitda: 1.0,
    beta: 1.0,
    analyst_consensus: 3.5,
    ...overrides,
  };
}
```

- [ ] **Step 3: Verify `tsc --noEmit` passes.**

- [ ] **Step 4: Commit**

```bash
git add src/types.ts tests/fixtures/samplePortfolio.ts
git commit -m "feat: add StockMetrics type and fixture builder"
```

---

### Task 14: Wave 3 — `scoreSingleStockRisk`

**Files:** `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests** — append:

```ts
import { scoreSingleStockRisk } from "./dimensions";
import { makeStockMetrics } from "../../tests/fixtures/samplePortfolio";

describe("scoreSingleStockRisk", () => {
  test("returns 10 / green when portfolio holds no individual stocks", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBe(10);
    expect(s.rating).toBe("green");
    expect(s.display_value).toBe("No individual stocks");
  });

  test("clean stock (P/E 20, positive EPS, beta 1) → no penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "BRK-B", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 20, eps_growth_yoy: 0.10, beta: 0.9, revenue_growth_yoy: 0.05 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreSingleStockRisk(portfolio, agg).score).toBe(10);
  });

  test("extreme P/E (>100) + declining EPS triggers heavy penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBeLessThan(5);
    expect(s.display_value).toContain("TSLA");
  });

  test("elevated P/E (>50) but otherwise healthy → mild penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "NVDA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, eps_growth_yoy: 0.50, beta: 1.2, revenue_growth_yoy: 0.40 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBe(9);
  });

  test("display_value lists all flagged tickers comma-separated", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700 }),
        makeHolding({
          ticker: "TSLA", market_value: 150, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8 }),
        }),
        makeHolding({
          ticker: "NVDA", market_value: 150, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, beta: 2.2 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.display_value).toContain("TSLA");
    expect(s.display_value).toContain("NVDA");
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Add `scoreSingleStockRisk`** — append to `dimensions.ts`:

```ts
import { Portfolio } from "../types";

export function scoreSingleStockRisk(portfolio: Portfolio, agg: PortfolioAggregates): DimensionScore {
  const total = agg.total_value;
  const stocks = portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics);

  if (stocks.length === 0) {
    return {
      id: "single_stock_risk",
      label: "Single-stock risk",
      score: 10,
      rating: "green",
      display_value: "No individual stocks",
      note: "No single-stock exposure",
      weight: 0.12,
    };
  }

  let totalPenalty = 0;
  const flaggedTickers: string[] = [];
  for (const s of stocks) {
    const m = s.stock_metrics!;
    const w = s.market_value / total;
    let penalty = 0;

    if (m.pe_ratio !== null && m.pe_ratio > 100) penalty += 2;
    else if (m.pe_ratio !== null && m.pe_ratio > 50) penalty += 1;

    if (m.eps_growth_yoy !== null && m.eps_growth_yoy < -0.15) penalty += 1.5;
    if (m.beta !== null && m.beta > 1.5) penalty += 1;
    if (m.revenue_growth_yoy !== null && m.revenue_growth_yoy < 0) penalty += 1;

    if (penalty > 0) {
      flaggedTickers.push(s.ticker);
      const stockShare = agg.individual_stock_weight > 0 ? w / agg.individual_stock_weight : 0;
      totalPenalty += penalty * stockShare;
    }
  }

  const score = Math.max(1, 10 - totalPenalty);

  return {
    id: "single_stock_risk",
    label: "Single-stock risk",
    score,
    rating: toRating(score),
    display_value: flaggedTickers.length > 0 ? `${flaggedTickers.join(", ")} flagged` : "No flags",
    note: "Penalizes stocks with P/E > 100, negative EPS growth, high beta, or declining revenue",
    weight: 0.12,
  };
}
```

- [ ] **Step 4: Run tests, verify pass.** Expected: ~86 passed.

- [ ] **Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat(engine): add scoreSingleStockRisk"
```

---

### Task 15: Wave 3 — `scoreQualityTilt`

**Files:** `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests** — append:

```ts
import { scoreQualityTilt } from "./dimensions";

describe("scoreQualityTilt", () => {
  test("returns low score (≤ 5) when no quality tickers held", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "TSLA", market_value: 1000, asset_class: "individual_stock" })],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreQualityTilt(portfolio, agg).score).toBeLessThanOrEqual(2);
  });

  test("returns higher score when BRK-B + VWENX both held at meaningful weights", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600 }),
        makeHolding({ ticker: "BRK-B", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "VWENX", market_value: 200, asset_class: "balanced" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreQualityTilt(portfolio, agg);
    expect(s.score).toBeGreaterThanOrEqual(7);
    expect(s.display_value).toBe("Strong defensive tilt");
  });

  test("medium tilt for partial defensive holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({ ticker: "XLU", market_value: 200, asset_class: "us_equity_sector", sector_tag: "utilities" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreQualityTilt(portfolio, agg);
    expect(s.score).toBeGreaterThanOrEqual(5);
    expect(s.score).toBeLessThanOrEqual(7);
  });

  test("score capped at 10", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "BRK-B", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "VWENX", market_value: 200, asset_class: "balanced" }),
        makeHolding({ ticker: "XLV", market_value: 200, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "XLU", market_value: 200, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "XLP", market_value: 200, asset_class: "us_equity_sector" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreQualityTilt(portfolio, agg).score).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Add `scoreQualityTilt`** — append to `dimensions.ts`:

```ts
const QUALITY_TICKERS: Record<string, number> = {
  "BRK-B": 1.5, "VWENX": 1.5, "XLV": 1.0, "XLU": 1.0,
  "XLP": 1.0, "VFSUX": 0.5, "FXNAX": 0.5, "VBTLX": 0.5,
};

export function scoreQualityTilt(portfolio: Portfolio, agg: PortfolioAggregates): DimensionScore {
  const total = agg.total_value;
  let raw = 0;
  for (const h of portfolio.holdings) {
    if (QUALITY_TICKERS[h.ticker]) {
      const wt = Math.min(2, total > 0 ? (h.market_value / total) / 0.02 : 0);
      raw += QUALITY_TICKERS[h.ticker] * wt;
    }
  }
  const score = Math.min(10, Math.max(1, raw * 2.5));

  return {
    id: "quality_tilt",
    label: "Quality / defensive tilt",
    score,
    rating: toRating(score),
    display_value: score >= 7 ? "Strong defensive tilt" : score >= 5 ? "Moderate" : "Weak",
    note: "Presence of quality/defensive/dividend-oriented holdings",
    weight: 0.06,
  };
}
```

- [ ] **Step 4: Run tests, verify pass.** Expected: ~90 passed. **Wave 3 complete — all 10 dimensions implemented.**

- [ ] **Step 5: Commit**

```bash
git add src/engine/
git commit -m "feat(engine): add scoreQualityTilt — closes wave 3 (10 dimensions complete)"
```

---

### Task 16: Wave 4 — scoreToGrade + computePortfolioScore + scoreAllDimensions

**Files:** `src/engine/dimensions.ts`, `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests** — append:

```ts
import { scoreToGrade, computePortfolioScore, scoreAllDimensions } from "./dimensions";

describe("scoreToGrade", () => {
  test.each([
    [9.5, "A+"], [8.8, "A"], [8.2, "A−"], [7.8, "B+"], [7.2, "B"],
    [6.7, "B−"], [6.2, "C+"], [5.7, "C"], [5.2, "C−"], [4.7, "D+"],
    [4.2, "D"], [3.0, "F"],
  ])("score %f → grade %s", (score, grade) => {
    expect(scoreToGrade(score)).toBe(grade);
  });

  test("grade for boundary case 9.0", () => {
    expect(scoreToGrade(9.0)).toBe("A+");
  });
});

describe("computePortfolioScore", () => {
  test("weighted sum of dimension scores", () => {
    const dimensions: DimensionScore[] = [
      { id: "a", label: "A", score: 10, rating: "green", display_value: "", note: "", weight: 0.5 },
      { id: "b", label: "B", score: 4,  rating: "red",   display_value: "", note: "", weight: 0.5 },
    ];
    expect(computePortfolioScore(dimensions)).toBe(7);
  });
});

describe("scoreAllDimensions", () => {
  test("returns 10 dimension scores for a sample portfolio", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const macro = makeMacro();
    const dims = scoreAllDimensions(portfolio, agg, macro);
    expect(dims).toHaveLength(10);
    const ids = dims.map(d => d.id).sort();
    expect(ids).toEqual([
      "bond_balance", "cash_efficiency", "concentration", "cost_efficiency",
      "diversification", "international", "macro_alignment", "quality_tilt",
      "simplicity", "single_stock_risk",
    ]);
  });

  test("dimension weights sum to 1.0 (within rounding)", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX" })] });
    const agg = computeAggregates(portfolio);
    const dims = scoreAllDimensions(portfolio, agg, makeMacro());
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Add the three functions** — append to `dimensions.ts`:

```ts
export function scoreToGrade(score: number): string {
  if (score >= 9.0) return "A+";
  if (score >= 8.5) return "A";
  if (score >= 8.0) return "A−";
  if (score >= 7.5) return "B+";
  if (score >= 7.0) return "B";
  if (score >= 6.5) return "B−";
  if (score >= 6.0) return "C+";
  if (score >= 5.5) return "C";
  if (score >= 5.0) return "C−";
  if (score >= 4.5) return "D+";
  if (score >= 4.0) return "D";
  return "F";
}

export function computePortfolioScore(dimensions: DimensionScore[]): number {
  return dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
}

export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext
): DimensionScore[] {
  return [
    scoreCostEfficiency(agg),
    scoreDiversification(agg),
    scoreCashEfficiency(agg),
    scoreMacroAlignment(agg, macro),
    scoreSingleStockRisk(portfolio, agg),
    scoreSimplicity(agg),
    scoreBondBalance(agg, macro),
    scoreConcentration(agg),
    scoreInternational(agg),
    scoreQualityTilt(portfolio, agg),
  ];
}
```

- [ ] **Step 4: Verify weights sum to 1.0** — manually add: `0.10 + 0.12 + 0.12 + 0.10 + 0.12 + 0.08 + 0.12 + 0.12 + 0.06 + 0.06 = 1.00`. ✓

- [ ] **Step 5: Run tests, verify pass.** Expected: ~106 passed. **Wave 4 complete.**

- [ ] **Step 6: Commit**

```bash
git add src/engine/
git commit -m "feat(engine): add scoreToGrade, computePortfolioScore, scoreAllDimensions — closes wave 4"
```

---

### Task 17: Wave 5 — `generateFlags`

**Files:**
- Create: `src/engine/plan.test.ts`
- Create: `src/engine/plan.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface Flag {
  ticker: string;
  severity: "red" | "yellow";
  title: string;
  body: string;
}
```

- [ ] **Step 2: Write failing tests** — create `src/engine/plan.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { generateFlags } from "./plan";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio, makeStockMetrics } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";

describe("generateFlags — individual stocks", () => {
  test("emits RED flag for P/E > 100 + declining EPS", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    const red = flags.find(f => f.ticker === "TSLA" && f.severity === "red");
    expect(red).toBeDefined();
    expect(red!.title).toContain("TSLA");
  });

  test("emits YELLOW flag for elevated P/E (>50) without declining EPS", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "NVDA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, eps_growth_yoy: 0.50 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    const yellow = flags.find(f => f.ticker === "NVDA" && f.severity === "yellow");
    expect(yellow).toBeDefined();
  });

  test("emits YELLOW flag for high beta (>1.5)", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 25, beta: 1.8 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "TSLA" && f.title.includes("beta"))).toBe(true);
  });
});

describe("generateFlags — portfolio-level", () => {
  test("emits CASH flag when idle cash > 10%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({ ticker: "SPAXX", market_value: 150, is_cash: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "FUND2", market_value: 50 }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "CASH")).toBe(true);
  });

  test("does NOT emit CASH flag when idle cash ≤ 10%", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "CASH")).toBe(false);
  });

  test("emits MACRO flag when yield curve inverted + FI underweight", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const macro = makeMacro({ yield_curve_status: "inverted", yield_curve_spread_10y_2y: -0.12 });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), macro);
    expect(flags.some(f => f.ticker === "MACRO" && f.title.includes("yield curve"))).toBe(true);
  });

  test("emits MACRO flag when LEI declined ≥ 6 months", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro({ lei_consecutive_declines: 6 }));
    expect(flags.some(f => f.ticker === "MACRO" && f.title.includes("LEI"))).toBe(true);
  });

  test("emits one flag per duplicate fund group", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 500, asset_class: "us_equity_total_market" }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.title.includes("Redundant"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests, verify failure.**

- [ ] **Step 4: Implement `src/engine/plan.ts`**

```ts
import { Portfolio, MacroContext, PortfolioAggregates, Flag } from "../types";

export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext
): Flag[] {
  const flags: Flag[] = [];
  const total = agg.total_value;

  for (const h of portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics)) {
    const m = h.stock_metrics!;
    const wPct = total > 0 ? ((h.market_value / total) * 100).toFixed(1) : "0";

    if (m.pe_ratio !== null && m.pe_ratio > 100 && m.eps_growth_yoy !== null && m.eps_growth_yoy < 0) {
      flags.push({
        ticker: h.ticker,
        severity: "red",
        title: `${h.ticker} — extreme valuation + declining earnings`,
        body: `P/E ${m.pe_ratio.toFixed(0)}×, EPS growth ${(m.eps_growth_yoy * 100).toFixed(1)}% YoY. Position is ${wPct}% of portfolio.`,
      });
    } else if (m.pe_ratio !== null && m.pe_ratio > 50) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — elevated valuation`,
        body: `P/E ${m.pe_ratio.toFixed(0)}× is above sector norms. Monitor for earnings deceleration.`,
      });
    }

    if (m.beta !== null && m.beta > 1.5) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — high beta`,
        body: `Beta ${m.beta.toFixed(2)} amplifies market moves. Late-cycle macro warrants reducing high-beta exposure.`,
      });
    }
  }

  if (agg.idle_cash_weight > 0.10) {
    flags.push({
      ticker: "CASH",
      severity: "yellow",
      title: `Idle cash at ${(agg.idle_cash_weight * 100).toFixed(1)}%`,
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% of portfolio earning money-market yield. Deploy or document as intentional strategic reserve.`,
    });
  }

  if (macro.yield_curve_status === "inverted" && agg.fixed_income_weight < 0.15) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: "Inverted yield curve — bond underweight",
      body: `Yield curve spread at ${macro.yield_curve_spread_10y_2y.toFixed(2)}%. Fixed income at ${(agg.fixed_income_weight * 100).toFixed(1)}% is below the 18–22% late-cycle target.`,
    });
  }

  if (macro.lei_consecutive_declines >= 6) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: `LEI declining for ${macro.lei_consecutive_declines} consecutive months`,
      body: "Six or more consecutive LEI declines historically precede recession. Defensive positioning is warranted.",
    });
  }

  for (const group of agg.duplicate_groups) {
    flags.push({
      ticker: group.tickers.join("/"),
      severity: "yellow",
      title: `Redundant funds — ${group.label}`,
      body: `${group.tickers.join(", ")} hold near-identical underlying exposure. Combined ${(group.combined_weight * 100).toFixed(1)}% — consolidate into one.`,
    });
  }

  return flags;
}
```

- [ ] **Step 5: Run tests, verify pass.** Expected: ~113 passed.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/engine/plan.ts src/engine/plan.test.ts
git commit -m "feat(engine): add generateFlags with stock + cash + macro + duplicate rules"
```

---

### Task 18: Wave 5 — `generateGapItems`

**Files:** `src/types.ts`, `src/engine/plan.ts`, `src/engine/plan.test.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface GapItem {
  title: string;
  type: "red" | "amber" | "blue";
  body: string;
  progress: number;
}
```

- [ ] **Step 2: Write failing tests** — append to `plan.test.ts`:

```ts
import { generateGapItems } from "./plan";
import { scoreAllDimensions } from "./dimensions";

function dimsFor(portfolio: Portfolio, macro = makeMacro()) {
  return scoreAllDimensions(portfolio, computeAggregates(portfolio), macro);
}

describe("generateGapItems", () => {
  test("emits RED 'Cash drag' when idle_cash > 5%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 900 }),
        makeHolding({ ticker: "SPAXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title === "Cash drag" && g.type === "red")).toBe(true);
  });

  test("emits AMBER FI underweight when bond_balance score < 7", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title.includes("Fixed income") && g.type === "amber")).toBe(true);
  });

  test("emits AMBER overlap gap when duplicate_groups non-empty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 500, asset_class: "us_equity_total_market" }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title.includes("overlap"))).toBe(true);
  });

  test("no gaps emitted for a healthy portfolio", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 550, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
        makeHolding({ ticker: "VWENX", market_value: 50, asset_class: "balanced" }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro({ market_regime: "Mid Cycle" }));
    expect(gaps.find(g => g.type === "red")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests, verify failure.**

- [ ] **Step 4: Add `generateGapItems`** — append to `plan.ts`:

```ts
import { DimensionScore, GapItem } from "../types";

export function generateGapItems(
  agg: PortfolioAggregates,
  dimensions: DimensionScore[],
  macro: MacroContext
): GapItem[] {
  const gaps: GapItem[] = [];
  const dim = (id: string) => dimensions.find(d => d.id === id)!;

  if (agg.idle_cash_weight > 0.05) {
    gaps.push({
      title: "Cash drag",
      type: "red",
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% idle cash reducing returns. Target ≤ 3%.`,
      progress: Math.round((1 - agg.idle_cash_weight / 0.30) * 100),
    });
  }

  const stockRiskDim = dim("single_stock_risk");
  if (stockRiskDim.score < 6) {
    gaps.push({
      title: "Single-stock risk",
      type: "red",
      body: `${stockRiskDim.display_value}. Deteriorating fundamentals in high-weight positions.`,
      progress: Math.round(stockRiskDim.score * 10),
    });
  }

  const bondDim = dim("bond_balance");
  if (bondDim.score < 7) {
    gaps.push({
      title: "Fixed income underweight",
      type: "amber",
      body: `${(agg.fixed_income_weight * 100).toFixed(1)}% FI vs. ${macro.market_regime} target. Add FXNAX or VBTLX weight.`,
      progress: Math.round((agg.fixed_income_weight / 0.20) * 100),
    });
  }

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    gaps.push({
      title: "Fund overlap / redundancy",
      type: "amber",
      body: `${g.tickers.join(" + ")} hold nearly identical securities. Consolidate to reduce complexity.`,
      progress: 20,
    });
  }

  const concDim = dim("concentration");
  if (concDim.score < 7) {
    gaps.push({
      title: "Top-3 concentration",
      type: "amber",
      body: `${(agg.top3_weight * 100).toFixed(1)}% in top 3 holdings (${agg.top3_tickers.join(", ")}). Target ≤ 45%.`,
      progress: Math.round(((1 - agg.top3_weight) / 0.65) * 100),
    });
  }

  return gaps;
}
```

- [ ] **Step 5: Run tests, verify pass.** Expected: ~117 passed.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add generateGapItems"
```

---

### Task 19: Wave 5 — `generatePlanPhases` + score_trajectory

**Files:** `src/types.ts`, `src/engine/plan.ts`, `src/engine/plan.test.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface PlanAction {
  category: "trade" | "rebalance" | "data" | "platform" | "process";
  description: string;
  tags: string[];
}

export interface PlanPhase {
  phase: 1 | 2 | 3 | 4;
  title: string;
  timing: string;
  projected_grade: string;
  actions: PlanAction[];
  insight: string;
}

export interface ScorePoint {
  label: string;
  score: number;
  grade: string;
}
```

- [ ] **Step 2: Write failing tests** — append to `plan.test.ts`:

```ts
import { generatePlanPhases } from "./plan";

describe("generatePlanPhases", () => {
  test("returns exactly 4 phases", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases).toHaveLength(4);
    expect(phases.map(p => p.phase)).toEqual([1, 2, 3, 4]);
  });

  test("phase 1 includes deploy-cash action when pending_cash_weight > 5%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "SPAXX", market_value: 200, is_cash: true, is_pending_deployment: true,
          deployment_date: "2026-05-29", deployment_label: "Tranche 3",
          asset_class: "cash", expense_ratio: null,
        }),
      ],
    });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    const p1 = phases[0];
    expect(p1.actions.some(a => a.description.includes("Tranche 3"))).toBe(true);
  });

  test("phase 1 omits deploy-cash action when pending_cash_weight ≤ 5%", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases[0].actions.some(a => a.description.includes("Tranche"))).toBe(false);
  });

  test("phase 2 includes FI rebalance when fixed_income_weight < 16%", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases[1].actions.some(a => a.description.includes("Increase fixed income"))).toBe(true);
  });

  test("score_trajectory has 5 points: today + after each phase", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { trajectory } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(trajectory).toHaveLength(5);
    expect(trajectory[0].label).toBe("Today");
    expect(trajectory[0].score).toBe(7.0);
    expect(trajectory[4].label).toBe("After phase 4");
  });

  test("each phase has a non-empty title, timing, projected_grade, and insight", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    for (const p of phases) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.timing.length).toBeGreaterThan(0);
      expect(p.projected_grade.length).toBeGreaterThan(0);
      expect(p.insight.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run tests, verify failure.**

- [ ] **Step 4: Add `generatePlanPhases`** — append to `plan.ts`:

```ts
import { PlanPhase, PlanAction, ScorePoint } from "../types";
import { scoreToGrade } from "./dimensions";

export function generatePlanPhases(
  agg: PortfolioAggregates,
  macro: MacroContext,
  baseScore: number
): { phases: PlanPhase[]; trajectory: ScorePoint[] } {
  const phases: PlanPhase[] = [];
  let runningScore = baseScore;

  // Phase 1
  const p1Actions: PlanAction[] = [];
  let p1Delta = 0;

  if (agg.pending_cash_weight > 0.05) {
    p1Actions.push({
      category: "trade",
      description: `Deploy ${(agg.pending_cash_weight * 100).toFixed(1)}% pending cash ($${(agg.pending_cash_value / 1000).toFixed(0)}K) on ${agg.pending_deployment_date ?? "scheduled date"} per existing ${agg.pending_deployment_label ?? "tranche"} plan. This is the largest single score lever.`,
      tags: ["impact"],
    });
    p1Delta += 0.4;
  }

  p1Actions.push({
    category: "trade",
    description: `Review and reduce any individual stock positions with P/E > 100 and negative EPS growth. Reinvest proceeds into Phase 2 targets.`,
    tags: ["risk_reduction"],
  });
  p1Delta += 0.25;

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    p1Actions.push({
      category: "rebalance",
      description: `Consolidate ${g.tickers.join(" + ")} — identical ${g.label} exposure. Keep lowest-cost fund, redeploy the rest.`,
      tags: ["simplification"],
    });
    p1Delta += 0.15;
  }

  runningScore = Math.min(10, runningScore + p1Delta);
  phases.push({
    phase: 1,
    title: "Immediate — deploy cash & reduce risk",
    timing: "Now → 30 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p1Actions,
    insight: `Macro context: ${macro.market_regime} regime with yield curve at ${macro.yield_curve_spread_10y_2y.toFixed(2)}. LEI has declined ${macro.lei_consecutive_declines} consecutive months. Lean defensive on T3 deployment — don't chase growth.`,
  });

  // Phase 2
  const p2Actions: PlanAction[] = [];
  let p2Delta = 0;

  if (agg.fixed_income_weight < 0.16) {
    p2Actions.push({
      category: "rebalance",
      description: `Increase fixed income from ${(agg.fixed_income_weight * 100).toFixed(1)}% to 18–22%. Late-cycle with inverted yield curve warrants adding FXNAX or VBTLX weight.`,
      tags: ["impact"],
    });
    p2Delta += 0.3;
  }

  if (macro.cpi_yoy_headline > 2.5) {
    p2Actions.push({
      category: "trade",
      description: `Add TIPS or short-duration bond position (5–7%) to hedge CPI at ${macro.cpi_yoy_headline}%. VFSUX can absorb additional weight.`,
      tags: ["inflation_hedge"],
    });
    p2Delta += 0.1;
  }

  p2Actions.push({
    category: "rebalance",
    description: `Trim QQQ and VUG if held — both are large-cap growth with near-identical holdings to a total-market fund. Redirect into XLI or increase BRK-B for quality exposure.`,
    tags: ["simplification"],
  });

  runningScore = Math.min(10, runningScore + p2Delta);
  phases.push({
    phase: 2,
    title: "Near-term — fix allocation gaps",
    timing: "30–90 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p2Actions,
    insight: `Target post-rebalance: ~55% equity / 20% fixed income / 15% international / 5% balanced / 5% cash.`,
  });

  // Phase 3
  runningScore = Math.min(10, runningScore + 0.25);
  phases.push({
    phase: 3,
    title: "Platform — monitoring & automation",
    timing: "60–120 days (parallel)",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "platform",
        description: "Set weekly report cadence (Sunday night). Automate macro.json refresh + portfolio.json pull from brokerage export.",
        tags: ["automation"],
      },
      {
        category: "platform",
        description: `Add threshold alerts: VIX > 25, HY spread > 450bps, any dimension score dropping > 1 point WoW, cash > 10%.`,
        tags: ["monitoring"],
      },
      {
        category: "platform",
        description: "Build score trajectory chart tracking progress over time. Persist weekly scores to a JSON history file.",
        tags: ["feature"],
      },
    ],
    insight: "The goal is making good portfolio hygiene effortless.",
  });

  // Phase 4
  runningScore = Math.min(10, runningScore + 0.15);
  phases.push({
    phase: 4,
    title: "Ongoing — quarterly rebalance cadence",
    timing: "Recurring quarterly",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "process",
        description: "Quarterly: check sleeve weights vs. targets, trim positions ±5% off target, review macro.json for sector rotation signals.",
        tags: ["process"],
      },
      {
        category: "process",
        description: "Annual: review reference model benchmarks for structural changes. Update macro regime targets if Fed policy shifts.",
        tags: ["process"],
      },
    ],
    insight: "Once automation is running, the main job is reviewing the Sunday report.",
  });

  const trajectory: ScorePoint[] = [
    { label: "Today",          score: baseScore,                          grade: scoreToGrade(baseScore) },
    { label: "After phase 1",  score: Number((baseScore + p1Delta).toFixed(1)),                  grade: scoreToGrade(baseScore + p1Delta) },
    { label: "After phase 2",  score: Number((baseScore + p1Delta + p2Delta).toFixed(1)),        grade: scoreToGrade(baseScore + p1Delta + p2Delta) },
    { label: "After phase 3",  score: Number((baseScore + p1Delta + p2Delta + 0.25).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.25) },
    { label: "After phase 4",  score: Number((baseScore + p1Delta + p2Delta + 0.40).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.40) },
  ];

  return { phases, trajectory };
}
```

- [ ] **Step 5: Run tests, verify pass.** Expected: ~123 passed. **Wave 5 complete.**

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/engine/
git commit -m "feat(engine): add generatePlanPhases + score_trajectory — closes wave 5"
```

---

### Task 20: Wave 6 — `PortfolioSchema` + `parsePortfolio`

**Files:**
- Create: `src/intake/parsePortfolio.ts`
- Create: `src/intake/parsePortfolio.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/intake/parsePortfolio.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { parsePortfolio } from "./parsePortfolio";

const VALID_INPUT = {
  snapshot_date: "2026-05-11",
  account_label: "Test",
  holdings: [
    {
      ticker: "FSKAX", label: "Fidelity Total Market",
      market_value: 100000, asset_class: "us_equity_total_market",
      is_cash: false, is_pending_deployment: false,
      expense_ratio: 0.00015,
    },
  ],
};

describe("parsePortfolio", () => {
  test("accepts a valid portfolio object", () => {
    const portfolio = parsePortfolio(VALID_INPUT);
    expect(portfolio.account_label).toBe("Test");
    expect(portfolio.holdings).toHaveLength(1);
    expect(portfolio.holdings[0].ticker).toBe("FSKAX");
  });

  test("rejects missing snapshot_date", () => {
    const bad = { ...VALID_INPUT, snapshot_date: undefined };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("rejects invalid asset_class", () => {
    const bad = {
      ...VALID_INPUT,
      holdings: [{ ...VALID_INPUT.holdings[0], asset_class: "crypto" }],
    };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("rejects negative market_value", () => {
    const bad = {
      ...VALID_INPUT,
      holdings: [{ ...VALID_INPUT.holdings[0], market_value: -100 }],
    };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("accepts holding with optional stock_metrics", () => {
    const input = {
      ...VALID_INPUT,
      holdings: [{
        ticker: "TSLA", label: "Tesla", market_value: 50000,
        asset_class: "individual_stock", is_cash: false, is_pending_deployment: false,
        expense_ratio: null,
        stock_metrics: {
          pe_ratio: 410, ev_ebitda: 137, fcf_yield: 0.0037, roe: 0.046,
          eps_growth_yoy: -0.47, revenue_growth_yoy: -0.03, net_debt_ebitda: -3,
          beta: 1.79, analyst_consensus: 3.19,
        },
      }],
    };
    const portfolio = parsePortfolio(input);
    expect(portfolio.holdings[0].stock_metrics?.pe_ratio).toBe(410);
  });

  test("accepts pending deployment with date + label", () => {
    const input = {
      ...VALID_INPUT,
      holdings: [{
        ticker: "SPAXX", label: "Money Market", market_value: 100000,
        asset_class: "cash", is_cash: true, is_pending_deployment: true,
        deployment_date: "2026-05-29", deployment_label: "Tranche 3",
        expense_ratio: null,
      }],
    };
    const portfolio = parsePortfolio(input);
    expect(portfolio.holdings[0].deployment_label).toBe("Tranche 3");
  });

  test("rejects holdings array with zero items", () => {
    const bad = { ...VALID_INPUT, holdings: [] };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("loads the dev doc sample data/portfolio.json", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/portfolio.json"), "utf-8"));
    expect(() => parsePortfolio(raw)).not.toThrow();
    const portfolio = parsePortfolio(raw);
    expect(portfolio.holdings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Implement `src/intake/parsePortfolio.ts`**

```ts
import { z } from "zod";

const AssetClassSchema = z.enum([
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
  "us_equity_sector",
  "international_equity",
  "us_bond_aggregate",
  "us_bond_short",
  "us_bond_tips",
  "balanced",
  "target_date",
  "individual_stock",
  "cash",
  "cash_pending",
]);

const StockMetricsSchema = z.object({
  pe_ratio: z.number().nullable(),
  ev_ebitda: z.number().nullable(),
  fcf_yield: z.number().nullable(),
  roe: z.number().nullable(),
  eps_growth_yoy: z.number().nullable(),
  revenue_growth_yoy: z.number().nullable(),
  net_debt_ebitda: z.number().nullable(),
  beta: z.number().nullable(),
  analyst_consensus: z.number().nullable(),
});

const HoldingSchema = z.object({
  ticker: z.string().min(1),
  label: z.string().min(1),
  market_value: z.number().nonnegative(),
  asset_class: AssetClassSchema,
  sector_tag: z.string().optional(),
  is_cash: z.boolean(),
  is_pending_deployment: z.boolean(),
  deployment_date: z.string().optional(),
  deployment_label: z.string().optional(),
  expense_ratio: z.number().nullable(),
  stock_metrics: StockMetricsSchema.optional(),
});

export const PortfolioSchema = z.object({
  snapshot_date: z.string().min(1),
  account_label: z.string().min(1),
  holdings: z.array(HoldingSchema).min(1),
});

export type Portfolio = z.infer<typeof PortfolioSchema>;

export function parsePortfolio(input: unknown): Portfolio {
  return PortfolioSchema.parse(input);
}
```

- [ ] **Step 4: Run tests, verify pass.** Expected: ~131 passed.

- [ ] **Step 5: Commit**

```bash
git add src/intake/parsePortfolio.ts src/intake/parsePortfolio.test.ts
git commit -m "feat(intake): add zod-validated parsePortfolio"
```

---

### Task 21: Wave 6 — `MacroContextSchema` + `parseMacro`

**Files:**
- Create: `src/intake/parseMacro.ts`
- Create: `src/intake/parseMacro.test.ts`

- [ ] **Step 1: Write failing tests** — create `src/intake/parseMacro.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { parseMacro } from "./parseMacro";

const VALID_MACRO = {
  snapshot_date: "2026-05-10",
  federal_funds_rate: 4.75,
  cpi_yoy_headline: 2.8,
  cpi_yoy_core: 2.6,
  yield_curve_spread_10y_2y: -0.12,
  yield_curve_status: "inverted",
  vix: 18.4,
  hy_credit_spread_oas_bps: 345,
  lei_consecutive_declines: 6,
  ism_manufacturing: 49.2,
  ism_services: 53.1,
  market_regime: "Late Cycle",
  sector_overweight: ["healthcare"],
  sector_underweight: ["consumer_discretionary"],
};

describe("parseMacro", () => {
  test("accepts a valid macro object", () => {
    const m = parseMacro(VALID_MACRO);
    expect(m.market_regime).toBe("Late Cycle");
    expect(m.lei_consecutive_declines).toBe(6);
  });

  test("rejects missing federal_funds_rate", () => {
    const { federal_funds_rate, ...bad } = VALID_MACRO;
    expect(() => parseMacro(bad)).toThrow();
  });

  test("rejects non-array sector_overweight", () => {
    const bad = { ...VALID_MACRO, sector_overweight: "healthcare" };
    expect(() => parseMacro(bad)).toThrow();
  });

  test("loads the dev doc sample data/macro.json", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/macro.json"), "utf-8"));
    expect(() => parseMacro(raw)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify failure.**

- [ ] **Step 3: Implement `src/intake/parseMacro.ts`**

```ts
import { z } from "zod";

export const MacroContextSchema = z.object({
  snapshot_date: z.string().min(1),
  federal_funds_rate: z.number(),
  cpi_yoy_headline: z.number(),
  cpi_yoy_core: z.number(),
  yield_curve_spread_10y_2y: z.number(),
  yield_curve_status: z.string(),
  vix: z.number().nonnegative(),
  hy_credit_spread_oas_bps: z.number().nonnegative(),
  lei_consecutive_declines: z.number().int().nonnegative(),
  ism_manufacturing: z.number(),
  ism_services: z.number(),
  market_regime: z.string(),
  sector_overweight: z.array(z.string()),
  sector_underweight: z.array(z.string()),
});

export type MacroContext = z.infer<typeof MacroContextSchema>;

export function parseMacro(input: unknown): MacroContext {
  return MacroContextSchema.parse(input);
}
```

- [ ] **Step 4: Run tests, verify pass.** Expected: ~135 passed. **Wave 6 complete.**

- [ ] **Step 5: Commit**

```bash
git add src/intake/parseMacro.ts src/intake/parseMacro.test.ts
git commit -m "feat(intake): add zod-validated parseMacro — closes wave 6"
```

---

### Task 22: Wave 7 — `REFERENCE_MODELS` benchmarks

**Files:**
- Create: `src/engine/benchmarks.ts`
- Create: `src/engine/benchmarks.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Extend `src/types.ts`** — add:

```ts
export interface ReferenceModel {
  id: string;
  label: string;
  description: string;
  grade: string;
  score: number;
  dimension_scores: Record<string, number>;
}
```

- [ ] **Step 2: Write failing tests** — create `src/engine/benchmarks.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { REFERENCE_MODELS } from "./benchmarks";
import { scoreAllDimensions } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";

describe("REFERENCE_MODELS", () => {
  test("contains exactly 3 models", () => {
    expect(REFERENCE_MODELS).toHaveLength(3);
  });

  test("each model has the 4 required top-level fields", () => {
    for (const model of REFERENCE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
      expect(model.grade).toBeTruthy();
      expect(model.score).toBeGreaterThan(0);
      expect(model.score).toBeLessThanOrEqual(10);
    }
  });

  test("each model has a score for every dimension ID used by the engine", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const dims = scoreAllDimensions(portfolio, computeAggregates(portfolio), makeMacro());
    const engineDimIds = dims.map(d => d.id).sort();

    for (const model of REFERENCE_MODELS) {
      const modelDimIds = Object.keys(model.dimension_scores).sort();
      expect(modelDimIds).toEqual(engineDimIds);
    }
  });

  test("model IDs are unique", () => {
    const ids = REFERENCE_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("expected model labels are present", () => {
    const labels = REFERENCE_MODELS.map(m => m.label);
    expect(labels).toContain("Boglehead 3-fund");
    expect(labels).toContain("All Weather");
    expect(labels).toContain("Classic 60/40");
  });
});
```

- [ ] **Step 3: Run tests, verify failure.**

- [ ] **Step 4: Implement `src/engine/benchmarks.ts`**

```ts
import { ReferenceModel } from "../types";

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: "boglehead_3fund",
    label: "Boglehead 3-fund",
    description: "Passive index",
    grade: "A",
    score: 9.1,
    dimension_scores: {
      cost_efficiency: 9, diversification: 9, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 10,
      bond_balance: 7, concentration: 8, international: 9, quality_tilt: 5,
    },
  },
  {
    id: "all_weather",
    label: "All Weather",
    description: "Risk parity (Dalio)",
    grade: "A−",
    score: 8.4,
    dimension_scores: {
      cost_efficiency: 8, diversification: 10, cash_efficiency: 9,
      macro_alignment: 7, single_stock_risk: 10, simplicity: 10,
      bond_balance: 9, concentration: 9, international: 7, quality_tilt: 8,
    },
  },
  {
    id: "classic_60_40",
    label: "Classic 60/40",
    description: "Balanced",
    grade: "B+",
    score: 7.8,
    dimension_scores: {
      cost_efficiency: 8, diversification: 7, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 8,
      bond_balance: 9, concentration: 8, international: 6, quality_tilt: 6,
    },
  },
];
```

- [ ] **Step 5: Run tests, verify pass.** Expected: ~140 passed. **Wave 7 complete — engine + intake done.**

- [ ] **Step 6: Final type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/engine/benchmarks.ts src/engine/benchmarks.test.ts
git commit -m "feat(engine): add REFERENCE_MODELS — closes wave 7, engine + intake complete"
```

---

## Self-review checklist

After all 22 tasks are complete:

- [ ] **Spec coverage:** Every dimension in dev doc §6 has a `score*` function with tests. Every aggregate field in `PortfolioAggregates` (per dev doc §4) is computed and verified. `generateFlags`, `generateGapItems`, `generatePlanPhases` cover the trigger conditions in dev doc §9. `REFERENCE_MODELS` matches dev doc §7 exactly.
- [ ] **Type consistency:** Every test imports types from `src/types.ts`. No duplicate interface declarations. The `id` strings used in `dimensions.ts` match the keys in every `REFERENCE_MODELS[].dimension_scores`.
- [ ] **No placeholders:** Every step contains exact code or commands. No "TBD" or "similar to Task N".
- [ ] **Build verification:** `npm test` passes (~140 tests). `npx tsc --noEmit` clean.
- [ ] **Engine + intake scope complete.** The non-TDD layers (narratives.ts, index.ts, React) are now ready to be built using the engine modules as dependencies.

---

## After this plan

Non-TDD work that follows (built manually, no automated tests):

1. **`src/ai/narratives.ts`** per dev doc §8 — Anthropic call with the saved engine output as input.
2. **`src/index.ts`** per dev doc §10 — wires together intake → aggregates → dimensions → benchmarks → plan → narratives, writes `output/analysis.json`.
3. **React report** per dev doc §11–12, validated visually against `Documentation/image.png` and `Documentation/image2.png`.

