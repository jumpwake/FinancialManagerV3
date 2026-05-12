import { Holding, Portfolio, StockMetrics } from "../../src/types";

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

export function makeStockMetrics(overrides: Partial<StockMetrics> = {}): StockMetrics {
  return {
    pe_ratio: 20,
    ev_ebitda: 15,
    fcf_yield: 0.04,
    roe: 0.15,
    eps_growth_yoy: 0.10,
    revenue_growth_yoy: 0.08,
    net_debt_ebitda: 1.0,
    beta: 1.0,
    analyst_consensus: 3.5,
    ...overrides,
  };
}
