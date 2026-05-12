# V2 Phase 1 — Chat, Memory, and Situations

**Status:** spec — design approved, awaiting implementation plan
**Author session:** brainstorming, 2026-05-12
**Scope:** Phase 1 of V2. Phases 2-4 (history/drift, what-if simulator, goals-driven scoring) are explicitly out of scope but referenced where they touch this phase's design.

## 1. Motivation

V1 produces a one-way report. Findings can be wrong about your situation in ways the engine can't know — a 25% cash position looks like cash drag but is actually mid-rollover. There's no way to push context back into the system, and no way for the system to track what's pending.

V2 Phase 1 makes the analysis a two-way object: you can talk to it, give it context, and the system uses that context on every subsequent run.

## 2. Goals

A user can:

1. **Annotate a finding** with free-form context that suppresses the flag and is visible on every future run.
2. **Track an open Situation** (e.g., "T3 of rollover deployment pending") that the system carries across runs.
3. **Get a fresh CFA-style verdict** on each open Situation every time `npm run analyze` runs, grounded in current macro signals.
4. **Chat with the analysis** in a sidebar — scoped to a specific finding, or globally. Free-form Q&A and advisory.

## 3. Non-goals

- No proactive notifications, scheduled jobs, or daemon-style monitoring. Pulse-check runs only when you re-run analyze.
- No auto-fetching of macro data. `macro.json` stays hand-edited; verdict quality is bounded by macro freshness. (Auto-fetch is its own phase.)
- No per-account or tax-aware analysis. Portfolio-level treatment stays.
- No rubric changes / no goals-driven scoring. The scoring engine is unchanged; Phase 4 handles that.
- No history/drift across runs. Phase 2 handles that.
- No what-if simulator. Phase 3 handles that.
- No multi-user concurrency, no production deploy target, no auth.

## 4. Decisions log

| Decision | Choice |
|---|---|
| Use case shape | Hybrid annotate + track + advise in one workflow (not three separate features) |
| Watching mechanic | Per-run pulse check using current `macro.json` |
| Chat UI shape | Hybrid: global sidebar + inline 💬 on flag rows |
| Data model | Structured Situations (status, target_date, verdict_history) + free-form Notes + append-only ChatMessage log |
| Backend plumbing | Vite middleware extension on the existing `npm run report` dev server |
| Pulse-check trigger | At `npm run analyze` time, embedded in analysis.json — not on report load |
| Model config | Per-call env vars: `CLAUDE_MODEL_PULSE` defaults to `claude-opus-4-7`, `CLAUDE_MODEL_CHAT` and `CLAUDE_MODEL_NARRATIVES` default to `claude-sonnet-4-6`. All fall back to `CLAUDE_MODEL` if set. |
| Tool use | LLM in chat can call `propose_situation`, `propose_note`, `propose_close_situation`, `propose_suppress_flag`. Tool calls render as confirm cards — user clicks Confirm to actually mutate. |
| Score impact | **Fact-vs-judgment rule.** Situations may carry `portfolio_effects[]` that modify the parsed portfolio before scoring (changes facts → grade reflects). Notes use `suppress_flag` for judgment annotations (cosmetic only → grade unchanged). The cash-rollover case is a fact change; dupe-funds-across-brokerages is a judgment. |
| Persistence location | `data/user-context.json`, **gitignored**. `data/user-context.example.json` committed as schema reference. |
| Concurrency | Atomic read-modify-write with temp file + rename. No locking. Single-user assumption. |

## 5. Architecture

### 5.1 Inputs

- `data/SamplePortfolio/*.json` — existing brokerage exports
- `data/macro.json` — existing hand-edited macro signals
- **`data/user-context.json`** — NEW; situations + notes + chat history

### 5.2 Pipeline extension (`npm run analyze`)

