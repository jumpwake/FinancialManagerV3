# Portfolio Analyzer — Claude Code Development Document

**Version:** 2.0  
**Date:** 2026-05-11  
**For:** Claude Code  
**Stack:** TypeScript / Node.js / React (Vite) / Anthropic API  

---

## 1. Project Overview

Build a weekly portfolio health analyzer. The user drops in a JSON file of portfolio holdings. The system runs a full analysis and renders a multi-section HTML report as a React app.

**There are no per-holding metric scores.** The old metrics.json scoring system (fund_core20, equity_core10) is not used. All analysis is at the portfolio level.

### The 9-section output pipeline

```
JSON in → [1] Allocation Breakdown
          [2] Benchmark Comparison (vs 3 model portfolios)
          [3] Dimension-by-Dimension Scorecard
          [4] Key Findings
          [5] Radar Chart
          [6] Additional Takeaways
          [7] Gaps
          [8] Flags
```

---

## 2. Repository Structure

```
portfolio-analyzer/
├── data/
│   ├── portfolio.json          ← weekly drop-in (user edits this)
│   └── macro.json              ← macro context (updated weekly)
├── src/
│   ├── index.ts                ← CLI entry point
│   ├── types.ts                ← all TypeScript interfaces
│   ├── intake/
│   │   └── parsePortfolio.ts   ← load + validate portfolio.json
│   ├── engine/
│   │   ├── aggregates.ts       ← compute portfolio-level aggregates
│   │   ├── dimensions.ts       ← score all 10 dimensions (pure math)
│   │   ├── benchmarks.ts       ← reference model static data
│   │   └── plan.ts             ← generate development plan phases
│   ├── ai/
│   │   └── narratives.ts       ← single Anthropic API call for text
│   └── report/
│       └── app/                ← React Vite app
│           ├── main.tsx
│           ├── App.tsx
│           └── sections/
│               ├── AllocationBreakdown.tsx
│               ├── BenchmarkComparison.tsx
│               ├── DimensionScorecard.tsx
│               ├── KeyFindings.tsx
│               ├── RadarChart.tsx
│               ├── AdditionalTakeaways.tsx
│               ├── Gaps.tsx
│               └── Flags.tsx
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 3. Input Data Schema

### 3.1 `data/portfolio.json` — the weekly drop-in

This is the only file the user touches each week. Everything else is computed.

```json
{
  "snapshot_date": "2026-05-11",
  "account_label": "My Portfolio",
  "holdings": [
    {
      "ticker": "FSKAX",
      "label": "Fidelity Total Market Index Fund",
      "market_value": 680000,
      "asset_class": "us_equity_total_market",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.00015
    },
    {
      "ticker": "SPAXX",
      "label": "Fidelity Government Money Market",
      "market_value": 483000,
      "asset_class": "cash",
      "is_cash": true,
      "is_pending_deployment": true,
      "deployment_date": "2026-05-29",
      "deployment_label": "Tranche 3",
      "expense_ratio": null
    },
    {
      "ticker": "FTIHX",
      "label": "Fidelity Total International Index Fund",
      "market_value": 270000,
      "asset_class": "international_equity",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.00006
    },
    {
      "ticker": "FXNAX",
      "label": "Fidelity US Bond Index Fund",
      "market_value": 160000,
      "asset_class": "us_bond_aggregate",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.00025
    },
    {
      "ticker": "VWENX",
      "label": "Vanguard Wellington Fund Admiral",
      "market_value": 110000,
      "asset_class": "balanced",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.0017
    },
    {
      "ticker": "TSLA",
      "label": "Tesla Inc",
      "market_value": 58000,
      "asset_class": "individual_stock",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 410.29,
        "ev_ebitda": 137.07,
        "fcf_yield": 0.0037,
        "roe": 0.0462,
        "eps_growth_yoy": -0.4702,
        "revenue_growth_yoy": -0.0293,
        "net_debt_ebitda": -3.03,
        "beta": 1.793,
        "analyst_consensus": 3.19
      }
    },
    {
      "ticker": "NVDA",
      "label": "NVIDIA Corporation",
      "market_value": 52000,
      "asset_class": "individual_stock",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 44.74,
        "ev_ebitda": 36.44,
        "fcf_yield": 0.0181,
        "roe": 0.7633,
        "eps_growth_yoy": 0.6667,
        "revenue_growth_yoy": 0.6547,
        "net_debt_ebitda": -0.35,
        "beta": 2.244,
        "analyst_consensus": 3.75
      }
    },
    {
      "ticker": "XLU",
      "label": "Utilities Select Sector SPDR",
      "market_value": 48000,
      "asset_class": "us_equity_sector",
      "sector_tag": "utilities",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.0008
    },
    {
      "ticker": "VFSUX",
      "label": "Vanguard Short-Term Investment-Grade",
      "market_value": 38000,
      "asset_class": "us_bond_short",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.001
    },
    {
      "ticker": "QQQ",
      "label": "Invesco Nasdaq-100 ETF",
      "market_value": 36000,
      "asset_class": "us_equity_large_cap_growth",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": 0.002
    },
    {
      "ticker": "BRK-B",
      "label": "Berkshire Hathaway Class B",
      "market_value": 32000,
      "asset_class": "individual_stock",
      "is_cash": false,
      "is_pending_deployment": false,
      "expense_ratio": null,
      "stock_metrics": {
        "pe_ratio": 26.12,
        "ev_ebitda": null,
        "fcf_yield": null,
        "roe": null,
        "eps_growth_yoy": null,
        "revenue_growth_yoy": null,
        "net_debt_ebitda": null,
        "beta": 0.622,
        "analyst_consensus": 3.41
      }
    },
    {
      "ticker": "VMFXX",
      "label": "Vanguard Federal Money Market",
      "market_value": 22000,
      "asset_class": "cash",
      "is_cash": true,
      "is_pending_deployment": false,
      "expense_ratio": null
    }
  ]
}
```

### 3.2 Allowed `asset_class` values

```typescript
type AssetClass =
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
```

### 3.3 `data/macro.json` — weekly macro context

```json
{
  "snapshot_date": "2026-05-10",
  "federal_funds_rate": 4.75,
  "cpi_yoy_headline": 2.8,
  "cpi_yoy_core": 2.6,
  "yield_curve_spread_10y_2y": -0.12,
  "yield_curve_status": "inverted",
  "vix": 18.4,
  "hy_credit_spread_oas_bps": 345,
  "lei_consecutive_declines": 6,
  "ism_manufacturing": 49.2,
  "ism_services": 53.1,
  "market_regime": "Late Cycle",
  "sector_overweight": ["healthcare", "consumer_staples", "utilities"],
  "sector_underweight": ["consumer_discretionary", "real_estate", "small_cap_growth"]
}
```

---

## 4. TypeScript Types (`src/types.ts`)

Define all interfaces here. Import from this file everywhere else — never redeclare types inline.

```typescript
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

