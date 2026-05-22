# Ticker Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `TICKER_METADATA` map with `data/ticker-metadata.json`, auto-classified by a single Claude call on first encounter, removing the silent `us_equity_total_market` fallback that's currently mislabeling VXUS as US equity.

**Architecture:** A new `tickerClassifier.ts` module owns metadata loading, lookup, and Anthropic-backed classification. The pipeline runs normalize first (unfound tickers come out as `asset_class: "unknown"`), collects unknowns, calls Claude once with a structured prompt, writes results to `data/ticker-metadata.json`, then patches the holdings in place. A final pass throws if any holding still classified as `"unknown"` carries non-zero market value.

**Tech Stack:** TypeScript 5.4 strict, Vitest 1.x, `@anthropic-ai/sdk` ^0.95 (`messages.parse` + `zodOutputFormat`), Zod v4 (per `zod/v4` import), Node `fs/promises`.

**Spec:** `docs/superpowers/specs/2026-05-22-ticker-classification-design.md`

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/types.ts` | Modify | Add `"unknown"` to `AssetClass` union |
| `src/report/app/types.ts` | Modify | Mirror — same addition to `AssetClass` |
| `data/ticker-metadata.json` | Create | Persisted ticker metadata, seeded from the current hardcoded map |
| `src/intake/tickerClassifier.ts` | Create | Zod schema, file loader, `lookupTicker`, `classifyTickers` |
| `src/intake/tickerClassifier.test.ts` | Create | Unit tests for loader, schema, lookup |
| `src/intake/tickerClassifier.prompt.test.ts` | Create | Snapshot test for the Anthropic prompt |
| `src/intake/tickerMetadata.ts` | Modify | Shrink to just `canonicalTicker()` |
| `src/intake/normalize.ts` | Modify | Import `lookupTicker` from `tickerClassifier`; change 4 fallbacks to `"unknown"` |
| `src/intake/normalize.test.ts` | Modify | Inject test map; add test for unknown-yields-unknown (no US-equity fallback) |
| `src/engine/aggregates.ts` | Modify | Filter `asset_class === "unknown"` out of weight buckets defensively |
| `src/engine/aggregates.test.ts` | Modify | Add coverage for zero-value unknown holding |
| `src/index.ts` | Modify | Post-normalize: collect unknowns, classify, patch holdings, throw on material unknowns |

---

## Task 1: Add `"unknown"` to AssetClass enum

**Files:**
- Modify: `src/types.ts:1-15`
- Modify: `src/report/app/types.ts:19-23`

- [ ] **Step 1: Add `"unknown"` to `src/types.ts`**

Edit `src/types.ts` lines 1-15. Replace:

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
```

With:

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
  | "cash_pending"
  | "unknown";
```

- [ ] **Step 2: Mirror the change in `src/report/app/types.ts`**

Edit `src/report/app/types.ts` lines 19-23. Replace:

```ts
export type AssetClass =
  | "us_equity_total_market" | "us_equity_large_cap" | "us_equity_large_cap_growth"
  | "us_equity_small_mid" | "us_equity_sector" | "international_equity"
  | "us_bond_aggregate" | "us_bond_short" | "us_bond_tips"
  | "balanced" | "target_date" | "individual_stock" | "cash" | "cash_pending";
```

With:

```ts
export type AssetClass =
  | "us_equity_total_market" | "us_equity_large_cap" | "us_equity_large_cap_growth"
  | "us_equity_small_mid" | "us_equity_sector" | "international_equity"
  | "us_bond_aggregate" | "us_bond_short" | "us_bond_tips"
  | "balanced" | "target_date" | "individual_stock" | "cash" | "cash_pending" | "unknown";
