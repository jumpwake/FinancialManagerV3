import { describe, test, it, expect } from "vitest";
import { parsePortfolio } from "./parsePortfolio";

const VALID_INPUT = {
  snapshot_date: "2026-05-11",
  account_label: "Test",
  holdings: [
    {
      ticker: "FSKAX", label: "Fidelity Total Market",
      market_value: 100000, asset_class: "us_equity_total_market",
      account_id: "fid",
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
      holdings: [{ ...VALID_INPUT.holdings[0], asset_class: "not_a_class" }],
    };
    expect(() => parsePortfolio(bad)).toThrow();
  });

  it("accepts a holding with asset_class crypto", () => {
    const portfolio = {
      snapshot_date: "2026-06-08",
      account_label: "All Accounts",
      holdings: [
        {
          ticker: "FBTC",
          label: "Fidelity Wise Origin Bitcoin Fund",
          market_value: 5000,
          asset_class: "crypto",
          account_id: "fid_roth",
          is_cash: false,
          is_pending_deployment: false,
          expense_ratio: 0.0025,
        },
      ],
    };
    const result = parsePortfolio(portfolio);
    expect(result.holdings[0].asset_class).toBe("crypto");
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
        asset_class: "individual_stock", account_id: "fid", is_cash: false, is_pending_deployment: false,
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
        asset_class: "cash", account_id: "fid", is_cash: true, is_pending_deployment: true,
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
});

describe("parsePortfolio with account_id and underlying_composition", () => {
  it("requires account_id on every holding", () => {
    expect(() =>
      parsePortfolio({
        snapshot_date: "2026-05-12",
        account_label: "X",
        holdings: [
          { ticker: "FSKAX", label: "x", market_value: 1, asset_class: "us_equity_total_market",
            is_cash: false, is_pending_deployment: false, expense_ratio: 0 /* no account_id */ },
        ],
      }),
    ).toThrow();
  });

  it("accepts underlying_composition that sums to ~1.0", () => {
    const p = parsePortfolio({
      snapshot_date: "2026-05-12",
      account_label: "X",
      holdings: [
        {
          ticker: "VWENX",
          label: "Wellington",
          market_value: 100,
          asset_class: "balanced",
          account_id: "vng",
          is_cash: false,
          is_pending_deployment: false,
          expense_ratio: 0.0017,
          underlying_composition: {
            us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0,
          },
        },
      ],
    });
    expect(p.holdings[0].underlying_composition?.us_equity).toBe(0.60);
  });

  it("rejects underlying_composition that does NOT sum to 1.0", () => {
    expect(() =>
      parsePortfolio({
        snapshot_date: "2026-05-12",
        account_label: "X",
        holdings: [
          {
            ticker: "VWENX",
            label: "Wellington",
            market_value: 100,
            asset_class: "balanced",
            account_id: "vng",
            is_cash: false,
            is_pending_deployment: false,
            expense_ratio: 0.0017,
            underlying_composition: { us_equity: 0.5, international_equity: 0.5, fixed_income: 0.5, cash: 0.5 },
          },
        ],
      }),
    ).toThrow(/sum|1\.0/i);
  });
});
