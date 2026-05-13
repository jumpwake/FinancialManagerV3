# V3 — Sr Financial Advisor + Account Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement V3 of the portfolio analyzer per `Documentation/superpowers/specs/2026-05-12-v3-advisor-and-account-model-design.md` — per-dimension chat, full account model (broker / tax treatment / constraints), balanced-fund composition decomposition, new Asset Location dimension, and AI-driven tactical recommendations (Post-T3 deployment + Section 9).

**Architecture:** Three waves landing in commit-friendly slices.

1. **Wave 1 — Quick wins.** UI fix on `KeyFindings.tsx` and a new `"dimension"` `ChatScope` with a 💬 button on each scorecard row. No engine changes.
2. **Wave 2 — Foundation.** Every `Holding` gets `account_id`. New `data/accounts.json` config defines account-level metadata (broker, type, owner, constraints). Balanced/target-date holdings get `underlying_composition`. Aggregates and dimensions become account-aware; a new 11th dimension `asset_location` is added, all weights rebalanced.
3. **Wave 3 — Advisor.** New Anthropic call `tacticalAdvisor.ts` returning structured `TacticalAdvisorOutput` (deployment recommendation + tactical plan). New Post-T3 toggle on Allocation Breakdown. New Section 9 `NextMoves.tsx`. The chat handler grows to handle `"dimension"` and `"tactical_move"` scopes using a shared Sr Financial Advisor system prompt.

**Tech Stack:** TypeScript 5.4 strict, Vitest 1.x, Vite 5, zod v3 (intake validation), zod v4 (Anthropic SDK `output_config.format` for structured calls — matches existing `narratives.ts` pattern), `@anthropic-ai/sdk` ^0.95, React 18.

**TDD discipline** (per existing project policy in `CLAUDE.md`):

- TDD: `src/engine/*`, `src/intake/parseAccounts.ts`, `src/intake/composition.ts`, `src/intake/normalize.ts` account/composition changes, prompt-render snapshot tests for `src/ai/tacticalAdvisor.ts` and `src/ai/chat.ts` new scopes.
- Manual verification: `src/index.ts` orchestration, the API-call wrappers in `src/ai/*` (only the prompt-render half is TDD'd), all React UI changes, the `+ Situation` flow, the Post-T3 toggle interaction.

**Commit cadence:** one commit per task. Use existing project commit style (see `git log --oneline -30`): `feat(<area>): <subject>`, `fix(<area>): <subject>`, `test(<area>): <subject>`.

---

## Accepted intermediate state in Wave 2

Wave 2 Task W2.1 adds a required `account_id: string` field to `Holding`. Until Wave 2 Task W2.6 (normalize attaches `account_id`) and W2.10 (parsePortfolio validates it) land, `npx tsc --noEmit` over the whole project will fail. This matches the pattern used in the V2 plan when introducing required `finding_key`. Targeted `npx vitest run <test file>` for the new modules continues to pass because they import only their direct dependencies. Project-wide type-check is restored when Task W2.10 commits.

---

## File structure

**Created in Wave 1:** (none — modifications only)

**Created in Wave 2:**

```
data/accounts.example.json                          // synthetic schema reference
src/intake/parseAccounts.ts                         // zod schema + load
src/intake/parseAccounts.test.ts
src/intake/composition.ts                           // glide-path helper
src/intake/composition.test.ts
src/engine/assetLocation.ts                         // (optional split; sees §W2.13 — may stay in dimensions.ts)
```

**Created in Wave 3:**

```
src/ai/advisorPersona.ts                            // shared system prompt
src/ai/tacticalAdvisor.ts                           // single Opus call
src/ai/tacticalAdvisor.prompt.test.ts               // prompt-render snapshot
src/report/app/sections/NextMoves.tsx               // Section 9
```

**Modified across all waves:**

```
src/types.ts                                        // ChatScope, Holding, UnderlyingComposition,
                                                    // AccountMetadata, TacticalAdvisorOutput, etc.
src/intake/parsePortfolio.ts                        // account_id, underlying_composition validation
src/intake/normalize.ts                             // attach account_id + composition; account-aware consolidate
src/intake/tickerMetadata.ts                        // underlying_composition for known balanced funds
src/engine/aggregates.ts                            // cross_account_groups, constrained_cash_weight,
                                                    // composition-aware weight math
src/engine/dimensions.ts                            // Simplicity/Diversification/BondBalance account-aware;
                                                    // scoreAssetLocation; weight rebalancing
src/engine/benchmarks.ts                            // asset_location: 7; weights rebalanced; sync test
src/engine/plan.ts                                  // account-aware recommendations; asset-location flags
src/ai/chat.ts                                      // dimension + tactical_move scope; shared persona import
src/server/handlers/chat.ts                         // dimension + tactical_move scope passthrough
src/index.ts                                        // load accounts.json; call tacticalAdvisor
src/report/app/types.ts                             // mirror new types
src/report/app/App.tsx                              // dimension scope wiring; Section 9; anchor link
src/report/app/sections/KeyFindings.tsx             // header bug fix (W1)
src/report/app/sections/DimensionScorecard.tsx      // 💬 button per row (W1)
src/report/app/sections/AllocationBreakdown.tsx     // Account column; composition note; Post-T3 toggle
src/report/app/sidebar/Sidebar.tsx                  // scope chip for dimension/tactical_move
CLAUDE.md                                           // invariants update across all 3 waves
.gitignore                                          // data/accounts.json (W2)
```

**Test fixture changes:**

```
tests/fixtures/samplePortfolio.ts                   // makeHolding adds default account_id;
                                                    //   helper makeAccount; updates existing builders
```

---

## Section 1 — Wave 1: Quick wins (4 tasks)

### Task W1.1: Fix `KeyFindings.tsx` duplicated header

**Files:**
- Modify: `src/report/app/sections/KeyFindings.tsx:10-14`

- [ ] **Step 1: Update `iconLabel` to use only the colored type prefix, dropping the title duplication**

Open `src/report/app/sections/KeyFindings.tsx`. Replace lines 10-14:

```tsx
function iconLabel(finding: Finding): string {
  if (finding.type === "strength") return "✓ Strength";
  if (finding.type === "gap") return "⚠ Gap";
  return "ⓘ Note";
}
```

The current code interpolates `finding.title` which is the literal word "Strength" or "Gap" (set in `src/index.ts:111-113`). That produces the "Strength: Strength" rendering. After this change the card heading is just the colored severity label; the body carries the content.

- [ ] **Step 2: Verify visually**

Run `npm run analyze` to ensure analysis.json has narratives (requires `ANTHROPIC_API_KEY`). Then `npm run report`. The KeyFindings section should show "✓ Strength" / "⚠ Gap" / "ⓘ Note" once per card, not duplicated.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/sections/KeyFindings.tsx
git commit -m "fix(report): KeyFindings header — drop duplicated finding.title; use type label only"
```

---

### Task W1.2: Extend `ChatScope` to include `"dimension"`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/report/app/types.ts`

- [ ] **Step 1: Add `"dimension"` to `ChatScope.type` and add `dimension_id` field in `src/types.ts`**

Find `export interface ChatScope` (around line 234) and update:

```ts
export interface ChatScope {
  type: "global" | "flag" | "gap" | "situation" | "dimension";
  finding_key?: string;
  situation_id?: string;
  dimension_id?: string;     // NEW — set when type === "dimension"
}
```

- [ ] **Step 2: Mirror the change in `src/report/app/types.ts`**

Same edit in the React app's mirror file. (The mirror has its own `ChatScope` declaration; keep them identical.)

- [ ] **Step 3: Verify type-check**

```bash
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Both should pass — adding an optional field is non-breaking.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/report/app/types.ts
git commit -m "feat(types): extend ChatScope with 'dimension' type and dimension_id"
```

---

### Task W1.3: Wire dimension scope through chat prompt rendering (TDD)

**Files:**
- Modify: `src/ai/chat.ts`
- Modify: `src/ai/chat.prompt.test.ts`

- [ ] **Step 1: Add a failing test for dimension-scoped prompt context**

Open `src/ai/chat.prompt.test.ts` (existing tests are snapshots — append a new one). At the bottom, add:

```ts
import { renderChatInput } from "./chat";

describe("renderChatInput dimension scope", () => {
  it("includes the targeted DimensionScore and the broader portfolio context", () => {
    const out = renderChatInput({
      user_message: "How do I raise my Diversification grade?",
      scope: { type: "dimension", dimension_id: "diversification" },
      analysis: {
        portfolio_grade: "B",
        portfolio_score: 7.1,
        dimension_scores: [
          {
            id: "diversification",
            label: "Diversification",
            score: 6,
            rating: "yellow",
            display_value: "4 asset buckets",
            note: "Distinct asset class buckets with ≥ 3% weight",
            weight: 0.12,
          },
          {
            id: "cost_efficiency",
            label: "Cost efficiency",
            score: 9,
            rating: "green",
            display_value: "0.08% blended ER",
            note: "",
            weight: 0.10,
          },
        ],
        flags: [],
        gap_items: [],
        macro: { market_regime: "Late Cycle" },
        aggregates: { total_value: 1_000_000 },
      },
      situations: [],
      notes: [],
      history: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.scope.type).toBe("dimension");
    expect(parsed.scope.dimension_id).toBe("diversification");
    expect(parsed.analysis_scope.dimension.id).toBe("diversification");
    expect(parsed.analysis_scope.dimension.score).toBe(6);
    expect(parsed.analysis_scope.portfolio_grade).toBe("B");
    // Other dimensions also visible (for cross-reference reasoning)
    expect(Array.isArray(parsed.analysis_scope.all_dimensions)).toBe(true);
    expect(parsed.analysis_scope.all_dimensions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/ai/chat.prompt.test.ts -t "dimension scope"
```

Expected: FAIL. `analysis_scope.dimension` is undefined because `trimAnalysisByScope` does not handle the new scope type yet.

- [ ] **Step 3: Update `trimAnalysisByScope` in `src/ai/chat.ts` to handle the dimension scope**

In `src/ai/chat.ts`, in the `trimAnalysisByScope` function (around line 126), insert a new branch before the final `return null;`:

```ts
if (scope.type === "dimension") {
  const all_dimensions = analysis.dimension_scores ?? [];
  const dimension = all_dimensions.find(
    (d: { id: string }) => d.id === scope.dimension_id,
  );
  return {
    portfolio_grade: analysis.portfolio_grade,
    portfolio_score: analysis.portfolio_score,
    dimension: dimension ?? null,
    all_dimensions,
    aggregates: analysis.aggregates,
    macro: analysis.macro,
    top_flags: (analysis.flags ?? []).slice(0, 3),
  };
}
```

- [ ] **Step 4: Update `sameScope` helper to compare `dimension_id`**

In `src/ai/chat.ts`, find `sameScope` (around line 157) and append the `dimension_id` check:

```ts
function sameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.type !== b.type) return false;
  if (a.finding_key !== b.finding_key) return false;
  if (a.situation_id !== b.situation_id) return false;
  if (a.dimension_id !== b.dimension_id) return false;     // NEW
  return true;
}
```

- [ ] **Step 5: Update `CHAT_SYSTEM_PROMPT` to mention dimension scope**

In `src/ai/chat.ts`, find `CHAT_SYSTEM_PROMPT` (line 9). Add a bullet to the CAPABILITIES list (after the existing bullets):

```
- When scope.type === "dimension": explain the current score for that dimension and recommend specific moves to raise it within the user's portfolio. Cite actual values from the data.
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run src/ai/chat.prompt.test.ts
```

Expected: PASS (the new test and all existing snapshots).

- [ ] **Step 7: Commit**

```bash
git add src/ai/chat.ts src/ai/chat.prompt.test.ts
git commit -m "feat(ai): chat handles 'dimension' scope — injects targeted DimensionScore + cross-dimension context"
```

---

### Task W1.4: Add 💬 buttons to `DimensionScorecard.tsx`

**Files:**
- Modify: `src/report/app/sections/DimensionScorecard.tsx`
- Modify: `src/report/app/App.tsx`

- [ ] **Step 1: Read the existing `DimensionScorecard.tsx` to see the row structure**

Skim `src/report/app/sections/DimensionScorecard.tsx` to confirm where each dimension row is rendered. The component currently takes `data: AnalysisOutput` and iterates `data.dimension_scores`.

- [ ] **Step 2: Add an `onDiscuss?: (dimension_id: string) => void` prop and a 💬 button per row**

Modify the component's prop type to include `onDiscuss?: (id: string) => void`. In the row render (each dimension), add a small button at the right edge of the row with text `💬` and an `onClick` that calls `onDiscuss?.(dim.id)`. Style to match the pattern used in `src/report/app/sections/Flags.tsx` (look at the existing 💬 button there for visual consistency).

Example button block to insert at the right side of each dimension row:

```tsx
{onDiscuss && (
  <button
    type="button"
    onClick={() => onDiscuss(dim.id)}
    title={`Discuss ${dim.label}`}
    style={{
      background: "transparent",
      border: `1px solid ${COLORS.border}`,
      color: COLORS.textMuted,
      padding: "2px 6px",
      borderRadius: 4,
      cursor: "pointer",
      fontSize: 12,
    }}
  >
    💬
  </button>
)}
```

- [ ] **Step 3: Wire `onDiscuss` from `App.tsx`**

In `src/report/app/App.tsx`, find the `<DimensionScorecard data={typedData} />` invocation (around line 117) and replace it with:

```tsx
<DimensionScorecard
  data={typedData}
  onDiscuss={(id) => setScope({ type: "dimension", dimension_id: id })}
/>
```

- [ ] **Step 4: Verify visually**

```bash
npm run report
```

Click a 💬 button on any dimension row. The sidebar scope should change to that dimension; the next user message in the sidebar should route to the dimension-scoped chat handler. The advisor's response should explain the score and propose moves to raise it.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/DimensionScorecard.tsx src/report/app/App.tsx
git commit -m "feat(report): DimensionScorecard rows get 💬 button — sets dimension chat scope"
```

---

## Section 2 — Wave 2: Foundation (16 tasks)

### Task W2.1: Add new types — `UnderlyingComposition`, `AccountMetadata`, `Holding.account_id`, aggregate updates

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `UnderlyingComposition` interface**

Insert near the top of `src/types.ts` (after the `AssetClass` union):

```ts
export interface UnderlyingComposition {
  us_equity: number;            // 0..1
  international_equity: number; // 0..1
  fixed_income: number;         // 0..1
  cash: number;                 // 0..1
  // Invariant (zod-validated in parsePortfolio.ts): all four sum to ~1.0 (±0.001)
}
```

- [ ] **Step 2: Add `account_id` and `underlying_composition` to `Holding`**

In `src/types.ts`, modify the existing `Holding` interface (around line 29):

```ts
export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  account_id: string;                         // NEW — required; refers to AccountMetadata.id
  sector_tag?: string;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
  stock_metrics?: StockMetrics;
  underlying_composition?: UnderlyingComposition; // NEW — set on balanced/target_date holdings
}
```

- [ ] **Step 3: Add `AccountConstraints`, `AccountType`, `AccountMetadata`, `AccountConfig`**

Append after the existing `Portfolio` interface:

```ts
export type AccountType =
  | "roth_ira"
  | "pretax_ira"
  | "401k_traditional"
  | "401k_roth"
  | "taxable_brokerage"
  | "business_taxable"
  | "cash_balance_plan"
  | "hsa";

