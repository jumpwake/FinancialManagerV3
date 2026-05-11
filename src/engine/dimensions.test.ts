import { describe, test, expect } from "vitest";
import { scoreCostEfficiency, scoreSimplicity, scoreConcentration, scoreCashEfficiency, scoreInternational } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";
import { PortfolioAggregates } from "../types";

function aggWithER(er: number): PortfolioAggregates {
  return { total_value: 1000, blended_expense_ratio: er, holding_count: 0, duplicate_groups: [], top3_weight: 0, top3_tickers: [], international_weight: 0, cash_weight: 0, idle_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0 };
}

describe("scoreCostEfficiency", () => {
  test("returns score 10 / green for ER ≤ 0.05%", () => {
    const s = scoreCostEfficiency(aggWithER(0.0003));
    expect(s.id).toBe("cost_efficiency");
    expect(s.score).toBe(10);
    expect(s.rating).toBe("green");
    expect(s.weight).toBe(0.10);
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
    top3_weight: 0,
    top3_tickers: [],
    international_weight: 0,
    cash_weight: 0,
    idle_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
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
    expect(scoreSimplicity(agg).display_value).toBe("8 holdings (7 effective)");
  });
});

function aggForConc(top3: number, tickers: string[] = ["A", "B", "C"]): PortfolioAggregates {
  return {
    total_value: 1000,
    blended_expense_ratio: 0.0002,
    holding_count: 10,
    duplicate_groups: [],
    top3_weight: top3,
    top3_tickers: tickers,
    international_weight: 0,
    cash_weight: 0,
    idle_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
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
    top3_weight: 0,
    top3_tickers: [],
    international_weight: 0,
    cash_weight: idle + pending,
    idle_cash_weight: idle,
    pending_cash_weight: pending,
    pending_cash_value: pending * 1000,
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
    top3_weight: 0,
    top3_tickers: [],
    cash_weight: 0,
    idle_cash_weight: 0,
    pending_cash_weight: 0,
    pending_cash_value: 0,
    international_weight: intl,
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
