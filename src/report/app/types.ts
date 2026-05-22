export type Rating = "green" | "yellow" | "red";
export type RiskTolerance =
  | "conservative"
  | "moderately_conservative"
  | "moderate"
  | "moderately_aggressive"
  | "aggressive";

export interface UserProfile {
  age: number;
  risk_tolerance: RiskTolerance;
}

export interface DroppedDimension {
  id: string;
  label: string;
  reason: string;
}
export type AssetClass =
  | "us_equity_total_market" | "us_equity_large_cap" | "us_equity_large_cap_growth"
  | "us_equity_small_mid" | "us_equity_sector" | "international_equity"
  | "us_bond_aggregate" | "us_bond_short" | "us_bond_tips"
  | "balanced" | "target_date" | "individual_stock" | "cash" | "cash_pending" | "unknown";

export interface UnderlyingComposition {
  us_equity: number;
  international_equity: number;
  fixed_income: number;
  cash: number;
}

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
  account_id: string;
  sector_tag?: string;
  is_cash: boolean;
  is_pending_deployment: boolean;
  deployment_date?: string;
  deployment_label?: string;
  expense_ratio: number | null;
  stock_metrics?: StockMetrics;
  underlying_composition?: UnderlyingComposition;
}

export type AccountType =
  | "roth_ira"
  | "pretax_ira"
  | "401k_traditional"
  | "401k_roth"
  | "taxable_brokerage"
  | "business_taxable"
  | "cash_balance_plan"
  | "hsa";

export type TaxTreatment = "tax_free_growth" | "tax_deferred" | "taxable_currently";

export interface AccountConstraints {
  conservative_only?: boolean;
  cash_reserve_minimum?: number;
  target_return?: number;
  excluded_from_deployment?: boolean;
}

export interface AccountMetadata {
  id: string;
  label: string;
  broker: "Fidelity" | "Empower" | "Vanguard" | "Schwab" | "Robinhood" | "Other";
  account_type: AccountType;
  owner: string;
  source_files: string[];
  account_numbers?: string[];
  constraints?: AccountConstraints;
}

export interface AccountConfig {
  accounts: AccountMetadata[];
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

export interface CrossAccountGroup {
  asset_class: AssetClass;
  label: string;
  tickers_by_account: { account_id: string; ticker: string }[];
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
  cross_account_groups: CrossAccountGroup[];
  top3_weight: number;
  top3_tickers: string[];
  cash_weight: number;
  idle_cash_weight: number;
  constrained_cash_weight: number;
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
  federal_funds_rate: number;
  cpi_yoy_headline: number;
  cpi_yoy_core: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
  ism_manufacturing: number;
  ism_services: number;
  sector_overweight: string[];
  sector_underweight: string[];
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
  finding_key: string;
  suppressed_by?: FlagSuppressionRef;
}

export interface GapItem {
  title: string;
  type: "red" | "amber" | "blue";
  body: string;
  progress: number;
  finding_key: string;
  suppressed_by?: FlagSuppressionRef;
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

// Mirror of V2 types from src/types.ts — keep in sync.

export type PortfolioEffect =
  | { type: "mark_cash_pending"; amount_usd?: number; deployment_label?: string }
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
  type: "global" | "flag" | "gap" | "situation" | "dimension" | "tactical_move";
  finding_key?: string;
  situation_id?: string;
  dimension_id?: string;
  move_id?: string;
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

// Wave 3 — Tactical Advisor types (mirror of src/types.ts)

export interface DeploymentMove {
  id: string;
  ticker: string;
  dollars: number;
  target_account: string;
  rationale: string;
}

export type TacticalMoveCategory =
  | "deploy_cash"
  | "rebalance"
  | "trim"
  | "asset_location_swap"
  | "scenario_hedge"
  | "tax_loss_harvest";

export interface TacticalMove {
  id: string;
  category: TacticalMoveCategory;
  action: string;
  target_account: string;
  dollars: number;
  rationale: string;
  scenarios_addressed: string[];
  expected_score_delta?: number;
}

export interface TacticalAdvisorOutput {
  deployment_recommendation: {
    summary: string;
    moves: DeploymentMove[];
    projected_grade: string;
    projected_dimension_deltas: Record<string, number>;
  } | null;
  tactical_plan: {
    summary: string;
    target_grade: string;
    next_7_days: TacticalMove[];
    next_30_days: TacticalMove[];
    scenario_resilience_notes: string[];
  };
}

export interface AnalysisOutput {
  generated_at: string;
  portfolio: Portfolio;
  macro: MacroContext;
  aggregates: PortfolioAggregates;
  portfolio_score: number;
  portfolio_grade: string;
  dimension_scores: DimensionScore[];
  profile?: UserProfile | null;
  dropped_dimensions?: DroppedDimension[];
  reference_models: ReferenceModel[];
  flags: Flag[];
  gap_items: GapItem[];
  plan_phases: PlanPhase[];
  score_trajectory: ScorePoint[];
  findings: Finding[];
  narratives: AINarratives | null;
  tactical_advisor: TacticalAdvisorOutput | null;
  accounts?: AccountConfig | null;
  situations?: Situation[];
  notes?: Note[];
}
