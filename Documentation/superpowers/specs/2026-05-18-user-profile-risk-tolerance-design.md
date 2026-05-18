# User Profile: Age + Risk Tolerance — Design

**Date:** 2026-05-18
**Status:** Approved design — ready for implementation plan

## Summary

Capture two facts about the user — `age` and a 5-level `risk_tolerance` — and let
them **drive the analysis**. The engine today scores every portfolio against a
fixed model. With a profile present, the "ideal" portfolio adapts to the person:
the fixed-income target shifts, four other dimensions re-tune their ladders, and
`bond_balance` can be dropped from grading entirely for an aggressive or
young-and-aggressive investor.

The profile is entered via a form in the React report, stored in that user's
`user-context.json`, and read by the engine at `analyze` time. When no profile
is present, the engine behaves exactly as it does today — the same graceful
fallback `asset_location` uses when there is no `accounts.json`.

## Goals

- Capture `age` and `risk_tolerance` per user, persisted in `user-context.json`.
- Make the analysis adapt: FI target, `cash_efficiency`, `concentration`,
  `single_stock_risk`, `quality_tilt`, and which dimensions are graded at all.
- Keep the benchmark comparison fair — reference models are graded on the same
  dimension set as the user.
- No profile → identical output to today. No regressions for existing data.

## Non-goals

- No per-holding scoring (V3 abandoned that — invariant preserved).
- No new dimensions. The 11 dimensions are unchanged in identity.
- No income, goals, time-horizon, or tax-bracket capture — only age + risk
  tolerance this round.
- No partial-weight "de-emphasis" state. A dimension is either graded or
  dropped — one mechanism.

## Approach

Chosen: **profile in `UserContext` + a new pure `riskProfile.ts` engine module**
(Approach A of three considered). The report backend already owns
`user-context.json`, so the profile rides existing persistence. Rejected:
a standalone `data/profile.json` (second persistence path, less cohesive) and
keeping all 11 dimensions with weight 0 for drops (produces a confusing greyed
scorecard row and a dead radar spoke — "not graded" is more honest as an
absence).

## Section 1 — Data model

```ts
// src/types.ts
export type RiskTolerance =
  | "conservative" | "moderately_conservative" | "moderate"
  | "moderately_aggressive" | "aggressive";

export interface UserProfile {
  age: number;                  // validated 18–100
  risk_tolerance: RiskTolerance;
}

export interface UserContext {
  version: 2;                   // bumped from 1
  profile: UserProfile | null;  // null = not yet captured
  situations: Situation[];
  notes: Note[];
  chat_history: ChatMessage[];
}
```

- `parseUserContext` (`src/intake/parseUserContext.ts`) accepts **version 1 or 2**:
  - A v1 file (no `profile` field) is migrated in-memory to v2 with
    `profile: null`. Implemented as a zod `preprocess`/`transform` ahead of the
    v2 schema, so disk files written before this feature still load.
  - A v2 file validates `profile` as `UserProfile | null`.
- `emptyUserContext()` returns `{ version: 2, profile: null, situations: [],
  notes: [], chat_history: [] }`.
- `UserProfileSchema`: `age` is an integer in `[18, 100]`; `risk_tolerance` is
  the 5-value enum.
- `analysis.json` (assembled in `src/index.ts`) gains a top-level `profile`
  field echoing `userContext.profile`, so the report can display the active
  values without re-reading `user-context.json`.

## Section 2 — `src/engine/riskProfile.ts` (new pure module)

Pure in/out, no I/O — consistent with the engine-is-pure-math invariant.
Turns `UserProfile | null` + `MacroContext` into a `ScoringProfile`:

```ts
export interface ScoringProfile {
  activeDimensionIds: Set<string>;    // which of the 11 to grade
  fiTarget: { min: number; max: number };
  cashLeniency: number;               // multiplier on idle-cash thresholds
  concentrationShift: number;         // pp added to top-3 thresholds
  singleStockPenaltyScale: number;    // multiplier on single-stock penalties
  qualityTiltRelaxed: boolean;
}

export function deriveScoringProfile(
  profile: UserProfile | null,
  macro: MacroContext,
): ScoringProfile;
```

**No-profile fallback.** When `profile` is `null`, `deriveScoringProfile`
returns: all 11 dimensions active, `fiTarget` from the existing
`FI_TARGETS_BY_REGIME` regime lookup, `cashLeniency: 1`,
`concentrationShift: 0`, `singleStockPenaltyScale: 1`,
`qualityTiltRelaxed: false`. This guarantees byte-identical analysis to today.

