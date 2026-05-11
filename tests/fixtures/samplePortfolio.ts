import { Holding, Portfolio } from "../../src/types";

export function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    ticker: "TEST",
    label: "Test Holding",
    market_value: 100,
    asset_class: "us_equity_total_market",
    is_cash: false,
    is_pending_deployment: false,
    expense_ratio: 0.0002,
    ...overrides,
  };
}

export function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    snapshot_date: "2026-05-11",
    account_label: "Test",
    holdings: [],
    ...overrides,
  };
}
