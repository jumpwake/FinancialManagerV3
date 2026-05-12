import type { UnderlyingComposition } from "../types";
import { AssetClass, StockMetrics } from "../types";

export interface TickerMetadata {
  asset_class: AssetClass;
  expense_ratio: number | null;
  sector_tag?: string;
  stock_metrics?: StockMetrics;
  underlying_composition?: UnderlyingComposition;
}

export const TICKER_METADATA: Record<string, TickerMetadata> = {
  // Fidelity index funds
  "FSKAX":  { asset_class: "us_equity_total_market", expense_ratio: 0.00015 },
  "FTIHX":  { asset_class: "international_equity",   expense_ratio: 0.00006 },
  "FXNAX":  { asset_class: "us_bond_aggregate",      expense_ratio: 0.00025 },
  // Vanguard funds
  "VTSAX":  { asset_class: "us_equity_total_market", expense_ratio: 0.0004 },
  "VFSUX":  { asset_class: "us_bond_short",          expense_ratio: 0.001 },
  "VBTLX":  { asset_class: "us_bond_aggregate",      expense_ratio: 0.0005 },
  "VWENX":  {
    asset_class: "balanced",
    expense_ratio: 0.0017,
    underlying_composition: {
      us_equity: 0.60,
      international_equity: 0.05,
      fixed_income: 0.35,
      cash: 0.0,
    },
  },
  "VUG":    { asset_class: "us_equity_large_cap_growth", expense_ratio: 0.0004 },
  // ETFs
  "QQQ":    { asset_class: "us_equity_large_cap_growth", expense_ratio: 0.002 },
  "XLU":    { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "utilities" },
  "XLV":    { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "healthcare" },
  "XLP":    { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "consumer_staples" },
  "XLI":    { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "industrials" },
  // Individual stocks
  "TSLA":   {
    asset_class: "individual_stock",
    expense_ratio: null,
    stock_metrics: {
      pe_ratio: 410.29, ev_ebitda: 137.07, fcf_yield: 0.0037, roe: 0.0462,
      eps_growth_yoy: -0.4702, revenue_growth_yoy: -0.0293, net_debt_ebitda: -3.03,
      beta: 1.793, analyst_consensus: 3.19,
    },
  },
  "NVDA":   {
    asset_class: "individual_stock",
    expense_ratio: null,
    stock_metrics: {
      pe_ratio: 44.74, ev_ebitda: 36.44, fcf_yield: 0.0181, roe: 0.7633,
      eps_growth_yoy: 0.6667, revenue_growth_yoy: 0.6547, net_debt_ebitda: -0.35,
      beta: 2.244, analyst_consensus: 3.75,
    },
  },
  "BRK-B":  {
    asset_class: "individual_stock",
    expense_ratio: null,
    stock_metrics: {
      pe_ratio: 26.12, ev_ebitda: null, fcf_yield: null, roe: null,
      eps_growth_yoy: null, revenue_growth_yoy: null, net_debt_ebitda: null,
      beta: 0.622, analyst_consensus: 3.41,
    },
  },
  // Money market
  "SPAXX":  { asset_class: "cash", expense_ratio: null },
  "VMFXX":  { asset_class: "cash", expense_ratio: null },
  // Empower descriptive symbols (no real ticker — use the description as the key)
  "US Large Company Stocks Fund":       { asset_class: "us_equity_large_cap",        expense_ratio: 0.001 },
  "US Small/Mid Company Stocks Fund":   { asset_class: "us_equity_small_mid",        expense_ratio: 0.001 },
  "Target Retirement 2040 Fund":        { asset_class: "target_date",                expense_ratio: 0.0008 },
};

/** Normalize variant tickers (e.g. "BRK B" → "BRK-B"). */
export function canonicalTicker(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed === "BRK B") return "BRK-B";
  return trimmed;
}

/** Look up metadata; returns null if ticker is unknown. */
export function lookupTicker(symbol: string): TickerMetadata | null {
  return TICKER_METADATA[canonicalTicker(symbol)] ?? null;
}
