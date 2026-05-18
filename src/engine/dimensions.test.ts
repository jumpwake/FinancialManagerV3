import { describe, test, it, expect } from "vitest";
import { scoreCostEfficiency, scoreSimplicity, scoreConcentration, scoreCashEfficiency, scoreInternational, scoreDiversification, scoreBondBalance, scoreMacroAlignment, scoreSingleStockRisk, scoreQualityTilt, scoreToGrade, computePortfolioScore, scoreAllDimensions, scoreAssetLocation } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio, makeStockMetrics, makeAccount } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import { PortfolioAggregates, DimensionScore } from "../types";

function aggWithER(er: number): PortfolioAggregates {
  return { total_value: 1000, blended_expense_ratio: er, holding_count: 0, duplicate_groups: [], cross_account_groups: [], top3_weight: 0, top3_tickers: [], international_weight: 0, cash_weight: 0, idle_cash_weight: 0, constrained_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0, equity_weight: 0, fixed_income_weight: 0, individual_stock_weight: 0, balanced_weight: 0, sector_holdings: [] };
}

describe("scoreCostEfficiency", () => {
  test("returns score 10 / green for ER ≤ 0.05%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0003));
    expect(s.id).toBe("cost_efficiency");
    expect(s.score).toBe(10);
    expect(s.rating).toBe("green");
    expect(s.weight).toBe(0.09);
  });

  test("returns score 9 for 0.05% < ER ≤ 0.10%", () => {
    expect(scoreCostEfficiency(aggWithER(0.0008)).score).toBe(9);
  });

  test("returns score 7 / yellow for 0.10% < ER ≤ 0.20%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0015));
    expect(s.score).toBe(7);
    expect(s.rating).toBe("yellow");
  });

  test("returns score 5 / yellow for 0.20% < ER ≤ 0.35%", () => {
    const s = scoreCostEfficiency(aggWithER(0.003));
    expect(s.score).toBe(5);
    expect(s.rating).toBe("yellow");
  });

  test("returns score 3 / red for 0.35% < ER ≤ 0.50%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0045));
    expect(s.score).toBe(3);
    expect(s.rating).toBe("red");
  });

  test("returns score 1 / red for ER > 0.50%", () => {
    expect(scoreCostEfficiency(aggWithER(0.0080)).score).toBe(1);
  });

  test("display_value includes the blended ER as a percent string", () => {
    expect(scoreCostEfficiency(aggWithER(0.0015)).display_value).toContain("0.15%");
  });

  test("end-to-end skeleton: portfolio → aggregates → score", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 680000, expense_ratio: 0.00015 }),
        makeHolding({ ticker: "FXNAX", market_value: 160000, expense_ratio: 0.00025 }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const score = scoreCostEfficiency(agg);
    expect(score.score).toBe(10);
    expect(score.rating).toBe("green");
    expect(score.id).toBe("cost_efficiency");
  });
});

function aggForSimplicity(overrides: Partial<PortfolioAggregates>): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 0,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    international_weight: 0,
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
    ...overrides,
  };
}

