import { Portfolio, MacroContext, PortfolioAggregates, Flag } from "../types";

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