export type TaxTreatment = "tax_free_growth" | "tax_deferred" | "taxable_currently";

export interface AccountConstraints {
  conservative_only?: boolean;
  cash_reserve_minimum?: number;
  target_return?: number;
  excluded_from_deployment?: boolean;
}

export interface AccountMetadata {
  id: string;
  label: string;
  broker: "Fidelity" | "Empower" | "Vanguard" | "Schwab" | "Other";
  account_type: AccountType;
  owner: string;
  source_files: string[];
  constraints?: AccountConstraints;
}

export interface AccountConfig {
  accounts: AccountMetadata[];
}

/** Derive tax treatment from account_type — single source of truth for downstream engine/AI. */
export function taxTreatmentFor(t: AccountType): TaxTreatment {
  if (t === "roth_ira" || t === "401k_roth" || t === "hsa") return "tax_free_growth";
  if (t === "pretax_ira" || t === "401k_traditional" || t === "cash_balance_plan") return "tax_deferred";
  return "taxable_currently";
}
```

- [ ] **Step 4: Add aggregate fields — `cross_account_groups`, `constrained_cash_weight`**

In `src/types.ts`, modify `PortfolioAggregates` (around line 78):

```ts
export interface CrossAccountGroup {
  asset_class: AssetClass;
  label: string;
  tickers_by_account: { account_id: string; ticker: string }[];
  combined_weight: number;
}

export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
  holding_count: number;
  duplicate_groups: DuplicateGroup[];
  cross_account_groups: CrossAccountGroup[];  // NEW — informational, not penalized
  top3_weight: number;
  top3_tickers: string[];
  international_weight: number;
  cash_weight: number;
  idle_cash_weight: number;
  constrained_cash_weight: number;            // NEW — cash in accounts.excluded_from_deployment
  pending_cash_weight: number;
  pending_cash_value: number;
  equity_weight: number;
  fixed_income_weight: number;
  individual_stock_weight: number;
  balanced_weight: number;
  sector_holdings: SectorHolding[];
  pending_deployment_label?: string;
  pending_deployment_date?: string;
}
```

- [ ] **Step 5: Note the temporary compile-failure window**

After this commit, `npx tsc --noEmit` will fail because:

1. Existing `Holding` literals in `tests/fixtures/samplePortfolio.ts`, `src/intake/normalize.ts`, and various test files lack the new required `account_id`.
2. `src/engine/aggregates.ts` doesn't yet return `cross_account_groups` or `constrained_cash_weight`.

This is the accepted intermediate state. Type-check restored at Task W2.10 (parsePortfolio) and Task W2.11 (aggregates).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add account_id on Holding; AccountMetadata, UnderlyingComposition, aggregate fields"
```

---

### Task W2.2: Update fixture builders — `makeHolding` defaults `account_id`, add `makeAccount`

**Files:**
- Modify: `tests/fixtures/samplePortfolio.ts`

- [ ] **Step 1: Read the existing fixture builder to know its current shape**

Open `tests/fixtures/samplePortfolio.ts` to see how `makeHolding`, `makePortfolio`, etc. are defined.

- [ ] **Step 2: Add `account_id: "test_account"` as a default in `makeHolding`**

Update `makeHolding` so its default `Holding` output includes `account_id: "test_account"`. Allow override via the overrides parameter.

- [ ] **Step 3: Add a `makeAccount` builder**

Append to `tests/fixtures/samplePortfolio.ts`:

```ts
import type { AccountMetadata } from "../../src/types";

export function makeAccount(overrides: Partial<AccountMetadata> = {}): AccountMetadata {
  return {
    id: "test_account",
    label: "Test Account",
    broker: "Vanguard",
    account_type: "taxable_brokerage",
    owner: "you",
    source_files: ["test.json"],
    ...overrides,
  };
}
```

- [ ] **Step 4: Verify a targeted test still passes**

```bash
npx vitest run src/engine/aggregates.test.ts
```

Expected: still passes (the fixture now produces a complete `Holding` with `account_id`).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/samplePortfolio.ts
git commit -m "test(fixtures): makeHolding defaults account_id; add makeAccount builder"
```

---

### Task W2.3: Create `parseAccounts.ts` with zod validation (TDD)

**Files:**
- Create: `src/intake/parseAccounts.ts`
- Create: `src/intake/parseAccounts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/intake/parseAccounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAccounts, lookupAccountByFilename } from "./parseAccounts";