describe("scoreSimplicity", () => {
  test("returns 10 for ≤ 5 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 5 })).score).toBe(10);
  });

  test("returns 8 for 6–8 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 7 })).score).toBe(8);
  });

  test("returns 6 for 9–12 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 10 })).score).toBe(6);
  });

  test("returns 4 for 13–16 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 14 })).score).toBe(4);
  });

  test("returns 2 for > 16 effective holdings", () => {
    expect(scoreSimplicity(aggForSimplicity({ holding_count: 20 })).score).toBe(2);
  });

  test("subtracts duplicate-extra positions from effective count", () => {
    const agg = aggForSimplicity({
      holding_count: 8,
      duplicate_groups: [{ label: "us equity total market", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreSimplicity(agg).score).toBe(8);
  });

  test("display_value shows raw and effective counts", () => {
    const agg = aggForSimplicity({
      holding_count: 8,
      duplicate_groups: [{ label: "x", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreSimplicity(agg).display_value).toBe("7 effective positions (8 across accounts)");
  });
});

function aggForConc(top3: number, tickers: string[] = ["A", "B", "C"]): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 10,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: top3,
    top3_tickers: tickers,
    international_weight: 0,
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
  };
}

describe("scoreConcentration", () => {
  test("returns 10 for top3 ≤ 35%", () => {
    expect(scoreConcentration(aggForConc(0.30)).score).toBe(10);
  });

  test("returns 8 for 35% < top3 ≤ 45%", () => {
    expect(scoreConcentration(aggForConc(0.40)).score).toBe(8);
  });

  test("returns 6 for 45% < top3 ≤ 55%", () => {
    expect(scoreConcentration(aggForConc(0.50)).score).toBe(6);
  });

  test("returns 4 for 55% < top3 ≤ 65%", () => {
    expect(scoreConcentration(aggForConc(0.60)).score).toBe(4);
  });

  test("returns 2 for top3 > 65%", () => {
    expect(scoreConcentration(aggForConc(0.80)).score).toBe(2);
  });

  test("display_value includes percentage and tickers", () => {
    const s = scoreConcentration(aggForConc(0.42, ["FSKAX", "FTIHX", "FXNAX"]));
    expect(s.display_value).toContain("42.0%");
    expect(s.display_value).toContain("FSKAX, FTIHX, FXNAX");
  });
});

function aggForCash(idle: number, pending: number = 0): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 5,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    international_weight: 0,
    cash_weight: idle + pending,
    idle_cash_weight: idle,
    constrained_cash_weight: 0,
    pending_cash_weight: pending,
    pending_cash_value: pending * 1000,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
  };
}

describe("scoreCashEfficiency", () => {
  test("returns 10 for idle ≤ 2%", () => {
    expect(scoreCashEfficiency(aggForCash(0.01)).score).toBe(10);
  });
  test("returns 8 for 2% < idle ≤ 5%", () => {
    expect(scoreCashEfficiency(aggForCash(0.04)).score).toBe(8);
  });
  test("returns 7 for 5% < idle ≤ 8%", () => {
    expect(scoreCashEfficiency(aggForCash(0.07)).score).toBe(7);
  });
  test("returns 5 for 8% < idle ≤ 12%", () => {
    expect(scoreCashEfficiency(aggForCash(0.10)).score).toBe(5);
  });
  test("returns 3 for 12% < idle ≤ 20%", () => {
    expect(scoreCashEfficiency(aggForCash(0.15)).score).toBe(3);
  });
  test("returns 1 for idle > 20%", () => {
    expect(scoreCashEfficiency(aggForCash(0.30)).score).toBe(1);
  });
  test("pending cash does not penalize the score", () => {
    expect(scoreCashEfficiency(aggForCash(0.01, 0.25)).score).toBe(10);
  });
  test("display_value includes pending when present", () => {
    expect(scoreCashEfficiency(aggForCash(0.04, 0.10)).display_value).toContain("pending");
  });
});

function aggForIntl(intl: number): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 5,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    international_weight: intl,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
  };
}

describe("scoreInternational", () => {
  test("returns 10 for 15% ≤ intl ≤ 30%", () => {
    expect(scoreInternational(aggForIntl(0.20)).score).toBe(10);
  });
  test("returns 8 for 10% ≤ intl < 15%", () => {
    expect(scoreInternational(aggForIntl(0.12)).score).toBe(8);
  });
  test("returns 6 for 5% ≤ intl < 10%", () => {
    expect(scoreInternational(aggForIntl(0.07)).score).toBe(6);
  });
  test("returns 4 for 2% ≤ intl < 5%", () => {
    expect(scoreInternational(aggForIntl(0.03)).score).toBe(4);
  });
  test("returns 2 for intl < 2%", () => {
    expect(scoreInternational(aggForIntl(0.01)).score).toBe(2);
  });
  test("returns 8 (not 10) for intl > 30% (over-allocation)", () => {
    expect(scoreInternational(aggForIntl(0.40)).score).toBe(8);
  });
});

function aggForDiv(o: Partial<PortfolioAggregates>): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 5,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
    ...o,
  };
}