```

- [ ] **Step 3: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS for both. If a TypeScript exhaustiveness check fails (e.g., a `switch (asset_class)` that needs a new case), add a no-op or throw branch for `"unknown"`. Likely candidates: any `switch` on `asset_class` in `src/engine/dimensions.ts` or `src/engine/aggregates.ts`. If none surface, this step is just a verify.

- [ ] **Step 4: Run the test suite to confirm nothing broke**

Run: `npm test`
Expected: All 174+ tests pass.

- [ ] **Step 5: Commit**

```sh
git add src/types.ts src/report/app/types.ts
git commit -m "feat(types): add 'unknown' to AssetClass union"
```

---

## Task 2: Seed `data/ticker-metadata.json` from current hardcoded map

**Files:**
- Create: `data/ticker-metadata.json`

- [ ] **Step 1: Create the seed file**

This is a hand-written one-shot migration: copy each entry from `src/intake/tickerMetadata.ts:12-75` into JSON form with `classified_at` set to today's date. Create `data/ticker-metadata.json` with exactly this content:

```json
{
  "version": 1,
  "tickers": {
    "FSKAX": { "asset_class": "us_equity_total_market", "expense_ratio": 0.00015, "classified_at": "2026-05-22" },
    "FTIHX": { "asset_class": "international_equity", "expense_ratio": 0.00006, "classified_at": "2026-05-22" },
    "FXNAX": { "asset_class": "us_bond_aggregate", "expense_ratio": 0.00025, "classified_at": "2026-05-22" },
    "VTSAX": { "asset_class": "us_equity_total_market", "expense_ratio": 0.0004, "classified_at": "2026-05-22" },
    "VFSUX": { "asset_class": "us_bond_short", "expense_ratio": 0.001, "classified_at": "2026-05-22" },
    "VBTLX": { "asset_class": "us_bond_aggregate", "expense_ratio": 0.0005, "classified_at": "2026-05-22" },
    "VWENX": {
      "asset_class": "balanced",
      "expense_ratio": 0.0017,
      "underlying_composition": {
        "us_equity": 0.60,
        "international_equity": 0.05,
        "fixed_income": 0.35,
        "cash": 0.0
      },
      "classified_at": "2026-05-22"
    },
    "VUG": { "asset_class": "us_equity_large_cap_growth", "expense_ratio": 0.0004, "classified_at": "2026-05-22" },
    "QQQ": { "asset_class": "us_equity_large_cap_growth", "expense_ratio": 0.002, "classified_at": "2026-05-22" },
    "XLU": { "asset_class": "us_equity_sector", "expense_ratio": 0.0008, "sector_tag": "utilities", "classified_at": "2026-05-22" },
    "XLV": { "asset_class": "us_equity_sector", "expense_ratio": 0.0008, "sector_tag": "healthcare", "classified_at": "2026-05-22" },
    "XLP": { "asset_class": "us_equity_sector", "expense_ratio": 0.0008, "sector_tag": "consumer_staples", "classified_at": "2026-05-22" },
    "XLI": { "asset_class": "us_equity_sector", "expense_ratio": 0.0008, "sector_tag": "industrials", "classified_at": "2026-05-22" },
    "TSLA": {
      "asset_class": "individual_stock",
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 410.29, "ev_ebitda": 137.07, "fcf_yield": 0.0037, "roe": 0.0462,
        "eps_growth_yoy": -0.4702, "revenue_growth_yoy": -0.0293, "net_debt_ebitda": -3.03,
        "beta": 1.793, "analyst_consensus": 3.19
      },
      "classified_at": "2026-05-22"
    },
    "NVDA": {
      "asset_class": "individual_stock",
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 44.74, "ev_ebitda": 36.44, "fcf_yield": 0.0181, "roe": 0.7633,
        "eps_growth_yoy": 0.6667, "revenue_growth_yoy": 0.6547, "net_debt_ebitda": -0.35,
        "beta": 2.244, "analyst_consensus": 3.75
      },
      "classified_at": "2026-05-22"
    },
    "BRK-B": {
      "asset_class": "individual_stock",
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 26.12, "ev_ebitda": null, "fcf_yield": null, "roe": null,
        "eps_growth_yoy": null, "revenue_growth_yoy": null, "net_debt_ebitda": null,
        "beta": 0.622, "analyst_consensus": 3.41
      },
      "classified_at": "2026-05-22"
    },
    "SPAXX": { "asset_class": "cash", "expense_ratio": null, "classified_at": "2026-05-22" },
    "VMFXX": { "asset_class": "cash", "expense_ratio": null, "classified_at": "2026-05-22" },
    "US Large Company Stocks Fund": { "asset_class": "us_equity_large_cap", "expense_ratio": 0.001, "classified_at": "2026-05-22" },
    "US Small/Mid Company Stocks Fund": { "asset_class": "us_equity_small_mid", "expense_ratio": 0.001, "classified_at": "2026-05-22" },
    "Target Retirement 2040 Fund": { "asset_class": "target_date", "expense_ratio": 0.0008, "classified_at": "2026-05-22" },
    "VFORX": { "asset_class": "target_date", "expense_ratio": 0.0014, "classified_at": "2026-05-22" }
  }
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/ticker-metadata.json', 'utf-8'))"`
Expected: No output (exit 0). Any syntax error would print a `SyntaxError`.

- [ ] **Step 3: Commit**

