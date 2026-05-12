import { Portfolio, MacroContext, PortfolioAggregates, Flag, DimensionScore, GapItem } from "../types";

export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext
): Flag[] {
  const flags: Flag[] = [];
  const total = agg.total_value;

  for (const h of portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics)) {
    const m = h.stock_metrics!;
    const wPct = total > 0 ? ((h.market_value / total) * 100).toFixed(1) : "0";

    if (m.pe_ratio !== null && m.pe_ratio > 100 && m.eps_growth_yoy !== null && m.eps_growth_yoy < 0) {
      flags.push({
        ticker: h.ticker,
        severity: "red",
        title: `${h.ticker} — extreme valuation + declining earnings`,
        body: `P/E ${m.pe_ratio.toFixed(0)}×, EPS growth ${(m.eps_growth_yoy * 100).toFixed(1)}% YoY. Position is ${wPct}% of portfolio.`,
      });
    } else if (m.pe_ratio !== null && m.pe_ratio > 50) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — elevated valuation`,
        body: `P/E ${m.pe_ratio.toFixed(0)}× is above sector norms. Monitor for earnings deceleration.`,
      });
    }

    if (m.beta !== null && m.beta > 1.5) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — high beta`,
        body: `Beta ${m.beta.toFixed(2)} amplifies market moves. Late-cycle macro warrants reducing high-beta exposure.`,
      });
    }
  }

  if (agg.idle_cash_weight > 0.10) {
    flags.push({
      ticker: "CASH",
      severity: "yellow",
      title: `Idle cash at ${(agg.idle_cash_weight * 100).toFixed(1)}%`,
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% of portfolio earning money-market yield. Deploy or document as intentional strategic reserve.`,
    });
  }

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
      body: `${(agg.fixed_income_weight * 100).toFixed(1)}% FI vs. ${macro.market_regime} target. Add FXNAX or VBTLX weight.`,
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