describe("scoreDiversification", () => {
  test("returns 10 when 5+ buckets ≥ 3%", () => {
    const agg = aggForDiv({
      equity_weight: 0.55, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05, individual_stock_weight: 0.05,
    });
    expect(scoreDiversification(agg).score).toBe(10);
  });

  test("returns 8 for 4 buckets", () => {
    const agg = aggForDiv({
      equity_weight: 0.60, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05,
    });
    expect(scoreDiversification(agg).score).toBe(8);
  });

  test("returns 6 for 3 buckets", () => {
    const agg = aggForDiv({
      equity_weight: 0.70, international_weight: 0.15, fixed_income_weight: 0.15,
    });
    expect(scoreDiversification(agg).score).toBe(6);
  });

  test("returns 4 for 2 buckets", () => {
    const agg = aggForDiv({ equity_weight: 0.80, fixed_income_weight: 0.20 });
    expect(scoreDiversification(agg).score).toBe(4);
  });

  test("returns 2 for ≤ 1 bucket", () => {
    const agg = aggForDiv({ equity_weight: 1.0 });
    expect(scoreDiversification(agg).score).toBe(2);
  });

  test("subtracts 1 per duplicate_group", () => {
    const agg = aggForDiv({
      equity_weight: 0.55, international_weight: 0.15, fixed_income_weight: 0.20,
      balanced_weight: 0.05, individual_stock_weight: 0.05,
      duplicate_groups: [{ label: "x", tickers: ["A", "B"], combined_weight: 0.3 }],
    });
    expect(scoreDiversification(agg).score).toBe(9);
  });

  test("end-to-end: real portfolio with international + individual stock", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 500, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "TSLA", market_value: 100, asset_class: "individual_stock" }),
        makeHolding({ ticker: "FXNAX", market_value: 150, asset_class: "us_bond_aggregate" }),
        makeHolding({ ticker: "VWENX", market_value: 50, asset_class: "balanced" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    // us_equity = equity_weight (0.60: FSKAX + TSLA) - individual_stock_weight (0.10) = 0.50
    // international = 0.20, fixed_income = 0.15, balanced = 0.05, individual_stock = 0.10
    // All 5 buckets >= 3% → score 10
    expect(scoreDiversification(agg).score).toBe(10);
  });
});

function aggForBond(fi: number): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 5,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 1 - fi,
    fixed_income_weight: fi,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: [],
  };
}

describe("scoreBondBalance", () => {
  test("returns 9 for Late Cycle when FI is 18–30%", () => {
    const agg = aggForBond(0.22);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(9);
  });

  test("returns 9 for Mid Cycle when FI is 15–25%", () => {
    const agg = aggForBond(0.20);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Mid Cycle" })).score).toBe(9);
  });

  test("returns 9 for Recession when FI is 25–40%", () => {
    const agg = aggForBond(0.30);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Recession" })).score).toBe(9);
  });

  test("returns 7 for slightly below target (>= 0.8x min)", () => {
    const agg = aggForBond(0.15);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(7);
  });

  test("returns 5 for half target", () => {
    const agg = aggForBond(0.10);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(5);
  });

  test("returns 3 for severely underweight", () => {
    const agg = aggForBond(0.05);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(3);
  });

  test("returns 7 when over the target range (overweight penalty is mild)", () => {
    const agg = aggForBond(0.50);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Late Cycle" })).score).toBe(7);
  });

  test("unknown regime falls back to 15–25% target", () => {
    const agg = aggForBond(0.20);
    expect(scoreBondBalance(agg, makeMacro({ market_regime: "Unknown" })).score).toBe(9);
  });

  it("VWENX-heavy portfolio has its FI contribution counted toward Bond Balance", () => {
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
    const macro = makeMacro({ market_regime: "Late Cycle" });
    const agg = computeAggregates(p);
    const result = scoreBondBalance(agg, macro);
    // 35% FI vs. 18-30% Late Cycle target → above range, score 7
    expect(result.display_value).toMatch(/35\.0% FI/);
    expect(result.score).toBeGreaterThanOrEqual(7);
  });
});

function aggForMacro(sectors: { sector_tag: string; tickers: string[]; combined_weight: number }[]): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 5,
    duplicate_groups: [],
    cross_account_groups: [],
    top3_weight: 0,
    top3_tickers: [],
    cash_weight: 0,
    idle_cash_weight: 0,
    constrained_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    international_weight: 0,
    equity_weight: 0,
    fixed_income_weight: 0,
    individual_stock_weight: 0,
    balanced_weight: 0,
    sector_holdings: sectors,
  };
}

