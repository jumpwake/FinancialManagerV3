import { describe, test, expect } from "vitest";
import { generateFlags, generateGapItems, generatePlanPhases } from "./plan";
import { computeAggregates } from "./aggregates";
import { scoreAllDimensions } from "./dimensions";
import { makeHolding, makePortfolio, makeStockMetrics } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import { Portfolio } from "../types";

function dimsFor(portfolio: Portfolio, macro = makeMacro()) {
  return scoreAllDimensions(portfolio, computeAggregates(portfolio), macro);
}

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

describe("generateGapItems", () => {
  test("emits RED 'Cash drag' when idle_cash > 5%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 900 }),
        makeHolding({ ticker: "SPAXX", market_value: 100, is_cash: true, asset_class: "cash", expense_ratio: null }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title === "Cash drag" && g.type === "red")).toBe(true);
  });

  test("emits AMBER FI underweight when bond_balance score < 7", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title.includes("Fixed income") && g.type === "amber")).toBe(true);
  });

  test("emits AMBER overlap gap when duplicate_groups non-empty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "VTSAX", market_value: 500, asset_class: "us_equity_total_market" }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title.includes("overlap"))).toBe(true);
  });

  test("no RED gaps emitted for a healthy portfolio", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 550, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
        makeHolding({ ticker: "VWENX", market_value: 50, asset_class: "balanced" }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro({ market_regime: "Mid Cycle" }));
    expect(gaps.find(g => g.type === "red")).toBeUndefined();
  });

  test("emits RED 'Single-stock risk' when stock_risk dimension score < 6", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500 }),
        makeHolding({
          ticker: "TSLA", market_value: 500, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
      ],
    });
    const gaps = generateGapItems(computeAggregates(portfolio), dimsFor(portfolio), makeMacro());
    expect(gaps.some(g => g.title === "Single-stock risk" && g.type === "red")).toBe(true);
  });
});

describe("generatePlanPhases", () => {
  test("returns exactly 4 phases", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases).toHaveLength(4);
    expect(phases.map(p => p.phase)).toEqual([1, 2, 3, 4]);
  });

  test("phase 1 includes deploy-cash action when pending_cash_weight > 5%", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "SPAXX", market_value: 200, is_cash: true, is_pending_deployment: true,
          deployment_date: "2026-05-29", deployment_label: "Tranche 3",
          asset_class: "cash", expense_ratio: null,
        }),
      ],
    });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    const p1 = phases[0];
    expect(p1.actions.some(a => a.description.includes("Tranche 3"))).toBe(true);
  });

  test("phase 1 omits deploy-cash action when pending_cash_weight ≤ 5%", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases[0].actions.some(a => a.description.includes("Tranche"))).toBe(false);
  });

  test("phase 2 includes FI rebalance when fixed_income_weight < 16%", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(phases[1].actions.some(a => a.description.includes("Increase fixed income"))).toBe(true);
  });

  test("score_trajectory has 5 points: today + after each phase", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { trajectory } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    expect(trajectory).toHaveLength(5);
    expect(trajectory[0].label).toBe("Today");
    expect(trajectory[0].score).toBe(7.0);
    expect(trajectory[4].label).toBe("After phase 4");
  });

  test("each phase has a non-empty title, timing, projected_grade, and insight", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), makeMacro(), 7.0);
    for (const p of phases) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.timing.length).toBeGreaterThan(0);
      expect(p.projected_grade.length).toBeGreaterThan(0);
      expect(p.insight.length).toBeGreaterThan(0);
    }
  });
});
