# V2 Phase 1 — Chat, Memory, and Situations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat sidebar + tracked Situations + free-form Notes + per-run FA-style pulse-check verdicts to the existing V1 portfolio analyzer, per `Documentation/superpowers/specs/2026-05-12-v2-chat-and-situations-design.md`.

**Architecture:** Three new pieces land on top of the V1 pipeline:
1. **Engine** gets `findingKeys.ts` (stable IDs on flags/gaps), `portfolioEffects.ts` (Situation effects mutate parsed portfolio pre-scoring), `suppression.ts` (Notes mute flags post-scoring).
2. **Per-call AI**: `pulseCheck.ts` (Opus default, one structured call per open Situation, embedded in analysis.json), `chat.ts` (Sonnet default, streaming with tool-proposal output).
3. **Vite middleware plugin** extends `npm run report` with `/api/chat`, `/api/situations`, `/api/notes`. A new React sidebar talks to it. State lives in `data/user-context.json` (gitignored), atomically read-modify-written.

**Tech Stack:** TypeScript 5.4 strict, Vitest 1.x (engine/intake tests), Vite 5 (existing report dev server + middleware), zod v3 (intake validation, matches existing convention), zod v4 (Anthropic SDK `output_config.format` only — matches `narratives.ts`), `@anthropic-ai/sdk` ^0.95, React 18.

---

## Overview & sequencing

The plan proceeds in seven sections. Each section can be reviewed at its commit boundary; later sections depend on earlier ones in roughly this order:

1. **Foundation** — types, zod schemas, atomic store, gitignore + example file
2. **Engine extensions** — finding_key, portfolioEffects, suppression (all pure, all TDD)
3. **AI calls** — narratives env-var update, pulseCheck, chat
4. **Server middleware** — handlers + Vite plugin registration
5. **CLI integration** — wire user-context.json + portfolioEffects + suppression + pulseCheck into `src/index.ts`
6. **React UI** — types mirror, sidebar, Open Situations strip, inline 💬 on flags/gaps, proposal cards
7. **Manual verification** — walk the spec's checklist

**TDD discipline (per existing project policy):**
- Engine + intake + store → strict TDD (red-green-commit per step)
- AI prompt-render functions → TDD on the pure `renderXxxInput()` half; not on the API call wrapper
- Server handlers, Vite plugin, CLI orchestrator, React UI → no unit tests; manual verification

**Commit cadence:** one commit at the end of each task. If a task includes a TDD red-green cycle, the test and the implementation commit together. Use the format `feat(<area>): <subject>` or `test(<area>): <subject>` matching the repo's existing style (see `git log --oneline -20`).

---

## File structure

Files created or modified in this plan:

```
data/
├── user-context.json              NEW (gitignored)
└── user-context.example.json      NEW (committed; synthetic schema reference)

src/
├── types.ts                       MODIFIED — add UserContext, Situation, Note,
│                                              ChatMessage, PortfolioEffect,
│                                              PulseVerdict; extend Flag/GapItem
│                                              with finding_key + suppressed_by
├── intake/
│   └── parseUserContext.ts        NEW — zod-v3 validation + load/save helpers
├── engine/
│   ├── findingKeys.ts             NEW — buildFindingKey() pure helper
│   ├── findingKeys.test.ts        NEW
│   ├── portfolioEffects.ts        NEW — applyPortfolioEffects() pure
│   ├── portfolioEffects.test.ts   NEW
│   ├── suppression.ts             NEW — applyNoteSuppressions() pure
│   ├── suppression.test.ts        NEW
│   └── plan.ts                    MODIFIED — every flag/gap emits finding_key
├── ai/
│   ├── narratives.ts              MODIFIED — read CLAUDE_MODEL_NARRATIVES
│   ├── pulseCheck.ts              NEW — Opus call, structured PulseVerdict
│   ├── pulseCheck.prompt.test.ts  NEW — snapshot of renderPulseInput()
│   ├── chat.ts                    NEW — Sonnet stream + tool proposals
│   └── chat.prompt.test.ts        NEW — snapshot of renderChatInput()
├── server/                         NEW directory
│   ├── userContextStore.ts        NEW — atomic read-modify-write
│   ├── userContextStore.test.ts   NEW
│   ├── handlers/
│   │   ├── situations.ts          NEW — CRUD
│   │   ├── notes.ts               NEW — CRUD
│   │   └── chat.ts                NEW — SSE streaming
│   └── vitePlugin.ts              NEW — Vite plugin registering middleware
├── index.ts                       MODIFIED — load user-context, apply effects
│                                              pre-score, apply suppression
│                                              post-score, call pulseCheck per
│                                              open situation, persist verdicts
└── report/app/
    ├── types.ts                   MODIFIED — mirror new types
    ├── App.tsx                    MODIFIED — wrap in two-column layout +
    │                                          collapsible sidebar
    ├── vite.config.ts             MODIFIED — register the plugin
    ├── sections/
    │   ├── OpenSituations.tsx     NEW — pinned strip + situation cards
    │   ├── Flags.tsx              MODIFIED — finding_key, 💬 button, suppressed state
    │   └── Gaps.tsx               MODIFIED — finding_key, 💬 button, suppressed state
    └── sidebar/                   NEW directory
        ├── Sidebar.tsx            NEW — wrapper + collapse + scope chip
        ├── ChatHistory.tsx        NEW — rendered messages
        ├── ChatInput.tsx          NEW — text input + send
        ├── ToolProposalCard.tsx   NEW — confirm/edit/dismiss
        ├── useChat.ts             NEW — streaming hook (SSE consumer)
        └── chatStore.ts           NEW — scope + history client-side state

.gitignore                          MODIFIED — add data/user-context.json
```

---

## Section 1 — Foundation

### Task 1: Add new types to `src/types.ts`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add `finding_key` and `suppressed_by` to existing `Flag` and `GapItem` interfaces**

Open `src/types.ts`. Modify the `Flag` and `GapItem` interfaces at lines 99-111:

```ts
export interface FlagSuppressionRef {
  source: "note" | "situation";
  id: string;
  body: string;
}

export interface Flag {
  ticker: string;
  severity: "red" | "yellow";
  title: string;
  body: string;
  finding_key: string;            // NEW — stable ID, e.g. "diversification:cash_drag"
  suppressed_by?: FlagSuppressionRef; // NEW — set by suppression.ts when a Note mutes this flag
}

export interface GapItem {
  title: string;
  type: "red" | "amber" | "blue";
  body: string;
  progress: number;
  finding_key: string;            // NEW — stable ID
  suppressed_by?: FlagSuppressionRef; // NEW
}
```

- [ ] **Step 2: Add the new top-level types at the end of `src/types.ts`**

Append after the existing `Finding` interface:

```ts
// ─────────────────────────────────────────────────────────────────────────────
// V2 Phase 1 — Chat, Memory, and Situations (per spec §6)
// ─────────────────────────────────────────────────────────────────────────────

export type PortfolioEffect =
  | { type: "mark_cash_pending"; amount_usd: number; deployment_label?: string }
  | { type: "mark_holding_pending"; ticker: string; amount_usd?: number };

export interface MacroSnapshot {
  regime: string;
  vix: number;
  yield_curve_10y_2y: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
}

export interface PulseVerdict {
  run_at: string;
  macro_snapshot: MacroSnapshot;
  verdict: "deploy" | "partial_deploy" | "hold" | "monitor";
  confidence: "low" | "medium" | "high";
  rationale: string;
  suggested_action: string;
  reconsider_when: string | null;
  error?: string;                 // populated when the API call failed
}

export interface Situation {
  id: string;
  title: string;
  intent: string;
  status: "open" | "closed";
  target_date: string | null;
  related_findings: string[];
  portfolio_effects: PortfolioEffect[];
  verdict_history: PulseVerdict[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closure_reason: string | null;
}

export interface Note {
  id: string;
  target: {
    type: "flag" | "gap" | "dimension" | "global";
    finding_key: string;
  };
  body: string;
  suppress_flag: boolean;
  created_at: string;
}

export interface ChatScope {
  type: "global" | "flag" | "gap" | "situation";
  finding_key?: string;
  situation_id?: string;
}

export interface ChatToolCall {
  tool: string;
  payload: Record<string, unknown>;
  status: "proposed" | "confirmed" | "rejected";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  scope: ChatScope;
  tool_call?: ChatToolCall;
  created_at: string;
}

export interface UserContext {
  version: 1;
  situations: Situation[];
  notes: Note[];
  chat_history: ChatMessage[];
}
```

- [ ] **Step 3: Acknowledge a temporary tsc breakage**

After this task commits, `npx tsc --noEmit` over the whole project WILL fail. The new required field `finding_key` on `Flag` and `GapItem` is not yet populated by `src/engine/plan.ts` — Task 6 closes that loop.

This is intentional: making `finding_key` optional just to avoid the error would force `f.finding_key!` non-null assertions throughout Tasks 8 and onward, which is worse hygiene than a brief multi-task gap.

Tasks 2–5 do not transitively import `plan.ts` at compile time, so each task's targeted `npx vitest run <test file>` will still pass. The full project type-check is restored at Task 6 step 6.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Situation, Note, ChatMessage, PortfolioEffect, PulseVerdict; extend Flag/GapItem with finding_key"
```

---

### Task 2: Create `src/intake/parseUserContext.ts` with TDD

**Files:**
- Create: `src/intake/parseUserContext.ts`
- Create: `src/intake/parseUserContext.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/intake/parseUserContext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseUserContext, emptyUserContext } from "./parseUserContext";

describe("parseUserContext", () => {
  it("accepts an empty context shape", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(1);
    expect(ctx.situations).toEqual([]);
  });

  it("accepts a fully populated situation with portfolio_effects", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [
        {
          id: "sit_test",
          title: "Rollover T3",
          intent: "Deploy remaining $200k",
          status: "open",
          target_date: "2026-06-30",
          related_findings: ["diversification:cash_drag"],
          portfolio_effects: [
            { type: "mark_cash_pending", amount_usd: 200000, deployment_label: "T3" },
          ],
          verdict_history: [],
          created_at: "2026-05-12T11:45:00Z",
          updated_at: "2026-05-12T11:47:24Z",
          closed_at: null,
          closure_reason: null,
        },
      ],
      notes: [],
      chat_history: [],
    });
    expect(ctx.situations[0].portfolio_effects[0].type).toBe("mark_cash_pending");
  });

  it("rejects an unknown PortfolioEffect.type", () => {
    expect(() =>
      parseUserContext({
        version: 1,
        situations: [
          {
            id: "x",
            title: "x",
            intent: "x",
            status: "open",
            target_date: null,
            related_findings: [],
            portfolio_effects: [{ type: "wat", amount_usd: 0 }],
            verdict_history: [],
            created_at: "2026-05-12T00:00:00Z",
            updated_at: "2026-05-12T00:00:00Z",
            closed_at: null,
            closure_reason: null,
          },
        ],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });

  it("rejects unknown version", () => {
    expect(() =>
      parseUserContext({ version: 99, situations: [], notes: [], chat_history: [] }),
    ).toThrow();
  });
});

describe("emptyUserContext", () => {
  it("returns a valid empty UserContext that round-trips through parseUserContext", () => {
    const empty = emptyUserContext();
    expect(parseUserContext(empty)).toEqual(empty);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/intake/parseUserContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parseUserContext.ts`**

Create `src/intake/parseUserContext.ts`:

```ts
import { z } from "zod";
import type { UserContext } from "../types";

const PortfolioEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mark_cash_pending"),
    amount_usd: z.number().positive(),
    deployment_label: z.string().optional(),
  }),
  z.object({
    type: z.literal("mark_holding_pending"),
    ticker: z.string().min(1),
    amount_usd: z.number().positive().optional(),
  }),
]);

const MacroSnapshotSchema = z.object({
  regime: z.string(),
  vix: z.number(),
  yield_curve_10y_2y: z.number(),
  hy_credit_spread_oas_bps: z.number(),
  lei_consecutive_declines: z.number(),
});

const PulseVerdictSchema = z.object({
  run_at: z.string(),
  macro_snapshot: MacroSnapshotSchema,
  verdict: z.enum(["deploy", "partial_deploy", "hold", "monitor"]),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
  suggested_action: z.string(),
  reconsider_when: z.string().nullable(),
  error: z.string().optional(),
});

const SituationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  intent: z.string(),
  status: z.enum(["open", "closed"]),
  target_date: z.string().nullable(),
  related_findings: z.array(z.string()),
  portfolio_effects: z.array(PortfolioEffectSchema),
  verdict_history: z.array(PulseVerdictSchema),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  closure_reason: z.string().nullable(),
});

const NoteSchema = z.object({
  id: z.string().min(1),
  target: z.object({
    type: z.enum(["flag", "gap", "dimension", "global"]),
    finding_key: z.string(),
  }),
  body: z.string(),
  suppress_flag: z.boolean(),
  created_at: z.string(),
});

const ChatScopeSchema = z.object({
  type: z.enum(["global", "flag", "gap", "situation"]),
  finding_key: z.string().optional(),
  situation_id: z.string().optional(),
});