```sh
git add data/ticker-metadata.json
git commit -m "feat(intake): seed data/ticker-metadata.json from hardcoded map"
```

---

## Task 3: Build `tickerClassifier.ts` with schema, loader, and lookup (TDD)

**Files:**
- Create: `src/intake/tickerClassifier.ts`
- Create: `src/intake/tickerClassifier.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/intake/tickerClassifier.test.ts` with this content:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadTickerMetadata,
  lookupTicker,
  resetTickerMetadataCache,
  TickerMetadataFileSchema,
} from "./tickerClassifier";

let tmpFile: string;

beforeEach(() => {
  resetTickerMetadataCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ticker-meta-"));
  tmpFile = path.join(dir, "ticker-metadata.json");
});

describe("loadTickerMetadata", () => {
  it("returns empty map when file is missing", () => {
    const file = loadTickerMetadata(tmpFile);
    expect(file).toEqual({ version: 1, tickers: {} });
  });

  it("parses and returns a well-formed file", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: {
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
      },
    }));
    const file = loadTickerMetadata(tmpFile);
    expect(file.tickers.VXUS?.asset_class).toBe("international_equity");
  });

  it("caches per-process; reset clears it", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ version: 1, tickers: {} }));
    loadTickerMetadata(tmpFile);
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: { VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" } },
    }));
    // Without reset, the cache is still empty
    expect(loadTickerMetadata(tmpFile).tickers.VXUS).toBeUndefined();
    resetTickerMetadataCache();
    expect(loadTickerMetadata(tmpFile).tickers.VXUS?.asset_class).toBe("international_equity");
  });
});

