import { describe, test, expect, it } from "vitest";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio, makeAccount } from "../../tests/fixtures/samplePortfolio";

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

describe("computeAggregates — sector_holdings", () => {
  test("groups holdings by sector_tag with combined_weight", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "XLP", market_value: 100, asset_class: "us_equity_sector", sector_tag: "consumer_staples" }),
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      ],
    });
    const sh = computeAggregates(portfolio).sector_holdings;
    expect(sh).toHaveLength(2);
    const utilities = sh.find(s => s.sector_tag === "utilities")!;
    expect(utilities.tickers).toEqual(["XLU"]);
    expect(utilities.combined_weight).toBeCloseTo(0.1, 6);
  });

  test("multiple holdings sharing a sector_tag merge into one group", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "VPU", market_value: 100, asset_class: "us_equity_sector", sector_tag: "utilities" }),
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      ],
    });
    const sh = computeAggregates(portfolio).sector_holdings;
    expect(sh).toHaveLength(1);
    expect(sh[0].tickers.sort()).toEqual(["VPU", "XLU"]);
    expect(sh[0].combined_weight).toBeCloseTo(0.2, 6);
  });

  test("holdings without sector_tag are not in sector_holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 100, asset_class: "us_equity_total_market" }),
      ],
    });
    expect(computeAggregates(portfolio).sector_holdings).toEqual([]);
  });
});

describe("aggregates — cross-account groups", () => {
  it("FSKAX in two accounts is recorded as cross_account_groups, not duplicate_groups", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
        makeHolding({ ticker: "VTSAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "vng_personal" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.duplicate_groups).toHaveLength(0);
    expect(agg.cross_account_groups).toHaveLength(1);
    expect(agg.cross_account_groups[0].asset_class).toBe("us_equity_total_market");
    expect(agg.cross_account_groups[0].combined_weight).toBeCloseTo(1.0, 2);
  });

  it("Two same-asset-class entries in the SAME account remain duplicates", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
        makeHolding({ ticker: "ITOT",  market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.duplicate_groups).toHaveLength(1);
    expect(agg.duplicate_groups[0].tickers).toContain("FSKAX");
    expect(agg.duplicate_groups[0].tickers).toContain("ITOT");
  });

  it("Same ticker (XLV) in two accounts is one cross_account_group, even for non-fungible classes", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLV", market_value: 1000, asset_class: "us_equity_sector", account_id: "vng_personal" }),
        makeHolding({ ticker: "XLV", market_value: 800,  asset_class: "us_equity_sector", account_id: "vng_business" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.duplicate_groups).toHaveLength(0);
    expect(agg.cross_account_groups).toHaveLength(1);
    expect(agg.cross_account_groups[0].label).toBe("XLV");
    expect(agg.cross_account_groups[0].tickers_by_account).toHaveLength(2);
  });

  it("Different sector ETFs (XLV vs XLU) across accounts are NOT grouped", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "XLV", market_value: 1000, asset_class: "us_equity_sector", account_id: "a" }),
        makeHolding({ ticker: "XLU", market_value: 1000, asset_class: "us_equity_sector", account_id: "b" }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.cross_account_groups).toHaveLength(0);
  });
});

describe("aggregates — composition decomposition", () => {
  it("VWENX with 60/5/35/0 composition contributes to equity AND FI weights", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({
          ticker: "VWENX",
          market_value: 1000,
          asset_class: "balanced",
          account_id: "vng",
          underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
        }),
      ],
    });
    const agg = computeAggregates(p);
    expect(agg.equity_weight).toBeCloseTo(0.60, 2);
    expect(agg.international_weight).toBeCloseTo(0.05, 2);
    expect(agg.fixed_income_weight).toBeCloseTo(0.35, 2);
    expect(agg.balanced_weight).toBeCloseTo(1.0, 2);
  });
});

describe("aggregates — constrained cash", () => {
  it("Cash in an account marked excluded_from_deployment goes to constrained_cash_weight, not idle", () => {
    const p = makePortfolio({
      holdings: [
        makeHolding({ ticker: "Cash", market_value: 500, asset_class: "cash", is_cash: true, account_id: "vng_business" }),
        makeHolding({ ticker: "Cash", market_value: 500, asset_class: "cash", is_cash: true, account_id: "vng_personal" }),
      ],
    });
    const accounts = {
      accounts: [
        makeAccount({ id: "vng_business", constraints: { excluded_from_deployment: true } }),
        makeAccount({ id: "vng_personal" }),
      ],
    };
    const agg = computeAggregates(p, accounts);
    expect(agg.constrained_cash_weight).toBeCloseTo(0.5, 2);
    expect(agg.idle_cash_weight).toBeCloseTo(0.5, 2);
    expect(agg.cash_weight).toBeCloseTo(1.0, 2);
  });
});

describe("aggregates — unknown asset_class filtering", () => {
  it("excludes 'unknown' asset_class holdings from weight calculations", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTSAX", asset_class: "us_equity_total_market", market_value: 8000 }),
        makeHolding({ ticker: "FAKE", asset_class: "unknown", market_value: 2000 }),
      ],
    });
    const aggregates = computeAggregates(portfolio);
    // Without the filter, FAKE's $2000 falls into no bucket and weights normalize wrong.
    // With the filter, VTSAX is 100% of the "classified" portfolio.
    expect(aggregates.equity_weight).toBeCloseTo(1.0, 3);
  });
});

describe("crypto sleeve", () => {
  it("counts crypto in crypto_weight and excludes it from equity_weight", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
      makeHolding({ ticker: "FBTC", market_value: 200, asset_class: "crypto", expense_ratio: 0.0025 }),
    ]});
    const agg = computeAggregates(p);
    expect(agg.crypto_weight).toBeCloseTo(0.2, 5);
    expect(agg.equity_weight).toBeCloseTo(0.8, 5);
  });
});

describe("computeAggregates — speculative sleeve", () => {
  test("sums combined weight of speculative tickers and lists those present", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "TSLA", market_value: 150, asset_class: "individual_stock" }),
        makeHolding({ ticker: "NVDA", market_value: 50, asset_class: "individual_stock" }),
      ],
    });
    const agg = computeAggregates(portfolio, undefined, ["TSLA", "NVDA", "AAPL"]);
    // (150 + 50) / 1000 = 0.20
    expect(agg.speculative_sleeve_weight).toBeCloseTo(0.20, 6);
    // Only tickers actually present are listed; AAPL is absent.
    expect(agg.speculative_sleeve_tickers).toEqual(["TSLA", "NVDA"]);
  });

  test("defaults to zero weight / empty list when no speculative tickers given", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const agg = computeAggregates(portfolio);
    expect(agg.speculative_sleeve_weight).toBe(0);
    expect(agg.speculative_sleeve_tickers).toEqual([]);
  });
});