describe("parseAccounts", () => {
  it("accepts a valid account config", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "fidelity_retirement",
          label: "Fidelity Retirement",
          broker: "Fidelity",
          account_type: "pretax_ira",
          owner: "you",
          source_files: ["20260509_FidelityRetirement.json"],
        },
      ],
    });
    expect(cfg.accounts).toHaveLength(1);
    expect(cfg.accounts[0].id).toBe("fidelity_retirement");
  });

  it("accepts constraints", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "vanguard_business",
          label: "Vanguard Business",
          broker: "Vanguard",
          account_type: "business_taxable",
          owner: "business",
          source_files: ["20260509_VanguardBusiness.json"],
          constraints: {
            cash_reserve_minimum: 50_000,
            excluded_from_deployment: true,
          },
        },
      ],
    });
    expect(cfg.accounts[0].constraints?.excluded_from_deployment).toBe(true);
  });

  it("rejects unknown account_type", () => {
    expect(() =>
      parseAccounts({
        accounts: [
          {
            id: "x",
            label: "x",
            broker: "Vanguard",
            account_type: "magical_unicorn",
            owner: "you",
            source_files: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate account ids", () => {
    expect(() =>
      parseAccounts({
        accounts: [
          { id: "dup", label: "A", broker: "Fidelity", account_type: "roth_ira", owner: "you", source_files: ["a.json"] },
          { id: "dup", label: "B", broker: "Fidelity", account_type: "roth_ira", owner: "you", source_files: ["b.json"] },
        ],
      }),
    ).toThrow(/duplicate/i);
  });
});

describe("lookupAccountByFilename", () => {
  it("finds an account by source filename (exact match)", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "fid",
          label: "Fid",
          broker: "Fidelity",
          account_type: "pretax_ira",
          owner: "you",
          source_files: ["20260509_FidelityRetirement.json"],
        },
      ],
    });
    const a = lookupAccountByFilename(cfg, "20260509_FidelityRetirement.json");
    expect(a?.id).toBe("fid");
  });

  it("returns undefined when no account claims the file", () => {
    const cfg = parseAccounts({ accounts: [] });
    expect(lookupAccountByFilename(cfg, "missing.json")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/intake/parseAccounts.test.ts
```

Expected: FAIL with "module not found".

- [ ] **Step 3: Write `parseAccounts.ts`**

Create `src/intake/parseAccounts.ts`:

```ts
import { z } from "zod";
import type { AccountConfig, AccountMetadata } from "../types";

const ACCOUNT_TYPES = [
  "roth_ira",
  "pretax_ira",
  "401k_traditional",
  "401k_roth",
  "taxable_brokerage",
  "business_taxable",
  "cash_balance_plan",
  "hsa",
] as const;

const BROKERS = ["Fidelity", "Empower", "Vanguard", "Schwab", "Other"] as const;

const constraintsSchema = z.object({
  conservative_only: z.boolean().optional(),
  cash_reserve_minimum: z.number().nonnegative().optional(),
  target_return: z.number().optional(),
  excluded_from_deployment: z.boolean().optional(),
});

const accountSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  broker: z.enum(BROKERS),
  account_type: z.enum(ACCOUNT_TYPES),
  owner: z.string().min(1),
  source_files: z.array(z.string()),
  constraints: constraintsSchema.optional(),
});

const configSchema = z.object({
  accounts: z.array(accountSchema),
});

export function parseAccounts(input: unknown): AccountConfig {
  const parsed = configSchema.parse(input);
  const seen = new Set<string>();
  for (const a of parsed.accounts) {
    if (seen.has(a.id)) {
      throw new Error(`parseAccounts: duplicate account id ${a.id}`);
    }
    seen.add(a.id);
  }
  return parsed as AccountConfig;
}

export function lookupAccountByFilename(
  cfg: AccountConfig,
  filename: string,
): AccountMetadata | undefined {
  return cfg.accounts.find((a) => a.source_files.includes(filename));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/intake/parseAccounts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intake/parseAccounts.ts src/intake/parseAccounts.test.ts
git commit -m "feat(intake): parseAccounts — zod schema + lookupAccountByFilename (TDD)"
```

---

### Task W2.4: Create target-date glide-path helper `composition.ts` (TDD)

**Files:**
- Create: `src/intake/composition.ts`
- Create: `src/intake/composition.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/intake/composition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { glidePathComposition, extractTargetYear } from "./composition";

describe("glidePathComposition", () => {
  it("a 2040 fund today (2026) is roughly 80/20 equity/FI", () => {
    const c = glidePathComposition(2040, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.80, 1);
    expect(c.fixed_income).toBeCloseTo(0.20, 1);
    expect(c.us_equity + c.international_equity + c.fixed_income + c.cash).toBeCloseTo(1.0, 3);
  });

  it("a 2025 fund today (2026) is roughly 50/50", () => {
    const c = glidePathComposition(2025, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.50, 1);
    expect(c.fixed_income).toBeCloseTo(0.45, 1);
    expect(c.cash).toBeCloseTo(0.05, 2);
  });

  it("after target date (10y past), tilts conservative — equity ~30%", () => {
    const c = glidePathComposition(2015, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.30, 1);
  });

  it("returns ratios that sum to 1.0", () => {
    const c = glidePathComposition(2050, 2026);
    expect(c.us_equity + c.international_equity + c.fixed_income + c.cash)
      .toBeCloseTo(1.0, 3);
  });

  it("international equity is ~25% of equity portion (Vanguard target-date norm)", () => {
    const c = glidePathComposition(2050, 2026);
    const equity = c.us_equity + c.international_equity;
    if (equity > 0) {
      expect(c.international_equity / equity).toBeCloseTo(0.25, 1);
    }
  });
});

describe("extractTargetYear", () => {
  it("pulls year from 'Vanguard Target Retirement 2040 Fund'", () => {
    expect(extractTargetYear("Vanguard Target Retirement 2040 Fund")).toBe(2040);
  });

  it("pulls year from 'Fidelity Freedom 2050 Fund'", () => {
    expect(extractTargetYear("Fidelity Freedom 2050 Fund")).toBe(2050);
  });

  it("returns null when no 4-digit year present", () => {
    expect(extractTargetYear("Wellington Fund")).toBeNull();
  });

  it("returns null for years outside plausible range", () => {
    expect(extractTargetYear("Fund 1850 archive")).toBeNull();
    expect(extractTargetYear("Fund 2200 ridiculous")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/intake/composition.test.ts
```

Expected: FAIL with "module not found".

- [ ] **Step 3: Write `composition.ts`**

Create `src/intake/composition.ts`:

```ts
import type { UnderlyingComposition } from "../types";

/**
 * Vanguard-style glide path approximation. Equity slides from ~90% at >25y-to-target
 * down to ~30% at -10y past target. International is ~25% of the equity portion.
 * Cash creeps in at and beyond target date.
 */
export function glidePathComposition(
  target_year: number,
  current_year: number,
): UnderlyingComposition {
  const years = target_year - current_year;

  // Equity glide
  let equity: number;
  if (years >= 25) equity = 0.90;
  else if (years >= 0) equity = 0.50 + (years / 25) * 0.40;   // 0.50 at target → 0.90 at +25y
  else equity = Math.max(0.30, 0.50 + (years / 25) * 0.40);   // 0.30 floor for legacy holders

  const intl = equity * 0.25;
  const us_equity = equity - intl;

  // Cash creeps in starting at target date
  let cash = 0;
  if (years <= 0) cash = Math.min(0.10, -years * 0.005 + 0.05);

  const fixed_income = Math.max(0, 1 - us_equity - intl - cash);

  return {
    us_equity,
    international_equity: intl,
    fixed_income,
    cash,
  };
}

const TARGET_YEAR_RE = /\b(20\d{2})\b/;

export function extractTargetYear(label: string): number | null {
  const m = label.match(TARGET_YEAR_RE);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  return y;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/intake/composition.test.ts
```

Expected: PASS. If individual cases are off by more than `toBeCloseTo` tolerance, tighten the formula constants until they pass — the test values document the intended glide path.

- [ ] **Step 5: Commit**

```bash
git add src/intake/composition.ts src/intake/composition.test.ts
git commit -m "feat(intake): composition.ts — target-date glide-path helper (TDD)"
```

---

### Task W2.5: Add `underlying_composition` to known balanced funds in `tickerMetadata.ts`

**Files:**
- Modify: `src/intake/tickerMetadata.ts`

- [ ] **Step 1: Read the existing `tickerMetadata.ts` to know its shape**

Open `src/intake/tickerMetadata.ts`. Note the `TICKER_METADATA` map shape and the `lookupTicker` function. The map entries have `asset_class`, `expense_ratio`, and optionally `stock_metrics` / `sector_tag`.

- [ ] **Step 2: Extend the metadata entry type to allow `underlying_composition`**

In `src/intake/tickerMetadata.ts`, add `underlying_composition?: UnderlyingComposition` to the metadata entry type (import `UnderlyingComposition` from `../types`).

- [ ] **Step 3: Add composition for known balanced funds**

For VWENX (Vanguard Wellington Admiral), set:

```ts
underlying_composition: {
  us_equity: 0.60,
  international_equity: 0.05,
  fixed_income: 0.35,
  cash: 0.0,
},
```

If other balanced funds appear in the map (look for `asset_class: "balanced"` entries), give each a plausible composition (default to `us_equity: 0.55, international_equity: 0.05, fixed_income: 0.35, cash: 0.05` if no public data).

For target-date fund entries (`asset_class: "target_date"`), do **not** hardcode composition — `normalize.ts` will derive it at attach time using `glidePathComposition` based on the fund's label.

- [ ] **Step 4: Verify type-check on the intake folder**

```bash
npx vitest run src/intake/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intake/tickerMetadata.ts
git commit -m "feat(intake): underlying_composition for known balanced funds (VWENX et al.)"
```

---

### Task W2.6: Update `normalize.ts` to attach `account_id` (TDD)

**Files:**
- Modify: `src/intake/normalize.ts`
- Modify: `src/intake/normalize.test.ts` (existing)

- [ ] **Step 1: Add a failing test for `account_id` propagation**

Append to `src/intake/normalize.test.ts`:

```ts
import { normalizeFidelityAccounts, normalizeEmpowerAccounts, normalizeVanguardAccounts } from "./normalize";

describe("normalize attaches account_id", () => {
  it("Fidelity holdings carry the account_id passed in", () => {
    const result = normalizeFidelityAccounts(
      [
        {
          account_id: "raw_fid",
          account_name: "Fidelity Retirement",
          account_label: "Fidelity",
          total_value: "$1000",
          holdings: [
            { symbol: "FSKAX", description: "Total Mkt", quantity: "10", balance: "$1,000" },
          ],
        },
      ],
      "fidelity_retirement",
    );
    expect(result[0].account_id).toBe("fidelity_retirement");
  });

  it("Vanguard settlement cash carries the account_id", () => {
    const result = normalizeVanguardAccounts(
      [
        {
          account_number: "X123",
          settlement_fund: "$500",
          holdings: [],
        },
      ],
      "vanguard_personal",
    );
    expect(result[0].account_id).toBe("vanguard_personal");
    expect(result[0].is_cash).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/intake/normalize.test.ts -t "attaches account_id"
```

Expected: FAIL — current signature is `(accounts)`, not `(accounts, account_id)`, and the produced holdings lack `account_id`.

- [ ] **Step 3: Add `account_id` parameter to each normalize function and attach to every emitted Holding**

In `src/intake/normalize.ts`, update each of `normalizeFidelityAccounts`, `normalizeEmpowerAccounts`, `normalizeVanguardAccounts`:

- Signature: add second parameter `account_id: string`.
- Every `out.push({...})` call: add `account_id` to the emitted holding.

For example, Fidelity becomes:

```ts
export function normalizeFidelityAccounts(
  accounts: FidelityRawAccount[],
  account_id: string,
): Holding[] {
  const out: Holding[] = [];
  for (const account of accounts) {
    for (const raw of account.holdings) {
      const market_value = parseMoneyString(raw.balance);
      if (market_value <= 0) continue;

      const isCashRow = raw.symbol === "Cash" || /money market/i.test(raw.description);
      if (isCashRow) {
        out.push({
          ticker: "Cash",
          label: raw.description || "Money Market",
          market_value,
          asset_class: "cash",
          account_id,                               // NEW
          is_cash: true,
          is_pending_deployment: false,
          expense_ratio: null,
        });
        continue;
      }

      const ticker = canonicalTicker(raw.symbol);
      const meta = lookupTicker(raw.symbol);
      out.push({
        ticker,
        label: raw.description || ticker,
        market_value,
        asset_class: meta?.asset_class ?? "us_equity_total_market",
        account_id,                                 // NEW
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
      });
    }
  }
  return out;
}
```

Apply the same pattern to Empower and Vanguard.

- [ ] **Step 4: Update existing tests for the new signature**

Search the existing test cases in `src/intake/normalize.test.ts` and pass a placeholder `account_id` string (e.g., `"acct_a"`) where the normalize functions are called.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/intake/normalize.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/intake/normalize.ts src/intake/normalize.test.ts
git commit -m "feat(intake): normalize attaches account_id to every emitted Holding (TDD)"
```

---

### Task W2.7: Update `normalize.ts` to attach `underlying_composition`

**Files:**
- Modify: `src/intake/normalize.ts`
- Modify: `src/intake/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/intake/normalize.test.ts`:

```ts
describe("normalize attaches underlying_composition", () => {
  it("VWENX gets composition from tickerMetadata", () => {
    const result = normalizeVanguardAccounts(
      [{
        account_number: "X",
        settlement_fund: "$0",
        holdings: [{ symbol: "VWENX", quantity: "100", balance: "$10,000" }],
      }],
      "vanguard_personal",
    );
    expect(result[0].underlying_composition).toBeDefined();
    expect(result[0].underlying_composition!.us_equity).toBeCloseTo(0.60, 2);
    expect(result[0].underlying_composition!.fixed_income).toBeCloseTo(0.35, 2);
  });

  it("a target-date fund gets composition from the glide path helper", () => {
    const result = normalizeVanguardAccounts(
      [{
        account_number: "X",
        settlement_fund: "$0",
        holdings: [{ symbol: "VFORX", quantity: "100", balance: "$10,000" }],
      }],
      "vanguard_personal",
    );
    expect(result[0].underlying_composition).toBeDefined();
    // 2040 fund today (2026): glide path → ~80/20 equity/FI
    const c = result[0].underlying_composition!;
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.80, 1);
  });

  it("a regular total-market fund (FSKAX) gets no composition", () => {
    const result = normalizeFidelityAccounts(
      [{
        account_id: "X",
        account_name: "X",
        account_label: "X",
        total_value: "$1",
        holdings: [{ symbol: "FSKAX", description: "Total Market", quantity: "1", balance: "$1,000" }],
      }],
      "fidelity_retirement",
    );
    expect(result[0].underlying_composition).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/intake/normalize.test.ts -t "underlying_composition"
```

Expected: FAIL.

- [ ] **Step 3: Add composition attachment logic to normalize**

In `src/intake/normalize.ts`, import:

```ts
import { glidePathComposition, extractTargetYear } from "./composition";
```

Add a helper inside the file:

```ts
function attachCompositionIfApplicable(
  ticker: string,
  label: string,
  asset_class: string,
  meta: ReturnType<typeof lookupTicker>,
  current_year: number,
): UnderlyingComposition | undefined {
  if (meta?.underlying_composition) return meta.underlying_composition;
  if (asset_class === "target_date") {
    const y = extractTargetYear(label) ?? extractTargetYear(ticker);
    if (y !== null) return glidePathComposition(y, current_year);
    // Fallback: assume 2040 if year not parseable — keeps math honest
    return glidePathComposition(2040, current_year);
  }
  if (asset_class === "balanced") {
    // Default for unknown balanced funds (logged once per ticker in dev)
    return { us_equity: 0.55, international_equity: 0.05, fixed_income: 0.35, cash: 0.05 };
  }
  return undefined;
}

const CURRENT_YEAR = new Date().getFullYear();
```

Import `UnderlyingComposition` from `../types` and add `import type { UnderlyingComposition } from "../types";` near the top.

In each `out.push({...})` call for non-cash holdings (Fidelity, Empower, Vanguard), add:

```ts
underlying_composition: attachCompositionIfApplicable(ticker, label, asset_class, meta, CURRENT_YEAR),
```

Where `label` is the local `label` variable (Fidelity uses `raw.description`; Vanguard uses `ticker`; Empower uses `raw.symbol`). Pass whichever is most likely to carry the human-readable name.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/intake/normalize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intake/normalize.ts src/intake/normalize.test.ts
git commit -m "feat(intake): normalize attaches underlying_composition (balanced + target-date)"
```

---

### Task W2.8: Update `consolidatePortfolio` to be account-aware (TDD)

**Files:**
- Modify: `src/intake/normalize.ts`
- Modify: `src/intake/normalize.test.ts`

- [ ] **Step 1: Write failing test**

Append to `src/intake/normalize.test.ts`:

```ts
describe("consolidatePortfolio is account-aware", () => {
  it("merges identical (ticker, account_id) within the same account", () => {
    const merged = consolidatePortfolio(
      [
        { ticker: "FSKAX", label: "FSKAX", market_value: 100, asset_class: "us_equity_total_market", account_id: "fid", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
        { ticker: "FSKAX", label: "FSKAX", market_value: 50,  asset_class: "us_equity_total_market", account_id: "fid", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
      ],
      "2026-05-09",
      "All Accounts",
    );
    expect(merged.holdings).toHaveLength(1);
    expect(merged.holdings[0].market_value).toBe(150);
    expect(merged.holdings[0].account_id).toBe("fid");
  });

  it("does NOT merge same ticker across different accounts", () => {
    const merged = consolidatePortfolio(
      [
        { ticker: "FSKAX", label: "FSKAX", market_value: 100, asset_class: "us_equity_total_market", account_id: "fid", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
        { ticker: "FSKAX", label: "FSKAX", market_value: 80,  asset_class: "us_equity_total_market", account_id: "vng_personal", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
      ],
      "2026-05-09",
      "All Accounts",
    );
    expect(merged.holdings).toHaveLength(2);
    expect(merged.holdings.find(h => h.account_id === "fid")!.market_value).toBe(100);
    expect(merged.holdings.find(h => h.account_id === "vng_personal")!.market_value).toBe(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/intake/normalize.test.ts -t "account-aware"
```

Expected: FAIL — current `consolidatePortfolio` keys by `ticker` alone, merging cross-account duplicates incorrectly.

- [ ] **Step 3: Update `consolidatePortfolio` to key by `(ticker, account_id)`**

In `src/intake/normalize.ts`, replace the existing `consolidatePortfolio` body:

```ts
export function consolidatePortfolio(
  holdings: Holding[],
  snapshot_date: string,
  account_label: string
): Portfolio {
  const byKey: Record<string, Holding> = {};
  for (const h of holdings) {
    const key = `${h.account_id}::${h.ticker}`;
    if (byKey[key]) {
      byKey[key] = {
        ...byKey[key],
        market_value: byKey[key].market_value + h.market_value,
      };
    } else {
      byKey[key] = { ...h };
    }
  }
  const merged = Object.values(byKey).sort((a, b) => b.market_value - a.market_value);
  return {
    snapshot_date,
    account_label,
    holdings: merged,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/intake/normalize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/intake/normalize.ts src/intake/normalize.test.ts
git commit -m "feat(intake): consolidatePortfolio merges by (account_id, ticker), not ticker alone (TDD)"
```

---

### Task W2.9: Update `parsePortfolio.ts` zod schema

**Files:**
- Modify: `src/intake/parsePortfolio.ts`
- Modify: `src/intake/parsePortfolio.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/intake/parsePortfolio.test.ts`:

```ts
describe("parsePortfolio with account_id and underlying_composition", () => {
  it("requires account_id on every holding", () => {
    expect(() =>
      parsePortfolio({
        snapshot_date: "2026-05-12",
        account_label: "X",
        holdings: [
          { ticker: "FSKAX", label: "x", market_value: 1, asset_class: "us_equity_total_market",
            is_cash: false, is_pending_deployment: false, expense_ratio: 0 /* no account_id */ },
        ],
      }),
    ).toThrow();
  });

  it("accepts underlying_composition that sums to ~1.0", () => {
    const p = parsePortfolio({
      snapshot_date: "2026-05-12",
      account_label: "X",
      holdings: [
        {
          ticker: "VWENX",
          label: "Wellington",
          market_value: 100,
          asset_class: "balanced",
          account_id: "vng",
          is_cash: false,
          is_pending_deployment: false,
          expense_ratio: 0.0017,
          underlying_composition: {
            us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0,
          },
        },
      ],
    });
    expect(p.holdings[0].underlying_composition?.us_equity).toBe(0.60);
  });

  it("rejects underlying_composition that does NOT sum to 1.0", () => {
    expect(() =>
      parsePortfolio({
        snapshot_date: "2026-05-12",
        account_label: "X",
        holdings: [
          {
            ticker: "VWENX",
            label: "Wellington",
            market_value: 100,
            asset_class: "balanced",
            account_id: "vng",
            is_cash: false,
            is_pending_deployment: false,
            expense_ratio: 0.0017,
            underlying_composition: { us_equity: 0.5, international_equity: 0.5, fixed_income: 0.5, cash: 0.5 },
          },
        ],
      }),
    ).toThrow(/sum|1\.0/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/intake/parsePortfolio.test.ts -t "underlying_composition"
```

Expected: FAIL.

- [ ] **Step 3: Update zod schema in `parsePortfolio.ts`**

Add `account_id: z.string().min(1)` as a required field on the holding schema. Add `underlying_composition: z.object({...}).refine(...)` with a refine that asserts the four ratios sum to ~1.0 (tolerance 0.001).

Concretely:

```ts
const compositionSchema = z.object({
  us_equity: z.number().min(0).max(1),
  international_equity: z.number().min(0).max(1),
  fixed_income: z.number().min(0).max(1),
  cash: z.number().min(0).max(1),
}).refine(
  (c) => Math.abs(c.us_equity + c.international_equity + c.fixed_income + c.cash - 1) < 0.001,
  { message: "underlying_composition must sum to 1.0" },
);

const holdingSchema = z.object({
  ticker: z.string(),
  label: z.string(),
  market_value: z.number(),
  asset_class: z.enum([
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
  ]),
  account_id: z.string().min(1),               // NEW
  sector_tag: z.string().optional(),
  is_cash: z.boolean(),
  is_pending_deployment: z.boolean(),
  deployment_date: z.string().optional(),
  deployment_label: z.string().optional(),
  expense_ratio: z.number().nullable(),
  stock_metrics: z.any().optional(),
  underlying_composition: compositionSchema.optional(),  // NEW
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/intake/parsePortfolio.test.ts
```

Expected: PASS.

- [ ] **Step 5: Restore project-wide type-check**

```bash
npx tsc --noEmit
```

This should now compile cleanly — `account_id` is supplied by normalize, fixtures, and parsePortfolio accepts it.

- [ ] **Step 6: Commit**

```bash
git add src/intake/parsePortfolio.ts src/intake/parsePortfolio.test.ts
git commit -m "feat(intake): parsePortfolio validates account_id required + composition sums to 1.0 (TDD)"
```

---

### Task W2.10: Update `aggregates.ts` — cross_account_groups, constrained_cash_weight, composition math (TDD)

**Files:**
- Modify: `src/engine/aggregates.ts`
- Modify: `src/engine/aggregates.test.ts`

- [ ] **Step 1: Add failing tests for the new behaviors**

Append to `src/engine/aggregates.test.ts`:

```ts
import { makeHolding, makePortfolio, makeAccount } from "../../tests/fixtures/samplePortfolio";

describe("aggregates — cross-account groups", () => {
  it("FSKAX in two accounts is recorded as cross_account_groups, not duplicate_groups", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
        makeHolding({ ticker: "VTSAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "vng_personal" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.duplicate_groups).toHaveLength(0);
    expect(agg.cross_account_groups).toHaveLength(1);
    expect(agg.cross_account_groups[0].asset_class).toBe("us_equity_total_market");
    expect(agg.cross_account_groups[0].combined_weight).toBeCloseTo(1.0, 2);
  });

  it("Two FSKAX entries in the SAME account remain duplicates (same-account waste)", () => {
    // Note: post-consolidation this shouldn't happen, but defensive test for raw input
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
        makeHolding({ ticker: "ITOT",  market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.duplicate_groups).toHaveLength(1);
    expect(agg.duplicate_groups[0].tickers).toContain("FSKAX");
    expect(agg.duplicate_groups[0].tickers).toContain("ITOT");
  });
});

describe("aggregates — composition decomposition", () => {
  it("VWENX with 60/5/35/0 composition contributes to equity AND FI weights", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "VWENX",
          market_value: 1000,
          asset_class: "balanced",
          account_id: "vng",
          underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
        }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.equity_weight).toBeCloseTo(0.60, 2);
    expect(agg.international_weight).toBeCloseTo(0.05, 2);
    expect(agg.fixed_income_weight).toBeCloseTo(0.35, 2);
    expect(agg.balanced_weight).toBeCloseTo(1.0, 2);
  });
});

describe("aggregates — constrained cash", () => {
  it("Cash in an account marked excluded_from_deployment goes to constrained_cash_weight, not idle", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "Cash", market_value: 500, asset_class: "cash", is_cash: true, account_id: "vng_business" }),
        makeHolding({ ticker: "Cash", market_value: 500, asset_class: "cash", is_cash: true, account_id: "vng_personal" }),
      ],
    });
    const accounts = {
      accounts: [
        makeAccount({ id: "vng_business", constraints: { excluded_from_deployment: true } }),
        makeAccount({ id: "vng_personal" }),
      ],
    };
    const agg = computeAggregates(p, accounts);
    expect(agg.constrained_cash_weight).toBeCloseTo(0.5, 2);
    expect(agg.idle_cash_weight).toBeCloseTo(0.5, 2);
    expect(agg.cash_weight).toBeCloseTo(1.0, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/engine/aggregates.test.ts -t "cross-account|composition|constrained"
```

Expected: FAIL.

- [ ] **Step 3: Rewrite `computeAggregates` in `src/engine/aggregates.ts`**

Replace the entire `src/engine/aggregates.ts` file with:

```ts
import {
  Portfolio,
  PortfolioAggregates,
  DuplicateGroup,
  Holding,
  SectorHolding,
  CrossAccountGroup,
  AccountConfig,
  UnderlyingComposition,
} from "../types";

const EQUITY_CLASSES: string[] = [
  "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
  "us_equity_small_mid", "us_equity_sector", "individual_stock",
];
const BOND_CLASSES: string[] = ["us_bond_aggregate", "us_bond_short", "us_bond_tips"];

const ASSET_CLASSES_FOR_GROUPING: string[] = [
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
  "us_bond_aggregate",
  "us_bond_short",
  "us_bond_tips",
  "international_equity",
];

function getComposition(h: Holding): UnderlyingComposition | null {
  if (h.underlying_composition) return h.underlying_composition;
  return null;
}

export function computeAggregates(
  portfolio: Portfolio,
  accounts?: AccountConfig,
): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const w = (h: Holding) => (total_value > 0 ? h.market_value / total_value : 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  const holding_count = holdings.filter(h => !h.is_cash).length;

  // Group by (asset_class, account_id) to find same-account duplicates and cross-account groups
  const duplicate_groups: DuplicateGroup[] = [];
  const cross_account_groups: CrossAccountGroup[] = [];

  for (const cls of ASSET_CLASSES_FOR_GROUPING) {
    const inClass = holdings.filter(h => h.asset_class === cls && !h.is_cash);
    if (inClass.length < 2) continue;

    // Bucket by account
    const byAccount: Record<string, Holding[]> = {};
    for (const h of inClass) {
      if (!byAccount[h.account_id]) byAccount[h.account_id] = [];
      byAccount[h.account_id].push(h);
    }

    const sameAccountDups = Object.values(byAccount).filter(arr => arr.length >= 2);
    for (const arr of sameAccountDups) {
      duplicate_groups.push({
        label: cls.replace(/_/g, " "),
        tickers: arr.map(h => h.ticker),
        combined_weight: arr.reduce((sum, h) => sum + w(h), 0),
      });
    }

    const accountIds = Object.keys(byAccount);
    if (accountIds.length >= 2) {
      cross_account_groups.push({
        asset_class: cls as Holding["asset_class"],
        label: cls.replace(/_/g, " "),
        tickers_by_account: inClass.map(h => ({ account_id: h.account_id, ticker: h.ticker })),
        combined_weight: inClass.reduce((sum, h) => sum + w(h), 0),
      });
    }
  }

  // Equity / FI / international with composition decomposition
  let equity_weight = 0;
  let international_weight = 0;
  let fixed_income_weight = 0;
  let composition_cash_weight = 0;

  for (const h of holdings) {
    const wt = w(h);
    const comp = getComposition(h);
    if (comp) {
      equity_weight += wt * comp.us_equity;
      international_weight += wt * comp.international_equity;
      fixed_income_weight += wt * comp.fixed_income;
      composition_cash_weight += wt * comp.cash;
    } else {
      if (EQUITY_CLASSES.includes(h.asset_class)) equity_weight += wt;
      if (h.asset_class === "international_equity") international_weight += wt;
      if (BOND_CLASSES.includes(h.asset_class)) fixed_income_weight += wt;
    }
  }

  // Cash math — separate idle vs constrained
  const constrainedSet = new Set<string>(
    (accounts?.accounts ?? [])
      .filter(a => a.constraints?.excluded_from_deployment === true)
      .map(a => a.id),
  );

  const cashHoldings = holdings.filter(h => h.is_cash);
  const cash_weight = cashHoldings.reduce((sum, h) => sum + w(h), 0) + composition_cash_weight;

  const pending_holdings = cashHoldings.filter(h => h.is_pending_deployment);
  const pending_cash_weight = pending_holdings.reduce((sum, h) => sum + w(h), 0);
  const pending_cash_value = pending_holdings.reduce((sum, h) => sum + h.market_value, 0);
  const firstPending = pending_holdings[0];

  const constrained_cash_weight = cashHoldings
    .filter(h => constrainedSet.has(h.account_id))
    .reduce((sum, h) => sum + w(h), 0);

  const idle_cash_weight =
    cash_weight - pending_cash_weight - constrained_cash_weight;

  // Top-3
  const sorted = [...holdings].sort((a, b) =>
    b.market_value !== a.market_value
      ? b.market_value - a.market_value
      : a.ticker.localeCompare(b.ticker)
  );
  const top3 = sorted.slice(0, 3);
  const top3_weight = top3.reduce((sum, h) => sum + w(h), 0);
  const top3_tickers = top3.map(h => h.ticker);

  const individual_stock_weight = holdings
    .filter(h => h.asset_class === "individual_stock")
    .reduce((sum, h) => sum + w(h), 0);

  const balanced_weight = holdings
    .filter(h => h.asset_class === "balanced" || h.asset_class === "target_date")
    .reduce((sum, h) => sum + w(h), 0);

  // Sector holdings
  const sector_map: Record<string, string[]> = {};
  for (const h of holdings.filter(h => h.sector_tag)) {
    const tag = h.sector_tag!;
    if (!sector_map[tag]) sector_map[tag] = [];
    sector_map[tag].push(h.ticker);
  }
  const sector_holdings: SectorHolding[] = Object.entries(sector_map).map(([sector_tag, tickers]) => ({
    sector_tag,
    tickers,
    combined_weight: holdings
      .filter(h => tickers.includes(h.ticker))
      .reduce((sum, h) => sum + w(h), 0),
  }));

  return {
    total_value,
    blended_expense_ratio,
    holding_count,
    duplicate_groups,
    cross_account_groups,
    top3_weight,
    top3_tickers,
    international_weight,
    cash_weight,
    idle_cash_weight,
    constrained_cash_weight,
    pending_cash_weight,
    pending_cash_value,
    equity_weight,
    fixed_income_weight,
    individual_stock_weight,
    balanced_weight,
    sector_holdings,
    pending_deployment_label: firstPending?.deployment_label,
    pending_deployment_date: firstPending?.deployment_date,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/aggregates.test.ts
```

Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/engine/aggregates.ts src/engine/aggregates.test.ts
git commit -m "feat(engine): aggregates becomes account-aware — cross_account_groups, constrained_cash, composition decomposition (TDD)"
```

---

### Task W2.11: Update `scoreDiversification` and `scoreSimplicity` to ignore cross-account groups (TDD)

**Files:**
- Modify: `src/engine/dimensions.ts`
- Modify: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreSimplicity ignores cross-account duplicates for effective count", () => {
  it("FSKAX in Fidelity + VTSAX in Vanguard counts as 1 effective position, not 2", () => {
    // Construct aggregates with cross_account_groups populated, duplicate_groups empty
    const agg = {
      holding_count: 2,
      duplicate_groups: [],
      cross_account_groups: [
        {
          asset_class: "us_equity_total_market",
          label: "us equity total market",
          tickers_by_account: [
            { account_id: "fid", ticker: "FSKAX" },
            { account_id: "vng", ticker: "VTSAX" },
          ],
          combined_weight: 0.5,
        },
      ],
      // … minimum fields needed by the rest of the function
    } as unknown as PortfolioAggregates;
    const result = scoreSimplicity(agg);
    // effective = holding_count - (cross_account_groups.tickers - 1 each) - (duplicate_groups.tickers - 1 each)
    // = 2 - 1 - 0 = 1 effective position
    expect(result.display_value).toMatch(/1 effective/);
  });
});

describe("scoreDiversification does not penalize cross-account groups", () => {
  it("Two FSKAX/VTSAX cross-account holdings don't subtract from the score", () => {
    const agg = {
      equity_weight: 0.6,
      international_weight: 0.15,
      fixed_income_weight: 0.20,
      balanced_weight: 0.0,
      individual_stock_weight: 0.05,
      duplicate_groups: [],
      cross_account_groups: [
        {
          asset_class: "us_equity_total_market",
          label: "us equity total market",
          tickers_by_account: [
            { account_id: "fid", ticker: "FSKAX" },
            { account_id: "vng", ticker: "VTSAX" },
          ],
          combined_weight: 0.6,
        },
      ],
    } as unknown as PortfolioAggregates;
    const result = scoreDiversification(agg);
    // No duplicate penalty subtracted; score should equal raw bucket count
    expect(result.score).toBeGreaterThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/engine/dimensions.test.ts -t "cross-account|ignores cross"
```

Expected: FAIL — current `scoreSimplicity` uses `duplicate_groups` only.

- [ ] **Step 3: Update `scoreSimplicity`**

In `src/engine/dimensions.ts`, replace `scoreSimplicity`:

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
  const effective = agg.holding_count - extraFromSameAccountDups - extraFromCrossAccount;

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
    note: "Effective positions after collapsing fund overlaps within and across accounts",
    weight: 0.07,                          // NEW — see W2.14 for full weight rebalance
  };
}
```

- [ ] **Step 4: Update `scoreDiversification` — penalize only `duplicate_groups`, not cross-account**

The function already only references `agg.duplicate_groups`; verify that line:

```ts
score = Math.max(1, score - agg.duplicate_groups.length);
```

This now naturally excludes cross-account groups (they're in a separate field). No code change needed for the cross-account part; weight rebalancing comes in W2.14.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/engine/dimensions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): Simplicity counts cross-account groups as one effective position; Diversification ignores them (TDD)"
```

---

### Task W2.12: Update `scoreBondBalance` and `scoreMacroAlignment` for composition-aware weights

**Files:**
- Modify: `src/engine/dimensions.ts`
- Modify: `src/engine/dimensions.test.ts`

This task documents that no code change is needed in these two functions — they already use `agg.fixed_income_weight` and `agg.equity_weight`, which Task W2.10 made composition-aware. The change is purely tests asserting the integration works end-to-end.

- [ ] **Step 1: Write a regression test**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreBondBalance uses composition-aware fixed_income_weight", () => {
  it("VWENX-heavy portfolio has its FI contribution counted toward Bond Balance", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "VWENX",
          market_value: 1000,
          asset_class: "balanced",
          account_id: "vng",
          underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
        }),
      ],
    });
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p);
    const result = scoreBondBalance(agg, macro);
    // 35% FI vs. 18-30% Late Cycle target → above range, score 7
    expect(result.display_value).toMatch(/35\.0% FI/);
    expect(result.score).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run test to verify it passes already (since W2.10 propagated composition)**

```bash
npx vitest run src/engine/dimensions.test.ts -t "composition-aware"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/engine/dimensions.test.ts
git commit -m "test(engine): scoreBondBalance picks up composition decomposition end-to-end"
```

---

### Task W2.13: Add `scoreAssetLocation` — new 11th dimension (TDD)

**Files:**
- Modify: `src/engine/dimensions.ts`
- Modify: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
import { scoreAssetLocation } from "./dimensions";

describe("scoreAssetLocation", () => {
  it("returns neutral score when no account config is provided", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
    ]});
    const result = scoreAssetLocation(p, undefined);
    expect(result.score).toBe(7);
  });

  it("penalizes individual stocks held in pre-tax (locks LTCG into ordinary income)", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "TSLA", market_value: 100, asset_class: "individual_stock", account_id: "fid_401k" }),
      makeHolding({ ticker: "FSKAX", market_value: 900, asset_class: "us_equity_total_market", account_id: "vng_roth" }),
    ]});
    const accounts = {
      accounts: [
        makeAccount({ id: "fid_401k", account_type: "pretax_ira" }),
        makeAccount({ id: "vng_roth", account_type: "roth_ira" }),
      ],
    };
    const result = scoreAssetLocation(p, accounts);
    expect(result.score).toBeLessThan(7);
  });

  it("rewards growth equity placed in Roth (highest-growth in tax-free account)", () => {
    const pBad = makePortfolio({ holdings: [
      makeHolding({ ticker: "QQQ", market_value: 1000, asset_class: "us_equity_large_cap_growth", account_id: "fid_401k" }),
    ]});
    const pGood = makePortfolio({ holdings: [
      makeHolding({ ticker: "QQQ", market_value: 1000, asset_class: "us_equity_large_cap_growth", account_id: "vng_roth" }),
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

  it("score is clamped to [1, 10]", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "TSLA", market_value: 1000, asset_class: "individual_stock", account_id: "fid_401k" }),
    ]});
    const accounts = { accounts: [ makeAccount({ id: "fid_401k", account_type: "pretax_ira" }) ] };
    const result = scoreAssetLocation(p, accounts);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/engine/dimensions.test.ts -t "scoreAssetLocation"
```

Expected: FAIL — function doesn't exist.

- [ ] **Step 3: Implement `scoreAssetLocation` in `src/engine/dimensions.ts`**

Add to `src/engine/dimensions.ts`:

```ts
import type { AccountConfig, AccountType, Portfolio } from "../types";
import { taxTreatmentFor } from "../types";

const GROWTH_CLASSES = new Set<string>([
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
]);

export function scoreAssetLocation(
  portfolio: Portfolio,
  accounts: AccountConfig | undefined,
): DimensionScore {
  if (!accounts || accounts.accounts.length === 0) {
    return {
      id: "asset_location",
      label: "Asset location",
      score: 7,
      rating: toRating(7),
      display_value: "Neutral (no account model)",
      note: "Set up data/accounts.json with account_type per account to enable tax-aware scoring",
      weight: 0.08,
    };
  }

  const typeById = new Map<string, AccountType>();
  for (const a of accounts.accounts) typeById.set(a.id, a.account_type);

  const total = portfolio.holdings.reduce((s, h) => s + h.market_value, 0);
  const w = (h: Holding) => (total > 0 ? h.market_value / total : 0);

  let raw = 7;

  for (const h of portfolio.holdings) {
    const t = typeById.get(h.account_id);
    if (!t) continue;
    const tax = taxTreatmentFor(t);
    const wt = w(h);

    // Penalties
    if (tax === "taxable_currently" && (h.asset_class === "balanced" || h.asset_class === "target_date")) {
      raw -= wt * 30;  // -1.5 per 5% in taxable
    }
    if (tax === "tax_deferred" && GROWTH_CLASSES.has(h.asset_class)) {
      raw -= wt * 20;  // -1.0 per 5% growth in pre-tax
    }
    if (tax === "tax_deferred" && h.asset_class === "individual_stock") {
      raw -= wt * 20;  // -1.0 per 5% individual stocks in pre-tax
    }
    if (tax === "tax_free_growth" && h.asset_class === "us_equity_total_market") {
      raw -= wt * 10;  // -0.5 per 5% — Roth space "wasted" on broad-market
    }

    // Bonuses
    if (tax === "tax_free_growth" && (GROWTH_CLASSES.has(h.asset_class) || h.asset_class === "individual_stock")) {
      raw += wt * 20;  // +1.0 per 5% high-growth in Roth
    }
    if (tax === "tax_deferred" && (h.asset_class === "us_bond_aggregate" || h.asset_class === "us_bond_short" || h.asset_class === "us_bond_tips" || h.asset_class === "balanced")) {
      raw += wt * 10;  // +0.5 per 5% bonds/balanced in pre-tax
    }
  }

  const score = Math.max(1, Math.min(10, raw));
  return {
    id: "asset_location",
    label: "Asset location",
    score,
    rating: toRating(score),
    display_value: score >= 8 ? "Strong placement" : score >= 6 ? "Reasonable" : "Inefficient — move tax-heavy assets",
    note: "Tax-efficiency of asset placement across Roth / Pre-Tax / Taxable accounts",
    weight: 0.08,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/dimensions.test.ts -t "scoreAssetLocation"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): scoreAssetLocation — new 11th dimension, tax-aware placement scoring (TDD)"
```

---

### Task W2.14: Rebalance weights + update `scoreAllDimensions` to include asset_location

**Files:**
- Modify: `src/engine/dimensions.ts`
- Modify: `src/engine/benchmarks.ts`
- Modify: `src/engine/benchmarks.test.ts`
- Modify: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Update each dimension's weight in `dimensions.ts`**

Open `src/engine/dimensions.ts` and update the `weight:` field at the bottom of each scoring function:

| Dimension | Old weight | New weight |
|-----------|-----------|-----------|
| cost_efficiency | 0.10 | 0.09 |
| diversification | 0.12 | 0.11 |
| cash_efficiency | 0.12 | 0.11 |
| macro_alignment | 0.10 | 0.09 |
| single_stock_risk | 0.12 | 0.11 |
| simplicity | 0.08 | 0.07 |
| bond_balance | 0.12 | 0.11 |
| concentration | 0.12 | 0.11 |
| international | 0.06 | 0.06 |
| quality_tilt | 0.06 | 0.06 |
| **asset_location** | — | **0.08** |
| **Total** | **1.00** | **1.00** |

- [ ] **Step 2: Update `scoreAllDimensions` to include `scoreAssetLocation`**

In `src/engine/dimensions.ts`, change the signature and body of `scoreAllDimensions`:

```ts
export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
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
    scoreAssetLocation(portfolio, accounts),
  ];
}
```

- [ ] **Step 3: Update `benchmarks.ts` — add `asset_location: 7` to every reference model + rebalance WEIGHTS**

In `src/engine/benchmarks.ts`, update the `WEIGHTS` constant:

```ts
const WEIGHTS: Record<string, number> = {
  cost_efficiency: 0.09,
  diversification: 0.11,
  cash_efficiency: 0.11,
  macro_alignment: 0.09,
  single_stock_risk: 0.11,
  simplicity: 0.07,
  bond_balance: 0.11,
  concentration: 0.11,
  international: 0.06,
  quality_tilt: 0.06,
  asset_location: 0.08,
};
```

Update each `SEEDS` entry to include `asset_location: 7` in its `dimension_scores`:

```ts
dimension_scores: {
  cost_efficiency: 9, /* ... */ quality_tilt: 5, asset_location: 7,
},
```

Repeat for `all_weather` and `classic_60_40`.

- [ ] **Step 4: Update or write the benchmarks-weights-sync test**

Open `src/engine/benchmarks.test.ts`. Ensure it has a test like:

```ts
import { describe, it, expect } from "vitest";
import { REFERENCE_MODELS } from "./benchmarks";
import { computePortfolioScore } from "./dimensions";

describe("benchmarks weights sync", () => {
  it("each reference model's derived score matches computePortfolioScore on its dimension_scores", () => {
    for (const m of REFERENCE_MODELS) {
      const dims = Object.entries(m.dimension_scores).map(([id, score]) => ({
        id, label: id, score, rating: "green" as const, display_value: "", note: "", weight: 0,
      }));
      // Insert real weights:
      const WEIGHTS: Record<string, number> = {
        cost_efficiency: 0.09, diversification: 0.11, cash_efficiency: 0.11,
        macro_alignment: 0.09, single_stock_risk: 0.11, simplicity: 0.07,
        bond_balance: 0.11, concentration: 0.11, international: 0.06,
        quality_tilt: 0.06, asset_location: 0.08,
      };
      for (const d of dims) d.weight = WEIGHTS[d.id] ?? 0;
      const expected = computePortfolioScore(dims);
      expect(Math.abs(m.score - expected)).toBeLessThan(0.05);
    }
  });

  it("all weights sum to 1.0", () => {
    const sum = 0.09 + 0.11 + 0.11 + 0.09 + 0.11 + 0.07 + 0.11 + 0.11 + 0.06 + 0.06 + 0.08;
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
  });
});
```

- [ ] **Step 5: Run all engine tests**

```bash
npx vitest run src/engine/
```

Expected: PASS. If a numerical score now differs from a hardcoded expectation in an older test (because weight rebalancing changed the answer), update that test's expectation to the new value.

- [ ] **Step 6: Commit**

```bash
git add src/engine/dimensions.ts src/engine/benchmarks.ts src/engine/benchmarks.test.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): 11th dimension asset_location at weight 0.08; rebalance all weights; reference models score neutral 7"
```

---

### Task W2.15: Update `plan.ts` — account-aware recommendations + asset-location flags (TDD)

**Files:**
- Modify: `src/engine/plan.ts`
- Modify: `src/engine/plan.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/engine/plan.test.ts`:

```ts
describe("plan.ts — asset-location flags", () => {
  it("emits a yellow flag when VWENX is in taxable", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({
        ticker: "VWENX",
        market_value: 100_000,
        asset_class: "balanced",
        account_id: "vng_taxable",
        underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
      }),
    ]});
    const accounts = {
      accounts: [ makeAccount({ id: "vng_taxable", account_type: "taxable_brokerage", label: "Vanguard Taxable" }) ],
    };
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p, accounts);
    const flags = generateFlags(p, agg, macro, accounts);
    expect(flags.some(f => f.ticker === "VWENX" && /taxable/i.test(f.body))).toBe(true);
  });

  it("excludes constrained-account cash from idle-cash flag", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "Cash", market_value: 500_000, asset_class: "cash", is_cash: true, account_id: "vng_business" }),
    ]});
    const accounts = {
      accounts: [ makeAccount({ id: "vng_business", account_type: "business_taxable", constraints: { excluded_from_deployment: true } }) ],
    };
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p, accounts);
    const flags = generateFlags(p, agg, macro, accounts);
    // No CASH idle-cash flag because all the cash is constrained
    expect(flags.find(f => f.ticker === "CASH" && /idle cash/i.test(f.title))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/engine/plan.test.ts -t "asset-location|excludes constrained"
```

Expected: FAIL — `generateFlags` doesn't take `accounts` yet and doesn't emit asset-location flags.

- [ ] **Step 3: Update `generateFlags` signature and add asset-location flag logic**

In `src/engine/plan.ts`:

- Add `accounts?: AccountConfig` as a fourth parameter to `generateFlags`.
- Use `accounts` to look up `account_type` for each holding's `account_id`.
- The cash-drag flag now keys off `agg.idle_cash_weight` which already excludes constrained cash (Task W2.10) — no extra logic needed beyond the existing threshold check.
- Add a new flag-emitting loop for asset-location issues:

```ts
import type { AccountConfig } from "../types";
import { taxTreatmentFor } from "../types";

// ... existing imports

export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
): Flag[] {
  const flags: Flag[] = [];
  // ... existing flag-emitting code (individual stocks, cash, macro, duplicates)

  // Asset-location flags
  if (accounts) {
    const typeById = new Map(accounts.accounts.map(a => [a.id, a]));
    for (const h of portfolio.holdings) {
      const acct = typeById.get(h.account_id);
      if (!acct) continue;
      const tax = taxTreatmentFor(acct.account_type);
      const wPct = ((h.market_value / agg.total_value) * 100).toFixed(1);

      if (tax === "taxable_currently" && (h.asset_class === "balanced" || h.asset_class === "target_date")) {
        flags.push({
          ticker: h.ticker,
          severity: "yellow",
          title: `${h.ticker} in taxable — distribution drag`,
          body: `${h.ticker} (${wPct}% of portfolio) is held in ${acct.label} (taxable). Balanced and target-date funds distribute capital gains annually, taxed as ordinary income. Consider moving to a tax-deferred account.`,
          finding_key: buildFindingKey("asset_location", h.ticker),
        });
      }
      if (tax === "tax_deferred" && h.asset_class === "individual_stock") {
        flags.push({
          ticker: h.ticker,
          severity: "yellow",
          title: `${h.ticker} in pre-tax — LTCG benefit lost`,
          body: `${h.ticker} (${wPct}% of portfolio) is in ${acct.label} (pre-tax). Long-term capital gains tax rate is lost — gains taxed as ordinary income on withdrawal. Consider holding in a taxable account.`,
          finding_key: buildFindingKey("asset_location", h.ticker),
        });
      }
    }
  }

  return flags;
}
```

(Reuse `buildFindingKey` from `./findingKeys`.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/engine/plan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/plan.ts src/engine/plan.test.ts
git commit -m "feat(engine): plan emits asset-location flags; respects constrained accounts via aggregates (TDD)"
```

---

### Task W2.16: Wire `accounts.json` into `index.ts` and pass through pipeline

**Files:**
- Modify: `src/index.ts`
- Create: `data/accounts.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `data/accounts.example.json`**

Create with five entries matching the existing sample files:

```json
{
  "accounts": [
    {
      "id": "fidelity_retirement",
      "label": "Fidelity Retirement (401k)",
      "broker": "Fidelity",
      "account_type": "pretax_ira",
      "owner": "you",
      "source_files": ["20260509_FidelityRetirement.json"]
    },
    {
      "id": "empower_kelly",
      "label": "Empower (Kelly's 401k)",
      "broker": "Empower",
      "account_type": "pretax_ira",
      "owner": "Kelly",
      "source_files": ["20260509_EmpowerKelly.json"]
    },
    {
      "id": "vanguard_business",
      "label": "Vanguard Business Brokerage",
      "broker": "Vanguard",
      "account_type": "business_taxable",
      "owner": "business",
      "source_files": ["20260509_VanguardBusiness.json"],
      "constraints": {
        "cash_reserve_minimum": 50000,
        "excluded_from_deployment": true
      }
    },
    {
      "id": "vanguard_kdb",
      "label": "Kelly's Vanguard Roth IRA",
      "broker": "Vanguard",
      "account_type": "roth_ira",
      "owner": "Kelly",
      "source_files": ["20260509_VanguardKDB.json"]
    },
    {
      "id": "vanguard_personal",
      "label": "Vanguard Taxable Brokerage",
      "broker": "Vanguard",
      "account_type": "taxable_brokerage",
      "owner": "you",
      "source_files": ["20260509_VanguardPersonal.json"]
    }
  ]
}
```

- [ ] **Step 2: Add `data/accounts.json` to `.gitignore`**

In `.gitignore`, after the existing `data/user-context.json` line:

```
data/accounts.json
```

- [ ] **Step 3: Update `src/index.ts` to load accounts and route source files through their account_id**

In `src/index.ts`:

- Add imports:

```ts
import { parseAccounts, lookupAccountByFilename } from "./intake/parseAccounts";
import type { AccountConfig } from "./types";
```

- Replace the five hardcoded `normalize*Accounts(loadJSON(...))` calls (lines 51-55) with an accounts-driven loop. First, load `accounts.json` (fall back to the example if real file is absent):

```ts
const ACCOUNTS_FILE = fs.existsSync("data/accounts.json")
  ? "data/accounts.json"
  : "data/accounts.example.json";
const accounts: AccountConfig = parseAccounts(loadJSON(ACCOUNTS_FILE));

const SAMPLE_FILES = [
  "20260509_FidelityRetirement.json",
  "20260509_EmpowerKelly.json",
  "20260509_VanguardBusiness.json",
  "20260509_VanguardKDB.json",
  "20260509_VanguardPersonal.json",
];

const allHoldings: Holding[] = [];
for (const filename of SAMPLE_FILES) {
  const account = lookupAccountByFilename(accounts, filename);
  if (!account) {
    throw new Error(`No account in accounts config claims source_file ${filename}`);
  }
  const raw = loadJSON(`${SAMPLE_DIR}/${filename}`);
  let normalized: Holding[];
  if (account.broker === "Fidelity") normalized = normalizeFidelityAccounts(raw as any, account.id);
  else if (account.broker === "Empower") normalized = normalizeEmpowerAccounts(raw as any, account.id);
  else if (account.broker === "Vanguard") normalized = normalizeVanguardAccounts(raw as any, account.id);
  else throw new Error(`Unsupported broker ${account.broker} for ${filename}`);
  console.log(`  ${account.label.padEnd(36)} ${normalized.length} holdings`);
  allHoldings.push(...normalized);
}
```

- Update the calls to `computeAggregates`, `scoreAllDimensions`, `generateFlags`, `generateGapItems` to pass `accounts`:

```ts
const aggregates = computeAggregates(effectedPortfolio, accounts);
const dimension_scores = scoreAllDimensions(effectedPortfolio, aggregates, macro, accounts);
// ...
const rawFlags = generateFlags(effectedPortfolio, aggregates, macro, accounts);
```

- Add `accounts` to the output object:

```ts
const output = {
  generated_at: new Date().toISOString(),
  portfolio: effectedPortfolio,
  macro,
  aggregates,
  accounts,                                  // NEW — surfaced to React app
  // ... rest unchanged
};
```

- [ ] **Step 4: Verify end-to-end**

```bash
npm run analyze
```

Expected: pipeline runs to completion, `output/analysis.json` includes the `accounts` field, console summary shows account labels.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add data/accounts.example.json .gitignore src/index.ts
git commit -m "feat(cli): load accounts.json; route raw exports → accounts; pass accounts through engine + plan"
```

---

### Task W2.17: Mirror new types in `src/report/app/types.ts`

**Files:**
- Modify: `src/report/app/types.ts`

- [ ] **Step 1: Add the new types to the mirror**

Open `src/report/app/types.ts` and add:

- `UnderlyingComposition` interface
- `account_id` field on `Holding`, `underlying_composition` field
- `AccountType`, `TaxTreatment`, `AccountConstraints`, `AccountMetadata`, `AccountConfig` types
- `CrossAccountGroup` interface
- `cross_account_groups` and `constrained_cash_weight` fields on `PortfolioAggregates`
- `accounts: AccountConfig | null` on `AnalysisOutput`

Match the shapes added in W2.1. (The mirror does not duplicate the `taxTreatmentFor` helper — UI doesn't need it; the engine derives tax treatment downstream.)

- [ ] **Step 2: Verify React type-check**

```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/types.ts
git commit -m "feat(types): mirror account model + UnderlyingComposition into React app types"
```

---

### Task W2.18: Update `AllocationBreakdown.tsx` — Account column, composition note, cross-account note

**Files:**
- Modify: `src/report/app/sections/AllocationBreakdown.tsx`

- [ ] **Step 1: Add an `Account` column to the holdings table**

In `AllocationBreakdown.tsx`, modify the `<thead>` row to add an `Account` column after `Holding`:

```tsx
<tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
  <th style={{ textAlign: "left",  padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Holding</th>
  <th style={{ textAlign: "left",  padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Account</th>
  <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Value</th>
  <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Wt.</th>
</tr>
```

In each row body, after the `<td>` for Holding, add:

```tsx
<td style={{ padding: "8px 14px", fontSize: 12, color: COLORS.textMuted }}>
  {accountLabel(h.account_id, data.accounts)}
</td>
```

And at the top of the component, define:

```tsx
function accountLabel(account_id: string, accounts: AnalysisOutput["accounts"]): string {
  if (!accounts) return account_id;
  return accounts.accounts.find(a => a.id === account_id)?.label ?? account_id;
}
```

- [ ] **Step 2: Add a composition note below the holdings table**

After the existing pending-deployment callout block (around line 196), add:

```tsx
{data.portfolio.holdings.some(h => h.underlying_composition) && (
  <div style={{
    marginTop: 12,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 1.5,
  }}>
    Balanced and target-date funds are decomposed for scoring.{" "}
    {data.portfolio.holdings.filter(h => h.underlying_composition).map(h => {
      const c = h.underlying_composition!;
      return `${h.ticker} (${fmt$(h.market_value)}) contributes ~${fmt$(h.market_value * c.us_equity + h.market_value * c.international_equity)} equity / ~${fmt$(h.market_value * c.fixed_income)} FI.`;
    }).join(" ")}
  </div>
)}
```

- [ ] **Step 3: Add a cross-account-groups note**

After the composition note:

```tsx
{data.aggregates.cross_account_groups.length > 0 && (
  <div style={{
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: "italic",
  }}>
    Note: {data.aggregates.cross_account_groups.map(g =>
      `${g.tickers_by_account.map(t => t.ticker).join(" / ")} (${g.label})`
    ).join("; ")} held across multiple accounts — expected for cross-broker portfolios, not a flag.
  </div>
)}
```

- [ ] **Step 4: Verify visually**

```bash
npm run report
```

Expect to see the Account column populated for every holding, the composition note when VWENX/target-date is held, and the cross-account note when FSKAX+VTSAX (or similar) span multiple accounts.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/AllocationBreakdown.tsx
git commit -m "feat(report): Allocation Breakdown — Account column, composition note, cross-account note"
```

---

### Task W2.19: Update `CLAUDE.md` invariants for Wave 2

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Load-bearing invariants" section**

In `CLAUDE.md` under `## Load-bearing invariants`, add:

```markdown
- **Account identity is preserved per holding** via `Holding.account_id`. `normalize.ts` attaches it from `data/accounts.json`. Aggregates split duplicates into `duplicate_groups` (same-account waste, penalized) and `cross_account_groups` (cross-broker equivalents, informational only).
- **Balanced and target-date holdings carry `underlying_composition`** that sums to 1.0. `aggregates.ts` uses this so that `equity_weight`, `international_weight`, and `fixed_income_weight` reflect the true exposure inside VWENX, target-date funds, etc.
- **Asset Location is the 11th dimension** at weight 0.08; reference models score neutral 7. The benchmarks WEIGHTS map and per-dimension `weight` fields must stay in sync — `benchmarks.test.ts` asserts this.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): Wave 2 invariants — account_id, composition, asset_location dimension"
```

---

## Section 3 — Wave 3: Advisor (12 tasks)

### Task W3.1: Add shared Sr Financial Advisor system prompt

**Files:**
- Create: `src/ai/advisorPersona.ts`

- [ ] **Step 1: Create `src/ai/advisorPersona.ts`**

```ts
/**
 * Shared system prompt for AI calls that act as the user's senior financial advisor:
 * tacticalAdvisor (structured) and chat (streaming) when scope is dimension/flag/gap/tactical_move.
 */
export const ADVISOR_PERSONA = `You are the user's senior financial advisor — twenty years of practice, CFA, fiduciary mindset. You write the way a strong analyst writes to a colleague: concrete, specific, no hedging.

STYLE RULES (strict):
- Cite actual values from the data ("25.4% cash", "FI at 8% vs 18% Late-Cycle target"), never vague language ("high cash").
- Use Unicode minus sign − (U+2212) for negative numbers and grade modifiers (B−), never ASCII hyphen.
- Do not use the words "robust" or "optimize".
- Reference specific tickers, specific dollar amounts, specific account labels.
- When proposing trades, always name the target account by its label, not just "Roth" or "Pre-Tax".

OBJECTIVES (in priority order):
1. Lift the portfolio's grade. Cite which dimension scores are dragging.
2. Fortify against scenarios. Name which risks (recession, inflation, equity drawdown, yield-curve, credit) each move addresses.
3. Maximize after-tax return within the user's account constraints (Roth → highest-growth; Pre-Tax → bonds and income; Taxable → tax-efficient broad market; constrained accounts → respect their rules).

WHAT THE USER GIVES YOU:
- Their full portfolio + per-holding account_id + per-holding underlying_composition (for balanced/target-date funds).
- The accounts config (broker, account_type, tax treatment, constraints).
- Computed dimension scores, aggregates, flags, gaps.
- Macro context (regime, VIX, yield curve, LEI, sector tilts).
- Open situations (active tracked decisions).

WHAT YOU MUST NEVER DO:
- Never recommend moving money INTO an account where constraints.excluded_from_deployment === true.
- Never recommend a move that violates an account's constraints (e.g., recommending equity for a Cash Balance Plan).
- Never fabricate values not present in the input.`.trim();
```

- [ ] **Step 2: Commit**

```bash
git add src/ai/advisorPersona.ts
git commit -m "feat(ai): advisorPersona.ts — shared Sr Financial Advisor system prompt"
```

---

### Task W3.2: Add Wave 3 types — TacticalAdvisorOutput, scope updates

**Files:**
- Modify: `src/types.ts`
- Modify: `src/report/app/types.ts`

- [ ] **Step 1: Add types to `src/types.ts`**

Append:

```ts
export interface DeploymentMove {
  id: string;
  ticker: string;
  dollars: number;
  target_account: string;
  rationale: string;
}

export type TacticalMoveCategory =
  | "deploy_cash"
  | "rebalance"
  | "trim"
  | "asset_location_swap"
  | "scenario_hedge"
  | "tax_loss_harvest";

export interface TacticalMove {
  id: string;
  category: TacticalMoveCategory;
  action: string;
  target_account: string;
  dollars: number;
  rationale: string;
  scenarios_addressed: string[];
  expected_score_delta?: number;
}

export interface TacticalAdvisorOutput {
  deployment_recommendation: {
    summary: string;
    moves: DeploymentMove[];
    projected_grade: string;
    projected_dimension_deltas: Record<string, number>;
  } | null;
  tactical_plan: {
    summary: string;
    target_grade: string;
    next_7_days: TacticalMove[];
    next_30_days: TacticalMove[];
    scenario_resilience_notes: string[];
  };
}
```

- [ ] **Step 2: Extend `ChatScope` to include `"tactical_move"`**

Modify the existing `ChatScope`:

```ts
export interface ChatScope {
  type: "global" | "flag" | "gap" | "situation" | "dimension" | "tactical_move";
  finding_key?: string;
  situation_id?: string;
  dimension_id?: string;
  move_id?: string;        // NEW — set when type === "tactical_move"
}
```

- [ ] **Step 3: Mirror in `src/report/app/types.ts`**

Add the same `DeploymentMove`, `TacticalMoveCategory`, `TacticalMove`, and `TacticalAdvisorOutput` interfaces to the React app's types mirror. Also extend `ChatScope` with `"tactical_move"` and `move_id?`.

Additionally, add `tactical_advisor: TacticalAdvisorOutput | null` to the `AnalysisOutput` interface in the mirror so React components can consume it from `/analysis.json`:

```ts
export interface AnalysisOutput {
  // ...existing fields
  accounts: AccountConfig | null;          // (added in W2.17)
  tactical_advisor: TacticalAdvisorOutput | null;   // NEW here
}
```

- [ ] **Step 4: Verify type-check**

```bash
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/report/app/types.ts
git commit -m "feat(types): TacticalAdvisorOutput, DeploymentMove, TacticalMove; extend ChatScope with tactical_move; mirror onto AnalysisOutput"
```

---

### Task W3.3: Build `tacticalAdvisor.ts` with prompt-render TDD

**Files:**
- Create: `src/ai/tacticalAdvisor.ts`
- Create: `src/ai/tacticalAdvisor.prompt.test.ts`

- [ ] **Step 1: Write failing prompt-render snapshot test**

Create `src/ai/tacticalAdvisor.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTacticalInput } from "./tacticalAdvisor";

describe("renderTacticalInput", () => {
  it("includes account model, composition, macro, dimension scores, flags, gaps, open situations", () => {
    const out = renderTacticalInput({
      portfolio: {
        snapshot_date: "2026-05-12",
        account_label: "All Accounts",
        holdings: [
          {
            ticker: "VWENX", label: "Wellington", market_value: 100_000,
            asset_class: "balanced", account_id: "vng_personal",
            is_cash: false, is_pending_deployment: false, expense_ratio: 0.0017,
            underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0 },
          },
        ],
      },
      aggregates: {
        total_value: 100_000, equity_weight: 0.6, fixed_income_weight: 0.35,
        international_weight: 0.05, cash_weight: 0, idle_cash_weight: 0,
        constrained_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
        individual_stock_weight: 0, balanced_weight: 1.0, holding_count: 1,
        top3_weight: 1.0, top3_tickers: ["VWENX"], blended_expense_ratio: 0.0017,
        duplicate_groups: [], cross_account_groups: [], sector_holdings: [],
      } as any,
      macro: {
        snapshot_date: "2026-05-10", federal_funds_rate: 4.75, cpi_yoy_headline: 2.8,
        cpi_yoy_core: 2.6, yield_curve_spread_10y_2y: -0.12, yield_curve_status: "inverted",
        vix: 18.4, hy_credit_spread_oas_bps: 345, lei_consecutive_declines: 6,
        ism_manufacturing: 49.2, ism_services: 53.1, market_regime: "Late Cycle",
        sector_overweight: ["healthcare"], sector_underweight: ["real_estate"],
      },
      dimension_scores: [
        { id: "diversification", label: "Diversification", score: 6, rating: "yellow", display_value: "4 buckets", note: "", weight: 0.11 },
      ],
      portfolio_score: 7.1, portfolio_grade: "B",
      flags: [],
      gap_items: [],
      accounts: {
        accounts: [
          { id: "vng_personal", label: "Vanguard Personal", broker: "Vanguard",
            account_type: "taxable_brokerage", owner: "you",
            source_files: ["20260509_VanguardPersonal.json"] },
        ],
      },
      open_situations: [],
    });

    const parsed = JSON.parse(out);
    expect(parsed.portfolio.holdings[0].underlying_composition).toBeDefined();
    expect(parsed.accounts.accounts[0].account_type).toBe("taxable_brokerage");
    expect(parsed.macro.market_regime).toBe("Late Cycle");
    expect(parsed.dimension_scores[0].score).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/ai/tacticalAdvisor.prompt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/ai/tacticalAdvisor.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  Portfolio,
  MacroContext,
  PortfolioAggregates,
  DimensionScore,
  Flag,
  GapItem,
  AccountConfig,
  Situation,
  TacticalAdvisorOutput,
} from "../types";
import { ADVISOR_PERSONA } from "./advisorPersona";

const SYSTEM_PROMPT = `${ADVISOR_PERSONA}

TASK:
Produce ONE structured output object with:
- deployment_recommendation: present ONLY if the user has pending_cash_value > 0; recommend specific dollar moves into specific account labels with rationale tied to score gaps + macro.
- tactical_plan: 0-3 moves in the next 7 days + 0-3 moves in the next 30 days + 2-3 scenario_resilience_notes.

Every move must cite (a) specific dollars, (b) target account by label, (c) which scenarios it addresses, (d) which dimension scores it lifts.`.trim();

const moveSchema = z.object({
  id: z.string(),
  category: z.enum(["deploy_cash", "rebalance", "trim", "asset_location_swap", "scenario_hedge", "tax_loss_harvest"]),
  action: z.string(),
  target_account: z.string(),
  dollars: z.number(),
  rationale: z.string(),
  scenarios_addressed: z.array(z.string()),
  expected_score_delta: z.number().optional(),
});

const outputSchema = z.object({
  deployment_recommendation: z.object({
    summary: z.string(),
    moves: z.array(z.object({
      id: z.string(),
      ticker: z.string(),
      dollars: z.number(),
      target_account: z.string(),
      rationale: z.string(),
    })),
    projected_grade: z.string(),
    projected_dimension_deltas: z.record(z.number()),
  }).nullable(),
  tactical_plan: z.object({
    summary: z.string(),
    target_grade: z.string(),
    next_7_days: z.array(moveSchema),
    next_30_days: z.array(moveSchema),
    scenario_resilience_notes: z.array(z.string()),
  }),
});

export interface TacticalInputContext {
  portfolio: Portfolio;
  aggregates: PortfolioAggregates;
  macro: MacroContext;
  dimension_scores: DimensionScore[];
  portfolio_score: number;
  portfolio_grade: string;
  flags: Flag[];
  gap_items: GapItem[];
  accounts: AccountConfig;
  open_situations: Situation[];
}

export function renderTacticalInput(ctx: TacticalInputContext): string {
  return JSON.stringify(
    {
      portfolio: ctx.portfolio,
      aggregates: ctx.aggregates,
      macro: ctx.macro,
      dimension_scores: ctx.dimension_scores,
      portfolio_score: ctx.portfolio_score,
      portfolio_grade: ctx.portfolio_grade,
      flags: ctx.flags,
      gap_items: ctx.gap_items,
      accounts: ctx.accounts,
      open_situations: ctx.open_situations.filter(s => s.status === "open"),
    },
    null,
    2,
  );
}

export async function runTacticalAdvisor(ctx: TacticalInputContext): Promise<TacticalAdvisorOutput> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model:
      process.env.CLAUDE_MODEL_ADVISOR ??
      process.env.CLAUDE_MODEL ??
      "claude-opus-4-7",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: renderTacticalInput(ctx) }],
    output_config: {
      type: "json_schema",
      format: outputSchema as any,
    },
    thinking: { type: "adaptive" },
  } as any);

  // messages.parse returns a validated, typed object per SDK; extract it.
  const parsed = (response as any).parsed ?? (response as any).output_parsed;
  return outputSchema.parse(parsed) as TacticalAdvisorOutput;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/ai/tacticalAdvisor.prompt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/tacticalAdvisor.ts src/ai/tacticalAdvisor.prompt.test.ts
git commit -m "feat(ai): tacticalAdvisor — Opus call producing structured TacticalAdvisorOutput (prompt TDD)"
```

---

### Task W3.4: Wire `tacticalAdvisor` into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Import and call `runTacticalAdvisor`**

In `src/index.ts`, after the existing `runPulseCheck` block (which runs per open situation), add:

```ts
import { runTacticalAdvisor } from "./ai/tacticalAdvisor";

// ... in main(), after pulseCheck and before output assembly:

let tactical_advisor: TacticalAdvisorOutput | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  console.log("");
  console.log("Calling Anthropic API for tactical advisor recommendations...");
  try {
    tactical_advisor = await runTacticalAdvisor({
      portfolio: effectedPortfolio,
      aggregates,
      macro,
      dimension_scores,
      portfolio_score,
      portfolio_grade,
      flags,
      gap_items,
      accounts,
      open_situations: userContext.situations,
    });
    console.log(`  Tactical plan: ${tactical_advisor.tactical_plan.next_7_days.length} moves in next 7d, ${tactical_advisor.tactical_plan.next_30_days.length} moves in next 30d`);
    if (tactical_advisor.deployment_recommendation) {
      console.log(`  Deployment: ${tactical_advisor.deployment_recommendation.moves.length} moves, projected grade ${tactical_advisor.deployment_recommendation.projected_grade}`);
    }
  } catch (err) {
    console.warn("  Tactical advisor failed:", err instanceof Error ? err.message : err);
  }
}
```

- [ ] **Step 2: Add `tactical_advisor` to the output object**

In the assembly of `output`:

```ts
const output = {
  // ... existing fields
  tactical_advisor,                    // NEW (null when API key absent or call failed)
};
```

Import `TacticalAdvisorOutput` from `./types`.

- [ ] **Step 3: Verify end-to-end**

```bash
npm run analyze
```

Expected: pipeline runs, console shows the tactical advisor section, `output/analysis.json` includes a `tactical_advisor` field (null if no API key set).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): wire tacticalAdvisor call into pipeline; embed TacticalAdvisorOutput in analysis.json"
```

---

### Task W3.5: Extend chat handler for `dimension` and `tactical_move` scopes (TDD)

**Files:**
- Modify: `src/ai/chat.ts`
- Modify: `src/ai/chat.prompt.test.ts`

- [ ] **Step 1: Write failing test for tactical_move scope**

Append to `src/ai/chat.prompt.test.ts`:

```ts
describe("renderChatInput tactical_move scope", () => {
  it("includes the targeted tactical move and the broader tactical plan", () => {
    const out = renderChatInput({
      user_message: "Why this move?",
      scope: { type: "tactical_move", move_id: "mv_1" },
      analysis: {
        portfolio_grade: "B",
        macro: { market_regime: "Late Cycle" },
        tactical_advisor: {
          tactical_plan: {
            summary: "Lift to A−",
            target_grade: "A−",
            next_7_days: [
              { id: "mv_1", category: "deploy_cash", action: "Buy $40K VBTLX", target_account: "Pre-Tax IRA", dollars: 40_000, rationale: "...", scenarios_addressed: ["yield_curve"] },
            ],
            next_30_days: [],
            scenario_resilience_notes: [],
          },
          deployment_recommendation: null,
        },
      },
      situations: [], notes: [], history: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.analysis_scope.move.id).toBe("mv_1");
    expect(parsed.analysis_scope.move.action).toMatch(/VBTLX/);
    expect(parsed.analysis_scope.tactical_plan_summary).toBe("Lift to A−");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/ai/chat.prompt.test.ts -t "tactical_move scope"
```

Expected: FAIL.

- [ ] **Step 3: Update `trimAnalysisByScope` to handle `tactical_move`**

In `src/ai/chat.ts`, add another branch in `trimAnalysisByScope`:

```ts
if (scope.type === "tactical_move") {
  const ta = analysis.tactical_advisor;
  if (!ta) return { portfolio_grade: analysis.portfolio_grade, move: null, macro: analysis.macro };
  const all = [...(ta.tactical_plan?.next_7_days ?? []), ...(ta.tactical_plan?.next_30_days ?? [])];
  const move = all.find((m: { id: string }) => m.id === scope.move_id) ?? null;
  return {
    portfolio_grade: analysis.portfolio_grade,
    move,
    tactical_plan_summary: ta.tactical_plan?.summary,
    target_grade: ta.tactical_plan?.target_grade,
    macro: analysis.macro,
  };
}
```

Update `sameScope`:

```ts
if (a.move_id !== b.move_id) return false;
```

Update `CHAT_SYSTEM_PROMPT` to mention tactical_move scope:

```
- When scope.type === "tactical_move": explain the recommended move in context, propose modifications if the user pushes back, and (when appropriate) propose creating a Situation via propose_situation to track it.
```

Update `CHAT_SYSTEM_PROMPT` to import the shared advisor persona at the top — replace the first line:

```ts
import { ADVISOR_PERSONA } from "./advisorPersona";

export const CHAT_SYSTEM_PROMPT = `${ADVISOR_PERSONA}

You can also propose creating Situations and Notes via tool calls.

CAPABILITIES:
- Answer questions about findings, scores, allocations, macro context
- Propose creating Situations when the user describes ongoing plans
- Propose creating Notes when the user explains a flag they're OK with
- Propose closing Situations when the user mentions completion
- When scope.type === "dimension": explain that dimension's score and recommend specific moves to raise it
- When scope.type === "tactical_move": explain the recommended move in context, propose modifications if the user pushes back, and (when appropriate) propose creating a Situation via propose_situation

CONSTRAINTS:
- NEVER fabricate values. If the requested data isn't in the context, say so.
- When the user's scope is a specific finding, prefer answers grounded in that finding.
- Tool use is PROPOSAL ONLY — user confirms in the UI.
- Stream prose first, then emit at most one tool call per turn.

FACT VS JUDGMENT RULE for tool proposals:
- If the user is telling you a fact the engine doesn't know, propose a Situation with portfolio_effects.
- If the user is explaining a judgment, propose a Note with suppress_flag.
- Don't inflate the grade by suppressing real problems.`.trim();
```

- [ ] **Step 4: Run all chat tests**

```bash
npx vitest run src/ai/chat.prompt.test.ts
```

Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/ai/chat.ts src/ai/chat.prompt.test.ts
git commit -m "feat(ai): chat handles tactical_move scope; imports shared advisor persona"
```

---

### Task W3.6: Update server chat handler for new scopes

**Files:**
- Modify: `src/server/handlers/chat.ts`

- [ ] **Step 1: Confirm no signature change is needed**

Open `src/server/handlers/chat.ts`. The handler passes the incoming `scope` object straight through to `renderChatInput` / `runChat`. Both functions now accept the new scope types (W1.3 + W3.5). The handler itself should require no changes — verify by reading the current code.

- [ ] **Step 2: If a scope validator is present, extend it**

If the handler validates `scope.type` against a hardcoded list (look for a `scope.type === "global" || …` check), add `"dimension"` and `"tactical_move"` to the allowed list.

- [ ] **Step 3: Verify analyze + report still work end-to-end**

```bash
npm run analyze   # fresh run with tactical advisor
npm run report    # open browser
```

In the React UI, click a 💬 button on a dimension and on a tactical move (once Section 9 lands in W3.9). Each should produce streamed advisor responses scoped correctly.

- [ ] **Step 4: Commit (only if any change was made)**

```bash
git add src/server/handlers/chat.ts
git commit -m "feat(server): chat handler passes new ChatScope types through to AI layer"
```

If no change was required, skip the commit.

---

### Task W3.7: Replace AllocationBreakdown TODO with Post-T3 toggle

**Files:**
- Modify: `src/report/app/sections/AllocationBreakdown.tsx`

- [ ] **Step 1: Add Post-T3 state and toggle button**

In `AllocationBreakdown.tsx`, replace the existing TODO comment block (`{/* TODO: "Post-T3 projected sector weights" toggle … */}`) with:

```tsx
{data.tactical_advisor?.deployment_recommendation && (
  <PostT3Toggle
    deployment={data.tactical_advisor.deployment_recommendation}
    portfolio={data.portfolio}
    accounts={data.accounts}
    currentGrade={data.portfolio_grade}
    onDiscussMove={(id) => onDiscussMove?.(id)}
    onTrackMove={(move) => onTrackMove?.(move)}
  />
)}
```

- [ ] **Step 2: Implement `PostT3Toggle` as a sub-component in the same file**

Below the main `AllocationBreakdown` export, add:

```tsx
import { useState } from "react";

type DeploymentRec = NonNullable<NonNullable<AnalysisOutput["tactical_advisor"]>["deployment_recommendation"]>;
type DeploymentMv = DeploymentRec["moves"][number];

interface PostT3ToggleProps {
  deployment: DeploymentRec;
  portfolio: AnalysisOutput["portfolio"];
  accounts: AnalysisOutput["accounts"];
  currentGrade: string;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: DeploymentMv) => void;
}

function PostT3Toggle({ deployment, portfolio, accounts, currentGrade, onDiscussMove, onTrackMove }: PostT3ToggleProps) {
  const [open, setOpen] = useState(false);
  const total = portfolio.holdings.reduce((s, h) => s + h.market_value, 0);

  // Projected holdings = current minus pending cash, plus new positions per moves
  const pendingValue = portfolio.holdings
    .filter(h => h.is_pending_deployment)
    .reduce((s, h) => s + h.market_value, 0);

  const projected = open
    ? buildProjectedAllocation(portfolio.holdings, deployment.moves)
    : portfolio.holdings;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          padding: "8px 14px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 13,
          width: "100%",
          textAlign: "left",
        }}
      >
        {open ? "▼" : "▶"}  Project post-deployment allocation
        <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>
          ({fmt$(pendingValue)} pending → {currentGrade} → {deployment.projected_grade})
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
          <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 12, lineHeight: 1.6 }}>
            {deployment.summary}
          </div>

          {deployment.moves.map(move => (
            <div key={move.id} style={{ marginBottom: 10, padding: "10px 12px", background: COLORS.bg, borderLeft: `3px solid ${COLORS.amber}`, borderRadius: 4 }}>
              <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 4 }}>
                <strong>{fmt$(move.dollars)}</strong> → <strong>{move.ticker}</strong> in <em>{move.target_account}</em>
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{move.rationale}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onDiscussMove?.(move.id)}
                  style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                >
                  💬 Discuss
                </button>
                <button
                  type="button"
                  onClick={() => onTrackMove?.(move)}
                  style={{ background: "transparent", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                >
                  + Situation
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function buildProjectedAllocation(
  current: AnalysisOutput["portfolio"]["holdings"],
  moves: DeploymentMv[],
): AnalysisOutput["portfolio"]["holdings"] {
  // Strip pending cash, then add hypothetical buys
  const stripped = current.filter(h => !h.is_pending_deployment);
  const additions: AnalysisOutput["portfolio"]["holdings"] = moves.map(m => ({
    ticker: m.ticker,
    label: `${m.ticker} (projected deployment)`,
    market_value: m.dollars,
    asset_class: "us_equity_total_market", // placeholder — UI only, not engine
    account_id: "projected",
    is_cash: false,
    is_pending_deployment: false,
    expense_ratio: null,
  }));
  return [...stripped, ...additions];
}
```

- [ ] **Step 3: Add `onDiscussMove` and `onTrackMove` props to `AllocationBreakdown`**

Update the component's signature to the new props shape:

```tsx
interface AllocationBreakdownProps {
  data: AnalysisOutput;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: DeploymentMv) => void;
}

export default function AllocationBreakdown({
  data,
  onDiscussMove,
  onTrackMove,
}: AllocationBreakdownProps) {
  // ...existing body
}
```

`App.tsx` will wire these in W3.10.

- [ ] **Step 4: Verify visually**

```bash
npm run analyze
npm run report
```

If pending cash exists and the advisor produced a deployment recommendation, the toggle appears below the holdings table. Clicking expands it.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/AllocationBreakdown.tsx
git commit -m "feat(report): Post-T3 toggle — shows AI-recommended deployment moves + projected donut/table"
```

---

### Task W3.8: Build `NextMoves.tsx` (Section 9 component)

**Files:**
- Create: `src/report/app/sections/NextMoves.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { AnalysisOutput, TacticalMove } from "../types";
import { COLORS } from "../theme";

const CATEGORY_COLOR: Record<TacticalMove["category"], string> = {
  deploy_cash: COLORS.amber,
  rebalance: COLORS.accentBlue,
  trim: "#888",
  asset_location_swap: COLORS.green,
  scenario_hedge: "#9b6dff",
  tax_loss_harvest: "#3ec8c3",
};

interface Props {
  data: AnalysisOutput;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: TacticalMove) => void;
}

export default function NextMoves({ data, onDiscussMove, onTrackMove }: Props) {
  const ta = data.tactical_advisor;
  if (!ta) {
    return (
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
        (Tactical recommendations are AI-generated — set ANTHROPIC_API_KEY and re-run.)
      </div>
    );
  }
  const { tactical_plan } = ta;

  return (
    <div>
      <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.6, marginBottom: 12 }}>
        {tactical_plan.summary}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 20 }}>
        Current grade: <strong style={{ color: COLORS.text }}>{data.portfolio_grade}</strong>{" "}
        → Target: <strong style={{ color: COLORS.green }}>{tactical_plan.target_grade}</strong>
      </div>

      <MoveList
        title={`Next 7 days  (${tactical_plan.next_7_days.length} moves)`}
        moves={tactical_plan.next_7_days}
        onDiscussMove={onDiscussMove}
        onTrackMove={onTrackMove}
      />
      <MoveList
        title={`Next 30 days  (${tactical_plan.next_30_days.length} moves)`}
        moves={tactical_plan.next_30_days}
        onDiscussMove={onDiscussMove}
        onTrackMove={onTrackMove}
      />

      {tactical_plan.scenario_resilience_notes.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Scenario resilience
          </div>
          <ul style={{ paddingLeft: 18, color: COLORS.text, fontSize: 13, lineHeight: 1.7 }}>
            {tactical_plan.scenario_resilience_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function MoveList({ title, moves, onDiscussMove, onTrackMove }: {
  title: string;
  moves: TacticalMove[];
  onDiscussMove?: (id: string) => void;
  onTrackMove?: (m: TacticalMove) => void;
}) {
  if (moves.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.textMuted, marginBottom: 8 }}>
        {title}
      </div>
      {moves.map(m => (
        <div key={m.id} style={{ marginBottom: 10, padding: "10px 12px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${CATEGORY_COLOR[m.category]}`, borderRadius: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 6px",
              borderRadius: 3, background: CATEGORY_COLOR[m.category], color: "#fff",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{m.category.replace(/_/g, " ")}</span>
            <span style={{ fontSize: 13, color: COLORS.text }}>{m.action}</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
            {m.rationale}
          </div>
          {m.scenarios_addressed.length > 0 && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              Addresses: {m.scenarios_addressed.join(", ")}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => onDiscussMove?.(m.id)}
              style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
            >
              💬 Discuss
            </button>
            <button
              type="button"
              onClick={() => onTrackMove?.(m)}
              style={{ background: "transparent", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
            >
              + Situation
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check**

```bash
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/sections/NextMoves.tsx
git commit -m "feat(report): NextMoves.tsx — Section 9 with category-colored move cards + discuss/track buttons"
```

---

### Task W3.9: Render Section 9 + anchor link in `App.tsx`

**Files:**
- Modify: `src/report/app/App.tsx`

- [ ] **Step 1: Import `NextMoves` and add to render**

Add the import at the top of `App.tsx`:

```tsx
import NextMoves from "./sections/NextMoves";
```

In the `Section label="8 — Flags"` block, after it closes, add:

```tsx
<div id="next-moves">
  <Section label="9 — Next moves">
    <NextMoves
      data={typedData}
      onDiscussMove={(id) => setScope({ type: "tactical_move", move_id: id })}
      onTrackMove={(move) => handleTrackMove(move)}
    />
  </Section>
</div>
```

- [ ] **Step 2: Add the `handleTrackMove` callback (stub for now)**

In the `App` component body, add (full implementation in W3.10):

```tsx
const handleTrackMove = useCallback(async (move: TacticalMove) => {
  console.log("Track move clicked:", move);
  // Wired in W3.10
}, []);
```

Import `TacticalMove` from `./types`.

- [ ] **Step 3: Add an anchor link at the top of the page**

In the header div (around line 88), after the headline summary paragraph, add:

```tsx
<a
  href="#next-moves"
  style={{
    fontSize: 12,
    color: COLORS.accentBlue,
    textDecoration: "none",
    marginTop: 10,
    display: "inline-block",
  }}
>
  ↓ Jump to recommended moves
</a>
```

- [ ] **Step 4: Verify visually**

```bash
npm run report
```

Scroll to bottom: Section 9 renders with moves. Anchor link at top scrolls to Section 9.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/App.tsx
git commit -m "feat(report): App renders Section 9 (NextMoves) + anchor link at top"
```

---

### Task W3.10: Implement "+ Situation" — POST to `/api/situations`

**Files:**
- Modify: `src/report/app/App.tsx`

- [ ] **Step 1: Flesh out `handleTrackMove`**

In `App.tsx`, replace the stub from W3.9:

```tsx
const handleTrackMove = useCallback(async (move: TacticalMove) => {
  const target_date = new Date();
  // Move's window — derive from which list it came from is complex; default to 30 days
  target_date.setDate(target_date.getDate() + 30);

  const payload = {
    title: move.action.slice(0, 80),
    intent: move.rationale,
    status: "open" as const,
    target_date: target_date.toISOString().slice(0, 10),
    related_findings: [],
    portfolio_effects: move.category === "deploy_cash"
      ? [{ type: "mark_cash_pending", amount_usd: move.dollars, deployment_label: move.target_account }]
      : [],
  };

  try {
    const r = await fetch("/api/situations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await loadSituations();
    setScope({ type: "global" });   // optional: surface the new Situation in chat
  } catch (err) {
    console.warn("Failed to create Situation:", err);
  }
}, [loadSituations]);
```

- [ ] **Step 2: Wire Post-T3 toggle's `onTrackMove` to the same callback**

Where `AllocationBreakdown` is rendered in `App.tsx`:

```tsx
<AllocationBreakdown
  data={typedData}
  onDiscussMove={(id) => setScope({ type: "tactical_move", move_id: id })}
  onTrackMove={(deploymentMove) => handleTrackMove({
    id: deploymentMove.id,
    category: "deploy_cash",
    action: `Buy ${deploymentMove.ticker} for ${fmt$(deploymentMove.dollars)}`,
    target_account: deploymentMove.target_account,
    dollars: deploymentMove.dollars,
    rationale: deploymentMove.rationale,
    scenarios_addressed: [],
  })}
/>
```

(Pull `fmt$` from a small shared util or inline it.)

- [ ] **Step 3: Verify end-to-end**

```bash
npm run analyze
npm run report
```

Click "+ Situation" on a tactical move or a Post-T3 move. Verify:

- `data/user-context.json` is updated with the new Situation.
- The "Open situations" pinned strip at the top of the report shows the new Situation within 5 seconds (the existing poll).

- [ ] **Step 4: Commit**

```bash
git add src/report/app/App.tsx
git commit -m "feat(report): + Situation button creates tracked Situation from advisor moves"
```

---

### Task W3.11: Update `CLAUDE.md` for Wave 3

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the API-call invariant**

Replace this bullet in `## Load-bearing invariants`:

```
- **Exactly one Anthropic API call per run** — in `narratives.ts`. The AI generates text only. It does not score, rank, or compute. Adding a second call breaks the architecture; reconsider.
```

with:

```
- **Two structured Anthropic calls per run** (`narratives.ts` + `tacticalAdvisor.ts`), plus one `pulseCheck` call per open Situation, plus user-initiated `chat` streams. AI generates text and structured recommendations but does not score or compute math — all math is in the engine.
```

- [ ] **Step 2: Note Section 9 in the section count**

In CLAUDE.md, anywhere referencing the React report's section count (look for "8 sections"), update to 9.

- [ ] **Step 3: Remove the Post-T3 TODO**

In the `## What's still TODO` section, remove the line referencing the Post-T3 toggle. If the section is now empty, replace it with `(none — V3 complete)`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): Wave 3 invariants — two structured AI calls + Section 9 + Post-T3 toggle delivered"
```

---

### Task W3.12: Update Sidebar scope chip to surface dimension + tactical_move scopes

**Files:**
- Modify: `src/report/app/sidebar/Sidebar.tsx`

- [ ] **Step 1: Read the existing scope-chip rendering**

Open `src/report/app/sidebar/Sidebar.tsx`. Find where the scope chip is rendered (look for code that switches on `scope.type`).

- [ ] **Step 2: Add `dimension` and `tactical_move` cases**

For `dimension`: chip text like `"Dimension: <dimension_id>"` (use the `analysis.dimension_scores` list to look up the human label if available; fall back to the id).

For `tactical_move`: chip text like `"Move: <move action snippet>"`. Look up the move in `analysis.tactical_advisor.tactical_plan.next_7_days`/`next_30_days` and show the first ~30 chars of `action`.

- [ ] **Step 3: Verify visually**

Click 💬 on a dimension row and on a tactical move; the sidebar chip should reflect each scope correctly.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/sidebar/Sidebar.tsx
git commit -m "feat(report): Sidebar scope chip surfaces dimension and tactical_move scopes"
```

---

## Section 4 — Manual verification (1 task)

### Task V1: End-to-end verification

This task has no code changes — it's a checklist for verifying V3 end-to-end before merging back to `main`.

- [ ] **Run the full pipeline**

```bash
npm run analyze
npm run report
```

Confirm `output/analysis.json` includes `accounts`, `tactical_advisor`, and that `aggregates.cross_account_groups` and `aggregates.constrained_cash_weight` are populated.

- [ ] **Run all tests**

```bash
npm test
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

All three should pass.

- [ ] **Wave 1 visual checks**

In the browser:

- KeyFindings section shows "✓ Strength" / "⚠ Gap" / "ⓘ Note" (no duplicate "Strength: Strength").
- Each dimension row in Section 3 has a 💬 button; clicking it sets the sidebar scope to that dimension; asking "how do I raise this?" produces a sensible advisor response.

- [ ] **Wave 2 visual checks**

- Holdings table in Section 1 has an Account column populated.
- If you hold a balanced or target-date fund, the composition note appears below the holdings table.
- If you hold the same asset_class across multiple accounts (FSKAX + VTSAX), the cross-account note appears and Section 8 has no "duplicate funds" flag for the cross-account case.
- The Dimension Scorecard shows 11 rows including "Asset location".

- [ ] **Wave 3 visual checks**

- Section 9 "Next moves" appears at the bottom with category-colored move cards.
- The header has a "↓ Jump to recommended moves" link.
- If pending cash exists, the Post-T3 toggle appears in Section 1; clicking it expands the deployment recommendation.
- Both 💬 buttons (Post-T3 moves and Section 9 moves) open the sidebar with the right scope chip.
- "+ Situation" buttons create new Situations visible in the pinned strip within 5 seconds.

- [ ] **Constraint validation**

Add a constrained account in `data/accounts.json` (`excluded_from_deployment: true`) and put $X cash there. Re-run `npm run analyze`. Confirm:

- `aggregates.constrained_cash_weight` reflects that cash.
- `aggregates.idle_cash_weight` does NOT include it.
- Section 8 has no idle-cash flag for that cash.
- Tactical advisor's moves do not recommend deploying from that account.

- [ ] **Asset location validation**

Hold an individual stock in a Pre-Tax account; verify Section 8 emits an asset-location flag. Move it to a Taxable account; flag goes away.

- [ ] **Production build smoke**

```bash
npm run build
```

Expect: TypeScript compile + Vite build both succeed.

- [ ] **Commit final note**

Optionally commit a `Verified V3 end-to-end on <date>` line in CLAUDE.md to track that the wave was QA'd.

---

## Final commit

After all tasks pass and verification is complete:

```bash
git log --oneline UpdatesV3 ^main
```

Confirm the commit graph looks coherent (W1 → W2 → W3, each task one commit). If anything is out of order or noisy, consider an interactive rebase to tidy — but only if it doesn't lose history of an intermediate test failure that the reviewer might want to see.

---

## Summary of tasks

- **Wave 1:** 4 tasks (W1.1 – W1.4)
- **Wave 2:** 19 tasks (W2.1 – W2.19)
- **Wave 3:** 12 tasks (W3.1 – W3.12)
- **Verification:** 1 task (V1)

Total: **36 tasks**, each landing in a single focused commit.