1. Load `user-context.json` (NEW)
2. Normalize + consolidate + parse portfolio (unchanged)
3. **Apply Situation `portfolio_effects` to the parsed portfolio** (NEW) — fact-change annotations modify portfolio inputs (e.g., mark $200k cash as `is_pending_deployment: true`) before anything is scored. The engine then sees the effected portfolio.
4. Parse macro (unchanged)
5. Aggregate + score dimensions (unchanged — but now operating on the effected portfolio)
6. Generate flags / gap items / plan — but each item now carries a stable `finding_key` (NEW)
7. **Apply Note suppressions** — annotate any flag/gap whose `finding_key` matches a `Note(suppress_flag: true)` (NEW). This is cosmetic only; score is already computed.
8. **Pulse-check each open Situation** — one Sonnet/Opus call per open situation, in parallel via `Promise.all`. Append result to `verdict_history` (NEW)
9. Generate narratives (unchanged)
10. Write `output/analysis.json` — now includes `situations[]`, `notes[]`, and `finding_key` on every flag/gap
11. Persist updated `user-context.json` — only `verdict_history` append; the rest is read-only at analyze time (NEW)

### 5.3 Report (`npm run report`)

- Vite dev server (existing) with NEW middleware plugin
- Middleware reads/writes `user-context.json` and proxies chat to Anthropic
- Single command launches everything; no CORS dance

### 5.4 Module layout

```
src/
├── engine/
│   ├── findingKeys.ts          NEW — deterministic stable IDs for flags/gaps
│   ├── portfolioEffects.ts     NEW — apply Situation.portfolio_effects to parsed portfolio (pure, pre-scoring)
│   ├── suppression.ts          NEW — apply Note.suppress_flag to flags (pure, post-scoring; cosmetic)
│   └── <existing>
├── intake/
│   ├── parseUserContext.ts     NEW — zod-validated load/write
│   └── <existing>
├── ai/
│   ├── pulseCheck.ts           NEW — one situation verdict (Opus default, structured output)
│   ├── chat.ts                 NEW — streaming Q&A with tool proposals (Sonnet default)
│   └── narratives.ts           small change: read CLAUDE_MODEL_NARRATIVES with fallback to CLAUDE_MODEL
├── server/                     NEW directory — never imported from src/report/app/
│   ├── vitePlugin.ts           registers middleware with the existing Vite dev server
│   ├── userContextStore.ts     atomic read-modify-write w/ temp-file rename
│   └── handlers/
│       ├── chat.ts             POST /api/chat (SSE)
│       ├── situations.ts       CRUD
│       └── notes.ts            CRUD
├── index.ts                    extended to call suppression + pulseCheck
└── types.ts                    UserContext, Situation, Note, ChatMessage added
```

### 5.5 API surface (Vite middleware)

```
POST   /api/chat               // streams SSE; body: { message, scope?, history_window }
GET    /api/situations         // list all
POST   /api/situations         // create
PATCH  /api/situations/:id     // update (incl. close)
DELETE /api/situations/:id
GET    /api/notes
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id
```

## 6. Data model

`data/user-context.json` has three top-level collections:

### 6.1 Situation

```ts
{
  id:                "sit_2026-05-12_rollover-t3",
  title:             "Rollover IRA — T3 deployment",
  intent:            string,                // full description of what's going on
  status:            "open" | "closed",
  target_date:       string | null,         // optional ISO date
  related_findings:  string[],              // finding_keys this Situation is *about* (informational link only)
  portfolio_effects: PortfolioEffect[],     // fact-change modifications applied pre-scoring (may be empty)
  verdict_history:   PulseVerdict[],        // one entry per analyze run
  created_at:        string,                // ISO timestamp
  updated_at:        string,
  closed_at:         string | null,
  closure_reason:    string | null
}

// PortfolioEffect — discriminated union of supported fact changes
type PortfolioEffect =
  | { type: "mark_cash_pending"; amount_usd: number; deployment_label?: string }
  | { type: "mark_holding_pending"; ticker: string; amount_usd?: number };
```

### 6.2 PulseVerdict (entry in verdict_history)

```ts
{
  run_at:           string,                 // ISO
  macro_snapshot:   { regime, vix, yield_curve_10y_2y, /* etc */ },
  verdict:          "deploy" | "partial_deploy" | "hold" | "monitor",
  confidence:       "low" | "medium" | "high",
  rationale:        string,                 // 2-4 sentences, cites specific indicators
  suggested_action: string,                 // 1 sentence, concrete next step
  reconsider_when:  string | null           // e.g., "if VIX > 25 or curve inverts"
}
```

