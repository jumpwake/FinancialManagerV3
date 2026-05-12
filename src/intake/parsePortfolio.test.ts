import { describe, test, expect } from "vitest";
import { parsePortfolio } from "./parsePortfolio";

const VALID_INPUT = {
  snapshot_date: "2026-05-11",
  account_label: "Test",
  holdings: [
    {
      ticker: "FSKAX", label: "Fidelity Total Market",
      market_value: 100000, asset_class: "us_equity_total_market",
      is_cash: false, is_pending_deployment: false,
      expense_ratio: 0.00015,
    },
  ],
};

describe("parsePortfolio", () => {
  test("accepts a valid portfolio object", () => {
    const portfolio = parsePortfolio(VALID_INPUT);
    expect(portfolio.account_label).toBe("Test");
    expect(portfolio.holdings).toHaveLength(1);
    expect(portfolio.holdings[0].ticker).toBe("FSKAX");
  });

  test("rejects missing snapshot_date", () => {
    const bad = { ...VALID_INPUT, snapshot_date: undefined };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("rejects invalid asset_class", () => {
    const bad = {
      ...VALID_INPUT,
      holdings: [{ ...VALID_INPUT.holdings[0], asset_class: "crypto" }],
    };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("rejects negative market_value", () => {
    const bad = {
      ...VALID_INPUT,
      holdings: [{ ...VALID_INPUT.holdings[0], market_value: -100 }],
    };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("accepts holding with optional stock_metrics", () => {
    const input = {
      ...VALID_INPUT,
      holdings: [{
        ticker: "TSLA", label: "Tesla", market_value: 50000,
        asset_class: "individual_stock", is_cash: false, is_pending_deployment: false,
        expense_ratio: null,
        stock_metrics: {
          pe_ratio: 410, ev_ebitda: 137, fcf_yield: 0.0037, roe: 0.046,
          eps_growth_yoy: -0.47, revenue_growth_yoy: -0.03, net_debt_ebitda: -3,
          beta: 1.79, analyst_consensus: 3.19,
        },
      }],
    };
    const portfolio = parsePortfolio(input);
    expect(portfolio.holdings[0].stock_metrics?.pe_ratio).toBe(410);
  });

  test("accepts pending deployment with date + label", () => {
    const input = {
      ...VALID_INPUT,
      holdings: [{
        ticker: "SPAXX", label: "Money Market", market_value: 100000,
        asset_class: "cash", is_cash: true, is_pending_deployment: true,
        deployment_date: "2026-05-29", deployment_label: "Tranche 3",
        expense_ratio: null,
      }],
    };
    const portfolio = parsePortfolio(input);
    expect(portfolio.holdings[0].deployment_label).toBe("Tranche 3");
  });

  test("rejects holdings array with zero items", () => {
    const bad = { ...VALID_INPUT, holdings: [] };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  test("loads the dev doc sample data/portfolio.json", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/portfolio.json"), "utf-8"));
    expect(() => parsePortfolio(raw)).not.toThrow();
    const portfolio = parsePortfolio(raw);
    expect(portfolio.holdings.length).toBeGreaterThan(0);
  });
});