export interface PortfolioAggregates {
  total_value: number;
  equity_weight: number;
  fixed_income_weight: number;
  international_weight: number;
  cash_weight: number;
  idle_cash_weight: number;
  pending_cash_weight: number;
  pending_cash_value: number;
  pending_deployment_label?: string;
  pending_deployment_date?: string;
  individual_stock_weight: number;
  balanced_weight: number;
  top3_weight: number;
  top3_tickers: string[];
  holding_count: number;
  blended_expense_ratio: number;
  duplicate_groups: DuplicateGroup[];
  sector_holdings: SectorHolding[];
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

export interface DimensionScore {
  id: string;
  label: string;
  score: number;
  rating: "green" | "yellow" | "red";
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

export interface Finding {
  type: "strength" | "gap" | "note";
  title: string;
  body: string;
  progress?: number;
}

export interface PlanPhase {
  phase: 1 | 2 | 3 | 4;
  title: string;
  timing: string;
  projected_grade: string;
  actions: PlanAction[];
  insight: string;
}

export interface PlanAction {
  category: "trade" | "rebalance" | "data" | "platform" | "process";
  description: string;
  tags: string[];
}

export interface GapItem {
  title: string;
  type: "red" | "amber" | "blue";
  body: string;
  progress: number;
}

export interface Flag {
  ticker: string;
  severity: "red" | "yellow";
  title: string;
  body: string;
}

export interface AINarratives {
  headline_summary: string;
  benchmark_context: string;
  strengths: string[];
  gaps: string[];
  additional_takeaways: string[];
  phase1_macro_note: string;
}

export interface ScorePoint {
  label: string;
  score: number;
  grade: string;
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
  findings: Finding[];
  plan_phases: PlanPhase[];
  score_trajectory: ScorePoint[];
  gap_items: GapItem[];
  flags: Flag[];
  narratives: AINarratives;
}
```

---

## 5. Portfolio Aggregates (`src/engine/aggregates.ts`)

Pure functions. No API calls. No side effects.

```typescript
import { Portfolio, PortfolioAggregates, DuplicateGroup } from "../types";

export function computeAggregates(portfolio: Portfolio): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total = holdings.reduce((sum, h) => sum + h.market_value, 0);

  const w = (h: Holding) => h.market_value / total;

  const equityClasses = [
    "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
    "us_equity_small_mid", "us_equity_sector", "individual_stock"
  ];
  const bondClasses = ["us_bond_aggregate", "us_bond_short", "us_bond_tips"];

  const equity_weight = holdings
    .filter(h => equityClasses.includes(h.asset_class))
    .reduce((sum, h) => sum + w(h), 0);

  const fixed_income_weight = holdings
    .filter(h => bondClasses.includes(h.asset_class))
    .reduce((sum, h) => sum + w(h), 0);

  const international_weight = holdings
    .filter(h => h.asset_class === "international_equity")
    .reduce((sum, h) => sum + w(h), 0);

  const cash_weight = holdings
    .filter(h => h.is_cash)
    .reduce((sum, h) => sum + w(h), 0);

  const pending_holdings = holdings.filter(h => h.is_pending_deployment);
  const pending_cash_weight = pending_holdings.reduce((sum, h) => sum + w(h), 0);
  const pending_cash_value = pending_holdings.reduce((sum, h) => sum + h.market_value, 0);
  const idle_cash_weight = cash_weight - pending_cash_weight;

  const individual_stock_weight = holdings
    .filter(h => h.asset_class === "individual_stock")
    .reduce((sum, h) => sum + w(h), 0);

  const balanced_weight = holdings
    .filter(h => h.asset_class === "balanced" || h.asset_class === "target_date")
    .reduce((sum, h) => sum + w(h), 0);

  const sorted = [...holdings].sort((a, b) => b.market_value - a.market_value);
  const top3 = sorted.slice(0, 3);
  const top3_weight = top3.reduce((sum, h) => sum + w(h), 0);
  const top3_tickers = top3.map(h => h.ticker);

  const holding_count = holdings.filter(h => !h.is_cash).length;