### 6.3 Note

```ts
{
  id:             "note_2026-05-12_xlp-tax",
  target:         { type: "flag" | "gap" | "dimension" | "global",
                    finding_key: string },
  body:           string,
  suppress_flag:  boolean,                  // if true, silence the underlying flag
  created_at:     string
}
```

### 6.4 ChatMessage

```ts
{
  id:         "msg_2026-05-12_001",
  role:       "user" | "assistant",
  content:    string,
  scope:      { type: "global" | "flag" | "gap" | "situation",
                finding_key?: string,
                situation_id?: string },
  tool_call?: { tool: string, payload: object, status: "proposed" | "confirmed" | "rejected" },
  created_at: string
}
```

### 6.5 Fact vs. judgment — when grade changes

Annotations come in two flavors and must be handled differently:

| Annotation kind | Example | Mechanism | Grade impact |
|---|---|---|---|
| **Fact change** | "$200k cash is part of a rollover deployment plan" | `Situation.portfolio_effects` modify the parsed portfolio before scoring | Grade reflects the change (e.g., cash-drag penalty disappears because cash is now `is_pending_deployment`) |
| **Judgment** | "Dupe funds VTSAX/FSKAX — structural across brokerages, accepting overlap" | `Note(suppress_flag: true)` mutes the flag in the UI | Grade unchanged — penalty stands |
| **Judgment** | "Overweight NVDA because I work there" | `Note(suppress_flag: true)` | Grade unchanged |
| **Mixed** | "T1+T2 deployed already, T3 pending" | Situation carries `mark_cash_pending` for T3 portion; T1+T2 are already in portfolio.json post-deployment | Grade reflects only the pending T3 portion as planned cash |

**Rule:** if the annotation tells the engine a *fact about the portfolio* it didn't know (this cash has a plan, this position is hedged), it's a fact change → use a Situation with `portfolio_effects`. If the annotation explains a *judgment about the analysis* (I accept this risk, this is intentional), it's a judgment → use a Note with `suppress_flag`.

This prevents grade inflation: you can't make a real concentration disappear by saying "I'm fine with it." You can only mute the flag.

### 6.6 finding_key convention

Engine generates a deterministic key for every flag and gap item, format: `{dimension}:{type}`, e.g. `diversification:cash_drag`, `concentration:single_position_NVDA`, `cost:high_expense_ratio`.

