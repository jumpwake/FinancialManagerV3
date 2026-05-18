# User Profile (Age + Risk Tolerance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a user's age and 5-level risk tolerance, persist it per-user in `user-context.json`, and let it drive the engine's analysis — adapting the fixed-income target, re-tuning four dimension ladders, and dropping `bond_balance` from grading entirely for aggressive (or young-and-aggressive) investors.

**Architecture:** A new pure module `src/engine/riskProfile.ts` turns `UserProfile | null` + `MacroContext` into a `ScoringProfile` (active dimensions, FI target, tuning knobs). The 5 affected scorers and the plan generators consume the `ScoringProfile`. `computePortfolioScore` and the benchmark builder renormalize across the active dimension set so a dropped dimension does not distort the 0–10 scale. The profile is entered through a form in the React report, written by a new `/api/profile` handler. When no profile is present, every code path falls back to today's behavior exactly.

**Tech Stack:** TypeScript 5.4 (strict, ESM), Vitest 1.x, Vite 5.x (React report), zod ^3.22 (intake) / zod v4 (AI schemas), `@anthropic-ai/sdk` ^0.95.

---

## File structure

**Created:**
- `src/engine/riskProfile.ts` — pure: `ScoringProfile`, `deriveScoringProfile`, `NEUTRAL_SCORING_PROFILE`, FI-target tables (moved here from `dimensions.ts`).
- `src/engine/riskProfile.test.ts` — unit tests for the above.
- `src/server/handlers/profile.ts` — `GET`/`PUT /api/profile` handler.
- `src/report/app/sections/ProfilePanel.tsx` — profile card + edit form.

**Modified:**
- `src/types.ts` — `RiskTolerance`, `UserProfile`, `UserContext` v2.
- `src/intake/parseUserContext.ts` (+`.test.ts`) — v1→v2 migration, `UserProfileSchema`.
- `src/engine/dimensions.ts` (+`.test.ts`) — 5 scorers consume `ScoringProfile`; `scoreAllDimensions` filters; `computePortfolioScore` renormalizes; FI tables moved out.
- `src/engine/benchmarks.ts` (+`.test.ts`) — `REFERENCE_MODELS` → `buildReferenceModels(activeIds)`.
- `src/engine/plan.ts` — flag/gap/phase generators consume `ScoringProfile`.
- `src/index.ts` — wire `deriveScoringProfile` through the pipeline; emit `profile` + `dropped_dimensions`.
- `src/server/vitePlugin.ts` — register `/api/profile`.
- `src/report/app/types.ts` — mirror new types + `AnalysisOutput` fields.
- `src/report/app/App.tsx` — render `ProfilePanel`.
- `src/report/app/sections/DimensionScorecard.tsx` — muted "not graded" rows.
- `src/report/app/sections/RadarChart.tsx` — plot only active dimensions.
- `src/ai/narratives.ts`, `src/ai/tacticalAdvisor.ts`, `src/ai/chat.ts` — pass `profile` into context.

**Conventions:** test files are co-located (`foo.ts` ↔ `foo.test.ts`). Fixture builders are in `tests/fixtures/`. Engine + intake follow TDD; the CLI (`index.ts`), server handlers, and React UI are verified manually per `CLAUDE.md`. After every task run **both** TypeScript projects:
```
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

---

## Task 1: Types + UserContext v1→v2 migration

**Files:**
- Modify: `src/types.ts:323-328`
- Modify: `src/intake/parseUserContext.ts`
- Test: `src/intake/parseUserContext.test.ts`

- [ ] **Step 1: Add the profile types to `src/types.ts`**

Replace the `UserContext` interface (currently at `src/types.ts:323-328`) with:

```ts
export type RiskTolerance =
  | "conservative"
  | "moderately_conservative"
  | "moderate"
  | "moderately_aggressive"
  | "aggressive";

export interface UserProfile {
  age: number;                  // integer 18–100 (validated in parseUserContext)
  risk_tolerance: RiskTolerance;
}

export interface UserContext {
  version: 2;
  profile: UserProfile | null;  // null = not yet captured
  situations: Situation[];
  notes: Note[];
  chat_history: ChatMessage[];
}
```

- [ ] **Step 2: Write the failing migration tests**

In `src/intake/parseUserContext.test.ts`, change the first test (`accepts an empty context shape`) so its body reads:

```ts
  it("migrates a version-1 context to version 2 with a null profile", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(2);
    expect(ctx.profile).toBeNull();
    expect(ctx.situations).toEqual([]);
  });
