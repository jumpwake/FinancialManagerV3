export type AssetClass =
  | "us_equity_total_market"
  | "us_equity_large_cap"
  | "us_equity_large_cap_growth"
  | "us_equity_small_mid"
  | "us_equity_sector"
  | "international_equity"
  | "us_bond_aggregate"
  | "us_bond_short"
  | "us_bond_tips"
  | "balanced"
  | "target_date"
  | "individual_stock"
  | "cash"
  | "cash_pending";

export interface StockMetrics {
  pe_ratio: number | null;
  ev_ebitda: number | null;
  fcf_yield: number | null;
  roe: number | null;
  eps_growth_yoy: number | null;
  revenue_growth_yoy: number | null;
  net_debt_ebitda: number | null;
  beta: number | null;
  analyst_consensus: number | null;
}

export interface Holding {
  ticker: string;
  label: string;
  market_value: number;
  asset_class: AssetClass;
  sector_tag?: string;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
  stock_metrics?: StockMetrics;
}

export interface Portfolio {
  snapshot_date: string;
  account_label: string;
  holdings: Holding[];
}

export interface MacroContext {
  snapshot_date: string;
  federal_funds_rate: number;
  cpi_yoy_headline: number;
  cpi_yoy_core: number;
  yield_curve_spread_10y_2y: number;
  yield_curve_status: string;
  vix: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
  ism_manufacturing: number;
  ism_services: number;
  market_regime: string;
  sector_overweight: string[];
  sector_underweight: string[];
}

export interface DuplicateGroup {
  label: string;
  tickers: string[];
  combined_weight: number;
}

export interface SectorHolding {
  sector_tag: string;
  tickers: string[];
  combined_weight: number;
}

export interface PortfolioAggregates {
  total_value: number;
  blended_expense_ratio: number;
  holding_count: number;
  duplicate_groups: DuplicateGroup[];
  top3_weight: number;
  top3_tickers: string[];
  international_weight: number;
  cash_weight: number;
  idle_cash_weight: number;
  pending_cash_weight: number;
  pending_cash_value: number;
  equity_weight: number;
  fixed_income_weight: number;
  individual_stock_weight: number;
  balanced_weight: number;
  sector_holdings: SectorHolding[];
  pending_deployment_label?: string;
  pending_deployment_date?: string;
}

export type Rating = "green" | "yellow" | "red";

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  rating: Rating;
  display_value: string;
  note: string;
  weight: number;
}
