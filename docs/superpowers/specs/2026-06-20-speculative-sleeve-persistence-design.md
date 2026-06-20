# Speculative Sleeve persistence — design

**Date:** 2026-06-20
**Status:** approved, ready for implementation plan
**Follows:** `2026-06-20-speculative-sleeve-design.md` (the engine/CLI/report-rendering feature)

## Problem

The speculative-sleeve feature was built entirely in the TypeScript stack (engine,
CLI, report rendering). The seed (`TSLA`/`NVDA`) was written only to the local
`data/kevin/user-context.json`. But the **authoritative** store is a separate
.NET/C# API (`api/PortfolioReport.Api`, deployed at `finance.bis-corp.com`), and:

1. The server's stored copy for a user predates this feature — it has no
   `speculative_holds` key.
2. `publish:<user>` (and anything pulling `GET /api/user-context`) overwrites the
   local file with the server's seedless copy, erasing the seed. The tell-tale
   signature is `speculative_holds: []` + `speculative_sleeve_threshold: 0.05`
   (both re-defaulted from a fieldless object by `parseUserContext`).
3. There is **no server endpoint and no app UI** to set a speculative hold, so the
   sleeve cannot live on the authoritative store at all.

Root cause confirmed by reproduction: the analyze pipeline, the TS store
round-trip, and the C# `UserContextStore` (which does structural JSON edits and
preserves unknown fields) all preserve `speculative_holds` correctly. Nothing
"strips" it — the field simply never reaches the server.

## Goal

Make the speculative sleeve durable and user-manageable end-to-end: add a server
endpoint set to persist `speculative_holds` on the authoritative store, and a
report-UI affordance to add/remove holds directly from the flags that nag about
them. After this, a designated sleeve survives `publish` and is editable from the
hosted report.

## Non-goals

- No change to the TypeScript engine/CLI — they already consume `speculative_holds`
  correctly (canonicalization, scoring exemption, flag suppression, guardrail flag).
- `speculative_sleeve_threshold` is **not** editable from the UI (stays at the
  engine default of `0.05`; the guardrail flag still fires from the engine).
- No bulk import/migration script — seeding is done through the new UI.

## Architecture context

The report app already separates **live user-context state** from the **static
analysis snapshot**:

- `data` (scoring, dimensions, flags) is fetched from `GET /api/analysis` — the
  published `analysis.json`, a snapshot recomputed only on `publish`/`analyze`.
- `liveSituations` is fetched from `GET /api/situations` and reflects edits
  immediately; the scoring *effect* of a situation appears on the next publish.

The speculative sleeve follows the `liveSituations` model exactly: edits write to
the server live and reflect in the UI instantly, while the scoring effect (muted
flags contributing to the grade, +score) appears on the next publish.

The C# `UserContextStore.MutateAsync(user, Action<JsonObject>)` loads the
user-context as a mutable `JsonObject`, applies a structural edit, and atomically
writes the whole tree back (serialized per-user via a semaphore). Unknown fields
are preserved. All new endpoints use this.

## Backend — C# API

New file `api/PortfolioReport.Api/Endpoints/SpeculativeHoldsEndpoints.cs`,
mirroring `NotesEndpoints` / `ProfileEndpoints`. Registered in `Program.cs`
alongside the others. All routes `RequireAuthorization("session")`.

### `GET /api/speculative-holds`
Loads the context, returns `ctx["speculative_holds"]` as a JSON array, or `[]`
when the key is absent.

### `POST /api/speculative-holds`
Body: `{ ticker: string, reason?: string }`.
- `400` if `ticker` is missing/empty.
- `MutateAsync`: **initialize the key if absent** — `c["speculative_holds"] ??=
  new JsonArray()` (pre-feature server blobs have no such key).
- **Dedup by ticker** (exact-string match — flags supply canonical tickers such as
  `TSLA`, `NVDA`, `BRK-B`): if a hold with the same `ticker` already exists, do not
  append; return the existing hold (idempotent).
- Otherwise append `{ ticker, reason? (only when non-empty), designated_at:
  ContextIds.Timestamp() }`.
- Return the hold object as `201 Created` (or `200` when it already existed),
  matching the JSON serialization style used by `NotesEndpoints`
  (`note.ToJsonString()`).

### `DELETE /api/speculative-holds/{ticker}`
- `MutateAsync`: remove the first array element whose `ticker` equals the route
  value.
- `204 No Content` on removal; `404` when not found (mirrors
  `DELETE /api/notes/{id}`).

`speculative_sleeve_threshold` is never written by these endpoints; if a server
blob lacks it, the TS engine defaults it to `0.05` on read.

### Backend tests (`api/PortfolioReport.Api.Tests`)
Mirror the existing endpoint test style:
- `GET` returns `[]` for a context with no `speculative_holds` key.
- `POST` appends a hold, stamps `designated_at`, and the hold survives a reload.
- `POST` is idempotent for a duplicate ticker (no second entry).
- `POST` initializes the key when the stored context lacks it.
- `DELETE` removes a hold; `DELETE` of an unknown ticker returns `404`.
- Unauthorized request (no session) returns `401`.

