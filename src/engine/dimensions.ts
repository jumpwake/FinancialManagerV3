import { PortfolioAggregates, DimensionScore, Rating } from "../types";

export function toRating(score: number): Rating {
  if (score >= 7.5) return "green";
  if (score >= 5.0) return "yellow";
  return "red";
}

export function scoreCostEfficiency(agg: PortfolioAggregates): DimensionScore {
  const erPct = agg.blended_expense_ratio * 100;
  const score =
    erPct <= 0.05 ? 10 :
    erPct <= 0.10 ? 9 :
    erPct <= 0.20 ? 7 :
    erPct <= 0.35 ? 5 :
    erPct <= 0.50 ? 3 : 1;

  return {
    id: "cost_efficiency",
    label: "Cost efficiency",
    score,
    rating: toRating(score),
    display_value: `~${erPct.toFixed(2)}% blended ER`,
    note: "Blended expense ratio across all fund holdings",
    weight: 0.10,
  };
}

export function scoreSimplicity(agg: PortfolioAggregates): DimensionScore {
  const extraPositions = agg.duplicate_groups.reduce((sum, g) => sum + (g.tickers.length - 1), 0);
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

export function scoreConcentration(agg: PortfolioAggregates): DimensionScore {
  const t3 = agg.top3_weight;
  const score =
    t3 <= 0.35 ? 10 :
    t3 <= 0.45 ? 8 :
    t3 <= 0.55 ? 6 :
    t3 <= 0.65 ? 4 : 2;

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

export function scoreInternational(agg: PortfolioAggregates): DimensionScore {
  const intl = agg.international_weight;
  const score =
    intl >= 0.15 && intl <= 0.30 ? 10 :
    intl >= 0.10                 ? 8 :
    intl >= 0.05                 ? 6 :
    intl >= 0.02                 ? 4 : 2;

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

export function scoreCashEfficiency(agg: PortfolioAggregates): DimensionScore {
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

export function scoreDiversification(agg: PortfolioAggregates): DimensionScore {
  const buckets: Record<string, number> = {
    us_equity: agg.equity_weight - agg.international_weight - agg.individual_stock_weight,
    international: agg.international_weight,
    fixed_income: agg.fixed_income_weight,
    balanced: agg.balanced_weight,
    individual_stock: agg.individual_stock_weight,
  };
  const filledBuckets = Object.values(buckets).filter(w => w >= 0.03).length;
  let score = filledBuckets >= 5 ? 10 : filledBuckets === 4 ? 8 : filledBuckets === 3 ? 6 : filledBuckets === 2 ? 4 : 2;
  score = Math.max(1, score - agg.duplicate_groups.length);

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