const ChatToolCallSchema = z.object({
  tool: z.string(),
  payload: z.record(z.unknown()),
  status: z.enum(["proposed", "confirmed", "rejected"]),
});

const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  scope: ChatScopeSchema,
  tool_call: ChatToolCallSchema.optional(),
  created_at: z.string(),
});

export const UserContextSchema = z.object({
  version: z.literal(1),
  situations: z.array(SituationSchema),
  notes: z.array(NoteSchema),
  chat_history: z.array(ChatMessageSchema),
});

export function parseUserContext(input: unknown): UserContext {
  return UserContextSchema.parse(input) as UserContext;
}

export function emptyUserContext(): UserContext {
  return { version: 1, situations: [], notes: [], chat_history: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/intake/parseUserContext.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/intake/parseUserContext.ts src/intake/parseUserContext.test.ts
git commit -m "feat(intake): add parseUserContext with zod schema + TDD coverage"
```

---

### Task 3: Atomic `userContextStore.ts` with TDD

**Files:**
- Create: `src/server/userContextStore.ts`
- Create: `src/server/userContextStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/server/userContextStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadUserContext,
  saveUserContext,
  mutateUserContext,
} from "./userContextStore";
import { emptyUserContext } from "../intake/parseUserContext";

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-test-"));
  filePath = path.join(tmpDir, "user-context.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadUserContext", () => {
  it("returns an empty context when the file does not exist", () => {
    const ctx = loadUserContext(filePath);
    expect(ctx.situations).toEqual([]);
    expect(ctx.notes).toEqual([]);
    expect(ctx.chat_history).toEqual([]);
  });

  it("returns the parsed file when it exists", () => {
    fs.writeFileSync(filePath, JSON.stringify(emptyUserContext()));
    const ctx = loadUserContext(filePath);
    expect(ctx.version).toBe(1);
  });

  it("throws on corrupt JSON", () => {
    fs.writeFileSync(filePath, "{ not json");
    expect(() => loadUserContext(filePath)).toThrow();
  });
});

describe("saveUserContext", () => {
  it("writes atomically — no .tmp left behind on success", () => {
    saveUserContext(filePath, emptyUserContext());
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("round-trips through loadUserContext", () => {
    const original = emptyUserContext();
    saveUserContext(filePath, original);
    expect(loadUserContext(filePath)).toEqual(original);
  });
});

describe("mutateUserContext", () => {
  it("applies the mutation function and persists", () => {
    saveUserContext(filePath, emptyUserContext());
    mutateUserContext(filePath, (ctx) => {
      ctx.notes.push({
        id: "note_1",
        target: { type: "flag", finding_key: "diversification:cash_drag" },
        body: "rollover",
        suppress_flag: true,
        created_at: "2026-05-12T00:00:00Z",
      });
    });
    const ctx = loadUserContext(filePath);
    expect(ctx.notes).toHaveLength(1);
    expect(ctx.notes[0].id).toBe("note_1");
  });

  it("creates the file on first mutate if it doesn't exist", () => {
    mutateUserContext(filePath, (ctx) => {
      ctx.notes.push({
        id: "note_seed",
        target: { type: "global", finding_key: "" },
        body: "seed",
        suppress_flag: false,
        created_at: "2026-05-12T00:00:00Z",
      });
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/server/userContextStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `userContextStore.ts`**

Create `src/server/userContextStore.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { UserContext } from "../types";
import { parseUserContext, emptyUserContext } from "../intake/parseUserContext";

export function loadUserContext(filePath: string): UserContext {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return emptyUserContext();
  }
  const raw = fs.readFileSync(abs, "utf-8");
  return parseUserContext(JSON.parse(raw));
}

export function saveUserContext(filePath: string, ctx: UserContext): void {
  const abs = path.resolve(filePath);
  const tmp = `${abs}.tmp`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2), "utf-8");
  fs.renameSync(tmp, abs);
}

export function mutateUserContext(
  filePath: string,
  mutator: (ctx: UserContext) => void,
): UserContext {
  const ctx = loadUserContext(filePath);
  mutator(ctx);
  saveUserContext(filePath, ctx);
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/server/userContextStore.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/userContextStore.ts src/server/userContextStore.test.ts
git commit -m "feat(server): add atomic userContextStore with TDD coverage"
```

---

### Task 4: Example file + gitignore

**Files:**
- Create: `data/user-context.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create the example file**

Create `data/user-context.example.json` with a synthetic Situation, Note, and ChatMessage so the schema is self-documenting:

```json
{
  "version": 1,
  "situations": [
    {
      "id": "sit_2026-05-12_rollover-t3",
      "title": "Rollover IRA — T3 deployment",
      "intent": "3-tranche rollover of $600k from old IRA into 60/40 equity/FI. T1 ($200k) deployed 2026-02-14 into FTIHX/FXNAX. T2 ($200k) deployed 2026-04-02 same allocation. T3 ($200k) pending — watching for fear signals before deploying.",
      "status": "open",
      "target_date": "2026-06-30",
      "related_findings": ["diversification:cash_drag"],
      "portfolio_effects": [
        {
          "type": "mark_cash_pending",
          "amount_usd": 200000,
          "deployment_label": "Rollover T3"
        }
      ],
      "verdict_history": [],
      "created_at": "2026-05-12T11:45:00Z",
      "updated_at": "2026-05-12T11:45:00Z",
      "closed_at": null,
      "closure_reason": null
    }
  ],
  "notes": [
    {
      "id": "note_2026-05-12_dupe-funds",
      "target": { "type": "flag", "finding_key": "cost:duplicate_funds" },
      "body": "VTSAX at Vanguard, FSKAX at Fidelity — cross-brokerage consolidation not worth the friction.",
      "suppress_flag": true,
      "created_at": "2026-05-12T11:50:00Z"
    }
  ],
  "chat_history": []
}
```

- [ ] **Step 2: Update `.gitignore`**

Open `.gitignore`. Add a line after `.superpowers/`:

```
data/user-context.json
```

- [ ] **Step 3: Commit**

```bash
git add data/user-context.example.json .gitignore
git commit -m "feat(data): add user-context.example.json + gitignore real user-context.json"
```

---

## Section 2 — Engine extensions (TDD)

### Task 5: `findingKeys.ts` — deterministic stable IDs

**Files:**
- Create: `src/engine/findingKeys.ts`
- Create: `src/engine/findingKeys.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/engine/findingKeys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildFindingKey } from "./findingKeys";

describe("buildFindingKey", () => {
  it("emits dimension:type for generic flags", () => {
    expect(buildFindingKey({ dimension: "diversification", type: "cash_drag" })).toBe(
      "diversification:cash_drag",
    );
  });

  it("emits dimension:type:ticker for ticker-scoped flags", () => {
    expect(
      buildFindingKey({ dimension: "concentration", type: "single_position", ticker: "NVDA" }),
    ).toBe("concentration:single_position:NVDA");
  });

  it("lowercases the dimension and type but preserves ticker casing", () => {
    expect(
      buildFindingKey({ dimension: "Concentration", type: "Single_Position", ticker: "BRK-B" }),
    ).toBe("concentration:single_position:BRK-B");
  });

  it("emits the same key for identical inputs (stability)", () => {
    const a = buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" });
    const b = buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" });
    expect(a).toBe(b);
    expect(a).toBe("macro_alignment:lei_decline");
  });

  it("supports a free-form 'label' segment for duplicates", () => {
    expect(
      buildFindingKey({ dimension: "cost", type: "duplicate_funds", label: "US Total Market" }),
    ).toBe("cost:duplicate_funds:us_total_market");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/findingKeys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `findingKeys.ts`**

Create `src/engine/findingKeys.ts`:

```ts
export interface FindingKeyInput {
  dimension: string;
  type: string;
  ticker?: string;
  label?: string;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function buildFindingKey(input: FindingKeyInput): string {
  const parts = [slug(input.dimension), slug(input.type)];
  if (input.ticker) parts.push(input.ticker);
  if (input.label) parts.push(slug(input.label));
  return parts.join(":");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/findingKeys.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/findingKeys.ts src/engine/findingKeys.test.ts
git commit -m "feat(engine): add buildFindingKey for stable flag/gap IDs"
```

---

### Task 6: Attach `finding_key` to every flag and gap in `plan.ts`

**Files:**
- Modify: `src/engine/plan.ts`
- Modify: `src/engine/plan.test.ts`

- [ ] **Step 1: Add a failing test asserting every flag has a finding_key**

Open `src/engine/plan.test.ts`. Find the existing `describe("generateFlags", ...)` block. Inside it, add a new test (place near the existing top-level tests, not nested inside another `describe`):

```ts
import { buildFindingKey } from "./findingKeys";

it("attaches a finding_key to every flag", () => {
  // Use whatever fixture builder the existing tests use to produce a
  // portfolio that generates >= 1 flag. The fixtures live in
  // tests/fixtures/samplePortfolio.ts and tests/fixtures/sampleMacro.ts.
  // Construct a portfolio with 11% idle cash so the "idle cash" flag fires.
  const portfolio = makePortfolio({
    holdings: [
      makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
      makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
    ],
  });
  const aggregates = computeAggregates(portfolio);
  const macro = makeMacro();
  const flags = generateFlags(portfolio, aggregates, macro);

  expect(flags.length).toBeGreaterThan(0);
  for (const f of flags) {
    expect(f.finding_key).toBeTruthy();
    expect(f.finding_key).toMatch(/^[a-z][a-z0-9_]+(:[A-Za-z0-9_\-]+)+$/);
  }
});

it("attaches finding_key matching the expected pattern for cash drag", () => {
  const portfolio = makePortfolio({
    holdings: [
      makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
      makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
    ],
  });
  const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
  const cashFlag = flags.find(f => f.ticker === "CASH");
  expect(cashFlag?.finding_key).toBe(buildFindingKey({ dimension: "diversification", type: "cash_drag" }));
});
```

If `computeAggregates`, `makePortfolio`, `makeHolding`, or `makeMacro` aren't already imported at the top of `plan.test.ts`, add the imports — match the existing pattern of other test files (look at `aggregates.test.ts` for the fixture imports).

- [ ] **Step 2: Add a failing test asserting every gap item has a finding_key**

Still in `src/engine/plan.test.ts`, in the existing `generateGapItems` describe block, add:

```ts
it("attaches a finding_key to every gap item", () => {
  const portfolio = makePortfolio({
    holdings: [
      makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
      makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
    ],
  });
  const aggregates = computeAggregates(portfolio);
  const macro = makeMacro();
  const dimensions = scoreAllDimensions(portfolio, aggregates, macro);
  const gaps = generateGapItems(aggregates, dimensions, macro);
  expect(gaps.length).toBeGreaterThan(0);
  for (const g of gaps) {
    expect(g.finding_key).toBeTruthy();
    expect(g.finding_key).toMatch(/^[a-z][a-z0-9_]+(:[A-Za-z0-9_\-]+)+$/);
  }
});
```

Make sure `scoreAllDimensions` is imported at the top of the file.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/engine/plan.test.ts`
Expected: FAIL — flags and gaps lack `finding_key`.

- [ ] **Step 4: Update `src/engine/plan.ts` to emit finding_key everywhere**

Open `src/engine/plan.ts`. At the top, import:

```ts
import { buildFindingKey } from "./findingKeys";
```

For each `flags.push({...})` call in `generateFlags`, add a `finding_key` field. Locations and exact keys:

The function `generateFlags` builds flags in several blocks (extreme valuation, elevated PE, high beta, idle cash, inverted yield curve, LEI declines, duplicate funds, sector concentration, top3 concentration, individual stocks total weight, etc). Walk the file top-to-bottom; for every `flags.push({...})`, add `finding_key`:

```ts
// Inside the loop over individual_stock holdings:

// Extreme valuation block (existing code at lines ~43-49):
flags.push({
  ticker: h.ticker,
  severity: "red",
  title: `${h.ticker} — extreme valuation + declining earnings`,
  body: `P/E ${m.pe_ratio.toFixed(0)}×, EPS growth ${(m.eps_growth_yoy * 100).toFixed(1)}% YoY. Position is ${wPct}% of portfolio.`,
  finding_key: buildFindingKey({ dimension: "valuation", type: "extreme_overvaluation", ticker: h.ticker }),
});

// Elevated PE block (existing code at lines ~50-56):
flags.push({
  ticker: h.ticker,
  severity: "yellow",
  title: `${h.ticker} — elevated valuation`,
  body: `P/E ${m.pe_ratio.toFixed(0)}× is above sector norms. Monitor for earnings deceleration.`,
  finding_key: buildFindingKey({ dimension: "valuation", type: "elevated_pe", ticker: h.ticker }),
});

// High beta block (existing code at lines ~59-66):
flags.push({
  ticker: h.ticker,
  severity: "yellow",
  title: `${h.ticker} — high beta`,
  body: `Beta ${m.beta.toFixed(2)} amplifies market moves. ${capitalize(regimeAdjective(macro.market_regime))} macro warrants reducing high-beta exposure.`,
  finding_key: buildFindingKey({ dimension: "macro_alignment", type: "high_beta", ticker: h.ticker }),
});

// Idle cash block (existing code at lines ~69-75):
flags.push({
  ticker: "CASH",
  severity: "yellow",
  title: `Idle cash at ${(agg.idle_cash_weight * 100).toFixed(1)}%`,
  body: `${(agg.idle_cash_weight * 100).toFixed(1)}% of portfolio earning money-market yield. Deploy or document as intentional strategic reserve.`,
  finding_key: buildFindingKey({ dimension: "diversification", type: "cash_drag" }),
});

// Inverted yield curve block (existing code at lines ~78-83):
flags.push({
  ticker: "MACRO",
  severity: "yellow",
  title: "Inverted yield curve — bond underweight",
  body: `Yield curve spread at ${macro.yield_curve_spread_10y_2y.toFixed(2)}%. Fixed income at ${(agg.fixed_income_weight * 100).toFixed(1)}% is below the ${fiTargetPctText(macro.market_regime)} ${regimeAdjective(macro.market_regime)} target.`,
  finding_key: buildFindingKey({ dimension: "macro_alignment", type: "fi_underweight_inverted_curve" }),
});

// LEI declines block (existing code at lines ~87-92):
flags.push({
  ticker: "MACRO",
  severity: "yellow",
  title: `LEI declining for ${macro.lei_consecutive_declines} consecutive months`,
  body: "Six or more consecutive LEI declines historically precede recession. Defensive positioning is warranted.",
  finding_key: buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" }),
});

// Duplicate funds block (existing code around the `for (const group of agg.duplicate_groups)` loop):
flags.push({
  ticker: group.tickers.join("/"),
  severity: "yellow",
  title: `Redundant funds — ${group.label}`,
  body: /* keep existing body */,
  finding_key: buildFindingKey({ dimension: "cost", type: "duplicate_funds", label: group.label }),
});
```

**Important:** Read the actual `plan.ts` end-to-end and add `finding_key` to **every** `flags.push({...})` call — including any flag-generation blocks not enumerated above. Use this rubric:

- Stock-specific flag → `dimension: <relevant dimension>, type: <descriptor>, ticker: h.ticker`
- Macro-level flag → `dimension: "macro_alignment", type: <descriptor>`
- Sector concentration → `dimension: "concentration", type: "sector_<sector_tag>"`
- Top-3 concentration → `dimension: "concentration", type: "top3_overweight"`
- Cash → `dimension: "diversification", type: "cash_drag"`
- Duplicate funds → `dimension: "cost", type: "duplicate_funds", label: group.label`
- Cost / ER → `dimension: "cost", type: "high_expense_ratio"` (or whatever matches the dimension id)

The dimensions used must match the `id` values in the existing `dimension_scores` (you can list them by reading `src/engine/dimensions.ts`). Picking a known dimension id makes the suppression logic in Task 9 simple (no key-to-dimension lookup table needed).

For each `gap_items.push(...)` in `generateGapItems`, do the same: add `finding_key: buildFindingKey({ dimension: <dim>, type: <descriptor> })`. Gap items don't have tickers; just dimension + type.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: PASS — all existing 174 tests + the new finding_key tests.

If existing snapshot tests fail because they snapshot the flags array, update the snapshots: `npx vitest run -u`.

- [ ] **Step 6: Compile-check**

Run: `npx tsc --noEmit`
Expected: PASS — no missing `finding_key` errors.

- [ ] **Step 7: Commit**

```bash
git add src/engine/plan.ts src/engine/plan.test.ts
git commit -m "feat(engine): attach stable finding_key to every flag and gap"
```

---

### Task 7: `portfolioEffects.ts` — apply Situation effects pre-scoring

**Files:**
- Create: `src/engine/portfolioEffects.ts`
- Create: `src/engine/portfolioEffects.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/engine/portfolioEffects.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyPortfolioEffects } from "./portfolioEffects";
import { makePortfolio, makeHolding } from "../../tests/fixtures/samplePortfolio";
import type { Situation, PortfolioEffect } from "../types";

function makeSituation(effects: PortfolioEffect[]): Situation {
  return {
    id: "sit_test",
    title: "Test",
    intent: "Test",
    status: "open",
    target_date: null,
    related_findings: [],
    portfolio_effects: effects,
    verdict_history: [],
    created_at: "2026-05-12T00:00:00Z",
    updated_at: "2026-05-12T00:00:00Z",
    closed_at: null,
    closure_reason: null,
  };
}

describe("applyPortfolioEffects", () => {
  it("returns the portfolio unchanged when no situations have effects", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "VTI", market_value: 100000 })],
    });
    const result = applyPortfolioEffects(portfolio, []);
    expect(result).toEqual(portfolio);
  });

  it("ignores closed situations", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
      ],
    });
    const sit = { ...makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }]), status: "closed" as const };
    const result = applyPortfolioEffects(portfolio, [sit]);
    expect(result.holdings.find(h => h.ticker === "CASH")?.is_pending_deployment).toBe(false);
  });

  it("marks all cash as pending when amount_usd >= total cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTI", market_value: 100000 }),
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
      ],
    });
    const sit = makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    const cashHoldings = result.holdings.filter(h => h.is_cash);
    expect(cashHoldings.every(h => h.is_pending_deployment)).toBe(true);
  });

  it("splits cash into pending + remainder when amount_usd < total cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
      ],
    });
    const sit = makeSituation([
      { type: "mark_cash_pending", amount_usd: 120000, deployment_label: "T3" },
    ]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    const cashHoldings = result.holdings.filter(h => h.is_cash);
    expect(cashHoldings.length).toBe(2);
    const pending = cashHoldings.find(h => h.is_pending_deployment);
    const idle = cashHoldings.find(h => !h.is_pending_deployment);
    expect(pending?.market_value).toBe(120000);
    expect(pending?.deployment_label).toBe("T3");
    expect(idle?.market_value).toBe(80000);
  });

  it("marks a specific holding as pending by ticker", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FXNAX", market_value: 50000, asset_class: "us_bond_aggregate", is_cash: false, is_pending_deployment: false }),
      ],
    });
    const sit = makeSituation([{ type: "mark_holding_pending", ticker: "FXNAX" }]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    expect(result.holdings[0].is_pending_deployment).toBe(true);
  });

  it("does not mutate the input portfolio (pure)", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false }),
      ],
    });
    const before = JSON.parse(JSON.stringify(portfolio));
    applyPortfolioEffects(portfolio, [makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }])]);
    expect(portfolio).toEqual(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/portfolioEffects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `portfolioEffects.ts`**

Create `src/engine/portfolioEffects.ts`:

```ts
import type { Portfolio, Holding, Situation, PortfolioEffect } from "../types";

function cloneHolding(h: Holding): Holding {
  return JSON.parse(JSON.stringify(h));
}

function applyMarkCashPending(
  holdings: Holding[],
  effect: Extract<PortfolioEffect, { type: "mark_cash_pending" }>,
): Holding[] {
  const result: Holding[] = [];
  let remaining = effect.amount_usd;

  for (const h of holdings) {
    if (!h.is_cash || h.is_pending_deployment || remaining <= 0) {
      result.push(cloneHolding(h));
      continue;
    }
    if (h.market_value <= remaining) {
      // Mark this entire holding pending.
      const updated = cloneHolding(h);
      updated.is_pending_deployment = true;
      updated.asset_class = "cash_pending";
      if (effect.deployment_label) updated.deployment_label = effect.deployment_label;
      result.push(updated);
      remaining -= h.market_value;
    } else {
      // Split: amount as pending, remainder stays idle.
      const pending = cloneHolding(h);
      pending.market_value = remaining;
      pending.is_pending_deployment = true;
      pending.asset_class = "cash_pending";
      pending.ticker = `${h.ticker}_pending`;
      pending.label = `${h.label} (pending)`;
      if (effect.deployment_label) pending.deployment_label = effect.deployment_label;
      result.push(pending);

      const idle = cloneHolding(h);
      idle.market_value = h.market_value - remaining;
      result.push(idle);
      remaining = 0;
    }
  }
  return result;
}

function applyMarkHoldingPending(
  holdings: Holding[],
  effect: Extract<PortfolioEffect, { type: "mark_holding_pending" }>,
): Holding[] {
  return holdings.map((h) => {
    if (h.ticker !== effect.ticker) return cloneHolding(h);
    const updated = cloneHolding(h);
    updated.is_pending_deployment = true;
    return updated;
  });
}

export function applyPortfolioEffects(
  portfolio: Portfolio,
  situations: Situation[],
): Portfolio {
  let holdings = portfolio.holdings.map(cloneHolding);
  for (const sit of situations) {
    if (sit.status !== "open") continue;
    for (const effect of sit.portfolio_effects) {
      if (effect.type === "mark_cash_pending") {
        holdings = applyMarkCashPending(holdings, effect);
      } else if (effect.type === "mark_holding_pending") {
        holdings = applyMarkHoldingPending(holdings, effect);
      }
    }
  }
  return { ...portfolio, holdings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/portfolioEffects.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/portfolioEffects.ts src/engine/portfolioEffects.test.ts
git commit -m "feat(engine): add applyPortfolioEffects for Situation pre-scoring modifications"
```

---

### Task 8: `suppression.ts` — apply Note suppressions post-scoring

**Files:**
- Create: `src/engine/suppression.ts`
- Create: `src/engine/suppression.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/engine/suppression.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyNoteSuppressions } from "./suppression";
import type { Flag, GapItem, Note } from "../types";

function makeNote(opts: Partial<Note> & { finding_key: string; suppress_flag: boolean }): Note {
  return {
    id: opts.id ?? "note_1",
    target: { type: "flag", finding_key: opts.finding_key },
    body: opts.body ?? "test note",
    suppress_flag: opts.suppress_flag,
    created_at: opts.created_at ?? "2026-05-12T00:00:00Z",
  };
}

function makeFlag(finding_key: string): Flag {
  return {
    ticker: "TEST",
    severity: "yellow",
    title: "Test flag",
    body: "test",
    finding_key,
  };
}

function makeGap(finding_key: string): GapItem {
  return {
    type: "amber",
    title: "Test gap",
    body: "test",
    progress: 0,
    finding_key,
  };
}

describe("applyNoteSuppressions", () => {
  it("does not modify flags when notes have suppress_flag=false", () => {
    const flags = [makeFlag("diversification:cash_drag")];
    const notes = [makeNote({ finding_key: "diversification:cash_drag", suppress_flag: false, body: "informational" })];
    const result = applyNoteSuppressions(flags, [], notes);
    expect(result.flags[0].suppressed_by).toBeUndefined();
  });

  it("annotates a flag with suppressed_by when a matching note has suppress_flag=true", () => {
    const flag = makeFlag("cost:duplicate_funds:us_total_market");
    const note = makeNote({ id: "note_dupe", finding_key: "cost:duplicate_funds:us_total_market", suppress_flag: true, body: "intentional" });
    const result = applyNoteSuppressions([flag], [], [note]);
    expect(result.flags[0].suppressed_by).toEqual({
      source: "note",
      id: "note_dupe",
      body: "intentional",
    });
  });

  it("annotates a gap item with suppressed_by when a matching note has suppress_flag=true", () => {
    const gap = makeGap("concentration:top3_overweight");
    const note = makeNote({ id: "note_g", finding_key: "concentration:top3_overweight", suppress_flag: true, body: "ok" });
    const result = applyNoteSuppressions([], [gap], [note]);
    expect(result.gaps[0].suppressed_by?.id).toBe("note_g");
  });

  it("does not modify flags whose finding_key does not match any note", () => {
    const flag = makeFlag("diversification:cash_drag");
    const note = makeNote({ finding_key: "cost:high_expense_ratio", suppress_flag: true });
    const result = applyNoteSuppressions([flag], [], [note]);
    expect(result.flags[0].suppressed_by).toBeUndefined();
  });

  it("does not mutate the input arrays (pure)", () => {
    const flags = [makeFlag("diversification:cash_drag")];
    const notes = [makeNote({ finding_key: "diversification:cash_drag", suppress_flag: true })];
    const flagsBefore = JSON.parse(JSON.stringify(flags));
    applyNoteSuppressions(flags, [], notes);
    expect(flags).toEqual(flagsBefore);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/suppression.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `suppression.ts`**

Create `src/engine/suppression.ts`:

```ts
import type { Flag, GapItem, Note, FlagSuppressionRef } from "../types";

function findSuppressingNote(finding_key: string, notes: Note[]): Note | undefined {
  return notes.find(n => n.suppress_flag && n.target.finding_key === finding_key);
}

export function applyNoteSuppressions(
  flags: Flag[],
  gaps: GapItem[],
  notes: Note[],
): { flags: Flag[]; gaps: GapItem[] } {
  const annotateFlag = (f: Flag): Flag => {
    const note = findSuppressingNote(f.finding_key, notes);
    if (!note) return { ...f };
    const ref: FlagSuppressionRef = { source: "note", id: note.id, body: note.body };
    return { ...f, suppressed_by: ref };
  };

  const annotateGap = (g: GapItem): GapItem => {
    const note = findSuppressingNote(g.finding_key, notes);
    if (!note) return { ...g };
    const ref: FlagSuppressionRef = { source: "note", id: note.id, body: note.body };
    return { ...g, suppressed_by: ref };
  };

  return {
    flags: flags.map(annotateFlag),
    gaps: gaps.map(annotateGap),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/suppression.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/suppression.ts src/engine/suppression.test.ts
git commit -m "feat(engine): add applyNoteSuppressions for cosmetic flag muting"
```

---

## Section 3 — AI calls

### Task 9: Update `narratives.ts` for per-call model env var

**Files:**
- Modify: `src/ai/narratives.ts`

- [ ] **Step 1: Replace the model fallback line**

Open `src/ai/narratives.ts`. Find:

```ts
model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
```

Replace with:

```ts
model: process.env.CLAUDE_MODEL_NARRATIVES ?? process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
```

- [ ] **Step 2: Verify nothing else changed**

Run: `git diff src/ai/narratives.ts`
Expected: single-line change.

- [ ] **Step 3: Compile-check**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ai/narratives.ts
git commit -m "feat(ai): per-call model env var for narratives (CLAUDE_MODEL_NARRATIVES)"
```

---

### Task 10: `pulseCheck.ts` — structured FA-style verdict per Situation

**Files:**
- Create: `src/ai/pulseCheck.ts`
- Create: `src/ai/pulseCheck.prompt.test.ts`

- [ ] **Step 1: Write the failing snapshot test for `renderPulseInput`**

Create `src/ai/pulseCheck.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderPulseInput } from "./pulseCheck";
import type { Situation, Portfolio, MacroContext, Flag } from "../types";

const baseSituation: Situation = {
  id: "sit_rollover_t3",
  title: "Rollover IRA — T3 deployment",
  intent: "Deploying $600k from old IRA in 3 tranches; T1+T2 done; T3 pending.",
  status: "open",
  target_date: "2026-06-30",
  related_findings: ["diversification:cash_drag"],
  portfolio_effects: [{ type: "mark_cash_pending", amount_usd: 200000 }],
  verdict_history: [],
  created_at: "2026-05-12T00:00:00Z",
  updated_at: "2026-05-12T00:00:00Z",
  closed_at: null,
  closure_reason: null,
};

const baseMacro: MacroContext = {
  snapshot_date: "2026-05-09",
  federal_funds_rate: 4.25,
  cpi_yoy_headline: 2.8,
  cpi_yoy_core: 3.1,
  yield_curve_spread_10y_2y: 0.42,
  yield_curve_status: "normal",
  vix: 18.2,
  hy_credit_spread_oas_bps: 340,
  lei_consecutive_declines: 0,
  ism_manufacturing: 49.2,
  ism_services: 51.4,
  market_regime: "late_cycle",
  sector_overweight: [],
  sector_underweight: [],
};

const basePortfolio: Portfolio = {
  snapshot_date: "2026-05-09",
  account_label: "All Accounts",
  holdings: [],
};

describe("renderPulseInput", () => {
  it("produces a deterministic JSON string for a given input", () => {
    const out = renderPulseInput({
      situation: baseSituation,
      macro: baseMacro,
      portfolio: basePortfolio,
      related_flags: [] as Flag[],
    });
    expect(out).toMatchSnapshot();
  });

  it("includes the situation's verdict_history if present", () => {
    const sit = {
      ...baseSituation,
      verdict_history: [
        {
          run_at: "2026-04-12T00:00:00Z",
          macro_snapshot: { regime: "late_cycle", vix: 16, yield_curve_10y_2y: 0.3, hy_credit_spread_oas_bps: 300, lei_consecutive_declines: 0 },
          verdict: "hold" as const,
          confidence: "medium" as const,
          rationale: "VIX subdued.",
          suggested_action: "Wait.",
          reconsider_when: null,
        },
      ],
    };
    const out = renderPulseInput({ situation: sit, macro: baseMacro, portfolio: basePortfolio, related_flags: [] });
    expect(out).toContain("VIX subdued");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ai/pulseCheck.prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pulseCheck.ts`**

Create `src/ai/pulseCheck.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Situation,
  PulseVerdict,
  Portfolio,
  MacroContext,
  Flag,
  MacroSnapshot,
} from "../types";

const PulseVerdictSchema = z.object({
  verdict: z
    .enum(["deploy", "partial_deploy", "hold", "monitor"])
    .describe("Current-conditions verdict on the situation."),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("Confidence in the verdict given the signal clarity."),
  rationale: z
    .string()
    .describe(
      "2-4 sentences citing actual indicator values (VIX X.X, yield curve X.XX%, regime). Colleague-to-colleague CFA tone.",
    ),
  suggested_action: z
    .string()
    .describe("One sentence with a concrete next step. Specific, not 'consider rebalancing'."),
  reconsider_when: z
    .string()
    .nullable()
    .describe("Optional threshold that would change the verdict (e.g., 'if VIX > 25 or curve inverts'). Null if no clear threshold."),
});

const SYSTEM_PROMPT = `You are a CFA-trained portfolio advisor evaluating an open user situation about an ongoing deployment, rebalance, or strategic decision. You read current macro signals through a contrarian lens:
- Calm markets / low VIX / euphoric sentiment → caution on deployments
- Fear / elevated VIX / negative sentiment → opportunity for deployment
- Late-cycle / recession risk → favor defensive tranches (FI, staples) over growth

Output a verdict tied to current conditions, NOT a generic recommendation. Reference specific indicators by value. Be willing to say "monitor" if signals are mixed.

STYLE:
- 2-4 sentences for rationale; cite actual values ("VIX at 18.2", not "calm")
- Concrete suggested_action — what to do this week, not "consider rebalancing"
- Use Unicode minus (−) for negatives, never ASCII -
- Tone: colleague-to-colleague, no hedging language
- No words "robust" or "optimize"`.trim();

export interface PulseInput {
  situation: Situation;
  macro: MacroContext;
  portfolio: Portfolio;
  related_flags: Flag[];
}

export function renderPulseInput(input: PulseInput): string {
  return JSON.stringify(
    {
      situation: {
        title: input.situation.title,
        intent: input.situation.intent,
        target_date: input.situation.target_date,
        portfolio_effects: input.situation.portfolio_effects,
        prior_verdicts: input.situation.verdict_history.slice(-3).map(v => ({
          run_at: v.run_at,
          verdict: v.verdict,
          rationale: v.rationale,
        })),
      },
      macro: {
        regime: input.macro.market_regime,
        vix: input.macro.vix,
        yield_curve_spread_10y_2y: input.macro.yield_curve_spread_10y_2y,
        yield_curve_status: input.macro.yield_curve_status,
        federal_funds_rate: input.macro.federal_funds_rate,
        cpi_yoy_core: input.macro.cpi_yoy_core,
        hy_credit_spread_oas_bps: input.macro.hy_credit_spread_oas_bps,
        lei_consecutive_declines: input.macro.lei_consecutive_declines,
      },
      portfolio_snapshot: {
        snapshot_date: input.portfolio.snapshot_date,
        holding_count: input.portfolio.holdings.length,
        total_value: input.portfolio.holdings.reduce((s, h) => s + h.market_value, 0),
      },
      related_flags: input.related_flags.map(f => ({
        title: f.title,
        body: f.body,
      })),
    },
    null,
    2,
  );
}

export function macroSnapshotFor(macro: MacroContext): MacroSnapshot {
  return {
    regime: macro.market_regime,
    vix: macro.vix,
    yield_curve_10y_2y: macro.yield_curve_spread_10y_2y,
    hy_credit_spread_oas_bps: macro.hy_credit_spread_oas_bps,
    lei_consecutive_declines: macro.lei_consecutive_declines,
  };
}

export async function runPulseCheck(input: PulseInput): Promise<PulseVerdict> {
  const client = new Anthropic();
  const userContent = renderPulseInput(input);

  const response = await client.messages.parse({
    model:
      process.env.CLAUDE_MODEL_PULSE ??
      process.env.CLAUDE_MODEL ??
      "claude-opus-4-7",
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(PulseVerdictSchema as never),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (!response.parsed_output) {
    throw new Error("Anthropic API returned no parsed_output for pulse-check");
  }

  return {
    run_at: new Date().toISOString(),
    macro_snapshot: macroSnapshotFor(input.macro),
    ...response.parsed_output,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass (will create snapshot on first run)**

Run: `npx vitest run src/ai/pulseCheck.prompt.test.ts`
Expected: PASS — 2 tests (snapshot created on first run).

- [ ] **Step 5: Compile-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/pulseCheck.ts src/ai/pulseCheck.prompt.test.ts src/ai/__snapshots__
git commit -m "feat(ai): add pulseCheck.ts (Opus-default situation verdicts) + prompt snapshot"
```

---

### Task 11: `chat.ts` — streaming Sonnet chat with tool proposals

**Files:**
- Create: `src/ai/chat.ts`
- Create: `src/ai/chat.prompt.test.ts`

- [ ] **Step 1: Write the failing snapshot test**

Create `src/ai/chat.prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderChatInput } from "./chat";
import type { ChatMessage, ChatScope, Situation, Note } from "../types";

const globalScope: ChatScope = { type: "global" };

const baseAnalysis = {
  portfolio_grade: "B+",
  portfolio_score: 7.4,
  flags: [{ ticker: "CASH", severity: "yellow", title: "Idle cash 24.7%", body: "", finding_key: "diversification:cash_drag" }],
  dimension_scores: [
    { id: "diversification", label: "Diversification", score: 6.8, rating: "yellow", display_value: "—", note: "", weight: 0.15 },
  ],
  macro: { market_regime: "late_cycle", vix: 18.2, yield_curve_spread_10y_2y: 0.42 },
  aggregates: { total_value: 2_500_000, cash_weight: 0.247 },
};

describe("renderChatInput", () => {
  it("emits a global-scope context block including header, top flags, and macro", () => {
    const out = renderChatInput({
      user_message: "Why is my grade B+?",
      scope: globalScope,
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history: [],
    });
    expect(out).toMatchSnapshot();
  });

  it("scopes to a single flag when scope.type === 'flag'", () => {
    const out = renderChatInput({
      user_message: "Tell me about cash drag",
      scope: { type: "flag", finding_key: "diversification:cash_drag" },
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history: [],
    });
    expect(out).toContain("diversification:cash_drag");
  });

  it("includes the last N history turns under their scope", () => {
    const history: ChatMessage[] = [
      { id: "m1", role: "user", content: "earlier question", scope: globalScope, created_at: "2026-05-12T00:00:00Z" },
      { id: "m2", role: "assistant", content: "earlier answer", scope: globalScope, created_at: "2026-05-12T00:00:01Z" },
    ];
    const out = renderChatInput({
      user_message: "next question",
      scope: globalScope,
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history,
    });
    expect(out).toContain("earlier question");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ai/chat.prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `chat.ts`**

Create `src/ai/chat.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  ChatScope,
  Situation,
  Note,
} from "../types";

export const CHAT_SYSTEM_PROMPT = `You are the user's portfolio advisor with access to their full analysis, open situations, and notes. CFA tone — direct, no hedging, no words "robust" or "optimize". Grades use Unicode minus (−), not ASCII -.

CAPABILITIES:
- Answer questions about findings, scores, allocations, macro context
- Propose creating Situations when the user describes ongoing plans (rollovers, multi-step deployments, decisions they're tracking)
- Propose creating Notes when the user gives context that explains a flag they're OK with
- Propose closing Situations when the user mentions completion

CONSTRAINTS:
- NEVER fabricate values. If the requested data isn't in the context, say so.
- When the user's scope is a specific finding, prefer answers grounded in that finding.
- Tool use is PROPOSAL ONLY — user confirms in the UI. Do not assume the tool ran; respond as if you're suggesting an action.
- Stream prose first, then emit at most one tool call per turn.
- Use Unicode minus for negatives.

FACT VS JUDGMENT RULE for tool proposals:
- If the user is telling you a fact about their portfolio the engine doesn't know (e.g., "$X cash has a deployment plan"), propose a Situation with portfolio_effects.
- If the user is explaining a judgment ("I accept this concentration"), propose a Note with suppress_flag.
- Don't inflate the grade by suppressing real problems — use Notes for judgment, not portfolio_effects.`.trim();

export const CHAT_TOOLS = [
  {
    name: "propose_situation",
    description:
      "Propose tracking an ongoing plan, deployment, or decision as a Situation. The user must confirm in the UI before this takes effect.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        intent: { type: "string" },
        target_date: { type: "string", description: "ISO date YYYY-MM-DD, optional" },
        related_findings: { type: "array", items: { type: "string" } },
        portfolio_effects: {
          type: "array",
          items: {
            oneOf: [
              {
                type: "object",
                properties: {
                  type: { const: "mark_cash_pending" },
                  amount_usd: { type: "number" },
                  deployment_label: { type: "string" },
                },
                required: ["type", "amount_usd"],
              },
              {
                type: "object",
                properties: {
                  type: { const: "mark_holding_pending" },
                  ticker: { type: "string" },
                  amount_usd: { type: "number" },
                },
                required: ["type", "ticker"],
              },
            ],
          },
        },
      },
      required: ["title", "intent"],
    },
  },
  {
    name: "propose_note",
    description:
      "Propose attaching a judgment Note to a finding. Setting suppress_flag mutes the flag (cosmetic; score unchanged). User confirms in UI.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "object",
          properties: {
            type: { enum: ["flag", "gap", "dimension", "global"] },
            finding_key: { type: "string" },
          },
          required: ["type", "finding_key"],
        },
        body: { type: "string" },
        suppress_flag: { type: "boolean" },
      },
      required: ["target", "body", "suppress_flag"],
    },
  },
  {
    name: "propose_close_situation",
    description: "Propose marking a Situation as resolved when the user mentions completion.",
    input_schema: {
      type: "object",
      properties: {
        situation_id: { type: "string" },
        closure_reason: { type: "string" },
      },
      required: ["situation_id", "closure_reason"],
    },
  },
] as const;