### FI target (when `bond_balance` is active)

Center FI % = age glide path + risk shift + regime nudge. Final range is
`center ± 5pp`, with `min` floored at 0.

Age glide path (center, before shifts):

| Age band | Center FI |
|----------|-----------|
| < 30     | 5%        |
| 30–39    | 12%       |
| 40–49    | 20%       |
| 50–59    | 28%       |
| 60–69    | 36%       |
| 70+      | 42%       |

Risk shift (added to center):

| Risk tolerance         | Shift     |
|------------------------|-----------|
| Conservative           | +10pp     |
| Moderately Conservative| +5pp      |
| Moderate               | 0         |
| Moderately Aggressive  | −6pp      |
| Aggressive             | (dropped) |

Regime nudge (added to center):

| Regime      | Shift |
|-------------|-------|
| Recession   | +5pp  |
| Late Cycle  | +2pp  |
| Mid Cycle   | 0     |
| Early Cycle | −3pp  |

Center is clamped to `[0, 0.55]` before the ±5pp range is formed.

### Drop rule for `bond_balance`

`bond_balance` is omitted from `activeDimensionIds` (not graded) when:

- `risk_tolerance == "aggressive"`, **or**
- `age < 35` **and** `risk_tolerance ∈ {"moderate", "moderately_aggressive"}`.

Otherwise it is active. This is a clean drop — there is no partial-weight state.
`fiTarget` is still computed and exposed for any consumer, but is unused when
`bond_balance` is dropped.

## Section 3 — Per-dimension tuning (4 risk-influenced scorers)

Each affected scorer in `src/engine/dimensions.ts` gains a `ScoringProfile`
parameter and shifts its ladder. All values below are first-draft and tunable.

**`scoreCashEfficiency`** — `cashLeniency` multiplies the idle-cash thresholds
(higher = larger buffer tolerated before penalty):

| Risk      | Cons | Mod-Cons | Mod | Mod-Agg | Agg |
|-----------|------|----------|-----|---------|-----|
| Multiplier| ×1.5 | ×1.25    | ×1.0| ×0.85   | ×0.7|

Age factor: `age ≥ 60` contributes an additional `×1.3`, applied
multiplicatively with the risk multiplier. `cashLeniency` is the product.

**`scoreConcentration`** — `concentrationShift` (pp) is added to each top-3
threshold:

| Cons  | Mod-Cons | Mod | Mod-Agg | Agg   |
|-------|----------|-----|---------|-------|
| −5pp  | −3pp     | 0   | +5pp    | +10pp |

**`scoreSingleStockRisk`** — `singleStockPenaltyScale` multiplies the
accumulated penalty before `score = max(1, 10 − totalPenalty)`:

| Cons | Mod-Cons | Mod  | Mod-Agg | Agg  |
|------|----------|------|---------|------|
| ×1.4 | ×1.2     | ×1.0 | ×0.8    | ×0.6 |

**`scoreQualityTilt`** — when `qualityTiltRelaxed` is true (set only for
`risk_tolerance == "aggressive"`), the score floor is raised so a weak defensive
tilt is not punished — proposed floor of 5 instead of 1. The dimension stays
graded (not dropped) so the radar/scorecard keep the spoke.

The remaining 6 dimensions (`cost_efficiency`, `simplicity`, `diversification`,
`international`, `macro_alignment`, `asset_location`) are unchanged.

## Section 4 — Scoring & benchmarks renormalization

- `scoreAllDimensions(portfolio, agg, macro, accounts, scoringProfile)` builds
  all 11 dimension scores, then **filters the returned array to
  `scoringProfile.activeDimensionIds`**. A dropped dimension is simply absent.
- `computePortfolioScore` becomes `Σ(score·weight) / Σ(weight)`. At the full 11,
  `Σweight == 1.0`, so the result is identical to today. With `bond_balance`
  dropped, it normalizes across the remaining `0.89`.
- `src/engine/benchmarks.ts`: the static `REFERENCE_MODELS` export becomes
  `buildReferenceModels(activeDimensionIds: Set<string>): ReferenceModel[]`. The
  three seeds keep all 11 dimension scores; the builder filters each seed's
  scores to the active set and derives the score with the same `/Σweight`
  normalization. Reference models are graded on the **same dimension set** as
  the user — the comparison stays apples-to-apples.