describe("scoreMacroAlignment", () => {
  test("baseline 5 when no sector tilts and no overweight matches", () => {
    const agg = aggForMacro([]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_overweight: [], sector_underweight: [] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(5);
  });

  test("+1 per aligned overweight sector held ≥ 1%", () => {
    const agg = aggForMacro([{ sector_tag: "utilities", tickers: ["XLU"], combined_weight: 0.02 }]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_overweight: ["utilities"] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(6);
  });

  test("−1.5 per underweight sector held ≥ 3%", () => {
    const agg = aggForMacro([{ sector_tag: "consumer_discretionary", tickers: ["XLY"], combined_weight: 0.05 }]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_underweight: ["consumer_discretionary"] });
    expect(scoreMacroAlignment(agg, macro).score).toBeCloseTo(3.5, 6);
  });

  test("score is clamped to 1..10", () => {
    const agg = aggForMacro([
      { sector_tag: "x1", tickers: ["A"], combined_weight: 0.05 },
      { sector_tag: "x2", tickers: ["B"], combined_weight: 0.05 },
      { sector_tag: "x3", tickers: ["C"], combined_weight: 0.05 },
      { sector_tag: "x4", tickers: ["D"], combined_weight: 0.05 },
      { sector_tag: "x5", tickers: ["E"], combined_weight: 0.05 },
    ]);
    const macro = makeMacro({ market_regime: "Mid Cycle", sector_underweight: ["x1", "x2", "x3", "x4", "x5"] });
    expect(scoreMacroAlignment(agg, macro).score).toBe(1);
  });

  test("display_value mentions the regime", () => {
    const agg = aggForMacro([]);
    const macro = makeMacro({ market_regime: "Late Cycle" });
    expect(scoreMacroAlignment(agg, macro).display_value).toContain("Late Cycle");
  });
});

describe("scoreSingleStockRisk", () => {
  test("returns 10 / green when portfolio holds no individual stocks", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBe(10);
    expect(s.rating).toBe("green");
    expect(s.display_value).toBe("No individual stocks");
  });

  test("clean stock (P/E 20, positive EPS, beta 1) → no penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "BRK-B", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 20, eps_growth_yoy: 0.10, beta: 0.9, revenue_growth_yoy: 0.05 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreSingleStockRisk(portfolio, agg).score).toBe(10);
  });

  test("extreme P/E (>100) + declining EPS triggers heavy penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "TSLA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8, revenue_growth_yoy: -0.03 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBeLessThan(5);
    expect(s.display_value).toContain("TSLA");
  });

  test("elevated P/E (>50) but otherwise healthy → mild penalty", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({
          ticker: "NVDA", market_value: 200, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, eps_growth_yoy: 0.50, beta: 1.2, revenue_growth_yoy: 0.40 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.score).toBe(9);
  });

  test("display_value lists all flagged tickers comma-separated", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 700 }),
        makeHolding({
          ticker: "TSLA", market_value: 150, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 410, eps_growth_yoy: -0.47, beta: 1.8 }),
        }),
        makeHolding({
          ticker: "NVDA", market_value: 150, asset_class: "individual_stock",
          stock_metrics: makeStockMetrics({ pe_ratio: 55, beta: 2.2 }),
        }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreSingleStockRisk(portfolio, agg);
    expect(s.display_value).toContain("TSLA");
    expect(s.display_value).toContain("NVDA");
  });
});

