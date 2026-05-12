import { describe, test, expect } from "vitest";
import { REFERENCE_MODELS } from "./benchmarks";
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./dimensions";
import { computeAggregates } from "./aggregates";
import { makeHolding, makePortfolio } from "../../tests/fixtures/samplePortfolio";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import { DimensionScore } from "../types";

const WEIGHTS_FOR_TEST: Record<string, number> = {
  cost_efficiency: 0.10,
  diversification: 0.12,
  cash_efficiency: 0.12,
  macro_alignment: 0.10,
  single_stock_risk: 0.12,
  simplicity: 0.08,
  bond_balance: 0.12,
  concentration: 0.12,
  international: 0.06,
  quality_tilt: 0.06,
};

describe("REFERENCE_MODELS", () => {
  test("contains exactly 3 models", () => {
    expect(REFERENCE_MODELS).toHaveLength(3);
  });

  test("each model has the 4 required top-level fields", () => {
    for (const model of REFERENCE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
      expect(model.grade).toBeTruthy();
      expect(model.score).toBeGreaterThan(0);
      expect(model.score).toBeLessThanOrEqual(10);
    }
  });

  test("each model has a score for every dimension ID used by the engine", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "FSKAX", market_value: 1000 })],
    });
    const dims = scoreAllDimensions(portfolio, computeAggregates(portfolio), makeMacro());
    const engineDimIds = dims.map(d => d.id).sort();

    for (const model of REFERENCE_MODELS) {
      const modelDimIds = Object.keys(model.dimension_scores).sort();
      expect(modelDimIds).toEqual(engineDimIds);
    }
  });

  test("model IDs are unique", () => {
    const ids = REFERENCE_MODELS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("expected model labels are present", () => {
    const labels = REFERENCE_MODELS.map(m => m.label);
    expect(labels).toContain("Boglehead 3-fund");
    expect(labels).toContain("All Weather");
    expect(labels).toContain("Classic 60/40");
  });

  test("each model's declared score equals computePortfolioScore over its dimension_scores", () => {
    for (const model of REFERENCE_MODELS) {
      const dims: DimensionScore[] = Object.entries(model.dimension_scores).map(([id, score]) => ({
        id,
        label: id,
        score,
        rating: score >= 7.5 ? "green" as const : score >= 5 ? "yellow" as const : "red" as const,
        display_value: "",
        note: "",
        weight: WEIGHTS_FOR_TEST[id]!,
      }));
      const computed = computePortfolioScore(dims);
      expect(model.score).toBeCloseTo(computed, 2);
    }
  });

  test("each model's grade equals scoreToGrade(score)", () => {
    for (const model of REFERENCE_MODELS) {
      expect(model.grade).toBe(scoreToGrade(model.score));
    }
  });
});
