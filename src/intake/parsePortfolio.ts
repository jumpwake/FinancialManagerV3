import { z } from "zod";

const AssetClassSchema = z.enum([
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
  "us_equity_sector",
  "international_equity",
  "us_bond_aggregate",
  "us_bond_short",
  "us_bond_tips",
  "balanced",
  "target_date",
  "individual_stock",
  "cash",
  "cash_pending",
]);

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

const compositionSchema = z.object({
  us_equity: z.number().min(0).max(1),
  international_equity: z.number().min(0).max(1),
  fixed_income: z.number().min(0).max(1),
  cash: z.number().min(0).max(1),
}).refine(
  (c) => Math.abs(c.us_equity + c.international_equity + c.fixed_income + c.cash - 1) < 0.001,
  { message: "underlying_composition must sum to 1.0" },
);

const HoldingSchema = z.object({
  ticker: z.string().min(1),
  label: z.string().min(1),
  market_value: z.number().nonnegative(),
  asset_class: AssetClassSchema,
  account_id: z.string().min(1),
  sector_tag: z.string().optional(),
  is_cash: z.boolean(),
  is_pending_deployment: z.boolean(),
  deployment_date: z.string().optional(),
  deployment_label: z.string().optional(),
  expense_ratio: z.number().nullable(),
  stock_metrics: StockMetricsSchema.optional(),
  underlying_composition: compositionSchema.optional(),
});

export const PortfolioSchema = z.object({
  snapshot_date: z.string().min(1),
  account_label: z.string().min(1),
  holdings: z.array(HoldingSchema).min(1),
});

import type { Portfolio } from "../types";

export function parsePortfolio(input: unknown): Portfolio {
  return PortfolioSchema.parse(input) as Portfolio;
}
