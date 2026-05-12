import { describe, test, expect } from "vitest";
import { generateFlags } from "./plan";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio, makeStockMetrics } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";

describe("generateFlags — individual stocks", () => {
  test("emits RED flag for P/E > 100 + declining EPS", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    const red = flags.find(f => f.ticker === "TSLA" && f.severity === "red");
    expect(red).toBeDefined();
    expect(red!.title).toContain("TSLA");
  });

  test("emits YELLOW flag for elevated P/E (>50) without declining EPS", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "NVDA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, eps_growth_yoy: 0.50 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    const yellow = flags.find(f => f.ticker === "NVDA" && f.severity === "yellow");
    expect(yellow).toBeDefined();
  });

  test("emits YELLOW flag for high beta (>1.5)", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 25, beta: 1.8 }),
        }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "TSLA" && f.title.includes("beta"))).toBe(true);
  });
});

describe("generateFlags — portfolio-level", () => {
  test("emits CASH flag when idle cash > 10%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({ ticker: "SPAXX", market_value: 150, is_cash: true, asset_class: "cash", expense_ratio: null }),
        makeHolding({ ticker: "FUND2", market_value: 50 }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "CASH")).toBe(true);
  });

  test("does NOT emit CASH flag when idle cash ≤ 10%", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.ticker === "CASH")).toBe(false);
  });

  test("emits MACRO flag when yield curve inverted + FI underweight", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const macro = makeMacro({ yield_curve_status: "inverted", yield_curve_spread_10y_2y: -0.12 });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), macro);
    expect(flags.some(f => f.ticker === "MACRO" && f.title.includes("yield curve"))).toBe(true);
  });

  test("emits MACRO flag when LEI declined ≥ 6 months", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro({ lei_consecutive_declines: 6 }));
    expect(flags.some(f => f.ticker === "MACRO" && f.title.includes("LEI"))).toBe(true);
  });

  test("emits one flag per duplicate fund group", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 500, asset_class: "us_equity_total_market" }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    expect(flags.some(f => f.title.includes("Redundant"))).toBe(true);
  });
});