describe("scoreQualityTilt", () => {
  test("returns low score (≤ 5) when no quality tickers held", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "TSLA", market_value: 1000, asset_class: "individual_stock" })],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreQualityTilt(portfolio, agg).score).toBeLessThanOrEqual(2);
  });

  test("returns higher score when BRK-B + VWENX both held at meaningful weights", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600 }),
        makeHolding({ ticker: "BRK-B", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "VWENX", market_value: 200, asset_class: "balanced" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreQualityTilt(portfolio, agg);
    expect(s.score).toBeGreaterThanOrEqual(7);
    expect(s.display_value).toBe("Strong defensive tilt");
  });

  test("medium tilt for partial defensive holdings", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 800 }),
        makeHolding({ ticker: "XLU", market_value: 200, asset_class: "us_equity_sector", sector_tag: "utilities" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const s = scoreQualityTilt(portfolio, agg);
    expect(s.score).toBeGreaterThanOrEqual(5);
    expect(s.score).toBeLessThanOrEqual(7);
  });

  test("score capped at 10", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "BRK-B", market_value: 200, asset_class: "individual_stock" }),
        makeHolding({ ticker: "VWENX", market_value: 200, asset_class: "balanced" }),
        makeHolding({ ticker: "XLV", market_value: 200, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "XLU", market_value: 200, asset_class: "us_equity_sector" }),
        makeHolding({ ticker: "XLP", market_value: 200, asset_class: "us_equity_sector" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    expect(scoreQualityTilt(portfolio, agg).score).toBe(10);
  });
});

describe("scoreToGrade", () => {
  test.each([
    [9.5, "A+"], [8.8, "A"], [8.2, "A−"], [7.8, "B+"], [7.2, "B"],
    [6.7, "B−"], [6.2, "C+"], [5.7, "C"], [5.2, "C−"], [4.7, "D+"],
    [4.2, "D"], [3.0, "F"],
  ])("score %f → grade %s", (score, grade) => {
    expect(scoreToGrade(score)).toBe(grade);
  });

  test("grade for boundary case 9.0", () => {
    expect(scoreToGrade(9.0)).toBe("A+");
  });
});

describe("computePortfolioScore", () => {
  test("weighted sum of dimension scores", () => {
    const dimensions: DimensionScore[] = [
      { id: "a", label: "A", score: 10, rating: "green", display_value: "", note: "", weight: 0.5 },
      { id: "b", label: "B", score: 4,  rating: "red",   display_value: "", note: "", weight: 0.5 },
    ];
    expect(computePortfolioScore(dimensions)).toBe(7);
  });
});

describe("scoreAllDimensions", () => {
  test("returns 10 dimension scores for a sample portfolio", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FSKAX", market_value: 600, asset_class: "us_equity_total_market" }),
        makeHolding({ ticker: "FTIHX", market_value: 200, asset_class: "international_equity" }),
        makeHolding({ ticker: "FXNAX", market_value: 200, asset_class: "us_bond_aggregate" }),
      ],
    });
    const agg = computeAggregates(portfolio);
    const macro = makeMacro();
    const dims = scoreAllDimensions(portfolio, agg, macro);
    expect(dims).toHaveLength(11);
    const ids = dims.map(d => d.id).sort();
    expect(ids).toEqual([
      "asset_location", "bond_balance", "cash_efficiency", "concentration", "cost_efficiency",
      "diversification", "international", "macro_alignment", "quality_tilt",
      "simplicity", "single_stock_risk",
    ]);
  });

  test("dimension weights sum to 1.0 (within rounding)", () => {
    const portfolio = makePortfolio({ holdings: [makeHolding({ ticker: "FSKAX" })] });
    const agg = computeAggregates(portfolio);
    const dims = scoreAllDimensions(portfolio, agg, makeMacro());
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 2);
  });
});

describe("scoreSimplicity ignores cross-account duplicates for effective count", () => {
  it("FSKAX in Fidelity + VTSAX in Vanguard counts as 1 effective position, not 2", () => {
    const agg = {
      holding_count: 2,
      duplicate_groups: [],
      cross_account_groups: [
        {
          asset_class: "us_equity_total_market" as const,
          label: "us equity total market",
          tickers_by_account: [
            { account_id: "fid", ticker: "FSKAX" },
            { account_id: "vng", ticker: "VTSAX" },
          ],
          combined_weight: 0.5,
        },
      ],
      // minimum stub fields for the function (it only reads the above three):
      total_value: 1, blended_expense_ratio: 0, top3_weight: 0, top3_tickers: [],
      international_weight: 0, cash_weight: 0, idle_cash_weight: 0,
      constrained_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
      equity_weight: 0, fixed_income_weight: 0, individual_stock_weight: 0,
      balanced_weight: 0, sector_holdings: [],
    } as unknown as PortfolioAggregates;
    const result = scoreSimplicity(agg);
    // effective = holding_count - extraSameAccount - extraCrossAccount
    //           = 2 - 0 - 1 = 1
    expect(result.display_value).toMatch(/1 effective/);
  });
});

