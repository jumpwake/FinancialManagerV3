# V3 — Sr Financial Advisor + Account Model Design

**Date:** 2026-05-12
**Branch:** `UpdatesV3` (branched from `main`)
**Status:** Design — pending user approval before implementation planning

---

## 1. Goals

Transform the portfolio analyzer from a passive scoring tool into an active financial advisor. Establish the data foundation required to do that honestly: tax-aware, account-aware, with correct underlying-composition math. Fix the analytical inaccuracies that today let cross-broker duplicates and balanced/target-date funds distort dimension scores.

**Three outcomes the user should feel:**

1. Reports recommend *specific* dollar moves in *specific* accounts, not generic phase descriptions.
2. The score reflects the user's portfolio honestly — cross-broker duplicates of the same exposure don't penalize, balanced funds contribute correctly to equity and FI weights, account-locked balances don't count as idle cash drag.
3. The chat advisor is the active intelligence layer — drillable from any dimension, any move, any flag.

---

## 2. Scope

Six items, three waves. Wave boundaries are commit-friendly: each wave can ship and be reviewed independently.

| # | Item | Wave |
|---|------|------|
| 1 | Per-dimension chat (Sr Financial Advisor on any dimension row) | 1 |
| 2 | KeyFindings header bug ("Strength: Strength" / "Gap: Gap") | 1 |
| 3 | Cross-broker fund equivalence (asset-class-based, account-aware) | 2 |
| 4 | Account model — broker, tax treatment, constraints | 2 |
| 5 | Post-T3 toggle with AI-targeted deployment recommendation | 3 |
| 6 | Section 9 — Tactical 7-day / 30-day moves | 3 |

Plus two additions identified during design:

- **Balanced/target-date fund composition decomposition** (Wave 2). Fixes a real analytical bug where VWENX and target-date funds don't contribute to `equity_weight` or `fixed_income_weight` at all today.
- **New 11th dimension: Asset Location** (Wave 2). Captures the tax-efficiency-of-account-placement concern unlocked by the account model.

---

## 3. Sequencing rationale

**Wave 1** ships visible improvements in 1–2 commits without touching the data model — validates the chat-as-advisor pattern before committing the full advisor implementation in Wave 3.

**Wave 2** is the foundational refactor. Everything downstream depends on per-holding `account_id` and accurate underlying composition. This wave is engine-heavy, TDD-disciplined per existing project policy.

**Wave 3** is the advisor layer riding on top of the Wave 2 foundation. New AI call, two new UI surfaces (Post-T3 toggle and Section 9), tied back into the existing Situations system.

---

## 4. Wave 1 — Quick wins

### 4.1 KeyFindings header bug

**Problem:** `App.tsx` constructs findings as `{type: "strength", title: "Strength", body: s}`. `KeyFindings.tsx` then renders both the `type`-derived colored label AND the `title`, producing "Strength: Strength: …" visually.

**Fix:** UI-only. In `KeyFindings.tsx`, drop the duplicated `title` render. The colored severity label already communicates the finding type; the body carries the content. No schema change to narratives, no engine change.

**Files modified:**

- `src/report/app/sections/KeyFindings.tsx`

**Testing:** Manual visual verification.

### 4.2 Per-dimension chat

**Behavior:** Each row of the Dimension Scorecard (Section 3) gets a 💬 button. Clicking sets `scope = { type: "dimension", dimension_id }`. The sidebar opens (or pops to focus if collapsed), scope chip shows e.g. "Diversification — 6/10". The user asks "How do I raise this?" The advisor answers, scoped to that dimension with the full portfolio + macro + open situations as context. After Wave 2 lands, the chat is automatically tax-aware and account-aware via the enriched prompt context.

**Type changes** (`src/types.ts` and the mirror in `src/report/app/types.ts`):

```ts
export interface ChatScope {
  type: "global" | "flag" | "gap" | "situation" | "dimension";
  finding_key?: string;
  situation_id?: string;
  dimension_id?: string;   // NEW
}
```

**Server changes** (`src/server/handlers/chat.ts` + `src/ai/chat.ts`): when scope is `dimension`, the prompt injects the full `DimensionScore` (id, label, score, display_value, note, weight). System prompt grows a paragraph: when scope is a dimension, the advisor's job is to explain the current score and recommend concrete moves to raise it within the user's portfolio.

