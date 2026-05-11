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
  });
});
