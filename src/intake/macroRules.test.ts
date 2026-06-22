import { describe, test, expect } from "vitest";
import {
  classifyYieldCurve,
  classifyMarketRegime,
  sectorTiltsFor,
  SECTOR_TAGS,
  type MacroNumerics,
} from "./macroRules";

const MID_CYCLE_BASE: MacroNumerics = {
  federal_funds_rate: 3.5,
  cpi_yoy_headline: 2.5,
  cpi_yoy_core: 2.3,
  yield_curve_spread_10y_2y: 1.0,
  vix: 15.0,
  hy_credit_spread_oas_bps: 320,
  lei_consecutive_declines: 0,
  ism_manufacturing: 52.0,
  ism_services: 54.0,
};

describe("classifyYieldCurve", () => {
  test("returns 'inverted' when spread < 0", () => {
    expect(classifyYieldCurve(-0.12)).toBe("inverted");
    expect(classifyYieldCurve(-0.01)).toBe("inverted");
  });

  test("returns 'flat' when 0 <= spread < 0.5", () => {
    expect(classifyYieldCurve(0)).toBe("flat");
    expect(classifyYieldCurve(0.25)).toBe("flat");
    expect(classifyYieldCurve(0.49)).toBe("flat");
  });

  test("returns 'normal' when spread >= 0.5", () => {
    expect(classifyYieldCurve(0.5)).toBe("normal");
    expect(classifyYieldCurve(1.5)).toBe("normal");
    expect(classifyYieldCurve(2.5)).toBe("normal");
  });
});

describe("classifyMarketRegime", () => {
  test("identifies Recession when LEI declines >= 6 AND ISM mfg < 47", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      lei_consecutive_declines: 7,
      ism_manufacturing: 45.0,
    })).toBe("Recession");
  });

  test("does NOT classify Recession when LEI signal present but ISM still above threshold", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      lei_consecutive_declines: 8,
      ism_manufacturing: 48.0,
      yield_curve_spread_10y_2y: 0.2,
    })).toBe("Late Cycle");
  });

  test("identifies Late Cycle on inverted yield curve and contracting ISM mfg", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      yield_curve_spread_10y_2y: -0.2,
      ism_manufacturing: 49.0,
      lei_consecutive_declines: 3,
    })).toBe("Late Cycle");
  });

  test("identifies Late Cycle on flat curve with widening credit spreads", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      yield_curve_spread_10y_2y: 0.3,
      hy_credit_spread_oas_bps: 450,
      ism_manufacturing: 49.5,
    })).toBe("Late Cycle");
  });

  test("identifies Early Cycle on steep curve with strong ISM", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      yield_curve_spread_10y_2y: 1.8,
      ism_manufacturing: 55.0,
      lei_consecutive_declines: 0,
    })).toBe("Early Cycle");
  });

  test("identifies Mid Cycle on neutral signals (default)", () => {
    expect(classifyMarketRegime(MID_CYCLE_BASE)).toBe("Mid Cycle");
  });

  test("identifies Mid Cycle on normal yield curve with stable ISM, regardless of low LEI signal", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      yield_curve_spread_10y_2y: 1.0,
      ism_manufacturing: 52.5,
      lei_consecutive_declines: 1,
    })).toBe("Mid Cycle");
  });

  test("Recession takes priority over Late Cycle when both signals present", () => {
    expect(classifyMarketRegime({
      ...MID_CYCLE_BASE,
      yield_curve_spread_10y_2y: -0.5,
      lei_consecutive_declines: 8,
      ism_manufacturing: 44.0,
      hy_credit_spread_oas_bps: 600,
    })).toBe("Recession");
  });
});

describe("sectorTiltsFor", () => {
  test("Late Cycle tilts defensive", () => {
    const tilts = sectorTiltsFor("Late Cycle");
    expect(tilts.overweight).toContain("healthcare");
    expect(tilts.overweight).toContain("consumer_staples");
    expect(tilts.overweight).toContain("utilities");
    expect(tilts.underweight).toContain("consumer_discretionary");
    expect(tilts.underweight).toContain("real_estate");
  });

  test("Recession tilts deeply defensive", () => {
    const tilts = sectorTiltsFor("Recession");
    expect(tilts.overweight).toContain("consumer_staples");
    expect(tilts.overweight).toContain("utilities");
    expect(tilts.underweight).toContain("consumer_discretionary");
    expect(tilts.underweight).toContain("financials");
  });

  test("Early Cycle tilts cyclical", () => {
    const tilts = sectorTiltsFor("Early Cycle");
    expect(tilts.overweight).toContain("consumer_discretionary");
    expect(tilts.overweight).toContain("financials");
    expect(tilts.underweight).toContain("utilities");
    expect(tilts.underweight).toContain("consumer_staples");
  });

  test("Mid Cycle tilts growth-leaning", () => {
    const tilts = sectorTiltsFor("Mid Cycle");
    expect(tilts.overweight).toContain("technology");
    expect(tilts.overweight).toContain("industrials");
    expect(tilts.underweight).toContain("utilities");
  });

  test("returns arrays for all four regimes (no empties)", () => {
    for (const regime of ["Late Cycle", "Mid Cycle", "Early Cycle", "Recession"] as const) {
      const tilts = sectorTiltsFor(regime);
      expect(tilts.overweight.length).toBeGreaterThan(0);
      expect(tilts.underweight.length).toBeGreaterThan(0);
    }
  });

  test("every tilt string is a recognized sector tag (no dead tilts)", () => {
    // A tilt outside SECTOR_TAGS can never match a holding's sector_tag, so it
    // silently does nothing. Guard against reintroducing such dead strings.
    for (const regime of ["Late Cycle", "Mid Cycle", "Early Cycle", "Recession"] as const) {
      const tilts = sectorTiltsFor(regime);
      for (const tag of [...tilts.overweight, ...tilts.underweight]) {
        expect(SECTOR_TAGS, `${regime} tilt "${tag}" is not a recognized sector tag`).toContain(tag);
      }
    }
  });
});