**UI changes** (`src/report/app/sections/DimensionScorecard.tsx`): 💬 button per row, same pattern as `Flags.tsx` and `Gaps.tsx`. `App.tsx` passes `onDiscuss={(id) => setScope({ type: "dimension", dimension_id: id })}`.

**Files modified:**

- `src/types.ts`
- `src/report/app/types.ts`
- `src/ai/chat.ts`
- `src/ai/chat.prompt.test.ts` (snapshot of dimension-scope prompt)
- `src/server/handlers/chat.ts`
- `src/report/app/App.tsx`
- `src/report/app/sections/DimensionScorecard.tsx`

**Testing:** TDD on the prompt-render snapshot for dimension scope. Manual verification of the UI interaction.

---

## 5. Wave 2 — Foundation: account model, fund equivalence, fund composition

### 5.1 Account metadata file

**New file:** `data/accounts.json` (gitignored, with `accounts.example.json` committed). Holds account-level metadata that maps raw broker exports to logical accounts.

```ts
interface AccountConfig {
  accounts: AccountMetadata[];
}

interface AccountMetadata {
  id: string;                 // stable key, e.g. "vanguard_kdb_roth"
  label: string;              // human display name, e.g. "Kelly's Vanguard Roth IRA"
  broker: "Fidelity" | "Empower" | "Vanguard" | "Schwab" | "Other";
  account_type:
    | "roth_ira"
    | "pretax_ira"
    | "401k_traditional"
    | "401k_roth"
    | "taxable_brokerage"
    | "business_taxable"
    | "cash_balance_plan"
    | "hsa";
  owner: string;              // free-form: "you", "Kelly", "business", "joint"
  source_files: string[];     // which raw exports contribute to this account
  constraints?: {
    conservative_only?: boolean;        // CBP — must stay in income/conservative
    cash_reserve_minimum?: number;      // Business — keep $X liquid
    target_return?: number;             // e.g. 0.05 for CBP
    excluded_from_deployment?: boolean; // skip from Post-T3 / Section 9 recommendations
  };
}
```

`tax_treatment` derives from `account_type`:

- `roth_ira` / `401k_roth` / `hsa` → tax-free growth
- `pretax_ira` / `401k_traditional` / `cash_balance_plan` → tax-deferred
- `taxable_brokerage` / `business_taxable` → taxable currently

**Why a separate file (not embedded in raw exports):** broker exports are refreshed weekly. Metadata must survive refresh.

**Validation:** new `src/intake/parseAccounts.ts` with zod schema, TDD'd. If a raw broker file isn't claimed by any account in `accounts.json`, normalize fails with a clear error.

### 5.2 Per-holding `account_id`

**Type change** (`src/types.ts`):

```ts
export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  account_id: string;          // NEW — required
  // ... existing fields
}
```

`normalize.ts` attaches `account_id` during normalization by looking up the source filename in `accounts.json`. `consolidatePortfolio()` becomes account-aware: it merges identical tickers *within an account* (e.g., two SPAXX entries from the same Fidelity export get summed), but never *across accounts* — cross-account duplicates stay as separate rows because they need distinct `account_id`s.

### 5.3 Cross-account duplicate handling

**Insight:** The donut chart in `AllocationBreakdown.tsx` already groups holdings by `asset_class`. FSKAX and VTSAX already show as a single "US Equity (Total Market)" slice. Engine equivalence should align to the same model — no separate fund-equivalence file needed.

**`aggregates.ts` changes:**

- Split `duplicate_groups` into two outputs:
  - `duplicate_groups: DuplicateGroup[]` — same `asset_class`, same `account_id`. Genuine waste. Drives Simplicity and Diversification penalties as today.
  - `cross_account_groups: CrossAccountGroup[]` — same `asset_class`, different `account_id`s. Informational only, **not** penalized. Surfaced in the report as a neutral note: "FSKAX (Fidelity) and VTSAX (Vanguard) are the same exposure across brokerages — fine."
- New aggregate fields: `idle_cash_weight` (already exists) excludes cash from accounts where `constraints.excluded_from_deployment === true`. New `constrained_cash_weight` captures that excluded cash for the report.

**`dimensions.ts` changes:**

