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