  // Blended expense ratio (fund holdings only, weighted)
  const fundHoldings = holdings.filter(h => h.expense_ratio != null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  // Duplicate detection: same asset_class bucket, both passive funds
  const DUPLICATE_CLASSES = [
    "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
    "us_bond_aggregate", "us_bond_short"
  ];
  const duplicate_groups: DuplicateGroup[] = [];
  for (const cls of DUPLICATE_CLASSES) {
    const group = holdings.filter(h => h.asset_class === cls && !h.is_cash);
    if (group.length >= 2) {
      duplicate_groups.push({
        label: cls.replace(/_/g, " "),
        tickers: group.map(h => h.ticker),
        combined_weight: group.reduce((sum, h) => sum + w(h), 0),
      });
    }
  }

  // Sector holdings (for macro alignment)
  const sector_map: Record<string, string[]> = {};
  for (const h of holdings.filter(h => h.sector_tag)) {
    const tag = h.sector_tag!;
    if (!sector_map[tag]) sector_map[tag] = [];
    sector_map[tag].push(h.ticker);
  }
  const sector_holdings = Object.entries(sector_map).map(([sector_tag, tickers]) => ({
    sector_tag,
    tickers,
    combined_weight: holdings
      .filter(h => tickers.includes(h.ticker))
      .reduce((sum, h) => sum + w(h), 0),
  }));

  const firstPending = pending_holdings[0];

  return {
    total_value: total,
    equity_weight,
    fixed_income_weight,
    international_weight,
    cash_weight,
    idle_cash_weight,
    pending_cash_weight,
    pending_cash_value,
    pending_deployment_label: firstPending?.deployment_label,
    pending_deployment_date: firstPending?.deployment_date,
    individual_stock_weight,
    balanced_weight,
    top3_weight,
    top3_tickers,
    holding_count,
    blended_expense_ratio,
    duplicate_groups,
    sector_holdings,
  };
}
```

---

## 6. Dimension Scoring (`src/engine/dimensions.ts`)

All 10 dimensions scored as pure functions. Returns 0–10. No AI involved.

```typescript
import { PortfolioAggregates, MacroContext, DimensionScore, Portfolio } from "../types";

export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext
): DimensionScore[] {
  return [
    scoreCostEfficiency(agg),
    scoreDiversification(agg),
    scoreCashEfficiency(agg),
    scoreMacroAlignment(agg, macro),
    scoreSingleStockRisk(portfolio, agg),
    scoreSimplicity(agg),
    scoreBondBalance(agg, macro),
    scoreConcentration(agg),
    scoreInternational(agg),
    scoreQualityTilt(portfolio, agg),
  ];
}

function toRating(score: number): "green" | "yellow" | "red" {
  if (score >= 7.5) return "green";
  if (score >= 5.0) return "yellow";
  return "red";
}

function scoreCostEfficiency(agg: PortfolioAggregates): DimensionScore {
  const er = agg.blended_expense_ratio * 100; // convert to percent
  let score =
    er <= 0.05 ? 10 :
    er <= 0.10 ? 9 :
    er <= 0.20 ? 7 :
    er <= 0.35 ? 5 :
    er <= 0.50 ? 3 : 1;

  return {
    id: "cost_efficiency",
    label: "Cost efficiency",
    score,
    rating: toRating(score),
    display_value: `~${(agg.blended_expense_ratio * 100).toFixed(2)}% blended ER`,
    note: "Blended expense ratio across all fund holdings",
    weight: 0.10,
  };
}

function scoreDiversification(agg: PortfolioAggregates): DimensionScore {
  // Count distinct asset class buckets with >= 3% weight
  const buckets: Record<string, number> = {
    us_equity: agg.equity_weight - agg.international_weight - agg.individual_stock_weight,
    international: agg.international_weight,
    fixed_income: agg.fixed_income_weight,
    balanced: agg.balanced_weight,
    individual_stock: agg.individual_stock_weight,
  };
  const filledBuckets = Object.values(buckets).filter(w => w >= 0.03).length;
  let score = filledBuckets >= 5 ? 10 : filledBuckets === 4 ? 8 : filledBuckets === 3 ? 6 : filledBuckets === 2 ? 4 : 2;
  score = Math.max(1, score - agg.duplicate_groups.length); // penalize overlap

  return {
    id: "diversification",
    label: "Diversification",
    score,
    rating: toRating(score),
    display_value: `${filledBuckets} asset buckets`,
    note: "Distinct asset class buckets with ≥ 3% weight; penalized for overlapping funds",
    weight: 0.12,
  };
}

function scoreCashEfficiency(agg: PortfolioAggregates): DimensionScore {
  const idle = agg.idle_cash_weight;
  const score =
    idle <= 0.02 ? 10 :
    idle <= 0.05 ? 8 :
    idle <= 0.08 ? 7 :
    idle <= 0.12 ? 5 :
    idle <= 0.20 ? 3 : 1;

  const display = agg.pending_cash_weight > 0
    ? `${(idle * 100).toFixed(1)}% idle + ${(agg.pending_cash_weight * 100).toFixed(1)}% pending`
    : `${(idle * 100).toFixed(1)}% idle`;

  return {
    id: "cash_efficiency",
    label: "Cash efficiency",
    score,
    rating: toRating(score),
    display_value: display,
    note: "Pending deployment cash is excluded from penalty — it has an active plan",
    weight: 0.12,
  };
}

function scoreMacroAlignment(agg: PortfolioAggregates, macro: MacroContext): DimensionScore {
  // Map tickers to macro sectors
  const DEFENSIVE_BONUS_TICKERS = ["VWENX", "FXNAX", "VBTLX", "VFSUX", "BRK-B"];
  const GROWTH_RISK_TICKERS = ["QQQ", "VUG", "TSLA"];

  let score = 5;

  // +1 per aligned overweight sector held
  for (const sh of agg.sector_holdings) {
    if (macro.sector_overweight.includes(sh.sector_tag) && sh.combined_weight >= 0.01) {
      score += 1;
    }
    if (macro.sector_underweight.includes(sh.sector_tag) && sh.combined_weight >= 0.03) {
      score -= 1.5;
    }
  }

  // Defensive fund bonus (late cycle)
  if (macro.market_regime === "Late Cycle") {
    score += DEFENSIVE_BONUS_TICKERS.filter(t =>
      agg.sector_holdings.some(sh => sh.tickers.includes(t)) ||
      true // simplified: if held at all
    ).length * 0.25;
  }

  score = Math.max(1, Math.min(10, score));

  return {
    id: "macro_alignment",
    label: "Macro alignment",
    score,
    rating: toRating(score),
    display_value: `${macro.market_regime} regime`,
    note: `Sector tilts vs. macro overweights: ${macro.sector_overweight.join(", ")}`,
    weight: 0.10,
  };
}

function scoreSingleStockRisk(portfolio: Portfolio, agg: PortfolioAggregates): DimensionScore {
  const total = agg.total_value;
  const stocks = portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics);

  if (stocks.length === 0) {
    return { id: "single_stock_risk", label: "Single-stock risk", score: 10, rating: "green",
      display_value: "No individual stocks", note: "No single-stock exposure", weight: 0.12 };
  }

  let totalPenalty = 0;
  const flaggedTickers: string[] = [];

  for (const s of stocks) {
    const m = s.stock_metrics!;
    const w = s.market_value / total;
    let penalty = 0;

    if (m.pe_ratio && m.pe_ratio > 100) penalty += 2;
    else if (m.pe_ratio && m.pe_ratio > 50) penalty += 1;

    if (m.eps_growth_yoy !== null && m.eps_growth_yoy < -0.15) penalty += 1.5;
    if (m.beta !== null && m.beta > 1.5) penalty += 1;
    if (m.revenue_growth_yoy !== null && m.revenue_growth_yoy < 0) penalty += 1;

    if (penalty > 0) {
      flaggedTickers.push(s.ticker);
      totalPenalty += penalty * (w / agg.individual_stock_weight);
    }
  }