- `scoreSimplicity`: "effective positions" counts distinct `asset_class` values held (matches the donut buckets). Holdings in cross-account groups count once per asset_class.
- `scoreDiversification`: overlap penalty only fires on same-account duplicates, never on cross-account ones.
- `scoreCashEfficiency`: uses `idle_cash_weight` (which already excludes constrained accounts).

### 5.4 Balanced and target-date fund composition decomposition

**Problem today:** `VWENX` and target-date funds get `asset_class: balanced` or `target_date`. The engine treats those as their own bucket — `balanced_weight` is exposed, but the equity and FI *inside* those funds don't contribute to `equity_weight` or `fixed_income_weight`. This makes Bond Balance scoring, Macro Alignment scoring, and Concentration scoring all systematically wrong when balanced or target-date funds are held.

**Fix — explicit composition on each balanced/target-date holding:**

```ts
export interface UnderlyingComposition {
  us_equity: number;
  international_equity: number;
  fixed_income: number;
  cash: number;
}
// invariant: sums to 1.0 (validated in zod)

export interface Holding {
  // ...
  underlying_composition?: UnderlyingComposition;
}
```

**Where composition comes from:**

- **Known funds in `tickerMetadata.ts`** carry an explicit composition. E.g. `VWENX` → `{us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0}`.
- **Target-date funds** use a glide-path helper: composition derived from `years_to_target` (extracted from label, e.g., "Target Retirement 2040 Fund" → 2040). Helper formula refresh annually; tests pin specific years/compositions to detect drift.
- **Unknown balanced/target-date holdings**: default to `balanced` → `{us_equity: 0.55, international: 0.05, fi: 0.40, cash: 0.0}`; `target_date` → glide path estimate. Normalize logs a warning so the user knows a default was applied.

**Engine integration in `aggregates.ts`:**

For each holding, if `underlying_composition` is present, contribute to each weight bucket proportionally:

```ts
equity_weight += w(h) * (comp.us_equity);
international_weight += w(h) * (comp.international_equity);
fixed_income_weight += w(h) * (comp.fixed_income);
cash_weight += w(h) * (comp.cash);
```

Otherwise fall back to the legacy whole-holding-by-asset-class logic. `balanced_weight` stays in the aggregates output (the report still shows "% in balanced funds") but the equity and FI weights now include the equity/FI portion of balanced funds.

**UI** (Allocation Breakdown):

- Donut keeps balanced/target-date as visible slices — preserves the fact that the user can see which balanced funds they hold.
- Small text note below the donut: "Balanced and target-date funds are decomposed for scoring — VWENX ($110K) contributes ~$66K equity / ~$38K FI."

(Option 2 — donut decomposition — is deferred to V4.)

### 5.5 New 11th dimension: Asset Location

**Concept:** measures how tax-efficiently the portfolio places different asset types across account types.

**Heuristic scoring** (in `src/engine/dimensions.ts`, `scoreAssetLocation`):

- **Penalties:**
  - High-yield bonds / high-distribution funds in taxable: -1.5 per 5% of taxable allocation
  - Growth equities in pre-tax (locks ordinary-income tax on what could be LTCG): -1.0 per 5% of pre-tax allocation in growth
  - Tax-efficient broad-market funds wasted in Roth (Roth is precious — better for highest-growth assets): -0.5 per 5% of Roth allocation in plain total-market
  - Individual stocks in pre-tax (loses LTCG benefit): -1.0 per 5% of pre-tax in individual_stock
- **Bonuses:**
  - High-growth allocations in Roth: +1.0 per 5% in Roth
  - Bonds and high-distribution funds in pre-tax: +0.5 per 5% in pre-tax
- Starts at 7, clamped [1, 10].

**Weight:** 0.08. All other dimension weights rebalance proportionally so the sum stays 1.0. CLAUDE.md's "benchmarks weights must stay in sync with dimensions weights" invariant carries forward.

**Reference models** (`benchmarks.ts`): all three reference models get `asset_location: 7` (neutral). The reference models are abstract conceptual portfolios with no tax/account context; a neutral score is honest.

### 5.6 Plan adjustments (`plan.ts`)