export interface ChatInputContext {
  user_message: string;
  scope: ChatScope;
  analysis: any; // analysis.json subset; intentionally permissive to avoid coupling to evolving shape
  situations: Situation[];
  notes: Note[];
  history: ChatMessage[];
}

function summarizeOpenSituations(situations: Situation[]) {
  return situations
    .filter((s) => s.status === "open")
    .map((s) => ({
      id: s.id,
      title: s.title,
      intent: s.intent,
      target_date: s.target_date,
      latest_verdict: s.verdict_history.at(-1) ?? null,
    }));
}

function trimAnalysisByScope(analysis: any, scope: ChatScope): unknown {
  if (!analysis) return null;
  if (scope.type === "global") {
    return {
      portfolio_grade: analysis.portfolio_grade,
      portfolio_score: analysis.portfolio_score,
      top_flags: (analysis.flags ?? []).slice(0, 3),
      dimension_scores: analysis.dimension_scores,
      macro: analysis.macro,
      aggregates: analysis.aggregates,
    };
  }
  if (scope.type === "flag" || scope.type === "gap") {
    const flag = (analysis.flags ?? []).find((f: any) => f.finding_key === scope.finding_key);
    const gap = (analysis.gap_items ?? []).find((g: any) => g.finding_key === scope.finding_key);
    return {
      portfolio_grade: analysis.portfolio_grade,
      finding: flag ?? gap ?? null,
      macro: analysis.macro,
    };
  }
  if (scope.type === "situation") {
    return {
      portfolio_grade: analysis.portfolio_grade,
      macro: analysis.macro,
    };
  }
  return null;
}

