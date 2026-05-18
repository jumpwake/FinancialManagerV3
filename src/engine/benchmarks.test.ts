import { describe, test, it, expect } from "vitest";
import { buildReferenceModels } from "./benchmarks";
import { scoreToGrade, computePortfolioScore } from "./dimensions";
import { ALL_DIMENSION_IDS } from "./riskProfile";
import { DimensionScore } from "../types";

const ALL = new Set<string>(ALL_DIMENSION_IDS);

const WEIGHTS: Record<string, number> = {
  cost_efficiency: 0.09, diversification: 0.11, cash_efficiency: 0.11,
  macro_alignment: 0.09, single_stock_risk: 0.11, simplicity: 0.07,
  bond_balance: 0.11, concentration: 0.11, international: 0.06,
  quality_tilt: 0.06, asset_location: 0.08,
};

describe("buildReferenceModels — full dimension set", () => {
  const models = buildReferenceModels(ALL);

  test("contains exactly 3 models", () => {
    expect(models).toHaveLength(3);
  });

  test("expected model labels are present", () => {
    const labels = models.map((m) => m.label);
    expect(labels).toContain("Boglehead 3-fund");
    expect(labels).toContain("All Weather");
    expect(labels).toContain("Classic 60/40");
  });

  test("each model scores all 11 dimensions with a score in (0, 10]", () => {
    for (const m of models) {
      expect(Object.keys(m.dimension_scores).sort()).toEqual([...ALL].sort());
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThanOrEqual(10);
    }
  });

  test("each model's score equals computePortfolioScore over its dimension_scores", () => {
    for (const m of models) {
      const dims: DimensionScore[] = Object.entries(m.dimension_scores).map(([id, score]) => ({
        id, label: id, score, rating: "green" as const, display_value: "", note: "",
        weight: WEIGHTS[id] ?? 0,
      }));
      expect(m.score).toBeCloseTo(computePortfolioScore(dims), 2);
    }
  });

  test("each model's grade equals scoreToGrade(score)", () => {
    for (const m of models) {
      expect(m.grade).toBe(scoreToGrade(m.score));
    }
  });
});

describe("buildReferenceModels — reduced dimension set", () => {
  it("omits dropped dimensions from each model's dimension_scores", () => {
    const reduced = new Set([...ALL].filter((id) => id !== "bond_balance"));
    const models = buildReferenceModels(reduced);
    for (const m of models) {
      expect(m.dimension_scores).not.toHaveProperty("bond_balance");
      expect(Object.keys(m.dimension_scores)).toHaveLength(10);
    }
  });

  it("re-derives the score over the reduced set (normalized by remaining weight)", () => {
    const reduced = new Set([...ALL].filter((id) => id !== "bond_balance"));
    const models = buildReferenceModels(reduced);
    for (const m of models) {
      const dims: DimensionScore[] = Object.entries(m.dimension_scores).map(([id, score]) => ({
        id, label: id, score, rating: "green" as const, display_value: "", note: "",
        weight: WEIGHTS[id] ?? 0,
      }));
      expect(m.score).toBeCloseTo(computePortfolioScore(dims), 2);
    }
  });
});