- Recommendations cite specific target accounts by label, not just tickers ("Buy $40K of VBTLX in Pre-Tax IRA", not "Add VBTLX").
- Asset-location flags: new flag category. Example: "`VWENX` in Taxable Brokerage — ~2.5% annual distributions taxed as ordinary income (~$2.7K/yr drag). Better in Pre-Tax IRA."
- CBP and Business accounts excluded from "deploy idle cash" recommendations.
- Cross-broker duplicate flags suppressed (now handled as `cross_account_groups`, informational).

### 5.7 UI changes for Wave 2

- **Allocation Breakdown holdings table**: new `Account` column showing the account label, muted styling.
- **Cross-account note**: small informational callout below the holdings table when `cross_account_groups` is non-empty: "These exposures are held across multiple accounts — that's expected with multiple brokerages, not a flag."
- **Composition note**: as described in 5.4.
- No new section yet (Section 9 is Wave 3).

### 5.8 Files added or modified in Wave 2

```
NEW:
  data/accounts.example.json
  src/intake/parseAccounts.ts (+ test)
  src/engine/composition.ts (+ test)    // glide-path helper for target-date

MODIFIED:
  src/types.ts                          // Holding.account_id, UnderlyingComposition,
                                        // AccountMetadata, aggregate field changes,
                                        // ChatScope (already in Wave 1)
  src/intake/normalize.ts               // attach account_id, attach underlying_composition
  src/intake/tickerMetadata.ts          // composition for known balanced funds
  src/intake/parsePortfolio.ts          // zod validation of new fields
  src/engine/aggregates.ts              // account-aware duplicates, composition math,
                                        // idle vs constrained cash
  src/engine/dimensions.ts              // account-aware Simplicity/Diversification,
                                        // composition-aware bond balance/macro/etc.,
                                        // new scoreAssetLocation()
  src/engine/benchmarks.ts              // asset_location: 7 on all reference models,
                                        // weights rebalanced
  src/engine/plan.ts                    // account-aware recommendations,
                                        // asset-location flags
  src/index.ts                          // load accounts.json, pass to normalize
  src/report/app/types.ts               // mirror new types
  src/report/app/sections/AllocationBreakdown.tsx  // Account column,
                                                   // composition note, cross-account note
  CLAUDE.md                             // new invariants: account identity preserved,
                                        // composition decomposition, asset_location weight
  .gitignore                            // data/accounts.json
```

**Testing:** TDD on everything in `src/engine/*` and `src/intake/parseAccounts.ts`. Manual verification on `normalize.ts`, `plan.ts` (per existing project policy — these are orchestration-heavy). React UI changes verified manually.

---

## 6. Wave 3 — Advisor

### 6.1 Shared advisor AI call

**New file:** `src/ai/tacticalAdvisor.ts`. One Anthropic call per analyze run, in addition to the existing `narratives` call and per-Situation `pulseCheck` calls. Uses Opus by default (highest-stakes call — concrete trade recommendations); env override `CLAUDE_MODEL_ADVISOR`. Anthropic SDK `messages.parse()` with a Zod output schema, same pattern as `narratives.ts`.

**Output schema:**

```ts
interface TacticalAdvisorOutput {
  deployment_recommendation?: {            // present only if pending_cash_value > 0
    summary: string;                       // 1-2 sentences framing the deployment
    moves: DeploymentMove[];
    projected_grade: string;
    projected_dimension_deltas: Record<string, number>;
  };
  tactical_plan: {
    summary: string;                       // 1-2 sentences framing the next month
    target_grade: string;                  // where the moves take us
    next_7_days: TacticalMove[];           // 0-3 moves
    next_30_days: TacticalMove[];          // 0-3 moves
    scenario_resilience_notes: string[];   // 2-3 bullets on fortification
  };
}

interface DeploymentMove {
  id: string;
  ticker: string;
  dollars: number;
  target_account: string;                  // account label
  rationale: string;
}

interface TacticalMove {
  id: string;
  category:
    | "deploy_cash"
    | "rebalance"
    | "trim"
    | "asset_location_swap"
    | "scenario_hedge"
    | "tax_loss_harvest";
  action: string;                          // "Sell $15K QQQ in Pre-Tax IRA,
                                           //  buy VTSAX in Roth IRA"
  target_account: string;                  // account label or "across accounts"
  dollars: number;
  rationale: string;
  scenarios_addressed: string[];           // ["recession", "inflation"]
  expected_score_delta?: number;
}
```