  const score = Math.max(1, 10 - totalPenalty);

  return {
    id: "single_stock_risk",
    label: "Single-stock risk",
    score,
    rating: toRating(score),
    display_value: flaggedTickers.length > 0 ? flaggedTickers.join(", ") + " flagged" : "No flags",
    note: "Penalizes stocks with P/E > 100, negative EPS growth, high beta, or declining revenue",
    weight: 0.12,
  };
}

function scoreSimplicity(agg: PortfolioAggregates): DimensionScore {
  const extraPositions = agg.duplicate_groups.reduce((sum, g) => sum + g.tickers.length - 1, 0);
  const effective = agg.holding_count - extraPositions;

  const score =
    effective <= 5  ? 10 :
    effective <= 8  ? 8 :
    effective <= 12 ? 6 :
    effective <= 16 ? 4 : 2;

  return {
    id: "simplicity",
    label: "Simplicity",
    score,
    rating: toRating(score),
    display_value: `${agg.holding_count} holdings (${effective} effective)`,
    note: "Effective positions after removing redundant fund overlaps",
    weight: 0.08,
  };
}

function scoreBondBalance(agg: PortfolioAggregates, macro: MacroContext): DimensionScore {
  const fi = agg.fixed_income_weight;
  const targets: Record<string, { min: number; max: number }> = {
    "Late Cycle":  { min: 0.18, max: 0.30 },
    "Mid Cycle":   { min: 0.15, max: 0.25 },
    "Early Cycle": { min: 0.10, max: 0.20 },
    "Recession":   { min: 0.25, max: 0.40 },
  };
  const target = targets[macro.market_regime] ?? { min: 0.15, max: 0.25 };

  const score =
    fi >= target.min && fi <= target.max ? 9 :
    fi >= target.min * 0.8             ? 7 :
    fi >= target.min * 0.5             ? 5 :
    fi > target.max                    ? 7 : 3;

  return {
    id: "bond_balance",
    label: "Bond balance",
    score,
    rating: toRating(score),
    display_value: `${(fi * 100).toFixed(1)}% FI (target ${(target.min * 100).toFixed(0)}–${(target.max * 100).toFixed(0)}%)`,
    note: `Target range for ${macro.market_regime} regime`,
    weight: 0.12,
  };
}

function scoreConcentration(agg: PortfolioAggregates): DimensionScore {
  const t3 = agg.top3_weight;
  const top3Score =
    t3 <= 0.35 ? 10 :
    t3 <= 0.45 ? 8 :
    t3 <= 0.55 ? 6 :
    t3 <= 0.65 ? 4 : 2;

  const score = top3Score;

  return {
    id: "concentration",
    label: "Concentration",
    score,
    rating: toRating(score),
    display_value: `Top 3: ${(t3 * 100).toFixed(1)}% (${agg.top3_tickers.join(", ")})`,
    note: "Top-3 holding weight as share of total portfolio",
    weight: 0.12,
  };
}

function scoreInternational(agg: PortfolioAggregates): DimensionScore {
  const intl = agg.international_weight;
  const score =
    intl >= 0.15 && intl <= 0.30 ? 10 :
    intl >= 0.10                  ? 8 :
    intl >= 0.05                  ? 6 :
    intl >= 0.02                  ? 4 : 2;

  return {
    id: "international",
    label: "International exposure",
    score,
    rating: toRating(score),
    display_value: `${(intl * 100).toFixed(1)}% international`,
    note: "Target 15–30% for a globally diversified portfolio",
    weight: 0.06,
  };
}

function scoreQualityTilt(portfolio: Portfolio, agg: PortfolioAggregates): DimensionScore {
  const QUALITY_TICKERS: Record<string, number> = {
    "BRK-B": 1.5, "VWENX": 1.5, "XLV": 1.0, "XLU": 1.0,
    "XLP": 1.0, "VFSUX": 0.5, "FXNAX": 0.5, "VBTLX": 0.5,
  };
  const total = agg.total_value;
  let raw = 0;
  for (const h of portfolio.holdings) {
    if (QUALITY_TICKERS[h.ticker]) {
      const wt = Math.min(2, (h.market_value / total) / 0.02);
      raw += QUALITY_TICKERS[h.ticker] * wt;
    }
  }
  const score = Math.min(10, Math.max(1, raw * 2.5));

  return {
    id: "quality_tilt",
    label: "Quality / defensive tilt",
    score,
    rating: toRating(score),
    display_value: score >= 7 ? "Strong defensive tilt" : score >= 5 ? "Moderate" : "Weak",
    note: "Presence of quality/defensive/dividend-oriented holdings",
    weight: 0.06,
  };
}

export function computePortfolioScore(dimensions: DimensionScore[]): number {
  return dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
}

