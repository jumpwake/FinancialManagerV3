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

  const cash_weight = holdings.filter(h => h.is_cash).reduce((sum, h) => sum + w(h), 0);
  const pending_holdings = holdings.filter(h => h.is_pending_deployment);
  const pending_cash_weight = pending_holdings.reduce((sum, h) => sum + w(h), 0);
  const pending_cash_value = pending_holdings.reduce((sum, h) => sum + h.market_value, 0);
  const idle_cash_weight = cash_weight - pending_cash_weight;
  const firstPending = pending_holdings[0];

  const sorted = [...holdings].sort((a, b) =>
    b.market_value !== a.market_value
      ? b.market_value - a.market_value
      : a.ticker.localeCompare(b.ticker)
  );
  const top3 = sorted.slice(0, 3);
  const top3_weight = top3.reduce((sum, h) => sum + w(h), 0);
  const top3_tickers = top3.map(h => h.ticker);

  return {
    total_value,
    blended_expense_ratio,
    holding_count,
    duplicate_groups,
    top3_weight,
    top3_tickers,
    cash_weight,
    idle_cash_weight,
    pending_cash_weight,
    pending_cash_value,
    pending_deployment_label: firstPending?.deployment_label,
    pending_deployment_date: firstPending?.deployment_date,
  };
}
