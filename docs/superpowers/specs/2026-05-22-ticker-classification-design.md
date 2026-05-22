# Ticker Classification — Design

**Date:** 2026-05-22
**Status:** Approved design, pending spec review
**Topic:** Replace hardcoded `TICKER_METADATA` with an AI-classified, file-backed metadata store so unknown tickers get classified automatically instead of silently mislabelled.

## Summary

Today, every ticker in a brokerage file is classified by a hardcoded lookup table in `src/intake/tickerMetadata.ts` (~20 entries). Any ticker not in the table silently falls back to `asset_class: "us_equity_total_market"` inside the four broker normalizers in `src/intake/normalize.ts` (lines 74, 118, 204, 254). VXUS — Vanguard's total-international ETF — currently gets bucketed as US equity for exactly this reason.

This design replaces the hardcoded map with `data/ticker-metadata.json`, classifies any unknown ticker via a single structured Anthropic call at the start of `analyze`, and removes the silent fallback entirely. Classifications are written back to the JSON file and committed alongside everyone else's data, so each new ticker is classified once and reused forever.

## Goals

1. Unknown tickers get the correct asset class on first analyze, without any human input in the common case.
2. The classification result is persisted to `data/ticker-metadata.json` and never re-computed unless the user manually deletes the entry.
3. Silent miscategorization is eliminated. Any unclassifiable ticker with non-zero market value causes analyze to fail loudly.
4. The publish flow (`scripts/publish.ts`) works headlessly — no interactive prompts.

## Non-goals

- Real-time market-data fetching (Yahoo Finance, Polygon, etc.). Stock metrics come from Claude's best-effort knowledge and may be months stale.
- Automatic refresh of stale entries. To re-classify, the user deletes the entry from the JSON.
- Per-user ticker metadata. The file is global and checked into git.
- Changes to the React app, API, or scoring engine. The engine continues to consume the same `Holding.asset_class` field; only its source changes.

## File format

`data/ticker-metadata.json` — a single JSON document, checked into git, edited by both the classifier and humans.

```json
{
  "version": 1,
  "tickers": {
    "VXUS": {
      "asset_class": "international_equity",
      "expense_ratio": 0.0007,
      "classified_at": "2026-05-22"
    },
    "XLU": {
      "asset_class": "us_equity_sector",
      "expense_ratio": 0.0008,
      "sector_tag": "utilities",
      "classified_at": "2026-05-22"
    },
    "VWENX": {
      "asset_class": "balanced",
      "expense_ratio": 0.0017,
      "underlying_composition": {
        "us_equity": 0.60,
        "international_equity": 0.05,
        "fixed_income": 0.35,
        "cash": 0.0
      },
      "classified_at": "2026-04-10"
    },
    "TSLA": {
      "asset_class": "individual_stock",
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 410.29, "ev_ebitda": 137.07, "fcf_yield": 0.0037,
        "roe": 0.0462, "eps_growth_yoy": -0.4702, "revenue_growth_yoy": -0.0293,
        "net_debt_ebitda": -3.03, "beta": 1.793, "analyst_consensus": 3.19
      },
      "classified_at": "2026-04-10"
    },
    "FAKETICKER123": {
      "asset_class": "unknown",
      "notes": "no public market data found",
      "classified_at": "2026-05-22"
    }
  }
}
```

Per-entry shape is a discriminated union on `asset_class`, validated by a Zod schema:

- All entries: `asset_class` (required), `classified_at` (required ISO date), `notes` (optional string from Claude).
- `us_equity_*`, `international_equity`, `us_bond_*`, `target_date`, `balanced`, `cash`: `expense_ratio` (number, can be 0).
- `us_equity_sector`: also requires `sector_tag` (e.g. `"utilities"`, `"healthcare"`).
- `balanced`: also requires `underlying_composition` (object summing to 1.0).
- `individual_stock`: `expense_ratio: null`, requires `stock_metrics` block (the same shape as today's hardcoded entries).
- `unknown`: only `notes` and `classified_at` are meaningful; no other fields required.

Keys are canonical tickers — `"BRK-B"` not `"BRK B"`. `canonicalTicker()` is applied at lookup time before reading the map.

## New `AssetClass` value: `"unknown"`

`src/types.ts` adds `"unknown"` to the `AssetClass` union. Required impact:

- `src/report/app/types.ts` (the React mirror per CLAUDE.md) gets the same union update.
- `aggregates.ts` is extended to filter out `asset_class: "unknown"` holdings from all weight calculations. Since the pipeline rejects non-zero-value unknowns earlier (see Error handling), only zero-value unknowns reach `aggregates.ts`.
- Any switch statement that's exhaustive on `AssetClass` (test fixtures, scoring branches) adds a no-op or throw case for `"unknown"`. The TypeScript compiler surfaces all of these.

## Classifier module

New file `src/intake/tickerClassifier.ts`. Three exports:

```ts
export interface TickerMetadataFile {
  version: 1;
  tickers: Record<string, TickerMetadata>;
}

// Loads data/ticker-metadata.json. Returns an empty map if the file doesn't
// exist yet (first run). Cached per-process after first load.
export function loadTickerMetadata(filePath?: string): TickerMetadataFile;

// Looks up a ticker in the currently-loaded map. Returns null if absent —
// callers (the broker normalizers) treat null as asset_class: "unknown".
// No silent fallback to us_equity_total_market.
export function lookupTicker(symbol: string): TickerMetadata | null;

// Given a list of canonical tickers not present in the loaded map, calls
// Claude with a structured prompt, validates the response against the Zod
// schema, merges new entries into the file on disk, and returns the merged
// map. Throws if ANTHROPIC_API_KEY is unset or the API call/parse fails.
export async function classifyTickers(
  unknowns: string[],
  filePath?: string,
): Promise<TickerMetadataFile>;
```

The four broker normalizers in `src/intake/normalize.ts` import `lookupTicker` from `tickerClassifier.ts` instead of `tickerMetadata.ts`.

`tickerMetadata.ts` shrinks to just `canonicalTicker()`:

```ts
// src/intake/tickerMetadata.ts (after migration)
export function canonicalTicker(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed === "BRK B") return "BRK-B";
  return trimmed;
}
```

### Anthropic call shape

- Model: `claude-sonnet-4-6` (consistent with `narratives.ts`, `tacticalAdvisor.ts`).
- Method: `client.messages.parse()` with the Zod schema for an array of `{ symbol, ...TickerMetadata }` entries.
- Adaptive thinking enabled.
- Temperature 0.
- Prompt instructs Claude to:
  - Return one entry per input symbol, in the same order.
  - Use canonical tickers.
  - Pick the most appropriate `asset_class` from the enum.
  - Provide `expense_ratio` from training data (acknowledged as potentially stale).
  - For `individual_stock`, provide best-effort `stock_metrics` even if approximate.
  - Use `asset_class: "unknown"` only if the ticker is genuinely unrecognizable. Include a `notes` field explaining why.

## Migration of the existing hardcoded map

One-time script (`scripts/migrate-ticker-metadata.ts`, run once and discarded — or kept for reference): reads the existing `TICKER_METADATA` literal, writes equivalent entries to `data/ticker-metadata.json` with `classified_at: "2026-05-22"`. After running it, the `TICKER_METADATA` literal is deleted from `tickerMetadata.ts`.

The committed `data/ticker-metadata.json` becomes the canonical source. Tests that currently rely on `lookupTicker("TSLA")` etc. work unchanged because the same data is in the new file.

## Pipeline wiring

The classifier runs *after* the first normalize pass, not before — that way we don't duplicate broker-specific parse logic just to enumerate tickers.

In `src/index.ts`:

1. Load `data/ticker-metadata.json` into the in-memory map.
2. Run the four broker normalizers as today. The four `?? "us_equity_total_market"` fallbacks in `normalize.ts` (lines 74, 118, 204, 254) are replaced with `?? "unknown"`. Holdings whose ticker isn't in the map come out as `asset_class: "unknown"`, with `expense_ratio: null`, etc.
3. After normalize, scan the consolidated portfolio for holdings with `asset_class === "unknown"`. Collect their canonical symbols.
4. If any: log `"Classifying N new tickers: VXUS, VTIAX, ..."`, call `await classifyTickers(unknowns)`. The function calls Claude, validates, writes the merged map back to `data/ticker-metadata.json`, and returns the updated map.
5. Re-walk the consolidated portfolio: for each holding still marked `"unknown"`, re-`lookupTicker` against the now-updated map and patch in the resolved `asset_class`, `expense_ratio`, `sector_tag`, `underlying_composition`, or `stock_metrics` as appropriate.
6. Final check: any holding still `asset_class === "unknown"` and `market_value > 0` → throw with the list of offenders and a remediation message.

This keeps the normalizers unchanged in shape (they still consult `lookupTicker`) and isolates the classification step to two well-defined points: the post-normalize scan and the post-classify patch.

## Error handling

Three explicit failure modes, all hard errors:

1. **Unknowns exist but Claude can't be reached.** `classifyTickers` throws:
   > Cannot classify [VXUS, VTIAX, TLT] — ANTHROPIC_API_KEY unset or Anthropic API unreachable. Either set the key and retry, or add entries manually to `data/ticker-metadata.json`.

2. **Claude returns `asset_class: "unknown"` and the holding has material value.** Pipeline throws after normalize:
   > Cannot analyze portfolio — VXUS classified as 'unknown' but holds $43,210. Edit `data/ticker-metadata.json` to set the correct asset_class, then re-run.

3. **Schema validation fails on Claude's response.** Same shape as #1 — throw with detail, ask user to retry or hand-classify.

Soft warning (not an error): an unknown-classified ticker with `market_value === 0`. Filtered out of aggregates with a one-line log.

End-of-run summary line if anything new landed in the file:
> Classified 3 new tickers this run: VXUS, VTIAX, TLT.

## Testing strategy

Co-located `*.test.ts` files per existing TDD discipline.

- **`src/intake/tickerClassifier.test.ts`** (new) — load/save round-trip; empty-file handling; Zod schema accepts each `AssetClass` variant including `"unknown"`; rejects malformed entries (e.g., `us_equity_sector` without `sector_tag`); `lookupTicker` returns `null` for absent symbols (does not throw); canonical-ticker resolution.
- **`src/intake/tickerClassifier.prompt.test.ts`** (new) — snapshot test for the Anthropic prompt string. Same convention as `narratives.prompt.test.ts`. No live API call.
- **`src/intake/normalize.test.ts`** (existing) — fixtures unchanged; replace the hardcoded `TICKER_METADATA` import with a test helper that injects a known map. Add one new test asserting that an unknown ticker throws (no silent fallback).
- **`tests/fixtures/`** — no changes; fixtures already use known tickers from the hardcoded map.
- **No live Anthropic call is unit-tested.** Same convention as `narratives.ts` and `tacticalAdvisor.ts`.

`data/ticker-metadata.json` is checked into git and used by both CI and local runs.

## File-level impact

| File | Change |
|---|---|
| `data/ticker-metadata.json` | **New.** Seeded from the existing `TICKER_METADATA` literal. |
| `src/intake/tickerMetadata.ts` | Shrinks to just `canonicalTicker()`. Hardcoded map deleted. |
| `src/intake/tickerClassifier.ts` | **New.** `loadTickerMetadata`, `classifyTickers`, `lookupTicker`, Zod schemas. |
| `src/intake/tickerClassifier.test.ts` | **New.** |
| `src/intake/tickerClassifier.prompt.test.ts` | **New.** |
| `src/intake/normalize.ts` | Imports `lookupTicker` from `tickerClassifier.ts`. Four `?? "us_equity_total_market"` fallbacks change to `?? "unknown"` (and the other metadata fields to `null`/`undefined`). |
| `src/intake/normalize.test.ts` | Updated to inject a test map; new test asserting that an unmapped ticker yields `asset_class: "unknown"` (no fallback to US total market). |
| `src/types.ts` | `AssetClass` union gains `"unknown"`. |
| `src/report/app/types.ts` | Mirror update — `AssetClass` union gains `"unknown"`. |
| `src/engine/aggregates.ts` | Filter out `asset_class === "unknown"` from weight buckets. |
| `src/engine/aggregates.test.ts` | Add coverage for the filter path. |
| `src/index.ts` | New pre-normalize step: enumerate symbols, call classifier for unknowns, validate post-normalize that no material holding is `"unknown"`. |
| `scripts/migrate-ticker-metadata.ts` | **New, one-shot.** Seeds the JSON from the existing literal. Optional to keep. |

## Open questions / future work

- **Refresh mechanism.** Not built. To re-classify a ticker, delete the entry and re-run. A `--reclassify <ticker>` CLI flag would be a natural addition if this becomes a chore.
- **Stale stock_metrics.** Claude's `pe_ratio`, `roe`, etc. for individual stocks may be months behind. Acceptable for grade-level scoring; not acceptable for precise valuation. Future work could integrate a market-data API for the `individual_stock` branch only.
- **Concurrency.** `classifyTickers` writes the file with a non-atomic `writeFileSync`. Acceptable for single-process CLI use. If publish ever runs concurrently with manual analyze, a temp-file-then-rename pattern (already used by `UserDataStore.cs:30-34` in the API) would be the fix.