Notes and situations reference findings by `finding_key`. If a finding disappears between runs (because you fixed it or because a Situation's `portfolio_effects` removed it), the reference gracefully detaches — the Note/Situation is still shown, marked "no longer applies."

## 7. UI behavior

### 7.1 Report layout

- Main content area (existing 8 sections) + right-hand collapsible sidebar
- Collapse state persisted to `localStorage`
- New **"📌 Open Situations"** strip pinned at the top of the report when any are open; hidden when zero

### 7.2 Situation card (in pinned strip)

- Title · target date · latest verdict pill (HOLD / DEPLOY / MONITOR / PARTIAL)
- Rationale text from latest verdict
- Footer: "History: N verdicts · last run YYYY-MM-DD · related: <flag titles>" — plus, when `portfolio_effects` are present, "Adjusts portfolio: $200k cash marked pending"
- Actions: `Discuss in chat` (scopes sidebar to this situation), `Mark resolved` (prompts for `closure_reason`)

### 7.3 Flag rows — two visual states

- **Un-annotated:** existing styling (severity-colored border)
- **Suppressed:** dashed border, reduced opacity, green "💬 suppressed" pill linking to the source Note/Situation. Never hidden.
- Every flag/gap row gets a small 💬 button on the right that opens the sidebar scoped to that finding.

### 7.4 Sidebar

- Header: "💬 Chat" + current scope label
- Scope chip below header (when scoped) shows the active finding/situation with a "clear" link
- Append-only chat history (filtered by scope or showing all — UI toggle, default: scope-filtered)
- Input row at bottom
- Tool-call proposals from the LLM render as inline confirm cards within the chat stream:

```
┌──────────────────────────────────────────────────┐
│ 💡 Track this as an open Situation?              │
│ Title: "Rollover IRA — T3 deployment"            │
│ Target: 2026-06-30                               │
│ Effect: mark $200,000 cash as pending deployment │
│ Grade impact: Diversification 6.8 → 7.9          │
│                Overall B+ → A−                    │
│ [Confirm]  [Edit]  [Dismiss]                     │
└──────────────────────────────────────────────────┘
```

The grade-impact preview is computed by running the engine twice (once with the effect, once without) when the LLM proposes a Situation with `portfolio_effects`. For pure-judgment proposals (Notes), the card just shows "Will mute: <flag>" with no grade preview.

- Confirm → browser POSTs to `/api/situations` → state mutates → card flips to a confirmation receipt
- Dismiss → card marked dismissed; LLM is told on next turn

## 8. LLM design

### 8.1 Pulse-check (one call per open Situation)

- **Model:** `CLAUDE_MODEL_PULSE` (default `claude-opus-4-7`)
- **Call shape:** `client.messages.parse()` with Zod `PulseVerdictSchema` → returns structured `PulseVerdict`
- **System prompt:** CFA-trained portfolio advisor reading current macro signals through a contrarian lens. Output verdict tied to current conditions, not generic recommendations. Reference indicators by value. Use Unicode minus, colleague-to-colleague tone (matches V1 narratives style).
- **User content:** situation (title, intent, target_date, portfolio_effects, prior verdict_history), macro snapshot (regime, key indicators), portfolio allocation snapshot (post-effects), report excerpt scoped to related findings.
- **Output schema:** see §6.2.
- **Failure handling:** if `ANTHROPIC_API_KEY` missing or call fails, the situation's `verdict_history` entry for this run is `{ run_at, error: "api_unavailable" }`. Analyze still completes.

### 8.2 Chat (streamed, scoped, with tool proposals)

- **Model:** `CLAUDE_MODEL_CHAT` (default `claude-sonnet-4-6`)
- **Call shape:** `client.messages.stream()` with SSE response to browser
- **System prompt:** Same advisor persona. Capabilities: answer questions about findings, scores, allocations, macro; propose Situations/Notes when appropriate; propose closing Situations on completion language. Constraints: never fabricate values; respect scope; tool calls are proposals only (do not assume confirmed); stream prose first, then emit ≤1 tool call per turn.
- **User content:** user message, scope context, trimmed `analysis.json` subset (see below), open situations summary (title + intent + latest verdict, no full history), notes attached to scoped item.
- **Context trimming by scope:**
  - `global` — portfolio header (grade, totals), top-3 flags, dimension scores summary, current macro snapshot
  - `flag:X` / `gap:X` — the single finding (full body), its dimension's score and weight, the macro snapshot, any notes/situations referencing it
  - `situation:X` — the situation (title, intent, full verdict_history), the findings it explains, current macro snapshot
- **Conversation history:** last 20 turns from `chat_history`, filtered to current scope (or include cross-scope context when scope is `global`).
- **Tools:**
  - `propose_situation({ title, intent, target_date?, related_findings?, portfolio_effects? })`
  - `propose_note({ target, body, suppress_flag })`
  - `propose_close_situation({ situation_id, closure_reason })`
  - `propose_suppress_flag({ finding_key, reason })`

### 8.3 Why per-call models

Pulse-check is the highest-stakes call — it's advisory output on real deployment decisions. Opus is worth ~5× Sonnet's cost there. Chat is conversational mix of lookup + reasoning; Sonnet handles it well at lower cost. Narratives is synthesis; Sonnet is sufficient.

## 9. Concurrency & persistence

`user-context.json` is read/written by two processes:

- The CLI (`npm run analyze`) — reads it at start, appends `verdict_history` at end
- The middleware (during `npm run report`) — read/writes situations, notes, chat history

**Strategy:** atomic read-modify-write. Each writer:

1. Read full file into memory
2. Apply mutation
3. Write to `user-context.json.tmp`
4. `fs.rename()` to `user-context.json` (atomic on most filesystems)

This prevents partial-write corruption. It does **not** prevent lost updates if two writers operate between each other's reads. Acceptable for single-user, low-frequency use. Analyze typically runs while the browser is closed.

If concurrency becomes a problem, file locking via `proper-lockfile` is the next step.

## 10. Privacy

`data/user-context.json` is gitignored by default. Situations may contain specific deployment intents, dollar amounts, and tax-relevant context. `data/user-context.example.json` is committed as a schema reference using synthetic data.

If the user explicitly opts in by removing the file from `.gitignore`, that's their call.

## 11. Testing strategy

### 11.1 Unit-tested (vitest, TDD)

- `src/engine/findingKeys.test.ts` — stable key generation per flag/gap
- `src/engine/portfolioEffects.test.ts` — applying Situation.portfolio_effects to a parsed portfolio (pure)
- `src/engine/suppression.test.ts` — flag annotation given Notes (cosmetic only; no score change)
- `src/intake/parseUserContext.test.ts` — zod validation + round-trip
- `src/ai/pulseCheck.prompt.test.ts` — `renderPulseInput(...)` → snapshot
- `src/ai/chat.prompt.test.ts` — `renderChatInput(...)` → snapshot
- `src/server/userContextStore.test.ts` — atomic write semantics over tmp dir

### 11.2 Not unit-tested (per existing project policy)

- `src/ai/pulseCheck.ts`, `src/ai/chat.ts` — actual API calls
- `src/server/vitePlugin.ts`, `src/server/handlers/*` — middleware/route handlers
- `src/report/app/**` — React components
- `src/index.ts` — CLI orchestrator

### 11.3 Manual verification checklist

```
[ ] npm test passes (existing 174 + new unit tests)
[ ] npx tsc --noEmit clean (both tsconfig projects)
[ ] npm run analyze with no user-context.json → V1 parity behavior
[ ] npm run analyze with a situation → analysis.json has verdict_history entry
[ ] npm run analyze with a Situation carrying mark_cash_pending → score
    reflects (cash drag flag absent or reduced) and grade goes up vs baseline
[ ] Note(suppress_flag) does NOT change scores between runs — only mutes flag
[ ] npm run analyze with no ANTHROPIC_API_KEY → skips pulse-check & narratives
    gracefully (no crash, verdict entry records error)
[ ] npm run report → sidebar opens, types, streams response, scopes correctly
[ ] Click 💬 on a flag → sidebar scopes; scope chip appears
[ ] Tell LLM about a deployment → confirm-card proposal renders → Confirm
    creates situation → reload page shows situation in pinned strip
[ ] Add note with suppress_flag → flag renders muted with "💬 suppressed" pill
[ ] Mark situation resolved → moves out of pinned strip; closure_reason saved
[ ] Concurrency: hit /api/situations while npm run analyze is running →
    final user-context.json contains both writes (or at worst loses one
    without corruption)
```

## 12. Deliberate omissions

- No integration tests for the Anthropic API (cost; existing project skips them)
- No React component tests (existing policy)
- No load testing
- No retry policy for failed pulse-check calls — single attempt, log on failure
- No deduplication of identical Notes/Situations — user responsibility
- No "no longer applies" cleanup automation — Notes/Situations with detached finding_keys persist until manually closed

## 13. Future-phase touch points

Phase 2 (history/drift) will:
- Snapshot `analysis.json` per run into a `output/history/` directory
- Diff Situation `verdict_history` across runs (already structured for this — no schema change needed)

Phase 3 (what-if simulator) will:
- Need the engine packaged for the browser bundle — this phase keeps engine in node-only territory
- Re-use the sidebar shell but add a "Trade Pad" mode

Phase 4 (goals-driven scoring) will:
- Promote Notes/Situations alongside a new `profile.json` input
- Refactor `dimensions.ts` to be profile-aware — this phase deliberately doesn't pre-emptively do this
