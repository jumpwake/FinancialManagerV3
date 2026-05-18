import { describe, test, it, expect } from "vitest";
import { generateFlags, generateGapItems, generatePlanPhases } from "./plan";
import { computeAggregates } from "./aggregates";
import { scoreAllDimensions } from "./dimensions";
import { buildFindingKey } from "./findingKeys";
import { makeHolding, makePortfolio, makeStockMetrics, makeAccount } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import { Portfolio, PortfolioAggregates, DimensionScore } from "../types";
import { NEUTRAL_SCORING_PROFILE } from "./riskProfile";

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

  it("attaches a finding_key to every flag", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
        makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const aggregates = computeAggregates(portfolio);
    const flags = generateFlags(portfolio, aggregates, makeMacro());

    expect(flags.length).toBeGreaterThan(0);
    for (const f of flags) {
      expect(f.finding_key).toBeTruthy();
      expect(f.finding_key).toMatch(/^[a-z][a-z0-9_]+(:[A-Za-z0-9_\-]+)+$/);
    }
  });

  it("attaches finding_key matching the expected pattern for cash drag", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
        makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), makeMacro());
    const cashFlag = flags.find(f => f.ticker === "CASH");
    expect(cashFlag?.finding_key).toBe(buildFindingKey({ dimension: "diversification", type: "cash_drag" }));
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

  test("throws descriptive error if required dimension is missing", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })] });
    const agg = computeAggregates(portfolio);
    // Build a dimension array missing single_stock_risk
    const fullDims = dimsFor(portfolio);
    const brokenDims = fullDims.filter(d => d.id !== "single_stock_risk");
    expect(() => generateGapItems(agg, brokenDims, makeMacro())).toThrow(/single_stock_risk/);
  });

  it("attaches a finding_key to every gap item", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTI", market_value: 89_000, asset_class: "us_equity_total_market", is_cash: false, is_pending_deployment: false }),
        makeHolding({ ticker: "CASH", market_value: 11_000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const aggregates = computeAggregates(portfolio);
    const macro = makeMacro();
    const dimensions = scoreAllDimensions(portfolio, aggregates, macro);
    const gaps = generateGapItems(aggregates, dimensions, macro);
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(g.finding_key).toBeTruthy();
      expect(g.finding_key).toMatch(/^[a-z][a-z0-9_]+(:[A-Za-z0-9_\-]+)+$/);
    }
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

describe("generateFlags — regime-sensitive text", () => {
  test("inverted yield curve flag uses regime-specific FI target", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const macro = makeMacro({ market_regime: "Recession", yield_curve_status: "inverted", yield_curve_spread_10y_2y: -0.12 });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), macro);
    const macroFlag = flags.find(f => f.ticker === "MACRO" && f.title.includes("yield curve"));
    expect(macroFlag).toBeDefined();
    expect(macroFlag!.body).toContain("25–40%");  // Recession target
    expect(macroFlag!.body).toContain("recessionary");  // lowercase in mid-sentence
    expect(macroFlag!.body).not.toContain("late-cycle");
  });

  test("high-beta flag body uses regime adjective not hardcoded late-cycle", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 25, beta: 1.8 }),
        }),
      ],
    });
    const macro = makeMacro({ market_regime: "Early Cycle" });
    const flags = generateFlags(portfolio, computeAggregates(portfolio), macro);
    const betaFlag = flags.find(f => f.ticker === "TSLA" && f.title.includes("beta"));
    expect(betaFlag).toBeDefined();
    expect(betaFlag!.body).toContain("Early-cycle");
    expect(betaFlag!.body).not.toContain("Late-cycle");
  });

  test("phase 2 FI rebalance action uses regime-specific target range", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const macro = makeMacro({ market_regime: "Recession", yield_curve_status: "inverted" });
    const { phases } = generatePlanPhases(computeAggregates(portfolio), macro, 7.0);
    const p2FiAction = phases[1].actions.find(a => a.description.includes("Increase fixed income"));
    expect(p2FiAction).toBeDefined();
    expect(p2FiAction!.description).toContain("25–40%");  // Recession target
    expect(p2FiAction!.description).toContain("Recessionary");  // capitalize() is applied in phase 2
    expect(p2FiAction!.description).not.toContain("Late-cycle");
    expect(p2FiAction!.description).toContain("with inverted yield curve");
  });
});

describe("plan.ts — asset-location flags", () => {
  it("emits a yellow flag when VWENX is in taxable", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({
        ticker: "VWENX",
        market_value: 100_000,
        asset_class: "balanced",
        account_id: "vng_taxable",
        underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
      }),
    ]});
    const accounts = {
      accounts: [ makeAccount({ id: "vng_taxable", account_type: "taxable_brokerage", label: "Vanguard Taxable" }) ],
    };
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p, accounts);
    const flags = generateFlags(p, agg, macro, accounts);
    expect(flags.some(f => f.ticker === "VWENX" && /taxable/i.test(f.body))).toBe(true);
  });

  it("excludes constrained-account cash from idle-cash flag", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "Cash", market_value: 500_000, asset_class: "cash", is_cash: true, account_id: "vng_business" }),
    ]});
    const accounts = {
      accounts: [ makeAccount({ id: "vng_business", account_type: "business_taxable", constraints: { excluded_from_deployment: true } }) ],
    };
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p, accounts);
    const flags = generateFlags(p, agg, macro, accounts);
    // No CASH idle-cash flag because all the cash is constrained
    expect(flags.find(f => f.ticker === "CASH" && /idle cash/i.test(f.title))).toBeUndefined();
  });
});

describe("plan generators with a bond_balance-dropped ScoringProfile", () => {
  const droppedSp = {
    ...NEUTRAL_SCORING_PROFILE,
    activeDimensionIds: new Set(
      [...NEUTRAL_SCORING_PROFILE.activeDimensionIds].filter((id) => id !== "bond_balance"),
    ),
  };

  it("generateGapItems does not throw and emits no FI gap when bond_balance is dropped", () => {
    const agg = {
      total_value: 1000, blended_expense_ratio: 0, holding_count: 1,
      duplicate_groups: [], cross_account_groups: [], top3_weight: 0.2, top3_tickers: [],
      international_weight: 0.1, cash_weight: 0, idle_cash_weight: 0, constrained_cash_weight: 0,
      pending_cash_weight: 0, pending_cash_value: 0, equity_weight: 0.9, fixed_income_weight: 0.02,
      individual_stock_weight: 0, balanced_weight: 0, sector_holdings: [],
    } as PortfolioAggregates;
    const dims: DimensionScore[] = [
      { id: "single_stock_risk", label: "Single-stock risk", score: 10, rating: "green", display_value: "", note: "", weight: 0.11 },
      { id: "concentration", label: "Concentration", score: 9, rating: "green", display_value: "", note: "", weight: 0.11 },
    ];
    const gaps = generateGapItems(agg, dims, makeMacro(), droppedSp);
    expect(gaps.find((g) => g.finding_key.startsWith("bond_balance:"))).toBeUndefined();
  });
});