- `src/index.ts` calls `deriveScoringProfile` once, threads the `ScoringProfile`
  into `scoreAllDimensions`, `buildReferenceModels`, and the `plan.ts`
  generators.
- The `benchmarks.test.ts` invariant — WEIGHTS map in sync with per-dimension
  `weight` fields — is preserved and its assertion updated for the function form.

## Section 5 — `plan.ts` flags/gaps + AI context

- `generateFlags`, `generateGapItems`, and `generatePlanPhases` take the
  `ScoringProfile` and use `scoringProfile.fiTarget` for the FI percentages in
  flag/gap bodies and plan-phase action text — replacing the direct
  `FI_TARGETS_BY_REGIME` lookup. The regime adjectives (e.g. "late-cycle")
  continue to come from `macro.market_regime`.
- When `bond_balance` is dropped, any FI-related flag/gap is **suppressed** — a
  portfolio cannot be flagged for missing bonds it is not graded on.
- **AI**: `narratives.ts`, `tacticalAdvisor.ts`, and `chat.ts` receive the
  `profile` in their context block, so prose can reference the investor
  concretely ("for a 42-year-old, moderately-aggressive investor…"). The flags
  and scores these calls summarize already reflect the profile; this is a small
  prompt-context addition for coherence, not a behavior change. AI still does
  not score or compute math.

## Section 6 — Report UI + server handler

- **`src/server/handlers/profile.ts`** — `handleProfileRoute`:
  - `GET /api/profile` → returns `ctx.profile` (`UserProfile | null`).
  - `PUT /api/profile` → validates the body as `UserProfile`, writes it via
    `mutateUserContext`, returns the saved profile. Invalid body → 400.
  - Follows the structure of `handlers/notes.ts` (`readBody`, `sendJSON`).
- **`vitePlugin.ts`** — register a `/api/profile` route alongside the existing
  situations/notes/chat routes.
- **`ProfilePanel`** component (`src/report/app/`): a compact card near the top
  of the report showing age + risk tolerance, with an inline edit form (number
  input + 5-option select). On save → `PUT /api/profile` → toast: *"Saved —
  re-run `npm run analyze` to apply."* Same edit-then-re-analyze loop as
  situations.
- **`DimensionScorecard`**: a dropped dimension renders as a muted row — e.g.
  *"Bond balance — not graded (Aggressive risk profile)"* — so the user
  understands why it is gone. **`RadarChart`** plots only the active dimensions
  (no dead spoke).
- **`src/report/app/types.ts`** mirror gains `RiskTolerance`, `UserProfile`, and
  the `profile` field on the analysis type.

## Section 7 — Testing

- **TDD (engine + intake)** — co-located `*.test.ts`:
  - `riskProfile.test.ts`: FI-target age-band ladder (with boundary probes at
    29/30, 39/40, 49/50, 59/60, 69/70), risk and regime shifts, the
    `bond_balance` drop rule (including the `age < 35` edge at 34/35), every
    tuning knob, and the `null`-profile fallback.
  - `dimensions.test.ts`: extend the 4 modified scorers for profile-shifted
    ladders; assert the 6 untouched scorers are unchanged.
  - `computePortfolioScore`: renormalization test — full 11 equals today's
    result; with a dimension dropped, normalizes across remaining weights.
  - `benchmarks.test.ts`: `buildReferenceModels` for full and reduced dimension
    sets; WEIGHTS-in-sync invariant updated.
  - `parseUserContext.test.ts`: v1→v2 migration, v2 round-trip, profile
    validation bounds.
- **Manual** (per CLAUDE.md convention — CLI/handlers/UI are not unit-tested):
  `handleProfileRoute`, `ProfilePanel`, scorecard/radar rendering with a
  dropped dimension, and a full `npm run analyze` run with a profile set.
- Both TypeScript projects must stay clean:
  `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`.

## Risks / open tuning points

- All numeric tables in Sections 2–3 are first-draft. They are isolated in
  `riskProfile.ts` and easy to tune after seeing real output.
- The `age < 35` drop rule for moderate/mod-aggressive investors is a judgment
  call; if it feels too aggressive in practice, narrow it to mod-aggressive
  only.
- Existing `user-context.json` files on disk are v1 — the migration path in
  `parseUserContext` is load-bearing and must be covered by a test.