**Prompt context** (passed as structured user input):

- Portfolio + aggregates + dimension scores + flags + gaps (already available from engine)
- Account model from Wave 2 (account_id → tax treatment + constraints)
- Fund composition for balanced/target-date holdings (from Wave 2)
- Macro context (regime, VIX, yield curve, LEI, sector overweights/underweights)
- Open Situations (so moves don't conflict with active tracked decisions)

**Why one call, not two:** deployment_recommendation and tactical_plan share all context. Splitting into two calls doubles the cost without adding value. Both are structured outputs from a single advisor session.

**Why pre-compute, not live:** the advisor output is cached in `output/analysis.json` at analyze time. The UI toggles in section 5 and section 9 just display pre-computed structured data. Re-running the advisor requires re-running `npm run analyze`. This matches the user's weekly-review workflow and keeps API cost predictable. Chat-driven what-ifs happen via the existing chat infrastructure.

### 6.2 Sr Financial Advisor persona (shared system prompt)

A consolidated persona used by:

- `tacticalAdvisor.ts` (new)
- `chat.ts` when scope is dimension, flag, gap, situation, or tactical_move (the chat that already exists, now enriched)

**Persona traits:**

- CFA with twenty years of advisory experience
- Concrete dollars and specific accounts; never vague
- Cites macro and scoring context for each recommendation ("the FI underweight at 8% vs. the 18% Late-Cycle target")
- Multi-objective: lift score, fortify against scenarios (recession, inflation, equity drawdown), maximize within constraints (taxes, account rules)
- Same style rules as narratives: Unicode minus `−` (U+2212), no words "robust" or "optimize", actual values not vague language

**Where the prompt lives:** new shared file `src/ai/advisorPersona.ts` exports the system prompt string. Used by `tacticalAdvisor.ts` and imported into `chat.ts`'s system prompt builder.

### 6.3 Post-T3 toggle (Allocation Breakdown)

Replaces the existing `TODO` stub in `AllocationBreakdown.tsx`.

**Visibility:** toggle is rendered only when `data.tactical_advisor?.deployment_recommendation` is present (i.e., pending cash > 0 and the advisor produced a recommendation).

**Layout:**

```
[ ↓ Project post-deployment allocation ]    <- collapsed state, button

When clicked, expands inline:

  Recommended deployment       Current grade: B  →  Projected: B+
  ─────────────────────────────────────────────────────────────
  Summary: <advisor's 1-2 sentence framing>

  ▸ $40,000  →  VBTLX in Pre-Tax IRA           [💬] [+ Situation]
                Rationale: ...
  ▸ $25,000  →  VTIP in Pre-Tax IRA            [💬] [+ Situation]
                Rationale: ...
  ▸ $20,000  →  VTSAX in Roth IRA              [💬] [+ Situation]
                Rationale: ...

  Projected allocation (post-deployment):

  [donut + holdings table re-rendered with pending cash redistributed
   per the moves above]
```

**Interactions:**

- 💬 button per move row → sets sidebar scope to `{type: "tactical_move", move_id}` (new scope type)
- "+ Situation" button per move → calls `POST /api/situations` with a pre-filled Situation derived from the move (title from action, body from rationale, `portfolio_effects` derived if applicable). Once tracked, the row shows a "tracked" pill.

### 6.4 Section 9 — Next moves (new section in `App.tsx`)

**Position:** after Section 8 (Flags), as the natural conclusion of the report. The page header gains a small anchor link "↓ Jump to recommended moves" for users who want to skip the analysis.

**Component:** new `src/report/app/sections/NextMoves.tsx`.

**Layout:**

```
Section 9 — Next moves
────────────────────────────────────────────────────────────────
<summary>
Current grade: B   →   Target: A−

Next 7 days       (N moves)
  ▸ [DEPLOY]   <action>                                [💬] [+ Situation]
                Rationale: ...
                Addresses: yield-curve risk, drawdown
  ▸ ...

Next 30 days      (N moves)
  ▸ ...

Scenario resilience
  • <note>
  • <note>
```

**Category pills** color-coded:

- `deploy_cash` — amber
- `rebalance` — blue
- `trim` — gray
- `asset_location_swap` — green (tax win)
- `scenario_hedge` — purple
- `tax_loss_harvest` — teal

**Interactions:** same 💬 and "+ Situation" pattern as Post-T3 moves.

### 6.5 Situation integration

The "+ Situation" button:

1. Builds a Situation payload from the move:
   - `title`: derived from `action` (truncated)
   - `intent`: `rationale`
   - `target_date`: 7 days or 30 days out depending on `window`
   - `related_findings`: links to the dimensions whose deltas the move addresses
   - `portfolio_effects`: derived if the move category is `deploy_cash` (uses `mark_cash_pending` with the dollar amount and target account)
2. `POST`s to `/api/situations`.
3. UI updates to show the move as tracked, with a link to the new Situation.
4. On the next `npm run analyze` run, pulse-check runs on the new Situation just like any other.

This closes the loop: advisor recommends → user tracks → engine applies portfolio_effects → next analysis reflects the planned move → pulse-check evaluates whether macro still supports it.

### 6.6 Type changes for Wave 3

```ts
// src/types.ts (and mirror in src/report/app/types.ts)
export interface ChatScope {
  type:
    | "global"
    | "flag"
    | "gap"
    | "situation"
    | "dimension"           // Wave 1
    | "tactical_move";      // Wave 3
  // ...
  move_id?: string;         // Wave 3
}

export interface AnalysisOutput {
  // ...existing fields
  tactical_advisor: TacticalAdvisorOutput | null;  // NEW
}
```

### 6.7 Per-dimension chat upgrade (free with Wave 2 + 3)

No new code in Wave 3 for the dimension chat. The chat handler's prompt builder already injects portfolio + aggregates + dimension scores. Once Wave 2 adds account model and composition to those data structures, the dimension chat is automatically tax-aware and account-aware. Once Wave 3 adds the shared advisor persona system prompt, the dimension chat speaks with the same voice as Section 9. Both come "for free" because the changes happen upstream in shared prompt context.

### 6.8 Files added or modified in Wave 3

```
NEW:
  src/ai/tacticalAdvisor.ts
  src/ai/tacticalAdvisor.prompt.test.ts
  src/ai/advisorPersona.ts                          // shared system prompt
  src/report/app/sections/NextMoves.tsx

MODIFIED:
  src/types.ts                                      // TacticalAdvisorOutput,
                                                    // ChatScope tactical_move
  src/report/app/types.ts                          // mirror
  src/ai/chat.ts                                   // import shared persona,
                                                    // handle dimension + tactical_move scope
  src/server/handlers/chat.ts                      // tactical_move scope
  src/index.ts                                     // call tacticalAdvisor,
                                                    // embed in analysis.json
  src/report/app/App.tsx                           // render Section 9, anchor link
  src/report/app/sections/AllocationBreakdown.tsx  // Post-T3 toggle
  src/report/app/sidebar/Sidebar.tsx               // tactical_move scope chip
  CLAUDE.md                                        // refresh: 2 Anthropic calls per run
                                                    // baseline + N pulse-checks
                                                    // (instead of "exactly one")
```

**Testing:** TDD on the prompt-render snapshot for `tacticalAdvisor.ts`. Manual verification for UI surfaces. The engine doesn't change in Wave 3 — only the AI layer and UI.

---

## 7. Cross-cutting concerns

### 7.1 Testing strategy

- **TDD** (red-green-commit): everything in `src/engine/*`, `src/intake/parseAccounts.ts`, `src/intake/normalize.ts` changes for account_id + composition, `src/engine/composition.ts` (glide-path helper), prompt-render snapshots for `tacticalAdvisor.ts` and `chat.ts`'s new scopes.
- **Manual verification**: `src/index.ts` orchestration, AI call wrappers themselves (not the prompt renderers), all React UI changes, the Post-T3 toggle interaction, the "+ Situation" flow.

This matches the existing project policy in CLAUDE.md.

### 7.2 Migration / sample data

The sample portfolio in `data/SamplePortfolio/*.json` will need a corresponding `data/accounts.example.json` so the example flow works end-to-end. The five sample files map to five accounts; tax treatments and constraints filled in plausibly (e.g., `20260509_FidelityRetirement.json` → pretax_ira; `20260509_VanguardBusiness.json` → business_taxable with `cash_reserve_minimum`). The committed example accompanies the spec.

### 7.3 Cost / model usage

| Call | Model | Per-run |
|------|-------|---------|
| `narratives` | `claude-sonnet-4-6` (env-overridable) | 1 |
| `tacticalAdvisor` | `claude-opus-4-7` (env-overridable) | 1 |
| `pulseCheck` | `claude-opus-4-7` (env-overridable) | 0..N (one per open Situation) |
| `chat` | `claude-sonnet-4-6` (env-overridable) | streaming, user-initiated |

CLAUDE.md's "exactly one Anthropic API call per run" invariant is updated to reflect this: "Two structured Anthropic calls per run (narratives + tacticalAdvisor), plus one pulseCheck per open Situation. Chat is user-initiated and streams separately."

### 7.4 CLAUDE.md updates

- Bump invariant about API calls per run (above).
- Add: "Account identity is preserved per holding via `Holding.account_id`. Normalize attaches it from `data/accounts.json`."
- Add: "Balanced and target-date holdings carry `underlying_composition` summing to 1.0. Aggregates use this to compute true equity/FI weights."
- Add: "Asset Location is the 11th dimension at weight 0.08. Reference models score neutral 7."
- Remove: "Post-T3 projected weights toggle is stubbed" (delivered in Wave 3).
- Update: section count in the React report (8 → 9).

---

## 8. Out of scope (deferred to V4 or later)

- **Quantitative scenario analysis** (Monte Carlo simulation, value-at-risk). The advisor's `scenario_resilience_notes` are qualitative.
- **UI for user-driven fund equivalence merging** (Option C from the brainstorming discussion). Asset-class-based default handles the user's stated case.
- **Decompose-balanced-funds donut toggle** (Option 2 in section 5.4). The donut keeps balanced funds as visible slices; decomposition is analysis-only.
- **Live deployment recommendation re-computation** in the UI. Recommendations are computed at analyze time, cached in `analysis.json`.
- **UI rendering of the existing 4-phase strategic Development Plan**. The plan still gets generated in engine output and printed in the CLI; React app surfaces Section 9 only. (The 4-phase plan can be added as a React section in a future wave if needed.)
- **Multi-snapshot historical tracking**. Each analyze run is still independent.

---

## 9. Risks and trade-offs

- **Asset Location dimension scoring is heuristic.** The penalties and bonuses in section 5.5 are reasonable starting values; they may need tuning as we see real outputs against the sample portfolio. Tests probe the ladder at boundary values to catch off-by-one regressions but don't validate "is the right answer" — that's manual review.
- **Target-date glide-path formula will drift annually.** A 2040 fund today is ~80/20 equity/FI; in 2034, the same fund is ~55/45. The composition helper takes "current year" as a parameter and derives composition from years-to-target. Tests pin specific (target_year, current_year, expected composition) tuples so drift is detectable.
- **Cost increase.** Adding the tacticalAdvisor Opus call roughly doubles per-run token spend on the deterministic side. Acceptable for weekly runs; not acceptable if analyze were running continuously. The chat path is unchanged.
- **Spec assumes single-user accounts.json.** Multi-user / shared portfolios are out of scope.
- **Section 9 quality is gated on prompt quality.** The advisor's recommendations are only as good as the persona prompt + structured context. Plan for an iteration cycle on the prompt after Wave 3 lands.

---

## 10. Confirmed design decisions

Captured here so implementation has no ambiguity:

1. Approach B (quick wins → foundation → advisor) over Approach A (foundation-first).
2. Asset-class as the fund-equivalence default; no separate `fund-equivalence.json`.
3. Option 1 for balanced/target-date UI (donut keeps balanced slices visible, with a text note explaining decomposition).
4. Single advisor AI call generating both deployment recommendation and tactical plan.
5. Pre-computed advisor output cached in `analysis.json`; no live calls from the UI.
6. Section 9 positioned after Section 8 (with anchor link at top of page).
7. "+ Situation" auto-creates a Situation from a move (not chat-only).
8. Asset Location is an 11th dimension at weight 0.08; reference models score neutral 7.
9. `accounts.json` is gitignored; `accounts.example.json` committed.
10. The existing 4-phase strategic Development Plan in engine output stays — Section 9 supplements rather than replaces it.