export function renderChatInput(ctx: ChatInputContext): string {
  const historyFiltered =
    ctx.scope.type === "global"
      ? ctx.history.slice(-20)
      : ctx.history
          .filter((m) => m.scope.type === "global" || sameScope(m.scope, ctx.scope))
          .slice(-20);

  const notesScoped = ctx.notes.filter((n) => {
    if (ctx.scope.type === "flag" || ctx.scope.type === "gap") {
      return n.target.finding_key === ctx.scope.finding_key;
    }
    return false;
  });

  return JSON.stringify(
    {
      user_message: ctx.user_message,
      scope: ctx.scope,
      analysis_scope: trimAnalysisByScope(ctx.analysis, ctx.scope),
      open_situations: summarizeOpenSituations(ctx.situations),
      notes_in_scope: notesScoped,
      history: historyFiltered.map((m) => ({
        role: m.role,
        content: m.content,
        scope: m.scope,
      })),
    },
    null,
    2,
  );
}

function sameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.type !== b.type) return false;
  if (a.finding_key !== b.finding_key) return false;
  if (a.situation_id !== b.situation_id) return false;
  return true;
}

export interface RunChatOptions {
  context: ChatInputContext;
  /** Called for each text delta as tokens stream in. */
  onDelta: (text: string) => void;
  /** Called once when a tool_use block completes. */
  onToolUse?: (toolName: string, payload: Record<string, unknown>) => void;
}