```

Then add these tests inside the `describe("parseUserContext", ...)` block:

```ts
  it("accepts a version-2 context with a populated profile", () => {
    const ctx = parseUserContext({
      version: 2,
      profile: { age: 42, risk_tolerance: "moderately_aggressive" },
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(2);
    expect(ctx.profile).toEqual({ age: 42, risk_tolerance: "moderately_aggressive" });
  });

  it("accepts a version-2 context with a null profile", () => {
    const ctx = parseUserContext({
      version: 2,
      profile: null,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.profile).toBeNull();
  });

  it("rejects a profile with an out-of-range age", () => {
    expect(() =>
      parseUserContext({
        version: 2,
        profile: { age: 12, risk_tolerance: "moderate" },
        situations: [],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });

  it("rejects a profile with an unknown risk_tolerance", () => {
    expect(() =>
      parseUserContext({
        version: 2,
        profile: { age: 40, risk_tolerance: "extreme" },
        situations: [],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/intake/parseUserContext.test.ts`
Expected: FAIL — the migration test gets `version: 1` (no migration yet), and v2-shaped inputs fail the `version: z.literal(1)` schema.

- [ ] **Step 4: Implement the v2 schema + migration in `src/intake/parseUserContext.ts`**

Replace the `UserContextSchema` declaration and the `parseUserContext` / `emptyUserContext` functions (currently `src/intake/parseUserContext.ts:85-98`) with:

```ts
const UserProfileSchema = z.object({
  age: z.number().int().min(18).max(100),
  risk_tolerance: z.enum([
    "conservative",
    "moderately_conservative",
    "moderate",
    "moderately_aggressive",
    "aggressive",
  ]),
});

export const UserContextSchema = z.object({
  version: z.literal(2),
  profile: UserProfileSchema.nullable(),
  situations: z.array(SituationSchema),
  notes: z.array(NoteSchema),
  chat_history: z.array(ChatMessageSchema),
});

/** Migrate a pre-feature version-1 context to version 2 in memory. */
function migrateToV2(input: unknown): unknown {
  if (
    input !== null &&
    typeof input === "object" &&
    (input as { version?: unknown }).version === 1
  ) {
    return { ...(input as object), version: 2, profile: null };
  }
  return input;
}

export function parseUserContext(input: unknown): UserContext {
  return UserContextSchema.parse(migrateToV2(input)) as UserContext;
}

export function emptyUserContext(): UserContext {
  return { version: 2, profile: null, situations: [], notes: [], chat_history: [] };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/intake/parseUserContext.test.ts`
Expected: PASS — all tests, including the unchanged `rejects unknown version` (version 99 is not migrated and fails `z.literal(2)`) and the `emptyUserContext` round-trip.

- [ ] **Step 6: Verify both TypeScript projects compile**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. (The React mirror is updated in Task 13; the root project must be clean now.)

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/intake/parseUserContext.ts src/intake/parseUserContext.test.ts
git commit -m "feat(types): add UserProfile + UserContext v2 with v1 migration"
```

---

## Task 2: `riskProfile.ts` — FI target + null fallback

**Files:**
- Create: `src/engine/riskProfile.ts`
- Create: `src/engine/riskProfile.test.ts`
- Modify: `src/engine/dimensions.ts:167-174` (remove the FI tables), `src/engine/dimensions.ts:1-2` and `:176-178` (import them from `riskProfile`)
- Modify: `src/engine/plan.ts:2` (import the FI tables from `riskProfile`)

This task moves `FI_TARGETS_BY_REGIME` / `DEFAULT_FI_TARGET` into the new module so `riskProfile.ts` has no dependency on `dimensions.ts` (clean layering — `dimensions.ts` depends on `riskProfile.ts`, never the reverse). The drop rule and tuning knobs are stubbed neutral here and completed in Task 3.

- [ ] **Step 1: Write the failing tests in `src/engine/riskProfile.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { deriveScoringProfile, NEUTRAL_SCORING_PROFILE, ALL_DIMENSION_IDS } from "./riskProfile";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import type { UserProfile } from "../types";

describe("deriveScoringProfile — null profile fallback", () => {
  it("activates all 11 dimensions with neutral knobs", () => {
    const sp = deriveScoringProfile(null, makeMacro());
    expect(sp.activeDimensionIds.size).toBe(11);
    expect(sp.droppedDimensions).toEqual([]);
    expect(sp.cashLeniency).toBe(1);
    expect(sp.concentrationShift).toBe(0);
    expect(sp.singleStockPenaltyScale).toBe(1);
    expect(sp.qualityTiltRelaxed).toBe(false);
  });

  it("uses the regime FI target when there is no profile", () => {
    const sp = deriveScoringProfile(null, makeMacro({ market_regime: "Late Cycle" }));
    expect(sp.fiTarget).toEqual({ min: 0.18, max: 0.30 });
  });

  it("NEUTRAL_SCORING_PROFILE activates all 11 dimensions", () => {
    expect(NEUTRAL_SCORING_PROFILE.activeDimensionIds.size).toBe(ALL_DIMENSION_IDS.length);
    expect(ALL_DIMENSION_IDS.length).toBe(11);
  });
});

describe("deriveScoringProfile — FI target age glide path (Moderately Conservative, Mid Cycle)", () => {
  // Moderately Conservative shift = +0.05; Mid Cycle nudge = 0; range = center ± 0.05.
  const macro = makeMacro({ market_regime: "Mid Cycle" });
  const mc = (age: number): UserProfile => ({ age, risk_tolerance: "moderately_conservative" });

  it("age 29 → band center 0.05 → fiTarget {0.05, 0.15}", () => {
    expect(deriveScoringProfile(mc(29), macro).fiTarget).toEqual({ min: 0.05, max: 0.15 });
  });
  it("age 30 → band center 0.12 → fiTarget {0.12, 0.22}", () => {
    expect(deriveScoringProfile(mc(30), macro).fiTarget).toEqual({ min: 0.12, max: 0.22 });
  });
  it("age 49 → band center 0.20 → fiTarget {0.20, 0.30}", () => {
    expect(deriveScoringProfile(mc(49), macro).fiTarget).toEqual({ min: 0.20, max: 0.30 });
  });
  it("age 50 → band center 0.28 → fiTarget {0.28, 0.38}", () => {
    expect(deriveScoringProfile(mc(50), macro).fiTarget).toEqual({ min: 0.28, max: 0.38 });
  });
  it("age 70 → band center 0.42 → fiTarget {0.42, 0.52}", () => {
    expect(deriveScoringProfile(mc(70), macro).fiTarget).toEqual({ min: 0.42, max: 0.52 });
  });
});

describe("deriveScoringProfile — FI target risk + regime shifts", () => {
  it("Conservative at age 45 in Mid Cycle: 0.20 + 0.10 → {0.25, 0.35}", () => {
    const sp = deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, makeMacro({ market_regime: "Mid Cycle" }));
    expect(sp.fiTarget).toEqual({ min: 0.25, max: 0.35 });
  });
  it("Recession nudges the center up by 0.05", () => {
    const sp = deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, makeMacro({ market_regime: "Recession" }));
    expect(sp.fiTarget).toEqual({ min: 0.30, max: 0.40 });
  });
  it("clamps the center at 0 — a low band + negative shifts never goes below {0, 0.05}", () => {
    const sp = deriveScoringProfile({ age: 25, risk_tolerance: "moderately_aggressive" }, makeMacro({ market_regime: "Early Cycle" }));
    // 0.05 - 0.06 - 0.03 = -0.04 → clamped to 0 → range {0, 0.05}
    expect(sp.fiTarget).toEqual({ min: 0, max: 0.05 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/riskProfile.test.ts`
Expected: FAIL with "Failed to resolve import './riskProfile'".

- [ ] **Step 3: Create `src/engine/riskProfile.ts`**

```ts
import type { UserProfile, MacroContext, RiskTolerance } from "../types";

/** Every dimension the engine can score. The single source of truth for the full set. */
export const ALL_DIMENSION_IDS = [
  "cost_efficiency",
  "diversification",
  "cash_efficiency",
  "macro_alignment",
  "single_stock_risk",
  "simplicity",
  "bond_balance",
  "concentration",
  "international",
  "quality_tilt",
  "asset_location",
] as const;

/** Regime-only FI targets — used when there is no user profile. */
export const FI_TARGETS_BY_REGIME: Record<string, { min: number; max: number }> = {
  "Late Cycle": { min: 0.18, max: 0.30 },
  "Mid Cycle": { min: 0.15, max: 0.25 },
  "Early Cycle": { min: 0.10, max: 0.20 },
  "Recession": { min: 0.25, max: 0.40 },
};

export const DEFAULT_FI_TARGET = { min: 0.15, max: 0.25 };

export interface DroppedDimension {
  id: string;
  label: string;
  reason: string;
}

export interface ScoringProfile {
  activeDimensionIds: Set<string>;
  droppedDimensions: DroppedDimension[];
  fiTarget: { min: number; max: number };
  cashLeniency: number;            // multiplier on idle-cash thresholds
  concentrationShift: number;      // pp (as a fraction) added to top-3 thresholds
  singleStockPenaltyScale: number; // multiplier on single-stock penalties
  qualityTiltRelaxed: boolean;
}

/** A context-free neutral profile — the default for scorers when none is threaded in. */
export const NEUTRAL_SCORING_PROFILE: ScoringProfile = {
  activeDimensionIds: new Set(ALL_DIMENSION_IDS),
  droppedDimensions: [],
  fiTarget: DEFAULT_FI_TARGET,
  cashLeniency: 1,
  concentrationShift: 0,
  singleStockPenaltyScale: 1,
  qualityTiltRelaxed: false,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Round to cents to avoid binary-float noise in the target range. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ageBandCenterFI(age: number): number {
  if (age < 30) return 0.05;
  if (age < 40) return 0.12;
  if (age < 50) return 0.20;
  if (age < 60) return 0.28;
  if (age < 70) return 0.36;
  return 0.42;
}

const RISK_FI_SHIFT: Record<RiskTolerance, number> = {
  conservative: 0.10,
  moderately_conservative: 0.05,
  moderate: 0,
  moderately_aggressive: -0.06,
  aggressive: 0, // unused — bond_balance is dropped for aggressive
};

const REGIME_FI_NUDGE: Record<string, number> = {
  "Recession": 0.05,
  "Late Cycle": 0.02,
  "Mid Cycle": 0,
  "Early Cycle": -0.03,
};

function computeFiTarget(profile: UserProfile, macro: MacroContext): { min: number; max: number } {
  const center = clamp(
    ageBandCenterFI(profile.age) +
      RISK_FI_SHIFT[profile.risk_tolerance] +
      (REGIME_FI_NUDGE[macro.market_regime] ?? 0),
    0,
    0.55,
  );
  return { min: round2(Math.max(0, center - 0.05)), max: round2(center + 0.05) };
}

export function deriveScoringProfile(
  profile: UserProfile | null,
  macro: MacroContext,
): ScoringProfile {
  if (profile === null) {
    return {
      activeDimensionIds: new Set(ALL_DIMENSION_IDS),
      droppedDimensions: [],
      fiTarget: FI_TARGETS_BY_REGIME[macro.market_regime] ?? DEFAULT_FI_TARGET,
      cashLeniency: 1,
      concentrationShift: 0,
      singleStockPenaltyScale: 1,
      qualityTiltRelaxed: false,
    };
  }

  // Drop rule + tuning knobs are completed in Task 3 — neutral stubs for now.
  return {
    activeDimensionIds: new Set(ALL_DIMENSION_IDS),
    droppedDimensions: [],
    fiTarget: computeFiTarget(profile, macro),
    cashLeniency: 1,
    concentrationShift: 0,
    singleStockPenaltyScale: 1,
    qualityTiltRelaxed: false,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/riskProfile.test.ts`
Expected: PASS — all tests.

- [ ] **Step 5: Move the FI tables out of `dimensions.ts`**

In `src/engine/dimensions.ts`, **delete** the `FI_TARGETS_BY_REGIME` and `DEFAULT_FI_TARGET` declarations (currently lines 167-174).

Then update `scoreBondBalance` (line 178) so it reads the tables from the new module. Change the import block at the top of `dimensions.ts` — after the existing `import { ... } from "../types";` line, add:

```ts
import { FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET } from "./riskProfile";
```

`scoreBondBalance` already references `FI_TARGETS_BY_REGIME` and `DEFAULT_FI_TARGET` — they now resolve to the import. No body change needed in this task.

- [ ] **Step 6: Update the `plan.ts` import**

In `src/engine/plan.ts`, change line 2 from:

```ts
import { scoreToGrade, FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET } from "./dimensions";
```

to:

```ts
import { scoreToGrade } from "./dimensions";
import { FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET } from "./riskProfile";
```

- [ ] **Step 7: Run the full engine test suite + typecheck**

Run: `npx vitest run src/engine && npx tsc --noEmit`
Expected: PASS — moving the tables is behavior-neutral; all existing engine tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/riskProfile.ts src/engine/riskProfile.test.ts src/engine/dimensions.ts src/engine/plan.ts
git commit -m "feat(engine): add riskProfile module with FI target + null fallback"
```

---

## Task 3: `riskProfile.ts` — drop rule + tuning knobs

**Files:**
- Modify: `src/engine/riskProfile.ts` (the non-null branch of `deriveScoringProfile`)
- Test: `src/engine/riskProfile.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/riskProfile.test.ts`:

```ts
describe("deriveScoringProfile — bond_balance drop rule", () => {
  const macro = makeMacro();
  const active = (p: UserProfile) => deriveScoringProfile(p, macro).activeDimensionIds.has("bond_balance");

  it("drops bond_balance for an aggressive investor at any age", () => {
    expect(active({ age: 55, risk_tolerance: "aggressive" })).toBe(false);
  });
  it("drops bond_balance for an under-35 moderately-aggressive investor", () => {
    expect(active({ age: 34, risk_tolerance: "moderately_aggressive" })).toBe(false);
  });
  it("drops bond_balance for an under-35 moderate investor", () => {
    expect(active({ age: 30, risk_tolerance: "moderate" })).toBe(false);
  });
  it("keeps bond_balance for a 35-year-old moderate investor (boundary)", () => {
    expect(active({ age: 35, risk_tolerance: "moderate" })).toBe(true);
  });
  it("keeps bond_balance for an under-35 conservative investor", () => {
    expect(active({ age: 28, risk_tolerance: "conservative" })).toBe(true);
  });
  it("records a dropped-dimension entry with a reason when bond_balance is dropped", () => {
    const sp = deriveScoringProfile({ age: 40, risk_tolerance: "aggressive" }, macro);
    expect(sp.activeDimensionIds.size).toBe(10);
    expect(sp.droppedDimensions).toHaveLength(1);
    expect(sp.droppedDimensions[0].id).toBe("bond_balance");
    expect(sp.droppedDimensions[0].label).toBe("Bond balance");
    expect(sp.droppedDimensions[0].reason.length).toBeGreaterThan(0);
  });
});

describe("deriveScoringProfile — tuning knobs", () => {
  const macro = makeMacro();

  it("cashLeniency scales by risk tolerance", () => {
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, macro).cashLeniency).toBeCloseTo(1.5, 5);
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "moderate" }, macro).cashLeniency).toBeCloseTo(1.0, 5);
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "aggressive" }, macro).cashLeniency).toBeCloseTo(0.7, 5);
  });
  it("cashLeniency gets an extra 1.3x for age 60+", () => {
    expect(deriveScoringProfile({ age: 65, risk_tolerance: "moderate" }, macro).cashLeniency).toBeCloseTo(1.3, 5);
    expect(deriveScoringProfile({ age: 65, risk_tolerance: "conservative" }, macro).cashLeniency).toBeCloseTo(1.95, 5);
  });
  it("concentrationShift scales by risk tolerance", () => {
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, macro).concentrationShift).toBeCloseTo(-0.05, 5);
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "aggressive" }, macro).concentrationShift).toBeCloseTo(0.10, 5);
  });
  it("singleStockPenaltyScale scales by risk tolerance", () => {
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, macro).singleStockPenaltyScale).toBeCloseTo(1.4, 5);
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "aggressive" }, macro).singleStockPenaltyScale).toBeCloseTo(0.6, 5);
  });
  it("qualityTiltRelaxed is true only for aggressive", () => {
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "aggressive" }, macro).qualityTiltRelaxed).toBe(true);
    expect(deriveScoringProfile({ age: 45, risk_tolerance: "moderately_aggressive" }, macro).qualityTiltRelaxed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/riskProfile.test.ts`
Expected: FAIL — the stub returns all dimensions active and all knobs neutral.

- [ ] **Step 3: Implement the drop rule + knobs**

In `src/engine/riskProfile.ts`, add these helpers below `computeFiTarget`:

```ts
const RISK_CASH_MULT: Record<RiskTolerance, number> = {
  conservative: 1.5,
  moderately_conservative: 1.25,
  moderate: 1.0,
  moderately_aggressive: 0.85,
  aggressive: 0.7,
};

const RISK_CONCENTRATION_SHIFT: Record<RiskTolerance, number> = {
  conservative: -0.05,
  moderately_conservative: -0.03,
  moderate: 0,
  moderately_aggressive: 0.05,
  aggressive: 0.10,
};

const RISK_SINGLE_STOCK_SCALE: Record<RiskTolerance, number> = {
  conservative: 1.4,
  moderately_conservative: 1.2,
  moderate: 1.0,
  moderately_aggressive: 0.8,
  aggressive: 0.6,
};

/** Returns the reason bond_balance is dropped, or null when it stays graded. */
function bondDropReason(profile: UserProfile): string | null {
  if (profile.risk_tolerance === "aggressive") {
    return "Aggressive risk profile — fixed income is not part of the target allocation.";
  }
  if (
    profile.age < 35 &&
    (profile.risk_tolerance === "moderate" || profile.risk_tolerance === "moderately_aggressive")
  ) {
    return "Long horizon (under 35) with an above-conservative risk profile — bonds are de-emphasized.";
  }
  return null;
}
```

Then replace the non-null `return { ... }` block at the end of `deriveScoringProfile` with:

```ts
  const cashLeniency =
    RISK_CASH_MULT[profile.risk_tolerance] * (profile.age >= 60 ? 1.3 : 1.0);

  const dropReason = bondDropReason(profile);
  const droppedDimensions: DroppedDimension[] = dropReason
    ? [{ id: "bond_balance", label: "Bond balance", reason: dropReason }]
    : [];
  const droppedIds = new Set(droppedDimensions.map((d) => d.id));
  const activeDimensionIds = new Set(
    ALL_DIMENSION_IDS.filter((id) => !droppedIds.has(id)),
  );

  return {
    activeDimensionIds,
    droppedDimensions,
    fiTarget: computeFiTarget(profile, macro),
    cashLeniency,
    concentrationShift: RISK_CONCENTRATION_SHIFT[profile.risk_tolerance],
    singleStockPenaltyScale: RISK_SINGLE_STOCK_SCALE[profile.risk_tolerance],
    qualityTiltRelaxed: profile.risk_tolerance === "aggressive",
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/riskProfile.test.ts`
Expected: PASS — all drop-rule and knob tests, plus the Task 2 FI-target tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/riskProfile.ts src/engine/riskProfile.test.ts
git commit -m "feat(engine): risk-tolerance drop rule + dimension tuning knobs"
```

---

## Task 4: `computePortfolioScore` renormalization

**Files:**
- Modify: `src/engine/dimensions.ts:262-264`
- Test: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("computePortfolioScore renormalization", () => {
  function dim(id: string, score: number, weight: number): DimensionScore {
    return { id, label: id, score, rating: "green", display_value: "", note: "", weight };
  }

  it("is unchanged for a full set whose weights already sum to 1.0", () => {
    const dims = [dim("a", 8, 0.5), dim("b", 6, 0.5)];
    expect(computePortfolioScore(dims)).toBeCloseTo(7, 5);
  });

  it("normalizes by the sum of weights when a dimension is dropped", () => {
    // (8*0.11 + 6*0.07) / (0.11 + 0.07) = 1.30 / 0.18 = 7.2222...
    const dims = [dim("a", 8, 0.11), dim("b", 6, 0.07)];
    expect(computePortfolioScore(dims)).toBeCloseTo(7.2222, 3);
  });

  it("returns 0 for an empty dimension list", () => {
    expect(computePortfolioScore([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/dimensions.test.ts -t "renormalization"`
Expected: FAIL — the dropped-dimension case returns `1.30` (un-normalized), not `7.2222`.

- [ ] **Step 3: Implement renormalization**

In `src/engine/dimensions.ts`, replace `computePortfolioScore` (lines 262-264) with:

```ts
export function computePortfolioScore(dimensions: DimensionScore[]): number {
  const weightSum = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (weightSum === 0) return 0;
  return dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/dimensions.test.ts`
Expected: PASS — the new tests and every existing `dimensions.test.ts` test (the full 11-dimension weights sum to 1.0, so dividing by `weightSum` is a no-op for them).

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): computePortfolioScore normalizes by active weight sum"
```

---

## Task 5: `scoreBondBalance` consumes the FI target

**Files:**
- Modify: `src/engine/dimensions.ts:176-195`
- Test: `src/engine/dimensions.test.ts`

`scoreBondBalance` keeps its `macro` parameter (for the display note) and gains an optional trailing `ScoringProfile`. When a profile is supplied, its `fiTarget` is used; otherwise the regime lookup is unchanged — so every existing call site keeps working.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreBondBalance with a ScoringProfile", () => {
  it("grades against the profile's fiTarget instead of the regime lookup", () => {
    // 18% FI is inside a {0.15, 0.25} regime target (score 9) but BELOW a
    // profile target of {0.30, 0.40} → should score lower than 9.
    const agg = { ...aggWithER(0), fixed_income_weight: 0.18 } as PortfolioAggregates;
    const sp = { ...NEUTRAL_SCORING_PROFILE, fiTarget: { min: 0.30, max: 0.40 } };
    const result = scoreBondBalance(agg, makeMacro({ market_regime: "Mid Cycle" }), sp);
    expect(result.score).toBeLessThan(9);
    expect(result.display_value).toContain("30–40%");
  });
});
```

Add `NEUTRAL_SCORING_PROFILE` to the imports at the top of `src/engine/dimensions.test.ts`:

```ts
import { NEUTRAL_SCORING_PROFILE } from "./riskProfile";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/dimensions.test.ts -t "scoreBondBalance with a ScoringProfile"`
Expected: FAIL — `scoreBondBalance` currently accepts only `(agg, macro)`; the third argument is a type error / ignored.

- [ ] **Step 3: Implement**

In `src/engine/dimensions.ts`, add this import near the top (below the `FI_TARGETS_BY_REGIME` import added in Task 2):

```ts
import type { ScoringProfile } from "./riskProfile";
```

Replace `scoreBondBalance` (lines 176-195) with:

```ts
export function scoreBondBalance(
  agg: PortfolioAggregates,
  macro: MacroContext,
  sp?: ScoringProfile,
): DimensionScore {
  const fi = agg.fixed_income_weight;
  const target =
    sp?.fiTarget ?? FI_TARGETS_BY_REGIME[macro.market_regime] ?? DEFAULT_FI_TARGET;

  const score =
    fi >= target.min && fi <= target.max ? 9 :
    fi > target.max                      ? 7 :
    fi >= target.min * 0.8               ? 7 :
    fi >= target.min * 0.5               ? 5 : 3;

  return {
    id: "bond_balance",
    label: "Bond balance",
    score,
    rating: toRating(score),
    display_value: `${(fi * 100).toFixed(1)}% FI (target ${(target.min * 100).toFixed(0)}–${(target.max * 100).toFixed(0)}%)`,
    note: `Target range for ${macro.market_regime} regime`,
    weight: 0.11,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/dimensions.test.ts`
Expected: PASS — the new test and all existing `scoreBondBalance` tests (they call `(agg, macro)` with no profile → regime lookup unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): scoreBondBalance grades against profile FI target"
```

---

## Task 6: `scoreCashEfficiency` + `scoreConcentration` consume the ScoringProfile

**Files:**
- Modify: `src/engine/dimensions.ts` (`scoreCashEfficiency` lines 97-119, `scoreConcentration` lines 59-76)
- Test: `src/engine/dimensions.test.ts`

Both gain an optional trailing `sp: ScoringProfile = NEUTRAL_SCORING_PROFILE`. With the neutral profile (`cashLeniency: 1`, `concentrationShift: 0`) behavior is identical to today, so existing tests are untouched.

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreCashEfficiency with cashLeniency", () => {
  it("a lenient profile rates a cash buffer higher than the neutral profile", () => {
    const agg = aggForCash(0.07); // neutral: 7
    const lenient = { ...NEUTRAL_SCORING_PROFILE, cashLeniency: 1.5 };
    expect(scoreCashEfficiency(agg, lenient).score).toBeGreaterThan(
      scoreCashEfficiency(agg).score,
    );
  });
  it("a strict profile rates the same buffer no higher than neutral", () => {
    const agg = aggForCash(0.07);
    const strict = { ...NEUTRAL_SCORING_PROFILE, cashLeniency: 0.7 };
    expect(scoreCashEfficiency(agg, strict).score).toBeLessThanOrEqual(
      scoreCashEfficiency(agg).score,
    );
  });
});

describe("scoreConcentration with concentrationShift", () => {
  it("a positive shift rates the same top-3 weight higher", () => {
    const agg = aggForConc(0.50); // neutral: 6
    const relaxed = { ...NEUTRAL_SCORING_PROFILE, concentrationShift: 0.10 };
    expect(scoreConcentration(agg, relaxed).score).toBeGreaterThan(
      scoreConcentration(agg).score,
    );
  });
  it("a negative shift rates the same top-3 weight lower", () => {
    const agg = aggForConc(0.35); // neutral: 10
    const strict = { ...NEUTRAL_SCORING_PROFILE, concentrationShift: -0.05 };
    expect(scoreConcentration(agg, strict).score).toBeLessThan(
      scoreConcentration(agg).score,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/dimensions.test.ts -t "cashLeniency"`
Expected: FAIL — the second argument is currently ignored.

- [ ] **Step 3: Implement**

In `src/engine/dimensions.ts`, add the `NEUTRAL_SCORING_PROFILE` runtime import to the existing `riskProfile` import line so it reads:

```ts
import { FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET, NEUTRAL_SCORING_PROFILE } from "./riskProfile";
```

Replace the signature + ladder of `scoreCashEfficiency` (lines 97-104) with:

```ts
export function scoreCashEfficiency(
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const idle = agg.idle_cash_weight;
  const L = sp.cashLeniency;
  const score =
    idle <= 0.02 * L ? 10 :
    idle <= 0.05 * L ? 8 :
    idle <= 0.08 * L ? 7 :
    idle <= 0.12 * L ? 5 :
    idle <= 0.20 * L ? 3 : 1;
```

(The rest of the function body — `display`, `return` — is unchanged.)

Replace the signature + ladder of `scoreConcentration` (lines 59-65) with:

```ts
export function scoreConcentration(
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const t3 = agg.top3_weight;
  const shift = sp.concentrationShift;
  const score =
    t3 <= 0.35 + shift ? 10 :
    t3 <= 0.45 + shift ? 8 :
    t3 <= 0.55 + shift ? 6 :
    t3 <= 0.65 + shift ? 4 : 2;
```

(The rest of the function body is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/dimensions.test.ts`
Expected: PASS — new tests plus all existing `scoreCashEfficiency` / `scoreConcentration` tests (neutral profile → `L = 1`, `shift = 0` → identical ladders).

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): cash + concentration scorers consume ScoringProfile"
```

---

## Task 7: `scoreSingleStockRisk` + `scoreQualityTilt` consume the ScoringProfile

**Files:**
- Modify: `src/engine/dimensions.ts` (`scoreSingleStockRisk` lines 197-245, `scoreQualityTilt` lines 297-317)
- Test: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreSingleStockRisk with singleStockPenaltyScale", () => {
  it("a scale below 1 softens the penalty (higher score)", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "RISK", market_value: 1000, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 120, beta: 1.8 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const lenient = { ...NEUTRAL_SCORING_PROFILE, singleStockPenaltyScale: 0.6 };
    expect(scoreSingleStockRisk(portfolio, agg, lenient).score).toBeGreaterThan(
      scoreSingleStockRisk(portfolio, agg).score,
    );
  });
});

describe("scoreQualityTilt with qualityTiltRelaxed", () => {
  it("raises the score floor when relaxed so a weak tilt is not punished", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const agg = computeAggregates(portfolio);
    const relaxed = { ...NEUTRAL_SCORING_PROFILE, qualityTiltRelaxed: true };
    expect(scoreQualityTilt(portfolio, agg).score).toBeLessThan(5);
    expect(scoreQualityTilt(portfolio, agg, relaxed).score).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/dimensions.test.ts -t "singleStockPenaltyScale"`
Expected: FAIL — the third argument is currently ignored.

- [ ] **Step 3: Implement**

In `src/engine/dimensions.ts`, change the `scoreSingleStockRisk` signature (line 197) to:

```ts
export function scoreSingleStockRisk(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
```

and change the score line (currently line 234) from:

```ts
  const score = Math.max(1, 10 - totalPenalty);
```

to:

```ts
  const score = Math.max(1, 10 - totalPenalty * sp.singleStockPenaltyScale);
```

Change the `scoreQualityTilt` signature (line 297) to:

```ts
export function scoreQualityTilt(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
```

and change the score line (currently line 306) from:

```ts
  const score = Math.min(10, Math.max(1, raw * 2.5));
```

to:

```ts
  const floor = sp.qualityTiltRelaxed ? 5 : 1;
  const score = Math.min(10, Math.max(floor, raw * 2.5));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/dimensions.test.ts`
Expected: PASS — new tests plus all existing tests (neutral profile → scale `1`, floor `1` → identical).

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): single-stock + quality scorers consume ScoringProfile"
```

---

## Task 8: `scoreAllDimensions` threads the profile + filters dropped dimensions

**Files:**
- Modify: `src/engine/dimensions.ts:266-285`
- Test: `src/engine/dimensions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/dimensions.test.ts`:

```ts
describe("scoreAllDimensions with a ScoringProfile", () => {
  it("returns all 11 dimensions when no profile is supplied", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const dims = scoreAllDimensions(portfolio, computeAggregates(portfolio), makeMacro());
    expect(dims).toHaveLength(11);
  });

  it("omits bond_balance when the profile drops it", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const sp = { ...NEUTRAL_SCORING_PROFILE, activeDimensionIds: new Set(
      [...NEUTRAL_SCORING_PROFILE.activeDimensionIds].filter((id) => id !== "bond_balance"),
    ) };
    const dims = scoreAllDimensions(portfolio, computeAggregates(portfolio), makeMacro(), undefined, sp);
    expect(dims).toHaveLength(10);
    expect(dims.find((d) => d.id === "bond_balance")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/dimensions.test.ts -t "scoreAllDimensions with a ScoringProfile"`
Expected: FAIL — `scoreAllDimensions` does not accept a 5th argument and always returns 11 dimensions.

- [ ] **Step 3: Implement**

In `src/engine/dimensions.ts`, add the runtime import for `deriveScoringProfile` to the `riskProfile` import line so it reads:

```ts
import { FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET, NEUTRAL_SCORING_PROFILE, deriveScoringProfile } from "./riskProfile";
```

Replace `scoreAllDimensions` (lines 266-285) with:

```ts
export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
  scoringProfile?: ScoringProfile,
): DimensionScore[] {
  // No profile threaded in → fall back to the regime-only, all-dimensions-active
  // profile, which reproduces today's behavior exactly.
  const sp = scoringProfile ?? deriveScoringProfile(null, macro);

  const all: DimensionScore[] = [
    scoreCostEfficiency(agg),
    scoreDiversification(agg),
    scoreCashEfficiency(agg, sp),
    scoreMacroAlignment(agg, macro),
    scoreSingleStockRisk(portfolio, agg, sp),
    scoreSimplicity(agg),
    scoreBondBalance(agg, macro, sp),
    scoreConcentration(agg, sp),
    scoreInternational(agg),
    scoreQualityTilt(portfolio, agg, sp),
    scoreAssetLocation(portfolio, accounts),
  ];

  return all.filter((d) => sp.activeDimensionIds.has(d.id));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine && npx tsc --noEmit`
Expected: PASS — the new tests, every existing engine test, and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dimensions.ts src/engine/dimensions.test.ts
git commit -m "feat(engine): scoreAllDimensions threads ScoringProfile + filters dropped dims"
```

---

## Task 9: `buildReferenceModels` — benchmarks graded on the active dimension set

**Files:**
- Modify: `src/engine/benchmarks.ts`
- Test: `src/engine/benchmarks.test.ts` (rewritten)

- [ ] **Step 1: Rewrite `src/engine/benchmarks.test.ts` as the failing test**

Replace the entire contents of `src/engine/benchmarks.test.ts` with:

```ts
import { describe, test, it, expect } from "vitest";
import { buildReferenceModels } from "./benchmarks";
import { scoreToGrade, computePortfolioScore } from "./dimensions";
import { ALL_DIMENSION_IDS } from "./riskProfile";
import { DimensionScore } from "../types";

const ALL = new Set<string>(ALL_DIMENSION_IDS);

const WEIGHTS: Record<string, number> = {
  cost_efficiency: 0.09, diversification: 0.11, cash_efficiency: 0.11,
  macro_alignment: 0.09, single_stock_risk: 0.11, simplicity: 0.07,
  bond_balance: 0.11, concentration: 0.11, international: 0.06,
  quality_tilt: 0.06, asset_location: 0.08,
};

describe("buildReferenceModels — full dimension set", () => {
  const models = buildReferenceModels(ALL);

  test("contains exactly 3 models", () => {
    expect(models).toHaveLength(3);
  });

  test("expected model labels are present", () => {
    const labels = models.map((m) => m.label);
    expect(labels).toContain("Boglehead 3-fund");
    expect(labels).toContain("All Weather");
    expect(labels).toContain("Classic 60/40");
  });

  test("each model scores all 11 dimensions with a score in (0, 10]", () => {
    for (const m of models) {
      expect(Object.keys(m.dimension_scores).sort()).toEqual([...ALL].sort());
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThanOrEqual(10);
    }
  });

  test("each model's score equals computePortfolioScore over its dimension_scores", () => {
    for (const m of models) {
      const dims: DimensionScore[] = Object.entries(m.dimension_scores).map(([id, score]) => ({
        id, label: id, score, rating: "green" as const, display_value: "", note: "",
        weight: WEIGHTS[id] ?? 0,
      }));
      expect(m.score).toBeCloseTo(computePortfolioScore(dims), 2);
    }
  });

  test("each model's grade equals scoreToGrade(score)", () => {
    for (const m of models) {
      expect(m.grade).toBe(scoreToGrade(m.score));
    }
  });
});

describe("buildReferenceModels — reduced dimension set", () => {
  it("omits dropped dimensions from each model's dimension_scores", () => {
    const reduced = new Set([...ALL].filter((id) => id !== "bond_balance"));
    const models = buildReferenceModels(reduced);
    for (const m of models) {
      expect(m.dimension_scores).not.toHaveProperty("bond_balance");
      expect(Object.keys(m.dimension_scores)).toHaveLength(10);
    }
  });

  it("re-derives the score over the reduced set (normalized by remaining weight)", () => {
    const reduced = new Set([...ALL].filter((id) => id !== "bond_balance"));
    const models = buildReferenceModels(reduced);
    for (const m of models) {
      const dims: DimensionScore[] = Object.entries(m.dimension_scores).map(([id, score]) => ({
        id, label: id, score, rating: "green" as const, display_value: "", note: "",
        weight: WEIGHTS[id] ?? 0,
      }));
      expect(m.score).toBeCloseTo(computePortfolioScore(dims), 2);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/benchmarks.test.ts`
Expected: FAIL — `buildReferenceModels` is not exported.

- [ ] **Step 3: Implement `buildReferenceModels` in `src/engine/benchmarks.ts`**

Replace the `deriveScore` function and the `REFERENCE_MODELS` export (lines 63-77) with:

```ts
function deriveScore(dim_scores: Record<string, number>): number {
  let weighted = 0;
  let weightSum = 0;
  for (const [id, score] of Object.entries(dim_scores)) {
    const w = WEIGHTS[id] ?? 0;
    weighted += score * w;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : weighted / weightSum;
}

/**
 * Build the reference models graded on the SAME active dimension set as the
 * user's portfolio, so the benchmark comparison is apples-to-apples. Each
 * seed carries all 11 dimension scores; dimensions absent from
 * `activeDimensionIds` are filtered out and the score is re-derived.
 */
export function buildReferenceModels(activeDimensionIds: Set<string>): ReferenceModel[] {
  return SEEDS.map((seed) => {
    const dimension_scores: Record<string, number> = {};
    for (const [id, score] of Object.entries(seed.dimension_scores)) {
      if (activeDimensionIds.has(id)) dimension_scores[id] = score;
    }
    const score = Number(deriveScore(dimension_scores).toFixed(2));
    return {
      id: seed.id,
      label: seed.label,
      description: seed.description,
      dimension_scores,
      score,
      grade: scoreToGrade(score),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/benchmarks.test.ts`
Expected: PASS — full-set and reduced-set tests.

- [ ] **Step 5: Verify nothing else imports the removed `REFERENCE_MODELS`**

Run: `npx tsc --noEmit`
Expected: FAIL with an error in `src/index.ts` (`REFERENCE_MODELS` no longer exported). This is expected — `index.ts` is rewired in Task 11. Note it and proceed; do not "fix" it here.

- [ ] **Step 6: Commit**

```bash
git add src/engine/benchmarks.ts src/engine/benchmarks.test.ts
git commit -m "feat(engine): buildReferenceModels graded on the active dimension set"
```

---

## Task 10: `plan.ts` — flags/gaps/phases consume the ScoringProfile

**Files:**
- Modify: `src/engine/plan.ts`
- Test: `src/engine/plan.test.ts`

The three generators gain an optional trailing `sp?: ScoringProfile`. They use `sp.fiTarget` for FI-percentage text and suppress FI-related findings when `bond_balance` is not in `sp.activeDimensionIds`. The `bond_balance` gap stops using the throwing `requireDim` helper (a dropped dimension is legitimately absent).

- [ ] **Step 1: Write the failing tests**

First, ensure the **top** of `src/engine/plan.test.ts` imports everything the new test needs. Add this import line near the other top-of-file imports (it is fine to merge with an existing `./riskProfile` import if one exists):

```ts
import { NEUTRAL_SCORING_PROFILE } from "./riskProfile";
```

The test below also uses `generateGapItems`, `makeMacro`, and the `PortfolioAggregates` / `DimensionScore` types. `generateGapItems` is already imported by this test file; verify `makeMacro` (from `../../tests/fixtures/sampleMacro`) and the two types (from `../types`) are imported at the top — add them if they are not.

Then append this `describe` block to `src/engine/plan.test.ts`:

```ts
describe("plan generators with a bond_balance-dropped ScoringProfile", () => {
  const droppedSp = {
    ...NEUTRAL_SCORING_PROFILE,
    activeDimensionIds: new Set(
      [...NEUTRAL_SCORING_PROFILE.activeDimensionIds].filter((id) => id !== "bond_balance"),
    ),
  };

  it("generateGapItems does not throw and emits no FI gap when bond_balance is dropped", () => {
    const agg = {
      total_value: 1000, blended_expense_ratio: 0, holding_count: 1,
      duplicate_groups: [], cross_account_groups: [], top3_weight: 0.2, top3_tickers: [],
      international_weight: 0.1, cash_weight: 0, idle_cash_weight: 0, constrained_cash_weight: 0,
      pending_cash_weight: 0, pending_cash_value: 0, equity_weight: 0.9, fixed_income_weight: 0.02,
      individual_stock_weight: 0, balanced_weight: 0, sector_holdings: [],
    } as PortfolioAggregates;
    // dimension list without bond_balance — mirrors a real dropped run
    const dims: DimensionScore[] = [
      { id: "single_stock_risk", label: "Single-stock risk", score: 10, rating: "green", display_value: "", note: "", weight: 0.11 },
      { id: "concentration", label: "Concentration", score: 9, rating: "green", display_value: "", note: "", weight: 0.11 },
    ];
    const gaps = generateGapItems(agg, dims, makeMacro(), droppedSp);
    expect(gaps.find((g) => g.finding_key.startsWith("bond_balance:"))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/engine/plan.test.ts -t "bond_balance-dropped"`
Expected: FAIL — `generateGapItems` currently calls `requireDim(dimensions, "bond_balance")`, which throws when the dimension is absent.

- [ ] **Step 3: Implement the `plan.ts` changes**

In `src/engine/plan.ts`:

(a) Add the import below the existing imports (line 3 area):

```ts
import type { ScoringProfile } from "./riskProfile";
```

(b) Replace `fiTargetFor` / `fiTargetPctText` (lines 5-12) with a `ScoringProfile`-aware version:

```ts
function fiTargetFor(macro: MacroContext, sp?: ScoringProfile): { min: number; max: number } {
  return sp?.fiTarget ?? FI_TARGETS_BY_REGIME[macro.market_regime] ?? DEFAULT_FI_TARGET;
}

function fiTargetPctText(macro: MacroContext, sp?: ScoringProfile): string {
  const t = fiTargetFor(macro, sp);
  return `${(t.min * 100).toFixed(0)}–${(t.max * 100).toFixed(0)}%`;
}

function bondActive(sp?: ScoringProfile): boolean {
  return sp ? sp.activeDimensionIds.has("bond_balance") : true;
}
```

(c) `generateFlags` — change the signature (line 32-37) to add `sp?: ScoringProfile` as the last parameter:

```ts
export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
  sp?: ScoringProfile,
): Flag[] {
```

In `generateFlags`, the inverted-curve block (lines 84-92) gates on `bond_balance` being graded and uses the profile target. Replace it with:

```ts
  if (bondActive(sp) && macro.yield_curve_status === "inverted" && agg.fixed_income_weight < 0.15) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: "Inverted yield curve — bond underweight",
      body: `Yield curve spread at ${macro.yield_curve_spread_10y_2y.toFixed(2)}%. Fixed income at ${(agg.fixed_income_weight * 100).toFixed(1)}% is below the ${fiTargetPctText(macro, sp)} ${regimeAdjective(macro.market_regime)} target.`,
      finding_key: buildFindingKey({ dimension: "macro_alignment", type: "fi_underweight_inverted_curve" }),
    });
  }
```

(d) `generateGapItems` — change the signature (lines 154-158) to:

```ts
export function generateGapItems(
  agg: PortfolioAggregates,
  dimensions: DimensionScore[],
  macro: MacroContext,
  sp?: ScoringProfile,
): GapItem[] {
```

Replace the bond gap block (lines 182-191) with a non-throwing lookup that respects the drop:

```ts
  const bondDim = dimensions.find((d) => d.id === "bond_balance");
  if (bondActive(sp) && bondDim && bondDim.score < 7) {
    gaps.push({
      title: "Fixed income underweight",
      type: "amber",
      body: `${(agg.fixed_income_weight * 100).toFixed(1)}% FI vs. the ${fiTargetPctText(macro, sp)} target. Add FXNAX or VBTLX weight.`,
      progress: Math.round((agg.fixed_income_weight / 0.20) * 100),
      finding_key: buildFindingKey({ dimension: "bond_balance", type: "fi_underweight" }),
    });
  }
```

(e) `generatePlanPhases` — change the signature (lines 218-222) to:

```ts
export function generatePlanPhases(
  agg: PortfolioAggregates,
  macro: MacroContext,
  baseScore: number,
  sp?: ScoringProfile,
): { phases: PlanPhase[]; trajectory: ScorePoint[] } {
```

Replace the Phase 2 FI action block (lines 270-277) with:

```ts
  if (bondActive(sp) && agg.fixed_income_weight < 0.16) {
    p2Actions.push({
      category: "rebalance",
      description: `Increase fixed income from ${(agg.fixed_income_weight * 100).toFixed(1)}% to ${fiTargetPctText(macro, sp)}. ${capitalize(regimeAdjective(macro.market_regime))}${macro.yield_curve_status === "inverted" ? " with inverted yield curve" : ""} warrants adding FXNAX or VBTLX weight.`,
      tags: ["impact"],
    });
    p2Delta += 0.3;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/plan.test.ts`
Expected: PASS — the new test plus all existing `plan.test.ts` tests (calls with no `sp` → `bondActive` returns `true`, `fiTargetPctText` falls back to the regime lookup → identical text).

- [ ] **Step 5: Commit**

```bash
git add src/engine/plan.ts src/engine/plan.test.ts
git commit -m "feat(engine): plan generators consume ScoringProfile, suppress FI items when dropped"
```

---

## Task 11: Wire the pipeline in `src/index.ts`

**Files:**
- Modify: `src/index.ts`

Verified manually (the CLI orchestrator has no unit tests per `CLAUDE.md`).

- [ ] **Step 1: Update imports**

In `src/index.ts`, change line 15-17 from:

```ts
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./engine/dimensions";
import { generateFlags, generateGapItems, generatePlanPhases } from "./engine/plan";
import { REFERENCE_MODELS } from "./engine/benchmarks";
```

to:

```ts
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./engine/dimensions";
import { generateFlags, generateGapItems, generatePlanPhases } from "./engine/plan";
import { buildReferenceModels } from "./engine/benchmarks";
import { deriveScoringProfile } from "./engine/riskProfile";
```

- [ ] **Step 2: Derive the scoring profile + reference models**

In `src/index.ts`, immediately after `console.log(\`  Macro regime: ${macro.market_regime}\`);` (line 165) add:

```ts
  // Derive the scoring profile from the user's captured age + risk tolerance.
  // userContext.profile is null until a profile is saved via the report — in
  // that case deriveScoringProfile reproduces the regime-only behavior.
  const scoringProfile = deriveScoringProfile(userContext.profile, macro);
  const reference_models = buildReferenceModels(scoringProfile.activeDimensionIds);
  if (userContext.profile) {
    console.log(
      `  Profile: age ${userContext.profile.age}, ${userContext.profile.risk_tolerance}` +
        (scoringProfile.droppedDimensions.length
          ? ` (not graded: ${scoringProfile.droppedDimensions.map((d) => d.id).join(", ")})`
          : ""),
    );
  }
```

- [ ] **Step 3: Thread the profile into the engine calls**

In `src/index.ts`, replace lines 171-176 (`computeAggregates` through `generateGapItems`) with:

```ts
  const aggregates = computeAggregates(effectedPortfolio, accounts);
  const dimension_scores = scoreAllDimensions(effectedPortfolio, aggregates, macro, accounts, scoringProfile);
  const portfolio_score = computePortfolioScore(dimension_scores);
  const portfolio_grade = scoreToGrade(portfolio_score);
  const rawFlags = generateFlags(effectedPortfolio, aggregates, macro, accounts, scoringProfile);
  const rawGapItems = generateGapItems(aggregates, dimension_scores, macro, scoringProfile);
```

Replace the `generatePlanPhases` call (lines 183-184) with:

```ts
  const { phases: plan_phases, trajectory: score_trajectory } =
    generatePlanPhases(aggregates, macro, portfolio_score, scoringProfile);
```

- [ ] **Step 4: Replace `REFERENCE_MODELS` references**

In `src/index.ts` there are three uses of `REFERENCE_MODELS`. Replace each with `reference_models`:
- The `generateNarratives` call argument (line 200): `reference_models: REFERENCE_MODELS,` → `reference_models: reference_models,`
- The output assembly (line 306): `reference_models: REFERENCE_MODELS,` → `reference_models,`
- The console summary loop (line 349): `for (const m of REFERENCE_MODELS) {` → `for (const m of reference_models) {`

- [ ] **Step 5: Emit `profile` + `dropped_dimensions` in the output**

In the `const output = { ... }` block (lines 297-316), add these two fields (place them after `dimension_scores,`):

```ts
    profile: userContext.profile,
    dropped_dimensions: scoringProfile.droppedDimensions,
```

- [ ] **Step 6: Pass the profile into the AI input contexts**

In the `generateNarratives({ ... })` call (lines 193-202), add as the first property:

```ts
        profile: userContext.profile,
```

In the `runTacticalAdvisor({ ... })` call (lines 275-286), add as the first property:

```ts
        profile: userContext.profile,
```

(These compile only after Task 15 widens the AI input interfaces. If implementing tasks strictly in order, do Step 6 as part of Task 15 instead and note it here.)

- [ ] **Step 7: Typecheck + run the pipeline**

Run: `npx tsc --noEmit`
Expected: PASS — except the two lines from Step 6, which depend on Task 15. If Task 15 is not yet done, temporarily omit Step 6 and revisit.

Run: `npm run analyze`
Expected: the pipeline completes; the console prints the dimension scorecard and benchmark comparison. With no profile saved, scores match the pre-feature baseline. Confirm `output/analysis.json` now contains top-level `profile` (null) and `dropped_dimensions` (`[]`).

- [ ] **Step 8: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): wire scoring profile through the analyze pipeline"
```

---

## Task 12: `/api/profile` server handler

**Files:**
- Create: `src/server/handlers/profile.ts`
- Modify: `src/server/vitePlugin.ts`

Verified manually (server handlers have no unit tests per `CLAUDE.md`).

- [ ] **Step 1: Create `src/server/handlers/profile.ts`**

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { UserProfile } from "../../types";

const UserProfileBodySchema = z.object({
  age: z.number().int().min(18).max(100),
  risk_tolerance: z.enum([
    "conservative",
    "moderately_conservative",
    "moderate",
    "moderately_aggressive",
    "aggressive",
  ]),
});

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw.length === 0 ? {} : JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJSON(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function handleProfileRoute(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  ctxPath: string,
): Promise<void> {
  if (method === "GET") {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.profile);
  }

  if (method === "PUT") {
    const parsed = UserProfileBodySchema.safeParse(await readBody(req));
    if (!parsed.success) {
      return sendJSON(res, 400, { error: "invalid profile", issues: parsed.error.issues });
    }
    const profile: UserProfile = parsed.data;
    mutateUserContext(ctxPath, (ctx) => {
      ctx.profile = profile;
    });
    return sendJSON(res, 200, profile);
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
```

- [ ] **Step 2: Register the route in `src/server/vitePlugin.ts`**

Add the import after the existing handler imports (line 6):

```ts
import { handleProfileRoute } from "./handlers/profile";
```

Add a route constant after `NOTES_RE` (line 11):

```ts
const PROFILE_RE = /^\/api\/profile$/;
```

Add this block inside `configureServer`'s middleware, immediately before the `const note = url.match(NOTES_RE);` line:

```ts
        if (PROFILE_RE.test(url)) {
          try {
            await handleProfileRoute(req, res, req.method ?? "GET", contextPath);
          } catch (err) {
            console.error("/api/profile error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manually verify the endpoint**

Run: `npm run report` (starts the Vite dev server). In a second terminal:

```bash
curl http://localhost:5173/api/profile
curl -X PUT http://localhost:5173/api/profile -H "Content-Type: application/json" -d "{\"age\":42,\"risk_tolerance\":\"moderately_aggressive\"}"
curl http://localhost:5173/api/profile
curl -X PUT http://localhost:5173/api/profile -H "Content-Type: application/json" -d "{\"age\":5,\"risk_tolerance\":\"moderate\"}"
```

Expected: first GET returns `null`; PUT returns the saved profile; second GET returns `{"age":42,...}`; the invalid PUT returns HTTP 400. Confirm the configured `user-context.json` now has a `profile` block and `version: 2`.

- [ ] **Step 5: Commit**

```bash
git add src/server/handlers/profile.ts src/server/vitePlugin.ts
git commit -m "feat(server): /api/profile GET + PUT handler"
```

---

## Task 13: Report — types mirror, ProfilePanel, App wiring

**Files:**
- Modify: `src/report/app/types.ts`
- Create: `src/report/app/sections/ProfilePanel.tsx`
- Modify: `src/report/app/App.tsx`

Verified manually (React UI has no unit tests per `CLAUDE.md`).

- [ ] **Step 1: Extend the report types mirror**

In `src/report/app/types.ts`, add after the `Rating` type (line 1):

```ts
export type RiskTolerance =
  | "conservative"
  | "moderately_conservative"
  | "moderate"
  | "moderately_aggressive"
  | "aggressive";

export interface UserProfile {
  age: number;
  risk_tolerance: RiskTolerance;
}

export interface DroppedDimension {
  id: string;
  label: string;
  reason: string;
}
```

In the `AnalysisOutput` interface (lines 318-337), add these two fields after `dimension_scores`:

```ts
  profile?: UserProfile | null;
  dropped_dimensions?: DroppedDimension[];
```

- [ ] **Step 2: Create `src/report/app/sections/ProfilePanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { RiskTolerance, UserProfile } from "../types";
import { COLORS } from "../theme";

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: "conservative", label: "Conservative" },
  { value: "moderately_conservative", label: "Moderately Conservative" },
  { value: "moderate", label: "Moderate" },
  { value: "moderately_aggressive", label: "Moderately Aggressive" },
  { value: "aggressive", label: "Aggressive" },
];

function riskLabel(value: RiskTolerance): string {
  return RISK_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export default function ProfilePanel() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [age, setAge] = useState("");
  const [risk, setRisk] = useState<RiskTolerance>("moderate");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: UserProfile | null) => {
        setProfile(p);
        if (p) {
          setAge(String(p.age));
          setRisk(p.risk_tolerance);
        } else {
          setEditing(true);
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    setErr(null);
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 18 || ageNum > 100) {
      setErr("Age must be a whole number between 18 and 100.");
      return;
    }
    const body: UserProfile = { age: ageNum, risk_tolerance: risk };
    try {
      const r = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setErr(`Save failed (HTTP ${r.status}).`);
        return;
      }
      setProfile(body);
      setEditing(false);
      setSaved(true);
    } catch {
      setErr("Save failed — is the dev server running?");
    }
  }

  const card: React.CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: "12px 14px",
    marginBottom: "1.5rem",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  };

  if (!editing && profile) {
    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={labelStyle}>Investor profile</span>
            <div style={{ fontSize: 14, color: COLORS.text, marginTop: 4 }}>
              Age {profile.age} · {riskLabel(profile.risk_tolerance)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted,
              padding: "4px 10px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Edit
          </button>
        </div>
        {saved && (
          <div style={{ fontSize: 12, color: COLORS.accentBlue, marginTop: 8 }}>
            Saved — re-run <code>npm run analyze</code> to apply it to the analysis.
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={card}>
      <span style={labelStyle}>Investor profile</span>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Age
          <br />
          <input
            type="number"
            min={18}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            style={{
              marginTop: 4,
              width: 80,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 13,
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: COLORS.textMuted }}>
          Risk tolerance
          <br />
          <select
            value={risk}
            onChange={(e) => setRisk(e.target.value as RiskTolerance)}
            style={{
              marginTop: 4,
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              borderRadius: 4,
              padding: "4px 6px",
              fontSize: 13,
            }}
          >
            {RISK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          style={{
            background: COLORS.accentBlue,
            border: "none",
            color: "#fff",
            padding: "6px 14px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Save
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: COLORS.red, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Render `ProfilePanel` in `App.tsx`**

In `src/report/app/App.tsx`, add the import after the other section imports (line 13 area):

```ts
import ProfilePanel from "./sections/ProfilePanel";
```

Render it immediately after the header `</div>` and before `<OpenSituations`  (i.e. between line 172 and line 174):

```tsx
        <ProfilePanel />

```

- [ ] **Step 4: Typecheck both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Manually verify**

Run: `npm run report`. In the browser: the profile card appears near the top. On first load with no profile it opens in edit mode. Enter age 42, pick "Moderately Aggressive", Save → the card collapses to "Age 42 · Moderately Aggressive" with the re-run hint. Reload the page → the saved values persist. Enter age 5 → Save shows the validation error.

- [ ] **Step 6: Commit**

```bash
git add src/report/app/types.ts src/report/app/sections/ProfilePanel.tsx src/report/app/App.tsx
git commit -m "feat(report): investor profile panel with age + risk tolerance form"
```

---

## Task 14: Report — scorecard "not graded" rows + radar active-dimension filter

**Files:**
- Modify: `src/report/app/sections/DimensionScorecard.tsx`
- Modify: `src/report/app/sections/RadarChart.tsx`

Verified manually.

- [ ] **Step 1: Add "not graded" rows to `DimensionScorecard`**

In `src/report/app/sections/DimensionScorecard.tsx`, inside `<tbody>`, immediately after the closing `))}` of the `dimensions.map(...)` block (line 117) and before `</tbody>`, add:

```tsx
          {(data.dropped_dimensions ?? []).map((dd) => (
            <tr key={dd.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>
                  {dd.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {dd.reason}
                </div>
              </td>
              <td
                colSpan={refs.length + 1 + (onDiscuss ? 1 : 0)}
                style={{ padding: "9px 14px", fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}
              >
                Not graded for your risk profile
              </td>
            </tr>
          ))}
```

- [ ] **Step 2: Filter `RadarChart` to active dimensions**

In `src/report/app/sections/RadarChart.tsx`, inside the `RadarChart` component, replace the `const dims` / `const refs` lines (50-53) and add a filtered dimension list:

```tsx
  const dims = data.dimension_scores;
  const refs = data.reference_models;
  // Only plot axes whose dimension is actually graded — a dropped dimension
  // (e.g. bond_balance for an aggressive profile) must not show a dead 0 spoke.
  const activeIds = new Set(dims.map((d) => d.id));
  const radarDims = RADAR_DIMS.filter((id) => activeIds.has(id));
```

Then replace every remaining use of `RADAR_DIMS` *inside the component* with `radarDims`:
- `portfolioValues`: `return RADAR_DIMS.map(...)` → `return radarDims.map(...)`
- `refValues`: `return RADAR_DIMS.map(...)` → `return radarDims.map(...)`
- `chartData.labels`: `labels: RADAR_DIMS.map(...)` → `labels: radarDims.map(...)`

(The module-level `RADAR_DIMS` constant and `RADAR_LABELS` map stay as they are.)

- [ ] **Step 3: Typecheck the report project**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Manually verify**

Save an Aggressive profile via the panel, run `npm run analyze`, then `npm run report`. Confirm: the dimension scorecard shows a muted "Bond balance — Not graded for your risk profile" row; the radar chart has no "Bonds" axis; the benchmark columns no longer show a bond row. Switch the profile back to Moderate, re-run `npm run analyze`, and confirm `bond_balance` returns everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/report/app/sections/DimensionScorecard.tsx src/report/app/sections/RadarChart.tsx
git commit -m "feat(report): show dropped dimensions; radar plots only graded axes"
```

---

## Task 15: Pass the profile into the AI context

**Files:**
- Modify: `src/ai/narratives.ts`, `src/ai/tacticalAdvisor.ts`, `src/ai/chat.ts`
- Test: `src/ai/chat.prompt.test.ts` (snapshot refresh)

The flags and scores the AI summarizes already reflect the profile; this task adds the raw `profile` to each context block so the prose can reference the investor concretely. All additions are optional fields, so existing callers and prompt tests stay valid.

- [ ] **Step 1: `narratives.ts` — accept + forward the profile**

In `src/ai/narratives.ts`, add `UserProfile` to the `import type { ... } from "../types";` block. Add to the `NarrativesInput` interface (after `flags: Flag[];`):

```ts
  profile?: UserProfile | null;
```

In `generateNarratives`, add `profile` to the `userContent` object (after the `flags: input.flags,` line):

```ts
    profile: input.profile ?? null,
```

- [ ] **Step 2: `tacticalAdvisor.ts` — accept + forward the profile**

In `src/ai/tacticalAdvisor.ts`, add `UserProfile` to the `import type { ... } from "../types";` block. Add to the `TacticalInputContext` interface (after `open_situations: Situation[];`):

```ts
  profile?: UserProfile | null;
```

In `renderTacticalInput`, add `profile` to the serialized object (after the `open_situations:` line):

```ts
      profile: ctx.profile ?? null,
```

- [ ] **Step 3: `chat.ts` — include the profile in the global + dimension scopes**

In `src/ai/chat.ts`, inside `trimAnalysisByScope`, add `profile` to the `global` scope return object and the `dimension` scope return object. For the `global` branch, the returned object becomes:

```ts
    return {
      portfolio_grade: analysis.portfolio_grade,
      portfolio_score: analysis.portfolio_score,
      top_flags: (analysis.flags ?? []).slice(0, 3),
      dimension_scores: analysis.dimension_scores,
      macro: analysis.macro,
      aggregates: analysis.aggregates,
      profile: analysis.profile ?? null,
    };
```

For the `dimension` branch, add `profile: analysis.profile ?? null,` to its returned object alongside `portfolio_grade`.

- [ ] **Step 4: Run the AI prompt tests**

Run: `npx vitest run src/ai`
Expected: `tacticalAdvisor.prompt.test.ts` PASSES (the new `profile` field is additive; its assertions check other fields). `chat.prompt.test.ts` FAILS on the `emits a global-scope context block` snapshot test — the global block now carries a `profile` key.

- [ ] **Step 5: Refresh the chat snapshot**

Run: `npx vitest run src/ai/chat.prompt.test.ts -u`
Expected: the snapshot is rewritten. Inspect the diff — the only change is the added `"profile": null` key in the global-scope block. Re-run `npx vitest run src/ai` → PASS.

- [ ] **Step 6: Confirm the `index.ts` Step 6 wiring compiles**

If Task 11 Step 6 was deferred, apply it now (add `profile: userContext.profile,` to the `generateNarratives` and `runTacticalAdvisor` call objects).

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ai/narratives.ts src/ai/tacticalAdvisor.ts src/ai/chat.ts src/ai/__snapshots__ src/index.ts
git commit -m "feat(ai): pass investor profile into narrative, advisor, and chat context"
```

---

## Task 16: Full-pipeline verification

**Files:** none — verification only.

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS — all engine + intake tests, including every test added by this plan.

- [ ] **Step 2: Typecheck both projects**

Run: `npx tsc --noEmit && npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS — both clean.

- [ ] **Step 3: End-to-end with no profile (regression check)**

Ensure the configured `user-context.json` has `profile: null` (or delete it so `emptyUserContext` is used). Run `npm run analyze`. Confirm the portfolio score, grade, dimension scorecard, and benchmark comparison match the pre-feature baseline (compare against `git stash`-ed `output/analysis.json` if needed). This proves the no-profile fallback is byte-faithful.

- [ ] **Step 4: End-to-end with an Aggressive profile**

`npm run report`, save an Aggressive profile (age 40) in the panel. Stop the report, run `npm run analyze`. Confirm the console shows `Profile: age 40, aggressive (not graded: bond_balance)`, the scorecard has 10 graded dimensions, `output/analysis.json` has `dropped_dimensions` with a `bond_balance` entry, and `portfolio_score` is renormalized across the remaining weights. `npm run report` and confirm the scorecard "not graded" row and the bond-free radar.

- [ ] **Step 5: End-to-end with a Conservative profile**

Save a Conservative profile (age 65), `npm run analyze`. Confirm `bond_balance` is graded with a higher FI target (the `display_value` shows an elevated target range), and the cash dimension is more lenient than the no-profile run.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test: full-pipeline verification for user profile feature"
```

---

## Notes for the implementer

- **Circular-import safety:** `dimensions.ts` imports `deriveScoringProfile` from `riskProfile.ts`, and nothing in `riskProfile.ts` imports from `dimensions.ts` (the FI tables were moved *out* of `dimensions.ts` in Task 2). There is no cycle.
- **The `sp` parameter is optional everywhere** it was added to engine functions. Omitting it reproduces today's behavior — that is the no-profile fallback and the reason existing tests need no edits beyond the ones spelled out.
- **`computePortfolioScore` divides by Σ(weight).** Because the full 11 dimension weights sum to 1.0, this is a no-op for a complete set and only matters when a dimension is dropped. `buildReferenceModels` uses the identical normalization so the comparison stays fair.
- **Tuning values** (FI-target tables, knob multipliers in `riskProfile.ts`) are first-draft per the design spec. They are all isolated in `riskProfile.ts` and safe to adjust after seeing real output — adjusting them only touches `riskProfile.test.ts`.
