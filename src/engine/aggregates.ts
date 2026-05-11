import { Portfolio, PortfolioAggregates } from "../types";

export function computeAggregates(portfolio: Portfolio): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  return { total_value, blended_expense_ratio };
}