describe("TickerMetadataFileSchema", () => {
  it("accepts every asset_class variant including 'unknown'", () => {
    const file = {
      version: 1 as const,
      tickers: {
        VTSAX: { asset_class: "us_equity_total_market", expense_ratio: 0.0004, classified_at: "2026-05-22" },
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
        XLU: { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "utilities", classified_at: "2026-05-22" },
        VWENX: {
          asset_class: "balanced", expense_ratio: 0.0017,
          underlying_composition: { us_equity: 0.6, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
          classified_at: "2026-05-22",
        },
        FAKETICKER: { asset_class: "unknown", classified_at: "2026-05-22", notes: "unrecognized" },
      },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).not.toThrow();
  });

  it("rejects us_equity_sector without sector_tag", () => {
    const file = {
      version: 1,
      tickers: { XLU: { asset_class: "us_equity_sector", expense_ratio: 0.0008, classified_at: "2026-05-22" } },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).toThrow();
  });

  it("rejects balanced without underlying_composition", () => {
    const file = {
      version: 1,
      tickers: { VWENX: { asset_class: "balanced", expense_ratio: 0.0017, classified_at: "2026-05-22" } },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).toThrow();
  });
});

describe("lookupTicker", () => {
  beforeEach(() => {
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: {
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
        "BRK-B": { asset_class: "individual_stock", expense_ratio: null, stock_metrics: {
          pe_ratio: 26.12, ev_ebitda: null, fcf_yield: null, roe: null,
          eps_growth_yoy: null, revenue_growth_yoy: null, net_debt_ebitda: null,
          beta: 0.622, analyst_consensus: 3.41,
        }, classified_at: "2026-05-22" },
      },
    }));
    loadTickerMetadata(tmpFile);
  });

  it("returns metadata for a known ticker", () => {
    expect(lookupTicker("VXUS")?.asset_class).toBe("international_equity");
  });

  it("returns null for an unknown ticker", () => {
    expect(lookupTicker("FAKETICKER")).toBeNull();
  });

  it("canonicalizes 'BRK B' to 'BRK-B'", () => {
    expect(lookupTicker("BRK B")?.asset_class).toBe("individual_stock");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/intake/tickerClassifier.test.ts`
Expected: FAIL with `Cannot find module './tickerClassifier'` or similar.

- [ ] **Step 3: Implement `tickerClassifier.ts`**

Create `src/intake/tickerClassifier.ts` with this content:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as z from "zod/v4";
import { canonicalTicker } from "./tickerMetadata";
import type { UnderlyingComposition, StockMetrics, AssetClass } from "../types";

const DEFAULT_FILE = path.join(process.cwd(), "data", "ticker-metadata.json");

const UnderlyingCompositionSchema = z.object({
  us_equity: z.number(),
  international_equity: z.number(),
  fixed_income: z.number(),
  cash: z.number(),
});

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

// Discriminated union: each asset_class branch has its own required fields.
const TickerEntrySchema = z.discriminatedUnion("asset_class", [
  z.object({
    asset_class: z.literal("us_equity_sector"),
    expense_ratio: z.number().nullable(),
    sector_tag: z.string(),
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    asset_class: z.literal("balanced"),
    expense_ratio: z.number().nullable(),
    underlying_composition: UnderlyingCompositionSchema,
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    asset_class: z.literal("individual_stock"),
    expense_ratio: z.null(),
    stock_metrics: StockMetricsSchema,
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    asset_class: z.literal("unknown"),
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  // All remaining asset classes share the same minimal shape.
  ...(["us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
       "us_equity_small_mid", "international_equity", "us_bond_aggregate",
       "us_bond_short", "us_bond_tips", "target_date", "cash", "cash_pending"] as const).map(ac =>
    z.object({
      asset_class: z.literal(ac),
      expense_ratio: z.number().nullable(),
      classified_at: z.string(),
      notes: z.string().optional(),
    }),
  ),
]);

export const TickerMetadataFileSchema = z.object({
  version: z.literal(1),
  tickers: z.record(z.string(), TickerEntrySchema),
});

export type TickerEntry = z.infer<typeof TickerEntrySchema>;
export type TickerMetadataFile = z.infer<typeof TickerMetadataFileSchema>;

// Shape the rest of the code consumes (was previously the TickerMetadata
// interface in tickerMetadata.ts). Note that StockMetrics, UnderlyingComposition,
// and sector_tag are class-specific; consumers read whichever applies.
export interface TickerMetadata {
  asset_class: AssetClass;
  expense_ratio: number | null;
  sector_tag?: string;
  stock_metrics?: StockMetrics;
  underlying_composition?: UnderlyingComposition;
}

let _cached: TickerMetadataFile | null = null;
let _cachedPath: string | null = null;

export function resetTickerMetadataCache(): void {
  _cached = null;
  _cachedPath = null;
}

export function loadTickerMetadata(filePath: string = DEFAULT_FILE): TickerMetadataFile {
  if (_cached && _cachedPath === filePath) return _cached;
  if (!fs.existsSync(filePath)) {
    _cached = { version: 1, tickers: {} };
    _cachedPath = filePath;
    return _cached;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = TickerMetadataFileSchema.parse(JSON.parse(raw));
  _cached = parsed;
  _cachedPath = filePath;
  return parsed;
}

export function lookupTicker(symbol: string): TickerMetadata | null {
  const file = loadTickerMetadata(_cachedPath ?? DEFAULT_FILE);
  const entry = file.tickers[canonicalTicker(symbol)];
  if (!entry) return null;
  // Project the discriminated-union shape onto the flat TickerMetadata interface
  // that the rest of the codebase already expects.
  return {
    asset_class: entry.asset_class,
    expense_ratio: "expense_ratio" in entry ? entry.expense_ratio : null,
    sector_tag: "sector_tag" in entry ? entry.sector_tag : undefined,
    stock_metrics: "stock_metrics" in entry ? entry.stock_metrics : undefined,
    underlying_composition: "underlying_composition" in entry ? entry.underlying_composition : undefined,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run src/intake/tickerClassifier.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```sh
git add src/intake/tickerClassifier.ts src/intake/tickerClassifier.test.ts
git commit -m "feat(intake): tickerClassifier loader + lookup (TDD)"
```

---

## Task 4: Switch `normalize.ts` to use new `lookupTicker`; change fallback to `"unknown"` (TDD)

**Files:**
- Modify: `src/intake/normalize.ts:2` (import path), lines 73-74, 117-118, 203-204, 253-254 (four fallback sites)
- Modify: `src/intake/normalize.test.ts`

The four broker normalizers (Fidelity, Empower, Vanguard, Robinhood) all import `lookupTicker` from `./tickerMetadata` and use `?? "us_equity_total_market"`. Switch them to import from `./tickerClassifier` and use `?? "unknown"`.

- [ ] **Step 1: Add a failing test that asserts unknown tickers yield `"unknown"`**

Open `src/intake/normalize.test.ts`. Find the `describe("normalizeFidelityAccounts", ...)` block (starting around line 35) and add this test inside it:

```ts
it("classifies unknown tickers as 'unknown' (no silent US-equity fallback)", () => {
  const raw = [{
    account_number: "X",
    holdings: [{ symbol: "ZZTOTALLYFAKE", description: "Bogus", market_value: "$100" }],
  }];
  const holdings = normalizeFidelityAccounts(raw as any, "acct_a");
  expect(holdings).toHaveLength(1);
  expect(holdings[0].asset_class).toBe("unknown");
  expect(holdings[0].expense_ratio).toBeNull();
  expect(holdings[0].sector_tag).toBeUndefined();
});
```

Note: the exact `raw` shape must match what `normalizeFidelityAccounts` expects. Look at an existing passing test in the same `describe` block for the right shape and copy its structure — then change the symbol to `"ZZTOTALLYFAKE"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/intake/normalize.test.ts -t "classifies unknown tickers"`
Expected: FAIL — current code returns `asset_class: "us_equity_total_market"` for unknown tickers.

- [ ] **Step 3: Change the import in `normalize.ts`**

Edit `src/intake/normalize.ts` line 2. Replace:

```ts
import { lookupTicker, canonicalTicker } from "./tickerMetadata";
```

With:

```ts
import { lookupTicker } from "./tickerClassifier";
import { canonicalTicker } from "./tickerMetadata";
```

- [ ] **Step 4: Replace the four `"us_equity_total_market"` fallbacks with `"unknown"`**

In `src/intake/normalize.ts`, find all four occurrences of:

```ts
const asset_class = meta?.asset_class ?? "us_equity_total_market";
```

(lines 74, 118, 204, 254 — Fidelity, Empower, Vanguard, Robinhood) and replace each with:

```ts
const asset_class = meta?.asset_class ?? "unknown";
```

- [ ] **Step 5: Run the new test and verify it passes**

Run: `npx vitest run src/intake/normalize.test.ts -t "classifies unknown tickers"`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: All tests pass. If any pre-existing tests fail because they depended on the silent fallback (unlikely, since fixtures use known tickers), update them to either use a known ticker or assert `"unknown"`.

- [ ] **Step 7: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 8: Commit**

```sh
git add src/intake/normalize.ts src/intake/normalize.test.ts
git commit -m "feat(intake): normalize falls back to 'unknown', not US equity (TDD)"
```

---

## Task 5: Remove the `TICKER_METADATA` literal from `tickerMetadata.ts`

**Files:**
- Modify: `src/intake/tickerMetadata.ts` — shrink to just `canonicalTicker()`

The hardcoded map and old `lookupTicker` are no longer used (normalize now imports from `tickerClassifier`). Delete them.

- [ ] **Step 1: Replace the entire contents of `src/intake/tickerMetadata.ts`**

Open `src/intake/tickerMetadata.ts` and replace the whole file with:

```ts
/** Normalize variant tickers (e.g. "BRK B" → "BRK-B"). */
export function canonicalTicker(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed === "BRK B") return "BRK-B";
  return trimmed;
}
```

- [ ] **Step 2: Check for any stragglers still importing the deleted exports**

Run: `npx grep -rn "from \"./tickerMetadata\"" src/ || true`
(Or use the Grep tool with pattern `from "./tickerMetadata"` and path `src/`.)
Expected: Only references to `canonicalTicker`. If anything still imports `TICKER_METADATA`, `TickerMetadata`, or `lookupTicker` from `./tickerMetadata`, update those imports to point at `./tickerClassifier` instead.

- [ ] **Step 3: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```sh
git add src/intake/tickerMetadata.ts
git commit -m "refactor(intake): remove hardcoded TICKER_METADATA; data lives in JSON"
```

---

## Task 6: Filter `"unknown"` holdings from aggregates (TDD)

**Files:**
- Modify: `src/engine/aggregates.ts`
- Modify: `src/engine/aggregates.test.ts`

The pipeline check (Task 8) will throw if any material-value holding is `"unknown"`, so in practice aggregates only sees zero-value unknowns. The filter is defensive — keeps weight calculations clean if zero-value unknowns slip through, and protects future call sites.

- [ ] **Step 1: Write a failing test in `aggregates.test.ts`**

Open `src/engine/aggregates.test.ts` and add a new test (use existing test conventions in that file — `makeHolding`/`makePortfolio` fixture builders from `tests/fixtures/samplePortfolio.ts`):

```ts
it("excludes 'unknown' asset_class holdings from weight calculations", () => {
  const portfolio = makePortfolio({
    holdings: [
      makeHolding({ ticker: "VTSAX", asset_class: "us_equity_total_market", market_value: 8000 }),
      makeHolding({ ticker: "FAKE", asset_class: "unknown", market_value: 0 }),
    ],
  });
  const aggregates = computeAggregates(portfolio);
  expect(aggregates.equity_weight).toBeCloseTo(1.0, 3);
  // Verify the unknown holding doesn't appear in any sector/concentration breakdown.
});
```

If `makeHolding` doesn't accept `asset_class: "unknown"`, check `tests/fixtures/samplePortfolio.ts` — it may need its parameter type widened to `AssetClass` (which now includes `"unknown"` per Task 1).

- [ ] **Step 2: Run the test to verify it fails or passes incidentally**

Run: `npx vitest run src/engine/aggregates.test.ts -t "excludes 'unknown'"`
Expected: Likely PASS already with `market_value: 0` (the zero contribution makes weights look right). To make this a meaningful test, also set `market_value` non-zero in a second assertion to confirm explicit filtering. Alternative: assert that `total_value` does NOT include the unknown holding's value. Update the test if it passes incidentally so it would fail without the filter.

Revised assertion:

```ts
it("excludes 'unknown' asset_class holdings from weight calculations", () => {
  const portfolio = makePortfolio({
    holdings: [
      makeHolding({ ticker: "VTSAX", asset_class: "us_equity_total_market", market_value: 8000 }),
      makeHolding({ ticker: "FAKE", asset_class: "unknown", market_value: 2000 }),
    ],
  });
  const aggregates = computeAggregates(portfolio);
  // Without the filter, FAKE's $2000 falls into no bucket and weights normalize wrong.
  // With the filter, VTSAX is 100% of the "classified" portfolio.
  expect(aggregates.equity_weight).toBeCloseTo(1.0, 3);
});
```

Now run again — expected: FAIL because `total_value` currently includes the unknown's $2000, so equity_weight = 8000/10000 = 0.8.

- [ ] **Step 3: Implement the filter in `aggregates.ts`**

In `src/engine/aggregates.ts`, find the top of `computeAggregates` (line 49-50):

```ts
const holdings = portfolio.holdings;
const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
```

Replace with:

```ts
// Filter out 'unknown' holdings defensively. The pipeline throws upstream if
// any unknown holding has material value, so in practice only zero-value
// stragglers reach here — but keeping the filter local protects future
// callers and keeps total_value honest.
const holdings = portfolio.holdings.filter(h => h.asset_class !== "unknown");
const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
```

- [ ] **Step 4: Run the new test**

Run: `npx vitest run src/engine/aggregates.test.ts -t "excludes 'unknown'"`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Commit**

```sh
git add src/engine/aggregates.ts src/engine/aggregates.test.ts
git commit -m "feat(aggregates): filter 'unknown' holdings from weight calculations (TDD)"
```

---

## Task 7: Implement `classifyTickers` Anthropic call (TDD with prompt snapshot)

**Files:**
- Create: `src/intake/tickerClassifier.prompt.test.ts`
- Modify: `src/intake/tickerClassifier.ts` — add `classifyTickers` export

Reference pattern: `src/ai/narratives.ts` already shows `client.messages.parse()` + `zodOutputFormat()` + adaptive thinking. Mirror that pattern, with a tickers-array schema.

- [ ] **Step 1: Write the failing snapshot test**

Create `src/intake/tickerClassifier.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildClassifyPrompt, CLASSIFY_SYSTEM_PROMPT } from "./tickerClassifier";

