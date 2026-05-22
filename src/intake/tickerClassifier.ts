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
