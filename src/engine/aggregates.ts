import { Portfolio, PortfolioAggregates, DuplicateGroup, Holding } from "../types";

const DUPLICATE_CLASSES: string[] = [
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_bond_aggregate",
  "us_bond_short",
];

export function computeAggregates(portfolio: Portfolio): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const w = (h: Holding) => (total_value > 0 ? h.market_value / total_value : 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  const holding_count = holdings.filter(h => !h.is_cash).length;

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

  return { total_value, blended_expense_ratio, holding_count, duplicate_groups };
}