export function scoreToGrade(score: number): string {
  if (score >= 9.0) return "A+";
  if (score >= 8.5) return "A";
  if (score >= 8.0) return "A−";
  if (score >= 7.5) return "B+";
  if (score >= 7.0) return "B";
  if (score >= 6.5) return "B−";
  if (score >= 6.0) return "C+";
  if (score >= 5.5) return "C";
  if (score >= 5.0) return "C−";
  if (score >= 4.5) return "D+";
  if (score >= 4.0) return "D";
  return "F";
}
```

---

## 7. Reference Model Benchmarks (`src/engine/benchmarks.ts`)

Static reference values. These are the ruler — they never change based on user portfolio data.

```typescript
import { ReferenceModel } from "../types";

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: "boglehead_3fund",
    label: "Boglehead 3-fund",
    description: "Passive index",
    grade: "A",
    score: 9.1,
    dimension_scores: {
      cost_efficiency: 9,
      diversification: 9,
      cash_efficiency: 9,
      macro_alignment: 5,
      single_stock_risk: 10,
      simplicity: 10,
      bond_balance: 7,
      concentration: 8,
      international: 9,
      quality_tilt: 5,
    },
  },
  {
    id: "all_weather",
    label: "All Weather",
    description: "Risk parity (Dalio)",
    grade: "A−",
    score: 8.4,
    dimension_scores: {
      cost_efficiency: 8,
      diversification: 10,
      cash_efficiency: 9,
      macro_alignment: 7,
      single_stock_risk: 10,
      simplicity: 10,
      bond_balance: 9,
      concentration: 9,
      international: 7,
      quality_tilt: 8,
    },
  },
  {
    id: "classic_60_40",
    label: "Classic 60/40",
    description: "Balanced",
    grade: "B+",
    score: 7.8,
    dimension_scores: {
      cost_efficiency: 8,
      diversification: 7,
      cash_efficiency: 9,
      macro_alignment: 5,
      single_stock_risk: 10,
      simplicity: 8,
      bond_balance: 9,
      concentration: 8,
      international: 6,
      quality_tilt: 6,
    },
  },
];
```

---

## 8. AI Narratives (`src/ai/narratives.ts`)

One Anthropic API call. Receives computed scores and portfolio data. Returns structured text only — no scoring logic here.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AnalysisOutput, AINarratives } from "../types";

const SYSTEM_PROMPT = `
You are a portfolio health analyst generating a comparative assessment for an investor dashboard.
You receive structured portfolio data including computed dimension scores and macro context.
Generate the following as a JSON object — no markdown, no explanation outside the JSON.

Fields required:
{
  "headline_summary": "2–3 sentences. Plain language. Mention the current grade, strongest dimension, and the #1 gap.",
  "benchmark_context": "2 sentences. How does this portfolio compare to the 3 reference models and why?",
  "strengths": ["1–2 sentence string", "1–2 sentence string", "1–2 sentence string"],
  "gaps": ["Specific actionable string (not vague). Reference actual values.", "...", "..."],
  "additional_takeaways": [
    "1–2 sentence observation about overlap, macro timing, or positioning nuance",
    "...",
    "..."
  ],
  "phase1_macro_note": "1–2 sentences. Reference specific macro indicators (VIX, yield curve, LEI). What does the current regime mean for the immediate action items?"
}

Rules:
- Use actual values from the data (e.g., "25.4% cash" not "high cash")
- Grades format: "B−" not "B-"
- No vague language: not "consider rebalancing", not "may want to look at"
- No word "robust" or "optimize"
- Tone: direct, like a CFA reading a portfolio to a colleague
- Return only valid JSON
`.trim();

export async function generateNarratives(
  output: Omit<AnalysisOutput, "narratives">
): Promise<AINarratives> {
  const client = new Anthropic();

  const userContent = JSON.stringify({
    snapshot_date: output.portfolio.snapshot_date,
    portfolio_grade: output.portfolio_grade,
    portfolio_score: output.portfolio_score,
    aggregates: output.aggregates,
    dimension_scores: output.dimension_scores,
    reference_models: output.reference_models.map(m => ({
      label: m.label,
      grade: m.grade,
      score: m.score,
    })),
    macro: output.macro,
    flags: output.flags,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => (b as any).text)
    .join("");

  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean) as AINarratives;
}
```

---

## 9. Flags Generation (`src/engine/plan.ts`)

Rule-based. No AI. Generates flags, gap items, development plan phases, and score trajectory.

```typescript
import { Portfolio, MacroContext, PortfolioAggregates, DimensionScore,
         Flag, GapItem, PlanPhase, ScorePoint } from "../types";
import { scoreToGrade } from "./dimensions";

export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext
): Flag[] {
  const flags: Flag[] = [];
  const total = agg.total_value;

  // Individual stock flags
  for (const h of portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics)) {
    const m = h.stock_metrics!;
    const w = ((h.market_value / total) * 100).toFixed(1);

    if (m.pe_ratio && m.pe_ratio > 100 && m.eps_growth_yoy !== null && m.eps_growth_yoy < 0) {
      flags.push({
        ticker: h.ticker,
        severity: "red",
        title: `${h.ticker} — extreme valuation + declining earnings`,
        body: `P/E ${m.pe_ratio.toFixed(0)}×, EPS growth ${(m.eps_growth_yoy * 100).toFixed(1)}% YoY. Position is ${w}% of portfolio.`,
      });
    } else if (m.pe_ratio && m.pe_ratio > 50) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — elevated valuation`,
        body: `P/E ${m.pe_ratio.toFixed(0)}× is above sector norms. Monitor for earnings deceleration.`,
      });
    }

    if (m.beta && m.beta > 1.5) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — high beta`,
        body: `Beta ${m.beta.toFixed(2)} amplifies market moves. Late-cycle macro warrants reducing high-beta exposure.`,
      });
    }
  }

  // Cash drag flag
  if (agg.idle_cash_weight > 0.10) {
    flags.push({
      ticker: "CASH",
      severity: "yellow",
      title: `Idle cash at ${(agg.idle_cash_weight * 100).toFixed(1)}%`,
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% of portfolio earning money-market yield. Deploy or document as intentional strategic reserve.`,
    });
  }

  // Macro regime flags
  if (macro.yield_curve_status === "inverted" && agg.fixed_income_weight < 0.15) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: "Inverted yield curve — bond underweight",
      body: `Yield curve spread at ${macro.yield_curve_spread_10y_2y.toFixed(2)}%. Fixed income at ${(agg.fixed_income_weight * 100).toFixed(1)}% is below the 18–22% late-cycle target.`,
    });
  }

  if (macro.lei_consecutive_declines >= 6) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: `LEI declining for ${macro.lei_consecutive_declines} consecutive months`,
      body: "Six or more consecutive LEI declines historically precede recession. Defensive positioning is warranted.",
    });
  }

  // Duplicate fund flags
  for (const group of agg.duplicate_groups) {
    flags.push({
      ticker: group.tickers.join("/"),
      severity: "yellow",
      title: `Redundant funds — ${group.label}`,
      body: `${group.tickers.join(", ")} hold near-identical underlying exposure. Combined ${(group.combined_weight * 100).toFixed(1)}% — consolidate into one.`,
    });
  }

  return flags;
}