describe("classifyTickers prompt", () => {
  it("includes the system rules", () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toMatchSnapshot();
  });

  it("formats the user message with the ticker list", () => {
    const msg = buildClassifyPrompt(["VXUS", "VTIAX", "TLT"]);
    expect(msg).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/intake/tickerClassifier.prompt.test.ts`
Expected: FAIL — exports `buildClassifyPrompt` and `CLASSIFY_SYSTEM_PROMPT` don't exist yet.

- [ ] **Step 3: Add `classifyTickers` and prompt helpers to `tickerClassifier.ts`**

First, add two new imports to the existing import block at the top of `src/intake/tickerClassifier.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
```

Then append the following to the end of the file (the new schemas reference `UnderlyingCompositionSchema` and `StockMetricsSchema` already defined in Task 3 — they remain module-scoped and reusable):

```ts
export const CLASSIFY_SYSTEM_PROMPT = `You are a financial-data classifier. You receive a list of brokerage ticker symbols and return one structured classification per symbol.

Rules:
- Return one entry per input symbol, in the same order.
- Use the canonical ticker as the symbol field (e.g., "BRK-B" not "BRK B").
- Pick the most accurate asset_class from the allowed enum. Be precise: VXUS is international_equity, not us_equity_total_market.
- expense_ratio: provide the published ratio as a decimal (e.g., 0.0007 for 7 basis points). May be null for individual stocks and money-market funds.
- For asset_class "us_equity_sector": include a sector_tag like "utilities", "healthcare", "technology", "consumer_staples", "industrials", "energy", "financials", "real_estate", "materials", "communication_services", "consumer_discretionary".
- For asset_class "balanced": include underlying_composition with us_equity / international_equity / fixed_income / cash weights summing to 1.0.
- For asset_class "individual_stock": include best-effort stock_metrics. Use null for any field you don't have data for, but provide values where you can — even slightly stale data is useful.
- For asset_class "unknown": use ONLY when the ticker is genuinely unrecognized. Include a notes field explaining (e.g., "no public market data found").
- classified_at: today's date in YYYY-MM-DD format.`.trim();

export function buildClassifyPrompt(symbols: string[]): string {
  return JSON.stringify({ symbols });
}

// Wraps the entry schema with a required `symbol` for the response.
const ClassifyResponseEntrySchema = z.discriminatedUnion("asset_class", [
  z.object({
    symbol: z.string(),
    asset_class: z.literal("us_equity_sector"),
    expense_ratio: z.number().nullable(),
    sector_tag: z.string(),
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    symbol: z.string(),
    asset_class: z.literal("balanced"),
    expense_ratio: z.number().nullable(),
    underlying_composition: UnderlyingCompositionSchema,
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    symbol: z.string(),
    asset_class: z.literal("individual_stock"),
    expense_ratio: z.null(),
    stock_metrics: StockMetricsSchema,
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  z.object({
    symbol: z.string(),
    asset_class: z.literal("unknown"),
    classified_at: z.string(),
    notes: z.string().optional(),
  }),
  ...(["us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
       "us_equity_small_mid", "international_equity", "us_bond_aggregate",
       "us_bond_short", "us_bond_tips", "target_date", "cash", "cash_pending"] as const).map(ac =>
    z.object({
      symbol: z.string(),
      asset_class: z.literal(ac),
      expense_ratio: z.number().nullable(),
      classified_at: z.string(),
      notes: z.string().optional(),
    }),
  ),
]);

const ClassifyResponseSchema = z.object({
  entries: z.array(ClassifyResponseEntrySchema),
});

export async function classifyTickers(
  unknowns: string[],
  filePath: string = DEFAULT_FILE,
): Promise<TickerMetadataFile> {
  if (unknowns.length === 0) return loadTickerMetadata(filePath);
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      `Cannot classify [${unknowns.join(", ")}] — ANTHROPIC_API_KEY unset. ` +
      `Either set the key and retry, or add entries manually to ${filePath}.`,
    );
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.parse({
      model: process.env.CLAUDE_MODEL_CLASSIFIER ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        // Same v3/v4 type-bridging cast pattern as narratives.ts and tacticalAdvisor.ts.
        format: zodOutputFormat(ClassifyResponseSchema as never),
      },
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildClassifyPrompt(unknowns) }],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot classify [${unknowns.join(", ")}] — Anthropic API call failed: ${detail}. ` +
      `Either retry, or add entries manually to ${filePath}.`,
    );
  }

  if (!response.parsed_output) {
    throw new Error(
      `Cannot classify [${unknowns.join(", ")}] — Anthropic returned no parsed_output. ` +
      `Either retry, or add entries manually to ${filePath}.`,
    );
  }

  // Merge new entries into the existing file and persist.
  const existing = loadTickerMetadata(filePath);
  const merged: TickerMetadataFile = {
    version: 1,
    tickers: { ...existing.tickers },
  };
  for (const entry of response.parsed_output.entries) {
    const { symbol, ...rest } = entry;
    merged.tickers[symbol] = rest as TickerEntry;
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  resetTickerMetadataCache();
  loadTickerMetadata(filePath); // re-prime cache
  return merged;
}
```

- [ ] **Step 4: Run the snapshot test (first run creates the snapshot)**

Run: `npx vitest run src/intake/tickerClassifier.prompt.test.ts`
Expected: PASS — snapshot written to `__snapshots__/tickerClassifier.prompt.test.ts.snap`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: All tests pass (no live API call is made — only the prompt builder is tested).

- [ ] **Step 7: Commit**

```sh
git add src/intake/tickerClassifier.ts src/intake/tickerClassifier.prompt.test.ts src/intake/__snapshots__/
git commit -m "feat(intake): classifyTickers via Anthropic structured call (TDD)"
```

---

## Task 8: Wire classifier into `src/index.ts` pipeline + material-value check

**Files:**
- Modify: `src/index.ts`

Pipeline order (per spec):
1. Load metadata file at startup.
2. Run normalize (unfound tickers → `asset_class: "unknown"`).
3. After consolidate, scan for `"unknown"` holdings; collect unique canonical symbols.
4. If any: log, call `classifyTickers`, then re-walk holdings and patch the resolved metadata in place.
5. Final check: any remaining `"unknown"` with `market_value > 0` → throw with full message.

- [ ] **Step 1: Add the imports to `src/index.ts`**

Open `src/index.ts`. Below the existing intake imports, add:

```ts
import { loadTickerMetadata, classifyTickers, lookupTicker } from "./intake/tickerClassifier";
import { canonicalTicker } from "./intake/tickerMetadata";
```

- [ ] **Step 2: Add the classify step after consolidatePortfolio**

In `src/index.ts`, find this line (around line 161):

```ts
const consolidated = consolidatePortfolio(allHoldings, snapshotDate, "All Accounts");
```

Immediately after it, add:

```ts
// Ticker classification: any holding whose ticker isn't in data/ticker-metadata.json
// came out of normalize with asset_class: "unknown". Call Claude once for all
// unknowns, then patch the consolidated portfolio in place.
loadTickerMetadata();
const unknownSymbols = Array.from(new Set(
  consolidated.holdings
    .filter(h => h.asset_class === "unknown")
    .map(h => canonicalTicker(h.ticker)),
));
if (unknownSymbols.length > 0) {
  console.log("");
  console.log(`Classifying ${unknownSymbols.length} new ticker(s): ${unknownSymbols.join(", ")}`);
  await classifyTickers(unknownSymbols);
  // Patch every unknown holding with the now-resolved metadata.
  for (const h of consolidated.holdings) {
    if (h.asset_class !== "unknown") continue;
    const meta = lookupTicker(h.ticker);
    if (!meta) continue;
    h.asset_class = meta.asset_class;
    h.expense_ratio = meta.expense_ratio;
    h.sector_tag = meta.sector_tag;
    h.stock_metrics = meta.stock_metrics;
    h.underlying_composition = meta.underlying_composition;
  }
}

// Material-value check: any unknown holding still on the books?
const materialUnknowns = consolidated.holdings.filter(
  h => h.asset_class === "unknown" && h.market_value > 0,
);
if (materialUnknowns.length > 0) {
  const lines = materialUnknowns.map(
    h => `  ${h.ticker}: ${fmtMoney(h.market_value)} (${h.label})`,
  ).join("\n");
  throw new Error(
    `Cannot analyze portfolio — ${materialUnknowns.length} holding(s) could not be classified:\n${lines}\n` +
    `Edit data/ticker-metadata.json to set the correct asset_class, then re-run.`,
  );
}
```

- [ ] **Step 3: Manual end-to-end verification with a known good portfolio**

Run: `npm run analyze`
Expected: Output includes the existing portfolio summary. No "Classifying N new tickers" line (every ticker in the sample portfolio is in the seeded file). No error.

- [ ] **Step 4: Manual verification with an unknown ticker**

Temporarily add `VXUS` to one of the sample broker files (e.g., `data/SamplePortfolio/<file>.json`) — pick a small holding to edit. Then:

Run: `npm run analyze` (requires `ANTHROPIC_API_KEY` to be set)
Expected output includes:
- `Classifying 1 new ticker(s): VXUS`
- `data/ticker-metadata.json` is updated to include a VXUS entry with `asset_class: "international_equity"` (or similar).
- Analyze completes without error.

Revert the sample file edit after verifying.

- [ ] **Step 5: Manual verification of the material-value error path**

Temporarily edit `data/ticker-metadata.json` to set a known ticker (e.g., FSKAX) to `asset_class: "unknown"`. Then:

Run: `npm run analyze`
Expected: Throws with `Cannot analyze portfolio — 1 holding(s) could not be classified: FSKAX: ...`.

Revert the JSON edit after verifying.

- [ ] **Step 6: Type-check both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```sh
git add src/index.ts
git commit -m "feat(pipeline): classify unknown tickers via Claude, patch holdings"
```

---

## Final Verification

After Task 8, run the full quality gate:

- [ ] **Step 1: Both type-checks pass**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 2: Full test suite passes**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: End-to-end analyze run succeeds**

Run: `npm run analyze`
Expected: Pipeline completes; `output/analysis.json` is written.

- [ ] **Step 4: VXUS regression check**

Add a small VXUS holding to the sample portfolio temporarily, run `npm run analyze`, confirm:
- VXUS is classified as `international_equity` in `data/ticker-metadata.json`.
- VXUS's market value flows into `international_weight`, not `equity_weight` of the US-equity bucket.

Revert the sample edit.
