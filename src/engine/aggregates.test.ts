import { describe, test, expect } from "vitest";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";

describe("computeAggregates", () => {
  describe("total_value", () => {
    test("sums market_values across all holdings", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 100 }),
          makeHolding({ ticker: "B", market_value: 250 }),
          makeHolding({ ticker: "C", market_value: 50 }),
        ],
      });
      expect(computeAggregates(portfolio).total_value).toBe(400);
    });

    test("returns 0 for an empty portfolio", () => {
      expect(computeAggregates(makePortfolio({ holdings: [] })).total_value).toBe(0);
    });
  });

  describe("blended_expense_ratio", () => {
    test("weighted average across fund holdings", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 100, expense_ratio: 0.001 }),
          makeHolding({ ticker: "B", market_value: 100, expense_ratio: 0.003 }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.002, 6);
    });

    test("weights respect market_value, not equal weighting", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "A", market_value: 900, expense_ratio: 0.0001 }),
          makeHolding({ ticker: "B", market_value: 100, expense_ratio: 0.0020 }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.00029, 6);
    });

    test("excludes cash holdings from the blend", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "FUND", market_value: 100, expense_ratio: 0.001, is_cash: false }),
          makeHolding({ ticker: "CASH", market_value: 100, expense_ratio: null, is_cash: true, asset_class: "cash" }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.001, 6);
    });

    test("returns 0 when no fund holdings exist", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "CASH", market_value: 100, expense_ratio: null, is_cash: true, asset_class: "cash" }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBe(0);
    });

    test("excludes cash holdings even when they have an expense ratio", () => {
      const portfolio = makePortfolio({
        holdings: [
          makeHolding({ ticker: "FUND", market_value: 100, expense_ratio: 0.001, is_cash: false }),
          makeHolding({ ticker: "VMFXX", market_value: 100, expense_ratio: 0.0011, is_cash: true, asset_class: "cash" }),
        ],
      });
      expect(computeAggregates(portfolio).blended_expense_ratio).toBeCloseTo(0.001, 6);
    });
  });
});

describe("computeAggregates — holding_count and duplicates", () => {
  test("holding_count excludes cash positions", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", is_cash: false }),
        makeHolding({ ticker: "B", is_cash: false }),
        makeHolding({ ticker: "C", is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    expect(computeAggregates(portfolio).holding_count).toBe(2);
  });

  test("duplicate_groups detects two funds in the same passive asset class", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 400, asset_class: "us_equity_total_market" }),
      ],
    });
    const dups = computeAggregates(portfolio).duplicate_groups;
    expect(dups).toHaveLength(1);
    expect(dups[0].tickers.sort()).toEqual(["FSKAX", "VTSAX"]);
    expect(dups[0].combined_weight).toBeCloseTo(1.0, 6);
  });

  test("duplicate_groups empty when no class has 2+ funds", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FXNAX", asset_class: "us_bond_aggregate" }),
      ],
    });
    expect(computeAggregates(portfolio).duplicate_groups).toEqual([]);
  });
});

describe("computeAggregates — top3 concentration", () => {
  test("top3_weight sums the three largest holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", market_value: 500 }),
        makeHolding({ ticker: "B", market_value: 300 }),
        makeHolding({ ticker: "C", market_value: 100 }),
        makeHolding({ ticker: "D", market_value: 100 }),
      ],
    });
    expect(computeAggregates(portfolio).top3_weight).toBeCloseTo(0.9, 6);
  });

  test("top3_tickers ordered by descending market_value", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "D", market_value: 100 }),
        makeHolding({ ticker: "A", market_value: 500 }),
        makeHolding({ ticker: "C", market_value: 100 }),
        makeHolding({ ticker: "B", market_value: 300 }),
      ],
    });
    expect(computeAggregates(portfolio).top3_tickers).toEqual(["A", "B", "C"]);
  });

  test("top3 with fewer than 3 holdings uses all of them", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "A", market_value: 600 }),
        makeHolding({ ticker: "B", market_value: 400 }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.top3_tickers).toEqual(["A", "B"]);
    expect(agg.top3_weight).toBeCloseTo(1.0, 6);
  });
});

describe("computeAggregates — international_weight", () => {
  test("sums international_equity holdings as fraction of total", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 300, asset_class: "international_equity" }),
      ],
    });
    expect(computeAggregates(portfolio).international_weight).toBeCloseTo(0.3, 6);
  });
});

describe("computeAggregates — cash partition", () => {
  test("cash_weight sums all is_cash holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FUND", market_value: 800, is_cash: false }),
        makeHolding({ ticker: "SPAXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "VMFXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    expect(computeAggregates(portfolio).cash_weight).toBeCloseTo(0.2, 6);
  });

  test("pending_cash_weight isolates is_pending_deployment cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FUND", market_value: 800, is_cash: false }),
        makeHolding({ ticker: "SPAXX", market_value: 150, is_cash: true, is_pending_deployment: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "VMFXX", market_value: 50, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.pending_cash_weight).toBeCloseTo(0.15, 6);
    expect(agg.pending_cash_value).toBe(150);
    expect(agg.idle_cash_weight).toBeCloseTo(0.05, 6);
  });

  test("pending_deployment_label and _date copied from first pending holding", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "SPAXX", market_value: 100, is_cash: true, is_pending_deployment: true,
          asset_class: "cash", expense_ratio: null,
          deployment_label: "Tranche 3",
          deployment_date: "2026-05-29",
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.pending_deployment_label).toBe("Tranche 3");
    expect(agg.pending_deployment_date).toBe("2026-05-29");
  });
});

describe("computeAggregates — sleeve weights", () => {
  test("equity_weight covers US equity + sector + individual_stock classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 400, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 100, asset_class: "individual_stock" }),
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
      ],
    });
    expect(computeAggregates(portfolio).equity_weight).toBeCloseTo(0.6, 6);
  });

  test("fixed_income_weight covers all us_bond_* classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
        makeHolding({ ticker: "VFSUX", market_value: 100, asset_class: "us_bond_short" }),
      ],
    });
    expect(computeAggregates(portfolio).fixed_income_weight).toBeCloseTo(0.3, 6);
  });

  test("individual_stock_weight isolated from broader equity bucket", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "NVDA", market_value: 200, asset_class: "individual_stock" }),
      ],
    });
    expect(computeAggregates(portfolio).individual_stock_weight).toBeCloseTo(0.4, 6);
  });

  test("balanced_weight covers balanced + target_date classes", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VWENX", market_value: 100, asset_class: "balanced" }),
        makeHolding({ ticker: "FXAIX", market_value: 100, asset_class: "target_date" }),
      ],
    });
    expect(computeAggregates(portfolio).balanced_weight).toBeCloseTo(0.2, 6);
  });
});
