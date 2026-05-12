export type Rating = "green" | "yellow" | "red";
export type AssetClass =
  | "us_equity_total_market" | "us_equity_large_cap" | "us_equity_large_cap_growth"
  | "us_equity_small_mid" | "us_equity_sector" | "international_equity"
  | "us_bond_aggregate" | "us_bond_short" | "us_bond_tips"
  | "balanced" | "target_date" | "individual_stock" | "cash" | "cash_pending";

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
  stock_metrics?: Record<string, number | null>;
}

export interface Portfolio {
  snapshot_date: string;
  account_label: string;
  holdings: Holding[];
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
  cash_weight: number;
  idle_cash_weight: number;
  pending_cash_weight: number;
  pending_cash_value: number;
  pending_deployment_label?: string;
  pending_deployment_date?: string;
  international_weight: number;
  equity_weight: number;
  fixed_income_weight: number;
  individual_stock_weight: number;
  balanced_weight: number;
  sector_holdings: SectorHolding[];
}

export interface MacroContext {
  snapshot_date: string;
  market_regime: string;
  yield_curve_status: string;
  yield_curve_spread_10y_2y: number;
  vix: number;
  cpi_yoy_headline: number;
  lei_consecutive_declines: number;
  sector_overweight: string[];
  sector_underweight: string[];
  [k: string]: unknown;
}

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  rating: Rating;
  display_value: string;
  note: string;
  weight: number;
}

export interface ReferenceModel {
  id: string;
  label: string;
  description: string;
  grade: string;
  score: number;
  dimension_scores: Record<string, number>;
}

export interface Flag {
  ticker: string;
  severity: "red" | "yellow";
  title: string;
  body: string;
}

export interface GapItem {
  title: string;
  type: "red" | "amber" | "blue";
  body: string;
  progress: number;
}

export interface PlanAction {
  category: "trade" | "rebalance" | "data" | "platform" | "process";
  description: string;
  tags: string[];
}

export interface PlanPhase {
  phase: 1 | 2 | 3 | 4;
  title: string;
  timing: string;
  projected_grade: string;
  actions: PlanAction[];
  insight: string;
}

export interface ScorePoint { label: string; score: number; grade: string; }

export interface Finding {
  type: "strength" | "gap" | "note";
  title: string;
  body: string;
  progress?: number;
}

export interface AINarratives {
  headline_summary: string;
  benchmark_context: string;
  strengths: string[];
  gaps: string[];
  additional_takeaways: string[];
  phase1_macro_note: string;
}

export interface AnalysisOutput {
  generated_at: string;
  portfolio: Portfolio;
  macro: MacroContext;
  aggregates: PortfolioAggregates;
  portfolio_score: number;
  portfolio_grade: string;
  dimension_scores: DimensionScore[];
  reference_models: ReferenceModel[];
  flags: Flag[];
  gap_items: GapItem[];
  plan_phases: PlanPhase[];
  score_trajectory: ScorePoint[];
  findings: Finding[];
  narratives: AINarratives | null;
}