## Frontend — React report

### `src/report/app/types.ts` (mirror)
Add a `SpeculativeHold` interface: `{ ticker: string; reason?: string;
designated_at: string }`. (Tasks 1–2 added `FlagSuppressionRef.source` and the two
`PortfolioAggregates` fields to this mirror, but not this interface — the live
editing needs it now.)

### `src/report/app/App.tsx`
- New state `liveSpeculativeHolds: SpeculativeHold[]`, fetched from
  `GET /api/speculative-holds` on load (next to the `liveSituations` fetch).
- `addSpeculativeHold(ticker, reason?)`: `POST /api/speculative-holds`, then append
  the returned hold to `liveSpeculativeHolds` (skip if already present).
- `removeSpeculativeHold(ticker)`: `DELETE /api/speculative-holds/{ticker}`, then
  drop it from `liveSpeculativeHolds`.
- Pass `liveSpeculativeHolds`, `addSpeculativeHold`, `removeSpeculativeHold` into
  the Flags section.
- Use `appPath(...)` for all URLs (dev/prod base handling), consistent with the
  existing fetches.

### `src/report/app/sections/Flags.tsx`
- A flag is **eligible** for the add action when it is an individual-stock flag
  (i.e., `flag.ticker` matches a holding of `asset_class === "individual_stock"`;
  in practice the valuation/high-beta flags). Determine eligibility from the
  ticker present in `data.portfolio.holdings`.
- For an eligible flag whose ticker is **not** in `liveSpeculativeHolds` and is not
  already `suppressed_by` speculative: render an **"Hold deliberately → add to
  sleeve"** button styled like the existing 💬 Discuss button; on click call
  `addSpeculativeHold(flag.ticker)`.
- A flag whose ticker **is** in `liveSpeculativeHolds` (optimistic) OR already
  carries `suppressed_by.source === "speculative_hold"` (post-publish) renders
  **muted** (the existing dashed/low-opacity style). For the optimistic case the
  footer reads: *"Speculative-sleeve hold — applies to scoring on the next report
  refresh."* For the already-published case it keeps today's source-aware footer.
- The sleeve summary banner lists held tickers — union of
  `data.aggregates.speculative_sleeve_tickers` (published) and
  `liveSpeculativeHolds` (live) — each with a **remove (×)** control calling
  `removeSpeculativeHold(ticker)`.
- All flags for the same ticker mute/un-mute together when a hold is added/removed.

### Frontend verification
Manual per repo convention: `npx tsc --noEmit -p src/report/app/tsconfig.json`
clean, plus eyeballing add/remove and the optimistic mute in `npm run report`.

## Seeding the existing sleeve

No script. After the feature ships, open the hosted report and click "add to
sleeve" on the TSLA and NVDA flags. This writes them to the server's
`user-context.json` (the authoritative copy). From then on `publish:kevin` pulls a
seeded context, `analyze` exempts them and mutes their flags, and the hosted report
reflects the sleeve. This closes the gap that erased the local seed.

## Data flow (post-feature)

```
User clicks "add to sleeve" (TSLA, NVDA) in hosted report
   │ POST /api/speculative-holds
   ▼
server user-context.json gains speculative_holds   ← authoritative & durable
   │ publish:<user> pulls it → overwrites local (now WITH the seed)
   ▼
analyze reads speculative_holds → scoring exemption + flag suppression + guardrail
   │ pushes analysis.json
   ▼
hosted report: muted flags + sleeve banner + higher grade
```

## Edge cases

- `POST` with absent key → initialize `[]`, then append.
- `POST` duplicate ticker → idempotent no-op, return existing hold.
- `DELETE` unknown ticker → `404`.
- Ticker casing/format → stored as entered (flags supply canonical tickers); the
  TS engine canonicalizes on read (`BRK B` → `BRK-B`), so matching at scoring time
  is already correct.
- Optimistic UI vs. published state → the Flags section unions live holds with the
  published `suppressed_by`/sleeve tickers, so a hold added live shows muted even
  though `analysis.json` still lists the flag active until the next publish.

## Surfaces touched

- `api/PortfolioReport.Api/Endpoints/SpeculativeHoldsEndpoints.cs` (new)
- `api/PortfolioReport.Api/Program.cs` (endpoint registration)
- `api/PortfolioReport.Api.Tests/` (new endpoint tests)
- `src/report/app/types.ts` (add `SpeculativeHold`)
- `src/report/app/App.tsx` (live state + handlers)
- `src/report/app/sections/Flags.tsx` (add/remove actions + optimistic mute)

The TypeScript engine and CLI are unchanged.

## Invariants preserved

- The C# store does structural JSON edits only; the schema of record stays in
  TypeScript (`parseUserContext.ts`). The new endpoints add/remove array elements
  and never reshape other fields.
- The engine remains the only place that computes the sleeve weight and the
  threshold guardrail; the UI and API only manage the list of holds.
- Scoring effects remain a property of the published `analysis.json`; live edits
  change the UI immediately but the grade only on the next publish — consistent
  with situations.
