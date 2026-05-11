import { describe, test, expect } from "vitest";
import { scoreCostEfficiency } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";
import { PortfolioAggregates } from "../types";

function aggWithER(er: number): PortfolioAggregates {
  return { total_value: 1000, blended_expense_ratio: er };
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