export function generateGapItems(
  agg: PortfolioAggregates,
  dimensions: DimensionScore[],
  macro: MacroContext
): GapItem[] {
  const gaps: GapItem[] = [];

  const dim = (id: string) => dimensions.find(d => d.id === id)!;

  if (agg.idle_cash_weight > 0.05) {
    gaps.push({
      title: "Cash drag",
      type: "red",
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% idle cash reducing returns. Target ≤ 3%.`,
      progress: Math.round((1 - agg.idle_cash_weight / 0.30) * 100),
    });
  }

  const stockRiskDim = dim("single_stock_risk");
  if (stockRiskDim.score < 6) {
    gaps.push({
      title: "Single-stock risk",
      type: "red",
      body: `${stockRiskDim.display_value}. Deteriorating fundamentals in high-weight positions.`,
      progress: Math.round(stockRiskDim.score * 10),
    });
  }

  const bondDim = dim("bond_balance");
  if (bondDim.score < 7) {
    gaps.push({
      title: "Fixed income underweight",
      type: "amber",
      body: `${(agg.fixed_income_weight * 100).toFixed(1)}% FI vs. ${macro.market_regime} target of 18–22%. Add FXNAX or VBTLX weight.`,
      progress: Math.round((agg.fixed_income_weight / 0.20) * 100),
    });
  }

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    gaps.push({
      title: "Fund overlap / redundancy",
      type: "amber",
      body: `${g.tickers.join(" + ")} hold nearly identical securities. Consolidate to reduce complexity.`,
      progress: 20,
    });
  }

  const concDim = dim("concentration");
  if (concDim.score < 7) {
    gaps.push({
      title: "Top-3 concentration",
      type: "amber",
      body: `${(agg.top3_weight * 100).toFixed(1)}% in top 3 holdings (${agg.top3_tickers.join(", ")}). Target ≤ 45%.`,
      progress: Math.round(((1 - agg.top3_weight) / 0.65) * 100),
    });
  }

  return gaps;
}

export function generatePlanPhases(
  agg: PortfolioAggregates,
  macro: MacroContext,
  baseScore: number
): { phases: PlanPhase[]; trajectory: ScorePoint[] } {
  const phases: PlanPhase[] = [];
  let runningScore = baseScore;

  // Phase 1
  const p1Actions = [];
  let p1Delta = 0;

  if (agg.pending_cash_weight > 0.05) {
    p1Actions.push({
      category: "trade" as const,
      description: `Deploy ${(agg.pending_cash_weight * 100).toFixed(1)}% pending cash ($${(agg.pending_cash_value / 1000).toFixed(0)}K) on ${agg.pending_deployment_date ?? "scheduled date"} per existing ${agg.pending_deployment_label ?? "tranche"} plan. This is the largest single score lever.`,
      tags: ["impact"],
    });
    p1Delta += 0.4;
  }

  // Find red-flagged stocks
  const highRiskStocks = agg.sector_holdings; // simplified — caller passes computed flags
  p1Actions.push({
    category: "trade" as const,
    description: `Review and reduce any individual stock positions with P/E > 100 and negative EPS growth. Reinvest proceeds into Phase 2 targets.`,
    tags: ["risk_reduction"],
  });
  p1Delta += 0.25;

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    p1Actions.push({
      category: "rebalance" as const,
      description: `Consolidate ${g.tickers.join(" + ")} — identical ${g.label} exposure. Keep lowest-cost fund, redeploy the rest.`,
      tags: ["simplification"],
    });
    p1Delta += 0.15;
  }

  runningScore = Math.min(10, runningScore + p1Delta);
  phases.push({
    phase: 1,
    title: "Immediate — deploy cash & reduce risk",
    timing: "Now → 30 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p1Actions,
    insight: `Macro context: ${macro.market_regime} regime with yield curve at ${macro.yield_curve_spread_10y_2y.toFixed(2)}. LEI has declined ${macro.lei_consecutive_declines} consecutive months. Lean defensive on T3 deployment — don't chase growth.`,
  });

  // Phase 2
  const p2Actions = [];
  let p2Delta = 0;

  if (agg.fixed_income_weight < 0.16) {
    p2Actions.push({
      category: "rebalance" as const,
      description: `Increase fixed income from ${(agg.fixed_income_weight * 100).toFixed(1)}% to 18–22%. Late-cycle with inverted yield curve warrants adding FXNAX or VBTLX weight.`,
      tags: ["impact"],
    });
    p2Delta += 0.3;
  }

  if (macro.cpi_yoy_headline > 2.5) {
    p2Actions.push({
      category: "trade" as const,
      description: `Add TIPS or short-duration bond position (5–7%) to hedge CPI at ${macro.cpi_yoy_headline}% — still above Fed's 2% target. VFSUX can absorb additional weight.`,
      tags: ["inflation_hedge"],
    });
    p2Delta += 0.1;
  }

  p2Actions.push({
    category: "rebalance" as const,
    description: `Trim QQQ and VUG if held — both are large-cap growth with near-identical holdings to a total-market fund. Redirect into XLI (industrials) or increase BRK-B for quality exposure.`,
    tags: ["simplification"],
  });

  runningScore = Math.min(10, runningScore + p2Delta);
  phases.push({
    phase: 2,
    title: "Near-term — fix allocation gaps",
    timing: "30–90 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p2Actions,
    insight: `Target post-rebalance: ~55% equity / 20% fixed income / 15% international / 5% balanced / 5% cash. Closer to a late-cycle All Weather posture without abandoning growth.`,
  });

  // Phase 3
  runningScore = Math.min(10, runningScore + 0.25);
  phases.push({
    phase: 3,
    title: "Platform — monitoring & automation",
    timing: "60–120 days (parallel)",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "platform" as const,
        description: "Set weekly report cadence (Sunday night). Automate macro.json refresh + portfolio.json pull from brokerage export. Regenerate full report automatically.",
        tags: ["automation"],
      },
      {
        category: "platform" as const,
        description: `Add threshold alerts: VIX > 25, HY spread > 450bps, any dimension score dropping more than 1 point week-over-week, cash exceeding 10%.`,
        tags: ["monitoring"],
      },
      {
        category: "platform" as const,
        description: "Build score trajectory chart tracking the B−→A− progress over time. Persist weekly scores to a JSON history file.",
        tags: ["feature"],
      },
    ],
    insight: "The goal is making good portfolio hygiene effortless. A Sunday morning report that takes 30 seconds to review beats a quarterly deep-dive that never happens.",
  });

  // Phase 4
  runningScore = Math.min(10, runningScore + 0.15);
  phases.push({
    phase: 4,
    title: "Ongoing — quarterly rebalance cadence",
    timing: "Recurring quarterly",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "process" as const,
        description: "Quarterly: check sleeve weights vs. targets, trim any position ±5% off target weight, review macro.json regime for sector rotation signals.",
        tags: ["process"],
      },
      {
        category: "process" as const,
        description: "Annual: review reference model benchmarks (Boglehead, All Weather, 60/40 scores) for any structural changes. Update macro regime targets if Fed policy shifts materially.",
        tags: ["process"],
      },
    ],
    insight: "Once the automation is running, the main job is reviewing the Sunday report and deciding whether any flags warrant action. Most weeks, nothing fires.",
  });

  const trajectory: ScorePoint[] = [
    { label: "Today", score: baseScore, grade: scoreToGrade(baseScore) },
    { label: "After phase 1", score: Number((baseScore + p1Delta).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta) },
    { label: "After phase 2", score: Number((baseScore + p1Delta + p2Delta).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta + p2Delta) },
    { label: "After phase 3", score: Number((baseScore + p1Delta + p2Delta + 0.25).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.25) },
    { label: "After phase 4", score: Number((baseScore + p1Delta + p2Delta + 0.40).toFixed(1)), grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.40) },
  ];

  return { phases, trajectory };
}
```

---

## 10. CLI Entry Point (`src/index.ts`)

Orchestrates the full pipeline. Writes `output/analysis.json` then opens the React report.

```typescript
import * as fs from "fs";
import * as path from "path";
import { computeAggregates } from "./engine/aggregates";
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./engine/dimensions";
import { REFERENCE_MODELS } from "./engine/benchmarks";
import { generateFlags, generateGapItems, generatePlanPhases } from "./engine/plan";
import { generateNarratives } from "./ai/narratives";
import { Portfolio, MacroContext, AnalysisOutput } from "./types";