export async function runChat(opts: RunChatOptions): Promise<void> {
  const client = new Anthropic();
  const userContent = renderChatInput(opts.context);

  const stream = client.messages.stream({
    model:
      process.env.CLAUDE_MODEL_CHAT ??
      process.env.CLAUDE_MODEL ??
      "claude-sonnet-4-6",
    max_tokens: 2000,
    system: CHAT_SYSTEM_PROMPT,
    tools: CHAT_TOOLS as any,
    messages: [{ role: "user", content: userContent }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta") {
      const d = event.delta;
      if (d.type === "text_delta") {
        opts.onDelta(d.text);
      }
    }
  }
  const final = await stream.finalMessage();
  if (opts.onToolUse) {
    for (const block of final.content) {
      if (block.type === "tool_use") {
        opts.onToolUse(block.name, block.input as Record<string, unknown>);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ai/chat.prompt.test.ts`
Expected: PASS — 3 tests (snapshot created on first run).

- [ ] **Step 5: Compile-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ai/chat.ts src/ai/chat.prompt.test.ts src/ai/__snapshots__
git commit -m "feat(ai): add chat.ts (Sonnet-default streaming + tool proposals) + prompt snapshot"
```

---

## Section 4 — Server middleware

### Task 12: `handlers/situations.ts` — CRUD endpoints

**Files:**
- Create: `src/server/handlers/situations.ts`

- [ ] **Step 1: Implement the handler**

Create `src/server/handlers/situations.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { Situation } from "../../types";

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

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${date}_${rand}`;
}

export async function handleSituationsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  match: { method: string; id?: string },
  ctxPath: string,
): Promise<void> {
  if (match.method === "GET" && !match.id) {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.situations);
  }

  if (match.method === "POST" && !match.id) {
    const body = (await readBody(req)) as Partial<Situation>;
    if (!body.title || !body.intent) {
      return sendJSON(res, 400, { error: "title and intent are required" });
    }
    const sit: Situation = {
      id: makeId("sit"),
      title: body.title,
      intent: body.intent,
      status: "open",
      target_date: body.target_date ?? null,
      related_findings: body.related_findings ?? [],
      portfolio_effects: body.portfolio_effects ?? [],
      verdict_history: [],
      created_at: nowIso(),
      updated_at: nowIso(),
      closed_at: null,
      closure_reason: null,
    };
    mutateUserContext(ctxPath, (ctx) => {
      ctx.situations.push(sit);
    });
    return sendJSON(res, 201, sit);
  }

  if (match.method === "PATCH" && match.id) {
    const body = (await readBody(req)) as Partial<Situation>;
    let updated: Situation | null = null;
    mutateUserContext(ctxPath, (ctx) => {
      const sit = ctx.situations.find((s) => s.id === match.id);
      if (!sit) return;
      Object.assign(sit, body, { updated_at: nowIso() });
      if (body.status === "closed" && !sit.closed_at) {
        sit.closed_at = nowIso();
      }
      updated = sit;
    });
    if (!updated) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 200, updated);
  }

  if (match.method === "DELETE" && match.id) {
    let removed = false;
    mutateUserContext(ctxPath, (ctx) => {
      const idx = ctx.situations.findIndex((s) => s.id === match.id);
      if (idx !== -1) {
        ctx.situations.splice(idx, 1);
        removed = true;
      }
    });
    if (!removed) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 204, {});
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
```

- [ ] **Step 2: Compile-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/handlers/situations.ts
git commit -m "feat(server): add /api/situations CRUD handler"
```

---

### Task 13: `handlers/notes.ts` — CRUD endpoints

**Files:**
- Create: `src/server/handlers/notes.ts`

- [ ] **Step 1: Implement the handler**

Create `src/server/handlers/notes.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { mutateUserContext, loadUserContext } from "../userContextStore";
import type { Note } from "../../types";

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

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `note_${date}_${rand}`;
}

export async function handleNotesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  match: { method: string; id?: string },
  ctxPath: string,
): Promise<void> {
  if (match.method === "GET" && !match.id) {
    const ctx = loadUserContext(ctxPath);
    return sendJSON(res, 200, ctx.notes);
  }

  if (match.method === "POST" && !match.id) {
    const body = (await readBody(req)) as Partial<Note>;
    if (!body.target || !body.body) {
      return sendJSON(res, 400, { error: "target and body are required" });
    }
    const note: Note = {
      id: makeId(),
      target: body.target,
      body: body.body,
      suppress_flag: body.suppress_flag ?? false,
      created_at: nowIso(),
    };
    mutateUserContext(ctxPath, (ctx) => {
      ctx.notes.push(note);
    });
    return sendJSON(res, 201, note);
  }

  if (match.method === "PATCH" && match.id) {
    const body = (await readBody(req)) as Partial<Note>;
    let updated: Note | null = null;
    mutateUserContext(ctxPath, (ctx) => {
      const n = ctx.notes.find((x) => x.id === match.id);
      if (!n) return;
      Object.assign(n, body);
      updated = n;
    });
    if (!updated) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 200, updated);
  }

  if (match.method === "DELETE" && match.id) {
    let removed = false;
    mutateUserContext(ctxPath, (ctx) => {
      const idx = ctx.notes.findIndex((n) => n.id === match.id);
      if (idx !== -1) {
        ctx.notes.splice(idx, 1);
        removed = true;
      }
    });
    if (!removed) return sendJSON(res, 404, { error: "not found" });
    return sendJSON(res, 204, {});
  }

  sendJSON(res, 405, { error: "method not allowed" });
}
```

- [ ] **Step 2: Compile-check + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/server/handlers/notes.ts
git commit -m "feat(server): add /api/notes CRUD handler"
```

---

### Task 14: `handlers/chat.ts` — SSE streaming endpoint

**Files:**
- Create: `src/server/handlers/chat.ts`

- [ ] **Step 1: Implement the streaming handler**

Create `src/server/handlers/chat.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { runChat, type ChatInputContext } from "../../ai/chat";
import { loadUserContext, mutateUserContext } from "../userContextStore";
import type { ChatMessage, ChatScope } from "../../types";

function readBody(req: IncomingMessage): Promise<any> {
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

function sendSSE(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeMsgId(): string {
  const d = new Date();
  const stamp = d.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6);
  return `msg_${stamp}_${rand}`;
}

function loadAnalysis(): unknown {
  const p = path.resolve("output/analysis.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export interface ChatRequestBody {
  message: string;
  scope?: ChatScope;
}

export async function handleChatRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctxPath: string,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end();
    return;
  }

  const body = (await readBody(req)) as ChatRequestBody;
  if (!body.message) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "message required" }));
    return;
  }

  const scope: ChatScope = body.scope ?? { type: "global" };

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const userCtx = loadUserContext(ctxPath);
  const userMsg: ChatMessage = {
    id: makeMsgId(),
    role: "user",
    content: body.message,
    scope,
    created_at: nowIso(),
  };

  // Persist user message immediately
  mutateUserContext(ctxPath, (c) => {
    c.chat_history.push(userMsg);
  });

  const chatInput: ChatInputContext = {
    user_message: body.message,
    scope,
    analysis: loadAnalysis(),
    situations: userCtx.situations,
    notes: userCtx.notes,
    history: userCtx.chat_history,
  };

  let assistantText = "";
  let toolCall: { tool: string; payload: Record<string, unknown> } | null = null;

  try {
    await runChat({
      context: chatInput,
      onDelta: (delta) => {
        assistantText += delta;
        sendSSE(res, "delta", { text: delta });
      },
      onToolUse: (tool, payload) => {
        toolCall = { tool, payload };
        sendSSE(res, "tool_use", { tool, payload });
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendSSE(res, "error", { message: msg });
    res.end();
    return;
  }

  const assistantMsg: ChatMessage = {
    id: makeMsgId(),
    role: "assistant",
    content: assistantText,
    scope,
    created_at: nowIso(),
    ...(toolCall
      ? { tool_call: { ...toolCall, status: "proposed" as const } }
      : {}),
  };
  mutateUserContext(ctxPath, (c) => {
    c.chat_history.push(assistantMsg);
  });

  sendSSE(res, "done", { id: assistantMsg.id });
  res.end();
}
```

- [ ] **Step 2: Compile-check + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add src/server/handlers/chat.ts
git commit -m "feat(server): add /api/chat SSE streaming handler"
```

---

### Task 15: `vitePlugin.ts` — register middleware with Vite

**Files:**
- Create: `src/server/vitePlugin.ts`

- [ ] **Step 1: Implement the plugin**

Create `src/server/vitePlugin.ts`:

```ts
import type { Plugin } from "vite";
import * as path from "node:path";
import { handleSituationsRoute } from "./handlers/situations";
import { handleNotesRoute } from "./handlers/notes";
import { handleChatRoute } from "./handlers/chat";

const SITUATIONS_RE = /^\/api\/situations(?:\/([^/]+))?$/;
const NOTES_RE = /^\/api\/notes(?:\/([^/]+))?$/;

export interface UserContextPluginOptions {
  /** Absolute path to data/user-context.json. */
  contextPath?: string;
}

export function userContextPlugin(opts: UserContextPluginOptions = {}): Plugin {
  const contextPath =
    opts.contextPath ?? path.resolve(process.cwd(), "data/user-context.json");

  return {
    name: "user-context-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";

        if (url === "/api/chat") {
          try {
            await handleChatRoute(req, res, contextPath);
          } catch (err) {
            console.error("/api/chat error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        const sit = url.match(SITUATIONS_RE);
        if (sit) {
          try {
            await handleSituationsRoute(
              req,
              res,
              { method: req.method ?? "GET", id: sit[1] },
              contextPath,
            );
          } catch (err) {
            console.error("/api/situations error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        const note = url.match(NOTES_RE);
        if (note) {
          try {
            await handleNotesRoute(
              req,
              res,
              { method: req.method ?? "GET", id: note[1] },
              contextPath,
            );
          } catch (err) {
            console.error("/api/notes error", err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.end();
            }
          }
          return;
        }

        next();
      });
    },
  };
}
```

- [ ] **Step 2: Compile-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/vitePlugin.ts
git commit -m "feat(server): add userContextPlugin Vite middleware registration"
```

---

### Task 16: Register the plugin in the React app's Vite config

**Files:**
- Modify: `src/report/app/vite.config.ts`

- [ ] **Step 1: Update the Vite config**

Open `src/report/app/vite.config.ts`. Replace the file contents with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { userContextPlugin } from "../../server/vitePlugin";

// Project root is src/report/app/. The CLI writes output/analysis.json at the
// repo root, which is three dirs up. Point Vite's static-serve directory there
// so /analysis.json resolves to <repo>/output/analysis.json without copying.
export default defineConfig({
  plugins: [
    react(),
    userContextPlugin({
      contextPath: path.resolve(__dirname, "../../../data/user-context.json"),
    }),
  ],
  publicDir: path.resolve(__dirname, "../../../output"),
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 2: Verify the dev server boots**

Run: `npm run report`
Expected: Vite starts, prints "ready in X ms" and serves on http://localhost:5173. No error about the plugin import.

Stop the server with Ctrl+C.

- [ ] **Step 3: Test an API route quickly with curl**

In one terminal, run `npm run report` (leave running). In another:

```bash
curl http://localhost:5173/api/situations
```

Expected: `[]` (empty array — user-context.json doesn't exist yet, store returns empty context).

```bash
curl -X POST http://localhost:5173/api/situations \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke test","intent":"verifying middleware"}'
```

Expected: 201 with a JSON `{id: "sit_...", title: "Smoke test", ...}`.

```bash
curl http://localhost:5173/api/situations
```

Expected: array with the smoke-test situation.

Delete the smoke-test situation:

```bash
curl -X DELETE http://localhost:5173/api/situations/<the-id-from-above>
```

Expected: 204 no content.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/vite.config.ts
git commit -m "feat(report): register userContextPlugin in Vite dev server"
```

---

## Section 5 — CLI pipeline integration

### Task 17: Extend `src/index.ts` to use the new pipeline steps

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update imports**

Open `src/index.ts`. Add to the existing imports block at the top:

```ts
import { loadUserContext, saveUserContext } from "./server/userContextStore";
import { applyPortfolioEffects } from "./engine/portfolioEffects";
import { applyNoteSuppressions } from "./engine/suppression";
import { runPulseCheck } from "./ai/pulseCheck";
import type { Situation, PulseVerdict } from "./types";
```

Add a constant near the top with the other constants:

```ts
const USER_CONTEXT_FILE = "data/user-context.json";
```

- [ ] **Step 2: Load user-context.json near the start of `main()`**

In `main()`, just after the "loading raw brokerage data..." log, add:

```ts
const userContext = loadUserContext(USER_CONTEXT_FILE);
if (userContext.situations.length || userContext.notes.length) {
  console.log(
    `  Loaded user-context.json: ${userContext.situations.length} situations, ${userContext.notes.length} notes`,
  );
}
```

- [ ] **Step 3: Apply portfolio_effects BEFORE scoring**

Find the section where the validated portfolio is produced (the line `const portfolio = parsePortfolio(consolidated);`). Just after that line, before `const aggregates = computeAggregates(portfolio);`, insert:

```ts
const effectedPortfolio = applyPortfolioEffects(portfolio, userContext.situations);
```

Then change every subsequent reference from `portfolio` to `effectedPortfolio` in:
- `const aggregates = computeAggregates(...)` — use `effectedPortfolio`
- `scoreAllDimensions(...)` — use `effectedPortfolio`
- `generateFlags(...)` — use `effectedPortfolio`
- The narratives input — use `effectedPortfolio`
- The output assembled at the bottom — `portfolio: effectedPortfolio`

(Leave the literal name `portfolio` in places that read from the unmodified input only if needed. The simplest patch is: rename `portfolio` → `effectedPortfolio` everywhere downstream, since the engine should see the effected portfolio.)

- [ ] **Step 4: Apply Note suppressions AFTER flag/gap generation**

After `generateGapItems(...)` runs and before `generatePlanPhases(...)`, add:

```ts
const suppressed = applyNoteSuppressions(flags, gap_items, userContext.notes);
const suppressedFlags = suppressed.flags;
const suppressedGapItems = suppressed.gaps;
```

Use `suppressedFlags` / `suppressedGapItems` instead of `flags` / `gap_items` in subsequent uses (narratives input and the final `output` object).

- [ ] **Step 5: Run pulse-check for each open Situation**

After narratives generation (after the `if (process.env.ANTHROPIC_API_KEY) {...}` block) but before assembling the output object, add:

```ts
const openSituations = userContext.situations.filter((s) => s.status === "open");
if (openSituations.length > 0 && process.env.ANTHROPIC_API_KEY) {
  console.log("");
  console.log(`Running pulse-check on ${openSituations.length} open situation(s)...`);
  await Promise.all(
    openSituations.map(async (sit) => {
      const related_flags = suppressedFlags.filter((f) =>
        sit.related_findings.includes(f.finding_key),
      );
      let verdict: PulseVerdict;
      try {
        verdict = await runPulseCheck({
          situation: sit,
          macro,
          portfolio: effectedPortfolio,
          related_flags,
        });
        console.log(`  ${sit.title}: ${verdict.verdict.toUpperCase()} (${verdict.confidence})`);
      } catch (err) {
        verdict = {
          run_at: new Date().toISOString(),
          macro_snapshot: {
            regime: macro.market_regime,
            vix: macro.vix,
            yield_curve_10y_2y: macro.yield_curve_spread_10y_2y,
            hy_credit_spread_oas_bps: macro.hy_credit_spread_oas_bps,
            lei_consecutive_declines: macro.lei_consecutive_declines,
          },
          verdict: "monitor",
          confidence: "low",
          rationale: "",
          suggested_action: "",
          reconsider_when: null,
          error: err instanceof Error ? err.message : String(err),
        };
        console.warn(`  ${sit.title}: pulse-check failed — ${verdict.error}`);
      }
      sit.verdict_history.push(verdict);
      sit.updated_at = verdict.run_at;
    }),
  );
} else if (openSituations.length > 0) {
  console.log("");
  console.log(`${openSituations.length} open situation(s) but ANTHROPIC_API_KEY not set — skipping pulse-check.`);
}
```

- [ ] **Step 6: Persist updated user-context.json**

After the pulse-check loop, save the updated context:

```ts
if (openSituations.length > 0) {
  saveUserContext(USER_CONTEXT_FILE, userContext);
}
```

- [ ] **Step 7: Extend the output object**

Update the assembled `output` object so it includes the user-context-derived data:

```ts
const output = {
  generated_at: new Date().toISOString(),
  portfolio: effectedPortfolio,
  macro,
  aggregates,
  portfolio_score,
  portfolio_grade,
  dimension_scores,
  reference_models: REFERENCE_MODELS,
  flags: suppressedFlags,
  gap_items: suppressedGapItems,
  plan_phases,
  score_trajectory,
  findings,
  narratives,
  situations: userContext.situations,
  notes: userContext.notes,
};
```

- [ ] **Step 8: Run analyze without a user-context.json (V1 parity)**

Delete or move `data/user-context.json` if it exists, then run:

```bash
npm run analyze
```

Expected: no errors. Output is identical to V1 (because no situations / no notes). Console summary unchanged except possibly a "Loaded user-context.json" line if you have a non-empty file.

- [ ] **Step 9: Smoke-test with a situation**

Create a minimal `data/user-context.json` with one situation that marks cash pending:

```json
{
  "version": 1,
  "situations": [
    {
      "id": "sit_smoke",
      "title": "Smoke: mark $200k cash pending",
      "intent": "verifying portfolio_effects pipeline",
      "status": "open",
      "target_date": null,
      "related_findings": ["diversification:cash_drag"],
      "portfolio_effects": [
        { "type": "mark_cash_pending", "amount_usd": 200000 }
      ],
      "verdict_history": [],
      "created_at": "2026-05-12T00:00:00Z",
      "updated_at": "2026-05-12T00:00:00Z",
      "closed_at": null,
      "closure_reason": null
    }
  ],
  "notes": [],
  "chat_history": []
}
```

Run `npm run analyze`. Expected:
- Console shows "Loaded user-context.json: 1 situations, 0 notes"
- Pending cash weight > 0 in the allocation summary
- Idle cash weight reduced by $200k worth
- If `ANTHROPIC_API_KEY` is set: pulse-check runs and prints the verdict
- `output/analysis.json` has `situations[0].verdict_history` with one entry
- `data/user-context.json` is updated with the new verdict_history entry

If `ANTHROPIC_API_KEY` is not set: pipeline still completes, message shows "skipping pulse-check," no crash.

Delete `data/user-context.json` afterward (it's gitignored — won't show up in git status).

- [ ] **Step 10: Run all tests + type-check**

```bash
npx vitest run
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add src/index.ts
git commit -m "feat(cli): wire user-context.json into pipeline (effects, suppression, pulse-check)"
```

---

## Section 6 — React UI

### Task 18: Add mirror types to `src/report/app/types.ts`

**Files:**
- Modify: `src/report/app/types.ts`

- [ ] **Step 1: Append the new types**

Open `src/report/app/types.ts`. Append at the end of the file:

```ts
// Mirror of V2 types from src/types.ts — keep in sync.

export interface FlagSuppressionRef {
  source: "note" | "situation";
  id: string;
  body: string;
}

export type PortfolioEffect =
  | { type: "mark_cash_pending"; amount_usd: number; deployment_label?: string }
  | { type: "mark_holding_pending"; ticker: string; amount_usd?: number };

export interface MacroSnapshot {
  regime: string;
  vix: number;
  yield_curve_10y_2y: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
}

export interface PulseVerdict {
  run_at: string;
  macro_snapshot: MacroSnapshot;
  verdict: "deploy" | "partial_deploy" | "hold" | "monitor";
  confidence: "low" | "medium" | "high";
  rationale: string;
  suggested_action: string;
  reconsider_when: string | null;
  error?: string;
}

export interface Situation {
  id: string;
  title: string;
  intent: string;
  status: "open" | "closed";
  target_date: string | null;
  related_findings: string[];
  portfolio_effects: PortfolioEffect[];
  verdict_history: PulseVerdict[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closure_reason: string | null;
}

export interface Note {
  id: string;
  target: { type: "flag" | "gap" | "dimension" | "global"; finding_key: string };
  body: string;
  suppress_flag: boolean;
  created_at: string;
}

export interface ChatScope {
  type: "global" | "flag" | "gap" | "situation";
  finding_key?: string;
  situation_id?: string;
}

export interface ChatToolCall {
  tool: string;
  payload: Record<string, unknown>;
  status: "proposed" | "confirmed" | "rejected";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  scope: ChatScope;
  tool_call?: ChatToolCall;
  created_at: string;
}
```

Also, find the existing `Flag` and `GapItem` interface mirrors in the same file and add `finding_key: string;` and `suppressed_by?: FlagSuppressionRef;` to each, matching the shape in `src/types.ts`.

- [ ] **Step 2: Compile-check**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/report/app/types.ts
git commit -m "feat(report): mirror V2 types (Situation, Note, ChatMessage, etc.)"
```

---

### Task 19: Sidebar scaffolding — `Sidebar.tsx`, `chatStore.ts`, `useChat.ts`

**Files:**
- Create: `src/report/app/sidebar/Sidebar.tsx`
- Create: `src/report/app/sidebar/ChatHistory.tsx`
- Create: `src/report/app/sidebar/ChatInput.tsx`
- Create: `src/report/app/sidebar/ToolProposalCard.tsx`
- Create: `src/report/app/sidebar/useChat.ts`
- Create: `src/report/app/sidebar/chatStore.ts`

- [ ] **Step 1: Create the client-side state holder `chatStore.ts`**

Create `src/report/app/sidebar/chatStore.ts`:

```ts
import type { ChatScope, ChatMessage, Situation, Note } from "../types";

export interface ChatState {
  collapsed: boolean;
  scope: ChatScope;
  history: ChatMessage[];
  streaming: boolean;
}

const LS_KEY = "fmv3.sidebar.collapsed";

export function initialChatState(): ChatState {
  const collapsed =
    typeof window !== "undefined" ? localStorage.getItem(LS_KEY) === "true" : false;
  return {
    collapsed,
    scope: { type: "global" },
    history: [],
    streaming: false,
  };
}

export function persistCollapsed(collapsed: boolean): void {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, String(collapsed));
}

export function sameScope(a: ChatScope, b: ChatScope): boolean {
  if (a.type !== b.type) return false;
  if ((a.finding_key ?? "") !== (b.finding_key ?? "")) return false;
  if ((a.situation_id ?? "") !== (b.situation_id ?? "")) return false;
  return true;
}
```

- [ ] **Step 2: Create the SSE consumer hook `useChat.ts`**

Create `src/report/app/sidebar/useChat.ts`:

```ts
import { useCallback, useState } from "react";
import type { ChatScope, ChatMessage, ChatToolCall } from "../types";

export interface UseChatResult {
  send: (message: string, scope: ChatScope) => Promise<void>;
  history: ChatMessage[];
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
  streaming: boolean;
  resetPending: () => void;
}

function makeMsgId(): string {
  const d = new Date();
  return `msg_${d.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useChat(initialHistory: ChatMessage[] = []): UseChatResult {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [pendingAssistantText, setPendingAssistantText] = useState("");
  const [pendingToolUse, setPendingToolUse] =
    useState<{ tool: string; payload: Record<string, unknown> } | null>(null);
  const [streaming, setStreaming] = useState(false);

  const resetPending = useCallback(() => {
    setPendingAssistantText("");
    setPendingToolUse(null);
  }, []);

  const send = useCallback(
    async (message: string, scope: ChatScope) => {
      setStreaming(true);
      setPendingAssistantText("");
      setPendingToolUse(null);

      const userMsg: ChatMessage = {
        id: makeMsgId(),
        role: "user",
        content: message,
        scope,
        created_at: new Date().toISOString(),
      };
      setHistory((h) => [...h, userMsg]);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, scope }),
      });

      if (!res.ok || !res.body) {
        setHistory((h) => [
          ...h,
          {
            id: makeMsgId(),
            role: "assistant",
            content: `(error: ${res.status} ${res.statusText})`,
            scope,
            created_at: new Date().toISOString(),
          },
        ]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let toolUse: { tool: string; payload: Record<string, unknown> } | null = null;
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const lines = ev.split("\n");
          let eventName = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            if (line.startsWith("data: ")) data += line.slice(6);
          }
          if (!eventName || !data) continue;
          const parsed = JSON.parse(data);
          if (eventName === "delta") {
            assistantText += parsed.text;
            setPendingAssistantText(assistantText);
          } else if (eventName === "tool_use") {
            toolUse = { tool: parsed.tool, payload: parsed.payload };
            setPendingToolUse(toolUse);
          } else if (eventName === "error") {
            assistantText += `\n[error: ${parsed.message}]`;
            setPendingAssistantText(assistantText);
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: makeMsgId(),
        role: "assistant",
        content: assistantText,
        scope,
        created_at: new Date().toISOString(),
        ...(toolUse
          ? { tool_call: { ...toolUse, status: "proposed" as const } as ChatToolCall }
          : {}),
      };
      setHistory((h) => [...h, assistantMsg]);
      setPendingAssistantText("");
      setPendingToolUse(null);
      setStreaming(false);
    },
    [],
  );

  return { send, history, pendingAssistantText, pendingToolUse, streaming, resetPending };
}
```

- [ ] **Step 3: Create `ChatHistory.tsx`**

Create `src/report/app/sidebar/ChatHistory.tsx`:

```tsx
import type { ChatMessage, ChatScope } from "../types";
import { sameScope } from "./chatStore";
import { ToolProposalCard } from "./ToolProposalCard";

interface Props {
  history: ChatMessage[];
  scope: ChatScope;
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
}

export function ChatHistory({ history, scope, pendingAssistantText, pendingToolUse }: Props) {
  const filtered =
    scope.type === "global"
      ? history
      : history.filter((m) => m.scope.type === "global" || sameScope(m.scope, scope));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", fontSize: 12 }}>
      {filtered.map((m) => (
        <div
          key={m.id}
          style={{
            background: m.role === "user" ? "#1a3a2a" : "#1a1d24",
            padding: "6px 8px",
            borderRadius: 6,
            marginBottom: 6,
            color: "#bbb",
          }}
        >
          <div>{m.content}</div>
          {m.tool_call && m.tool_call.status === "proposed" && (
            <div style={{ marginTop: 6 }}>
              <ToolProposalCard
                tool={m.tool_call.tool}
                payload={m.tool_call.payload}
                messageId={m.id}
              />
            </div>
          )}
        </div>
      ))}
      {pendingAssistantText && (
        <div
          style={{
            background: "#1a1d24",
            padding: "6px 8px",
            borderRadius: 6,
            color: "#bbb",
          }}
        >
          {pendingAssistantText}
          <span style={{ opacity: 0.4 }}> ▌</span>
        </div>
      )}
      {pendingToolUse && (
        <div style={{ marginTop: 6 }}>
          <ToolProposalCard tool={pendingToolUse.tool} payload={pendingToolUse.payload} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `ChatInput.tsx`**

Create `src/report/app/sidebar/ChatInput.tsx`:

```tsx
import { useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  return (
    <form
      style={{ display: "flex", gap: 6, padding: "8px 10px", borderTop: "1px solid #2a2d34" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !disabled) {
          onSend(text.trim());
          setText("");
        }
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask or annotate..."
        disabled={disabled}
        style={{ flex: 1, fontSize: 12, padding: "4px 6px" }}
      />
      <button type="submit" disabled={disabled || !text.trim()} style={{ fontSize: 12, padding: "4px 10px" }}>
        ↑
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Create `ToolProposalCard.tsx`**

Create `src/report/app/sidebar/ToolProposalCard.tsx`:

```tsx
import { useState } from "react";

interface Props {
  tool: string;
  payload: Record<string, unknown>;
  messageId?: string;
}

export function ToolProposalCard({ tool, payload }: Props) {
  const [status, setStatus] = useState<"proposed" | "confirmed" | "dismissed">("proposed");

  const confirm = async () => {
    let url = "";
    let body = payload;
    if (tool === "propose_situation") {
      url = "/api/situations";
    } else if (tool === "propose_note") {
      url = "/api/notes";
    } else if (tool === "propose_close_situation") {
      const sid = payload.situation_id as string;
      url = `/api/situations/${sid}`;
      body = { status: "closed", closure_reason: payload.closure_reason };
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setStatus("confirmed");
      return;
    } else {
      setStatus("dismissed");
      return;
    }
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setStatus("confirmed");
  };

  const title = tool === "propose_situation"
    ? "💡 Track this as a Situation?"
    : tool === "propose_note"
      ? "💡 Save this as a Note?"
      : tool === "propose_close_situation"
        ? "💡 Mark Situation as resolved?"
        : tool;

  return (
    <div
      style={{
        border: status === "confirmed" ? "1px solid #4ade80" : "1px solid #4a9eff",
        borderRadius: 4,
        padding: 8,
        background: status === "confirmed" ? "#0a2a1a" : "#0a1a2a",
        fontSize: 11,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 10, overflowX: "auto" }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
      {status === "proposed" && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <button onClick={confirm} style={{ fontSize: 11, padding: "3px 8px" }}>Confirm</button>
          <button onClick={() => setStatus("dismissed")} style={{ fontSize: 11, padding: "3px 8px" }}>Dismiss</button>
        </div>
      )}
      {status === "confirmed" && <div style={{ marginTop: 4, color: "#4ade80" }}>✓ saved</div>}
      {status === "dismissed" && <div style={{ marginTop: 4, color: "#888" }}>dismissed</div>}
    </div>
  );
}
```

- [ ] **Step 6: Create `Sidebar.tsx`**

Create `src/report/app/sidebar/Sidebar.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ChatScope, ChatMessage } from "../types";
import { initialChatState, persistCollapsed } from "./chatStore";
import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";
import { useChat } from "./useChat";

interface Props {
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
  initialHistory?: ChatMessage[];
}

export function Sidebar({ scope, onScopeChange, initialHistory = [] }: Props) {
  const [collapsed, setCollapsed] = useState(initialChatState().collapsed);
  const chat = useChat(initialHistory);

  useEffect(() => persistCollapsed(collapsed), [collapsed]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          position: "fixed",
          right: 12,
          top: 12,
          padding: "6px 10px",
          background: "#11141a",
          border: "1px solid #2a2d34",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        💬 Chat
      </button>
    );
  }

  return (
    <aside
      style={{
        width: 340,
        background: "#11141a",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #2a2d34",
        height: "100vh",
        position: "sticky",
        top: 0,
      }}
    >
      <header
        style={{
          padding: 10,
          borderBottom: "1px solid #2a2d34",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>💬 Chat</strong>
        <button onClick={() => setCollapsed(true)} style={{ fontSize: 11 }}>×</button>
      </header>

      {scope.type !== "global" && (
        <div
          style={{
            margin: "8px 10px",
            padding: "5px 8px",
            background: "#0a1a2a",
            border: "1px solid #4a9eff",
            borderRadius: 3,
            fontSize: 10,
            color: "#4a9eff",
          }}
        >
          Discussing: <strong>{scope.finding_key ?? scope.situation_id}</strong> ·{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onScopeChange({ type: "global" });
            }}
            style={{ color: "#4a9eff", textDecoration: "underline" }}
          >
            clear
          </a>
        </div>
      )}

      <ChatHistory
        history={chat.history}
        scope={scope}
        pendingAssistantText={chat.pendingAssistantText}
        pendingToolUse={chat.pendingToolUse}
      />
      <ChatInput onSend={(text) => chat.send(text, scope)} disabled={chat.streaming} />
    </aside>
  );
}
```

- [ ] **Step 7: Compile-check + commit**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

```bash
git add src/report/app/sidebar/
git commit -m "feat(report): add chat sidebar (history, input, streaming hook, tool-proposal cards)"
```

---

### Task 20: `OpenSituations.tsx` pinned strip

**Files:**
- Create: `src/report/app/sections/OpenSituations.tsx`

- [ ] **Step 1: Implement the component**

Create `src/report/app/sections/OpenSituations.tsx`:

```tsx
import type { Situation, ChatScope } from "../types";

interface Props {
  situations: Situation[];
  onDiscuss: (sit: Situation) => void;
  onResolve: (sit: Situation) => void;
}

function verdictPillStyle(verdict: string): React.CSSProperties {
  if (verdict === "deploy") return { background: "#0a2a1a", color: "#4ade80" };
  if (verdict === "partial_deploy") return { background: "#1a2a0a", color: "#a3e635" };
  if (verdict === "hold") return { background: "#3a2d0a", color: "#d97706" };
  return { background: "#2a2d34", color: "#9ca3af" };
}

export function OpenSituations({ situations, onDiscuss, onResolve }: Props) {
  const open = situations.filter((s) => s.status === "open");
  if (open.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid #4a9eff",
        borderRadius: 6,
        padding: 10,
        marginBottom: 14,
        background: "#0a1a2a",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 8, color: "#4a9eff" }}>
        📌 Open Situations · {open.length}
      </div>
      {open.map((sit) => {
        const v = sit.verdict_history.at(-1);
        return (
          <div
            key={sit.id}
            style={{
              background: "#11151c",
              padding: 10,
              borderRadius: 4,
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{sit.title}</strong>
                {sit.target_date && (
                  <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                    target {sit.target_date}
                  </span>
                )}
              </div>
              {v && (
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: "bold",
                    ...verdictPillStyle(v.verdict),
                  }}
                >
                  {v.verdict.toUpperCase()}
                </span>
              )}
            </div>
            {v?.rationale && (
              <div style={{ color: "#aaa", marginTop: 4, fontSize: 11 }}>{v.rationale}</div>
            )}
            {v?.suggested_action && (
              <div style={{ color: "#bbb", marginTop: 4, fontSize: 11 }}>
                <em>{v.suggested_action}</em>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, color: "#888" }}>
              History: {sit.verdict_history.length} verdicts
              {v && ` · last run ${v.run_at.slice(0, 10)}`}
              {sit.related_findings.length > 0 && ` · related: ${sit.related_findings.join(", ")}`}
              {sit.portfolio_effects.length > 0 &&
                ` · adjusts portfolio: ${sit.portfolio_effects
                  .map((e) => (e.type === "mark_cash_pending" ? `$${e.amount_usd.toLocaleString()} cash pending` : `${e.ticker} pending`))
                  .join(", ")}`}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button onClick={() => onDiscuss(sit)} style={{ fontSize: 10, padding: "3px 8px" }}>
                Discuss in chat
              </button>
              <button onClick={() => onResolve(sit)} style={{ fontSize: 10, padding: "3px 8px" }}>
                Mark resolved
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Compile-check + commit**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

```bash
git add src/report/app/sections/OpenSituations.tsx
git commit -m "feat(report): add OpenSituations pinned strip with verdict pills + actions"
```

---

### Task 21: Update `Flags.tsx` with `finding_key`, 💬 button, suppressed state

**Files:**
- Modify: `src/report/app/sections/Flags.tsx`

- [ ] **Step 1: Read the existing Flags.tsx to understand its structure**

Run `Read` on `src/report/app/sections/Flags.tsx`. Identify where each flag row is rendered.

- [ ] **Step 2: Add the 💬 button and suppressed visual state**

For each rendered flag row, the row should:

- Show a small 💬 button on the right (use a simple `<button>` styled inline)
- When the flag has `suppressed_by`, render the row with:
  - `border: "1px dashed #555"` and `opacity: 0.6`
  - A green pill labeled `💬 suppressed` linking to the source note ID
  - The suppression body text under the row, e.g. "Suppressed by your note: <body excerpt>"

Add a prop `onDiscuss: (finding_key: string) => void` to the Flags component, and call `onDiscuss(flag.finding_key)` when the 💬 button is clicked. This lets the parent re-scope the sidebar.

Pseudocode for the row render:

```tsx
const isSuppressed = !!flag.suppressed_by;
return (
  <div
    key={flag.finding_key}
    style={{
      border: isSuppressed ? "1px dashed #555" : "1px solid " + (flag.severity === "red" ? "#dc2626" : "#d97706"),
      borderRadius: 4,
      padding: 8,
      marginBottom: 6,
      opacity: isSuppressed ? 0.6 : 1,
      background: isSuppressed ? "transparent" : flag.severity === "red" ? "#2a1010" : "#2a1d0a",
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <strong>{flag.title}</strong>
        {isSuppressed && (
          <span style={{ marginLeft: 6, padding: "1px 5px", borderRadius: 3, background: "#1a3a2a", color: "#4ade80", fontSize: 10 }}>
            💬 suppressed
          </span>
        )}
      </div>
      <button
        onClick={() => onDiscuss(flag.finding_key)}
        style={{ fontSize: 11, padding: "2px 6px" }}
      >
        💬
      </button>
    </div>
    <div style={{ color: "#aaa", fontSize: 11, marginTop: 3 }}>{flag.body}</div>
    {isSuppressed && flag.suppressed_by && (
      <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>
        Suppressed by your note: "{flag.suppressed_by.body}"
      </div>
    )}
  </div>
);
```

Apply this transformation to the existing Flags component. Keep whatever wrapper/title the existing component had (e.g., a section header "Flags"); only the per-row markup changes.

- [ ] **Step 3: Compile-check**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/sections/Flags.tsx
git commit -m "feat(report): flag rows show 💬 button + suppressed visual state"
```

---

### Task 22: Update `Gaps.tsx` with `finding_key`, 💬 button, suppressed state

**Files:**
- Modify: `src/report/app/sections/Gaps.tsx`

- [ ] **Step 1: Mirror the Flags.tsx changes onto Gaps.tsx**

Open `src/report/app/sections/Gaps.tsx`. Apply the same pattern as Flags.tsx (Task 21):

- Add a `onDiscuss: (finding_key: string) => void` prop
- Render each gap row with a 💬 button on the right
- When `gap.suppressed_by` is set, render with dashed border + reduced opacity + suppressed pill + suppressed-by-note line

The gap row uses `gap.type` for severity color (red / amber / blue) — preserve the existing color scheme for non-suppressed rows.

- [ ] **Step 2: Compile-check + commit**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

```bash
git add src/report/app/sections/Gaps.tsx
git commit -m "feat(report): gap rows show 💬 button + suppressed visual state"
```

---

### Task 23: Wire it all into `App.tsx`

**Files:**
- Modify: `src/report/app/App.tsx`

- [ ] **Step 1: Read the existing App.tsx**

Run `Read` on `src/report/app/App.tsx` to understand its current structure. It loads `analysis.json` and renders the 8 sections.

- [ ] **Step 2: Wrap content in two-column layout + add Sidebar + OpenSituations**

Update `App.tsx` so that:

1. A new top-level `<div>` uses `display: grid; grid-template-columns: 1fr 340px` (or 1fr when sidebar is collapsed).
2. The main column holds the existing sections, but with `<OpenSituations>` rendered above the first existing section.
3. The right column is the new `<Sidebar>`.
4. Top-level state tracks `scope: ChatScope` and updates when:
   - Sidebar's scope chip "clear" link clicked → `{ type: "global" }`
   - 💬 button on a flag/gap clicked → `{ type: flag.suppressed_by ? "gap" : "flag", finding_key }` (use flag for Flag rows, gap for Gap rows)
   - "Discuss in chat" on a Situation card → `{ type: "situation", situation_id: sit.id }`
5. `OpenSituations` is passed `onResolve` that prompts for a `closure_reason` and PATCHes the situation.

Sketch:

```tsx
import { useEffect, useState } from "react";
// ... existing imports ...
import { Sidebar } from "./sidebar/Sidebar";
import { OpenSituations } from "./sections/OpenSituations";
import type { ChatScope, Situation } from "./types";

function App() {
  // ... existing analysis-loading state ...
  const [scope, setScope] = useState<ChatScope>({ type: "global" });

  // Re-fetch situations after PATCH/POST so the strip stays current.
  // For simplicity: just refetch the whole analysis.json — it includes situations.
  const reloadAnalysis = async () => { /* refetch */ };

  const handleResolve = async (sit: Situation) => {
    const reason = window.prompt(`Why is "${sit.title}" resolved?`, "completed");
    if (reason === null) return;
    await fetch(`/api/situations/${sit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed", closure_reason: reason }),
    });
    await reloadAnalysis();
  };

  // ...

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", minHeight: "100vh" }}>
      <main style={{ padding: 14 }}>
        {analysis && (
          <>
            <OpenSituations
              situations={analysis.situations ?? []}
              onDiscuss={(sit) => setScope({ type: "situation", situation_id: sit.id })}
              onResolve={handleResolve}
            />
            {/* existing sections — pass onDiscuss to Flags/Gaps */}
            <Flags flags={analysis.flags} onDiscuss={(k) => setScope({ type: "flag", finding_key: k })} />
            <Gaps gaps={analysis.gap_items} onDiscuss={(k) => setScope({ type: "gap", finding_key: k })} />
            {/* ... other sections unchanged ... */}
          </>
        )}
      </main>
      <Sidebar
        scope={scope}
        onScopeChange={setScope}
        initialHistory={[] /* chat history isn't loaded from server in Phase 1 — user starts fresh each session */}
      />
    </div>
  );
}
```

The `initialHistory={[]}` for Phase 1 is deliberate: we don't fetch chat history into the UI on every load. The server persists chat history (for use as LLM context), but the UI displays only the current session's messages. Loading prior turns into the UI is a polish item for V2.1.

- [ ] **Step 3: Compile-check**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/report/app/App.tsx
git commit -m "feat(report): integrate Sidebar + OpenSituations + finding-scope wiring in App"
```

---

## Section 7 — Manual verification

### Task 24: End-to-end verification

**Files:** none modified — this task is a checklist.

- [ ] **Step 1: Clean state**

```bash
rm -f data/user-context.json
npx vitest run
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

Expected: all PASS.

- [ ] **Step 2: V1 parity — no user-context.json**

```bash
npm run analyze
```

Expected: pipeline completes normally; `output/analysis.json` has empty `situations: []` and `notes: []`; rest of the output matches V1 behavior.

```bash
npm run report
```

Open http://localhost:5173 in a browser. Verify:
- All 8 existing sections render
- No "Open Situations" strip visible (empty)
- Sidebar is open by default (or collapsed if localStorage was previously set)
- Flag rows have 💬 buttons
- Clicking 💬ed scopes the sidebar to that finding (scope chip appears)

Stop the server.

- [ ] **Step 3: Fact change scenario — cash rollover**

Create `data/user-context.json`:

```json
{
  "version": 1,
  "situations": [
    {
      "id": "sit_rollover",
      "title": "Rollover IRA — T3 deployment",
      "intent": "Deploying remaining $200k of rollover into FXNAX/FTIHX over the next 4-6 weeks.",
      "status": "open",
      "target_date": "2026-06-30",
      "related_findings": ["diversification:cash_drag"],
      "portfolio_effects": [{ "type": "mark_cash_pending", "amount_usd": 200000 }],
      "verdict_history": [],
      "created_at": "2026-05-12T00:00:00Z",
      "updated_at": "2026-05-12T00:00:00Z",
      "closed_at": null,
      "closure_reason": null
    }
  ],
  "notes": [],
  "chat_history": []
}
```

Run `npm run analyze`. Verify:
- Pending cash weight > 0 in console
- Pulse-check runs (if API key is set) and prints a verdict
- `data/user-context.json` is updated with the new verdict_history entry
- `output/analysis.json` has `situations[0].verdict_history` populated

Compare the new grade vs the baseline (V1) grade — diversification score should have improved.

Open the report with `npm run report`. Verify:
- "📌 Open Situations" strip at top shows the rollover situation with verdict pill
- The "Cash drag" flag (if it still appears) shows as suppressed OR doesn't appear (depends on whether the pending mark removed it entirely)

- [ ] **Step 4: Judgment scenario — duplicate funds note**

Add to `data/user-context.json` under `notes`:

```json
{
  "id": "note_dupe",
  "target": { "type": "flag", "finding_key": "cost:duplicate_funds:us_total_market" },
  "body": "VTSAX at Vanguard, FSKAX at Fidelity — cross-brokerage consolidation not worth the friction.",
  "suppress_flag": true,
  "created_at": "2026-05-12T00:00:00Z"
}
```

Adjust the `finding_key` value to match what your actual analysis produces — run `npm run analyze` first and look at `output/analysis.json` flags for the actual `finding_key` strings, then put the right one in the note.

Run `npm run analyze` again. Verify:
- The flag still exists in `analysis.json` (judgment doesn't remove flags)
- The flag has `suppressed_by` populated

Open `npm run report`. Verify:
- The dupe-funds flag renders with dashed border, reduced opacity, 💬 suppressed pill
- Hovering / clicking the pill shows the source note body

- [ ] **Step 5: API-key-absent path**

Temporarily unset `ANTHROPIC_API_KEY`:

```bash
ANTHROPIC_API_KEY= npm run analyze
```

Expected: pipeline completes without crashing; pulse-check is skipped with a "skipping pulse-check" message; narratives are skipped per existing behavior.

- [ ] **Step 6: Chat smoke test**

Run `npm run report`. In the browser:

1. Type "What's driving my B+ grade?" in the sidebar.
2. Verify tokens stream into the message.
3. Click a 💬 on a flag (any). Verify scope chip appears.
4. Ask a scope-specific question and verify the response references the finding.
5. Tell the LLM: "Cash at 24% is from a 3-tranche IRA rollover — T1 and T2 done, T3 pending over the next month." Verify the LLM produces a tool-use proposal (a `ToolProposalCard` should render under the assistant message).
6. Click "Confirm" on the proposal. Verify the network tab shows the POST to `/api/situations` succeed (201).
7. Refresh the page. Verify the new situation appears in the "📌 Open Situations" strip.

- [ ] **Step 7: Mark-resolved smoke test**

Click "Mark resolved" on a Situation card. Enter a closure reason. Verify the situation disappears from the strip on next refresh, and `data/user-context.json` shows the situation with `status: "closed"` and `closure_reason` populated.

- [ ] **Step 8: Concurrency smoke test (optional)**

While `npm run report` is running, in a separate shell start `npm run analyze`. After both complete, verify `data/user-context.json` is valid JSON (parses without error). Either side may have lost an update, but the file shouldn't be corrupt:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('data/user-context.json','utf-8')).version)"
```

Expected: prints `1`.

- [ ] **Step 9: Type-check both projects + run tests**

```bash
npx vitest run
npx tsc --noEmit
npx tsc --noEmit -p src/report/app/tsconfig.json
```

All three: PASS.

- [ ] **Step 10: No commit needed for verification.** If anything failed, fix it under a new commit titled `fix(<area>): <subject>` before declaring Phase 1 complete.

---

## Known omissions

### Per spec §12 (intentionally out of scope)

- Integration tests against the live Anthropic API
- React component tests
- Load / multi-user concurrency testing
- Retry policy for failed pulse-checks (single attempt; logs on failure)
- Auto-detection / deduplication of similar Notes / Situations
- Cleanup automation for Notes/Situations whose `finding_key` no longer resolves to a current finding

### Punted from this plan to a Phase 1.1 follow-up

Two UI niceties from the spec are NOT implemented in the tasks above. They're worth doing — but the engine refactor needed for the first one and the small scope of the second one make them a clean follow-up rather than blocking Phase 1 launch:

- **Grade-impact preview on `ToolProposalCard`** (spec §7.4 — "Diversification 6.8 → 7.9, Overall B+ → A−"). Requires (a) a new `/api/preview-effect` endpoint that re-runs the engine with hypothetical Situation effects and returns before/after dimension scores, and (b) refactoring `src/index.ts` so the analyze pipeline is callable as a pure function `runAnalysis(portfolio, macro, userContext)`. The base `ToolProposalCard` in Task 19 ships showing just the proposal payload; users still click Confirm with full knowledge of what they're confirming, just without the numeric preview.
- **Sidebar "show all / scope-filtered" toggle** (spec §7.4 — "filtered by scope or showing all — UI toggle, default: scope-filtered"). `ChatHistory.tsx` in Task 19 hard-codes the scope-filtered default with no toggle UI. Adding a toggle is ~10 lines.

If either becomes important quickly, they're small, isolated additions on top of the Phase 1 work.

These belong to V2.1 or later phases.
