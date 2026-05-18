import { describe, it, expect } from "vitest";
import { deriveScoringProfile, NEUTRAL_SCORING_PROFILE, ALL_DIMENSION_IDS } from "./riskProfile";
import { makeMacro } from "../../tests/fixtures/sampleMacro";
import type { UserProfile } from "../types";

describe("deriveScoringProfile — null profile fallback", () => {
  it("activates all 11 dimensions with neutral knobs", () => {
    const sp = deriveScoringProfile(null, makeMacro());
    expect(sp.activeDimensionIds.size).toBe(11);
    expect(sp.droppedDimensions).toEqual([]);
    expect(sp.cashLeniency).toBe(1);
    expect(sp.concentrationShift).toBe(0);
    expect(sp.singleStockPenaltyScale).toBe(1);
    expect(sp.qualityTiltRelaxed).toBe(false);
  });

  it("uses the regime FI target when there is no profile", () => {
    const sp = deriveScoringProfile(null, makeMacro({ market_regime: "Late Cycle" }));
    expect(sp.fiTarget).toEqual({ min: 0.18, max: 0.30 });
  });

  it("NEUTRAL_SCORING_PROFILE activates all 11 dimensions", () => {
    expect(NEUTRAL_SCORING_PROFILE.activeDimensionIds.size).toBe(ALL_DIMENSION_IDS.length);
    expect(ALL_DIMENSION_IDS.length).toBe(11);
  });
});

describe("deriveScoringProfile — FI target age glide path (Moderately Conservative, Mid Cycle)", () => {
  // Moderately Conservative shift = +0.05; Mid Cycle nudge = 0; range = center ± 0.05.
  const macro = makeMacro({ market_regime: "Mid Cycle" });
  const mc = (age: number): UserProfile => ({ age, risk_tolerance: "moderately_conservative" });

  it("age 29 → band center 0.05 → fiTarget {0.05, 0.15}", () => {
    expect(deriveScoringProfile(mc(29), macro).fiTarget).toEqual({ min: 0.05, max: 0.15 });
  });
  it("age 30 → band center 0.12 → fiTarget {0.12, 0.22}", () => {
    expect(deriveScoringProfile(mc(30), macro).fiTarget).toEqual({ min: 0.12, max: 0.22 });
  });
  it("age 49 → band center 0.20 → fiTarget {0.20, 0.30}", () => {
    expect(deriveScoringProfile(mc(49), macro).fiTarget).toEqual({ min: 0.20, max: 0.30 });
  });
  it("age 50 → band center 0.28 → fiTarget {0.28, 0.38}", () => {
    expect(deriveScoringProfile(mc(50), macro).fiTarget).toEqual({ min: 0.28, max: 0.38 });
  });
  it("age 70 → band center 0.42 → fiTarget {0.42, 0.52}", () => {
    expect(deriveScoringProfile(mc(70), macro).fiTarget).toEqual({ min: 0.42, max: 0.52 });
  });
});

describe("deriveScoringProfile — FI target risk + regime shifts", () => {
  it("Conservative at age 45 in Mid Cycle: 0.20 + 0.10 → {0.25, 0.35}", () => {
    const sp = deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, makeMacro({ market_regime: "Mid Cycle" }));
    expect(sp.fiTarget).toEqual({ min: 0.25, max: 0.35 });
  });
  it("Recession nudges the center up by 0.05", () => {
    const sp = deriveScoringProfile({ age: 45, risk_tolerance: "conservative" }, makeMacro({ market_regime: "Recession" }));
    expect(sp.fiTarget).toEqual({ min: 0.30, max: 0.40 });
  });
  it("clamps the center at 0 — a low band + negative shifts never goes below {0, 0.05}", () => {
    const sp = deriveScoringProfile({ age: 25, risk_tolerance: "moderately_aggressive" }, makeMacro({ market_regime: "Early Cycle" }));
    // 0.05 - 0.06 - 0.03 = -0.04 → clamped to 0 → range {0, 0.05}
    expect(sp.fiTarget).toEqual({ min: 0, max: 0.05 });
  });
});