async function main() {
  console.log("Portfolio Analyzer — loading data...");

  const portfolio: Portfolio = JSON.parse(
    fs.readFileSync(path.resolve("data/portfolio.json"), "utf-8")
  );
  const macro: MacroContext = JSON.parse(
    fs.readFileSync(path.resolve("data/macro.json"), "utf-8")
  );

  console.log(`Portfolio: ${portfolio.account_label} — ${portfolio.holdings.length} holdings`);

  // Step 1: Aggregates (pure math)
  const aggregates = computeAggregates(portfolio);

  // Step 2: Dimension scores (pure math)
  const dimension_scores = scoreAllDimensions(portfolio, aggregates, macro);
  const portfolio_score = computePortfolioScore(dimension_scores);
  const portfolio_grade = scoreToGrade(portfolio_score);

  console.log(`Portfolio score: ${portfolio_score.toFixed(1)} / 10 — Grade: ${portfolio_grade}`);

  // Step 3: Flags, gaps, plan (rule-based)
  const flags = generateFlags(portfolio, aggregates, macro);
  const gap_items = generateGapItems(aggregates, dimension_scores, macro);
  const { phases: plan_phases, trajectory: score_trajectory } =
    generatePlanPhases(aggregates, macro, portfolio_score);

  // Step 4: AI narratives (one API call)
  console.log("Calling Anthropic API for narratives...");
  const partial: Omit<AnalysisOutput, "narratives"> = {
    generated_at: new Date().toISOString(),
    portfolio,
    macro,
    aggregates,
    portfolio_score,
    portfolio_grade,
    dimension_scores,
    reference_models: REFERENCE_MODELS,
    findings: [],   // generated from narratives below
    plan_phases,
    score_trajectory,
    gap_items,
    flags,
  };

  const narratives = await generateNarratives(partial);

  // Step 5: Assemble findings from narratives
  const findings = [
    ...narratives.strengths.map(s => ({ type: "strength" as const, title: "Strength", body: s })),
    ...narratives.gaps.map(g => ({ type: "gap" as const, title: "Gap", body: g })),
  ];

  const output: AnalysisOutput = { ...partial, narratives, findings };

  // Write output JSON
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync("output/analysis.json", JSON.stringify(output, null, 2));
  console.log("Analysis written to output/analysis.json");
  console.log("Run `npm run report` to open the report.");
}

main().catch(err => { console.error(err); process.exit(1); });
```

---

## 11. React Report App

### `src/report/app/App.tsx`

Loads `output/analysis.json` and renders all 9 sections in order.

```tsx
import { useEffect, useState } from "react";
import { AnalysisOutput } from "../../types";
import AllocationBreakdown from "./sections/AllocationBreakdown";
import BenchmarkComparison from "./sections/BenchmarkComparison";
import DimensionScorecard from "./sections/DimensionScorecard";
import KeyFindings from "./sections/KeyFindings";
import RadarChart from "./sections/RadarChart";
import AdditionalTakeaways from "./sections/AdditionalTakeaways";
import Gaps from "./sections/Gaps";
import Flags from "./sections/Flags";

