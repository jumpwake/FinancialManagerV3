import * as fs from "node:fs";
import * as path from "node:path";
import * as z from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

// Asset classes that only need the minimal shape (asset_class +
// expense_ratio + classified_at + optional notes). Sector ETFs, balanced
// funds, individual stocks, and unknown each have their own branch below
// because they require additional discriminator-specific fields.
const MINIMAL_SHAPE_ASSET_CLASSES = [
  "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
  "us_equity_small_mid", "international_equity", "us_bond_aggregate",
  "us_bond_short", "us_bond_tips", "target_date", "cash", "cash_pending",
] as const;

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
  ...MINIMAL_SHAPE_ASSET_CLASSES.map(ac =>
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

/**
 * Looks up a canonicalized ticker in the metadata file. Reads from whatever
 * path `loadTickerMetadata(filePath)` was last called with in this process;
 * falls back to `DEFAULT_FILE` if the cache is cold. Production callers
 * always call `loadTickerMetadata()` once at startup, so the fallback only
 * fires for tests that forget to prime. Returns null if the ticker isn't
 * in the file.
 */
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

// ---------------------------------------------------------------------------
// AI classifier
// ---------------------------------------------------------------------------

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
  ...MINIMAL_SHAPE_ASSET_CLASSES.map(ac =>
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

  // Cast needed because zodOutputFormat receives `as never` to bridge stale SDK v3 types.
  const parsed = response.parsed_output as z.infer<typeof ClassifyResponseSchema>;

  // Merge new entries into the existing file and persist.
  const existing = loadTickerMetadata(filePath);
  const merged: TickerMetadataFile = {
    version: 1,
    tickers: { ...existing.tickers },
  };
  for (const entry of parsed.entries) {
    const { symbol, ...rest } = entry;
    merged.tickers[symbol] = rest as TickerEntry;
  }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  resetTickerMetadataCache();
  loadTickerMetadata(filePath); // re-prime cache
  return merged;
}