describe("scoreDiversification does not penalize cross-account groups", () => {
  it("Two FSKAX/VTSAX cross-account holdings don't subtract from the score", () => {
    const agg = {
      equity_weight: 0.6,
      international_weight: 0.15,
      fixed_income_weight: 0.20,
      balanced_weight: 0.0,
      individual_stock_weight: 0.05,
      duplicate_groups: [],
      cross_account_groups: [
        {
          asset_class: "us_equity_total_market" as const,
          label: "us equity total market",
          tickers_by_account: [
            { account_id: "fid", ticker: "FSKAX" },
            { account_id: "vng", ticker: "VTSAX" },
          ],
          combined_weight: 0.6,
        },
      ],
    } as unknown as PortfolioAggregates;
    const result = scoreDiversification(agg);
    expect(result.score).toBeGreaterThanOrEqual(8);
  });
});

describe("scoreAssetLocation", () => {
  it("returns neutral score when no account config is provided", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "FSKAX", market_value: 1000, asset_class: "us_equity_total_market", account_id: "fid" }),
    ]});
    const result = scoreAssetLocation(p, undefined);
    expect(result.score).toBe(7);
  });

  it("penalizes individual stocks held in pre-tax (locks LTCG into ordinary income)", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "TSLA", market_value: 100, asset_class: "individual_stock", account_id: "fid_401k" }),
      makeHolding({ ticker: "FSKAX", market_value: 900, asset_class: "us_equity_total_market", account_id: "vng_roth" }),
    ]});
    const accounts = {
      accounts: [
        makeAccount({ id: "fid_401k", account_type: "pretax_ira" }),
        makeAccount({ id: "vng_roth", account_type: "roth_ira" }),
      ],
    };
    const result = scoreAssetLocation(p, accounts);
    expect(result.score).toBeLessThan(7);
  });

  it("rewards growth equity placed in Roth (highest-growth in tax-free account)", () => {
    const pBad = makePortfolio({ holdings: [
      makeHolding({ ticker: "QQQ", market_value: 1000, asset_class: "us_equity_large_cap_growth", account_id: "fid_401k" }),
    ]});
    const pGood = makePortfolio({ holdings: [
      makeHolding({ ticker: "QQQ", market_value: 1000, asset_class: "us_equity_large_cap_growth", account_id: "vng_roth" }),
    ]});
    const accounts = {
      accounts: [
        makeAccount({ id: "fid_401k", account_type: "pretax_ira" }),
        makeAccount({ id: "vng_roth", account_type: "roth_ira" }),
      ],
    };
    const bad = scoreAssetLocation(pBad, accounts).score;
    const good = scoreAssetLocation(pGood, accounts).score;
    expect(good).toBeGreaterThan(bad);
  });

  it("score is clamped to [1, 10]", () => {
    const p = makePortfolio({ holdings: [
      makeHolding({ ticker: "TSLA", market_value: 1000, asset_class: "individual_stock", account_id: "fid_401k" }),
    ]});
    const accounts = { accounts: [ makeAccount({ id: "fid_401k", account_type: "pretax_ira" }) ] };
    const result = scoreAssetLocation(p, accounts);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(10);
  });
});

describe("computePortfolioScore renormalization", () => {
  function dim(id: string, score: number, weight: number): DimensionScore {
    return { id, label: id, score, rating: "green", display_value: "", note: "", weight };
  }

  it("is unchanged for a full set whose weights already sum to 1.0", () => {
    const dims = [dim("a", 8, 0.5), dim("b", 6, 0.5)];
    expect(computePortfolioScore(dims)).toBeCloseTo(7, 5);
  });

  it("normalizes by the sum of weights when a dimension is dropped", () => {
    // (8*0.11 + 6*0.07) / (0.11 + 0.07) = 1.30 / 0.18 = 7.2222...
    const dims = [dim("a", 8, 0.11), dim("b", 6, 0.07)];
    expect(computePortfolioScore(dims)).toBeCloseTo(7.2222, 3);
  });

  it("returns 0 for an empty dimension list", () => {
    expect(computePortfolioScore([])).toBe(0);
  });
});