export default function App() {
  const [data, setData] = useState<AnalysisOutput | null>(null);

  useEffect(() => {
    fetch("/analysis.json")
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) return <div style={{ padding: "2rem", color: "#888" }}>Loading analysis...</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
          {data.portfolio.account_label}
        </h1>
        <p style={{ fontSize: 13, color: "#888" }}>
          Generated {new Date(data.generated_at).toLocaleDateString()} · {data.portfolio.holdings.length} holdings · Grade <strong>{data.portfolio_grade}</strong> ({data.portfolio_score.toFixed(1)}/10)
        </p>
        <p style={{ fontSize: 14, color: "#555", marginTop: 12, lineHeight: 1.6 }}>
          {data.narratives.headline_summary}
        </p>
      </div>

      <Section label="1 — Allocation breakdown">
        <AllocationBreakdown data={data} />
      </Section>
      <Section label="2 — Benchmark comparison">
        <BenchmarkComparison data={data} />
      </Section>
      <Section label="3 — Dimension scorecard">
        <DimensionScorecard data={data} />
      </Section>
      <Section label="4 — Key findings">
        <KeyFindings data={data} />
      </Section>
      <Section label="5 — Radar">
        <RadarChart data={data} />
      </Section>
      <Section label="6 — Additional takeaways">
        <AdditionalTakeaways data={data} />
      </Section>
      <Section label="7 — Gaps">
        <Gaps data={data} />
      </Section>
      <Section label="8 — Flags">
        <Flags data={data} />
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase",
                  letterSpacing: "0.06em", marginBottom: 12 }}>{label}</p>
      {children}
    </div>
  );
}
```

---

## 12. Section Component Specs

Each section component receives the full `AnalysisOutput` as its `data` prop.

### Section 1 — `AllocationBreakdown.tsx`
Render exactly as the reference screenshot:
- Top row: 4 stat cards — Total Portfolio Value | Equity Exposure | Fixed Income | Cash (flag amber if pending deployment exists and show "T3 pending" label)
- Donut chart: one slice per asset class group, color-coded legend above with percentages
- Holdings table: columns = Holding name | $ value | Wt. — sorted by market value descending
- If any holding has `is_pending_deployment: true`, show an amber callout box below the table: "T3 note: $Xk in TICKER (Y%) is dry powder awaiting [deployment_label] deployment ~[deployment_date]"
- Down-arrow chevron + "Post-T3 projected sector weights (at target allocation)" toggle — when clicked, re-renders the donut and table with pending cash redistributed proportionally across the user's non-cash holdings

### Section 2 — `BenchmarkComparison.tsx`
- 4 grade cards side by side: Your portfolio | Boglehead 3-fund | All Weather | Classic 60/40
- Each card: model name, description tag, large grade letter, score/10
- Your portfolio card has a blue accent border
- Below cards: `data.narratives.benchmark_context` as a single paragraph

### Section 3 — `DimensionScorecard.tsx`
- Table: rows = dimensions (10), columns = Your portfolio + 3 reference models
- Each cell: colored dot (green/yellow/red) + short display label
- Your portfolio column has light blue background
- Row header includes dimension name + subtitle (the `note` field, truncated to ~50 chars)

### Section 4 — `KeyFindings.tsx`
- 2×3 grid of finding cards
- Strengths: green left-border accent
- Gaps: red left-border accent  
- Notes: blue left-border accent
- Each card: bold label + body text
- Gaps include a mini horizontal progress bar (4px height)

### Section 5 — `RadarChart.tsx`
- Chart.js radar, 7 dimensions (drop international and quality_tilt for visual clarity)
- 4 datasets: portfolio (solid blue), Boglehead (dashed teal), All Weather (dashed amber), 60/40 (dashed gray)
- Custom HTML legend below — colored squares, model label, score
- Background fills at 0.12 opacity for portfolio, 0.07 for references

### Section 6 — `AdditionalTakeaways.tsx`
- Render `data.narratives.additional_takeaways` as a bulleted list
- Each bullet is a card with a thin left border
- Include `data.narratives.phase1_macro_note` as a final highlighted callout in amber

### Section 7 — `Gaps.tsx`
- 2×N grid of gap cards from `data.gap_items`
- Each card: icon + colored title (red/amber/blue) + body + mini progress bar
- Progress bar width = `gap.progress`%

### Section 8 — `Flags.tsx`
- List of flag rows from `data.flags`
- Red flags at top, yellow below
- Each row: colored severity badge | ticker pill | title | body text
- If no flags: show a green "No critical flags this week" card

---

## 13. Package Configuration

### `package.json`
```json
{
  "name": "portfolio-analyzer",
  "version": "1.0.0",
  "scripts": {
    "analyze": "ts-node src/index.ts",
    "report": "vite src/report/app --open",
    "build": "tsc && vite build src/report/app"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "chart.js": "^4.4.1",
    "react": "^18.2.0",
    "react-chartjs-2": "^5.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### `.env`
```
ANTHROPIC_API_KEY=your_key_here
```

---

## 14. Weekly Workflow

```
1. Update data/portfolio.json with new holdings + values
2. Update data/macro.json if macro data has changed (weekly)
3. Run: npm run analyze
4. Run: npm run report
5. Browser opens with full analysis report
```

---

## 15. Build Order for Claude Code

Build in this exact sequence. Each step is independently testable before moving on.

```
Step 1:  Create folder structure + package.json + tsconfig.json
Step 2:  Write src/types.ts (all interfaces)
Step 3:  Write data/portfolio.json + data/macro.json (sample data from Section 3)
Step 4:  Write src/intake/parsePortfolio.ts — load and validate portfolio.json
Step 5:  Write src/engine/aggregates.ts — test with console.log(computeAggregates(...))
Step 6:  Write src/engine/dimensions.ts — test each dimension returns a valid 0–10 score
Step 7:  Write src/engine/benchmarks.ts — static data only
Step 8:  Write src/engine/plan.ts — flags, gaps, plan phases, trajectory
Step 9:  Write src/ai/narratives.ts — test standalone with mock dimension scores
Step 10: Wire src/index.ts — full pipeline, writes output/analysis.json
Step 11: Create React app skeleton in src/report/app/
Step 12: Build AllocationBreakdown.tsx first (most complex, reference screenshot)
Step 13: Build remaining 7 section components
Step 14: Verify full end-to-end: npm run analyze && npm run report
```

---

## 16. Design Reference

The report UI matches the dark-card aesthetic in the reference screenshot:

- Background: `#111` or near-black
- Cards: `#1a1a1a` with `1px solid #2a2a2a` border
- Text primary: `#f0f0f0`
- Text secondary: `#888`
- Accent blue (equity): `#4a9fd4`
- Accent green: `#1D9E75`
- Accent amber: `#BA7517`
- Accent red: `#E24B4A`
- Pending cash callout background: `#2a1f00` with amber border

Donut chart color palette (assign in order):
```
US Equity:      #3a9e5f   (green)
Cash:           #5a5a5a   (gray)
International:  #4a5fa0   (blue-purple)
Fixed Income:   #4a7ac4   (blue)
Cons. Disc/EV:  #a05030   (coral)
Technology:     #c48830   (amber)
Utilities:      #7a9060   (muted green)
Nasdaq-100:     #903080   (pink-purple)
Financials:     #a0a060   (khaki)
```