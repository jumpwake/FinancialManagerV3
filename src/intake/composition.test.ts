import { describe, it, expect } from "vitest";
import { glidePathComposition, extractTargetYear } from "./composition";

describe("glidePathComposition", () => {
  it("a 2040 fund today (2026) is roughly 80/20 equity/FI", () => {
    const c = glidePathComposition(2040, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.80, 1);
    expect(c.fixed_income).toBeCloseTo(0.20, 1);
    expect(c.us_equity + c.international_equity + c.fixed_income + c.cash).toBeCloseTo(1.0, 3);
  });

  it("a 2025 fund today (2026) is roughly 50/50", () => {
    const c = glidePathComposition(2025, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.50, 1);
    expect(c.fixed_income).toBeCloseTo(0.45, 1);
    expect(c.cash).toBeCloseTo(0.05, 2);
  });

  it("after target date (10y past), tilts conservative — equity ~30%", () => {
    const c = glidePathComposition(2015, 2026);
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.30, 1);
  });

  it("returns ratios that sum to 1.0", () => {
    const c = glidePathComposition(2050, 2026);
    expect(c.us_equity + c.international_equity + c.fixed_income + c.cash)
      .toBeCloseTo(1.0, 3);
  });

  it("international equity is ~25% of equity portion (Vanguard target-date norm)", () => {
    const c = glidePathComposition(2050, 2026);
    const equity = c.us_equity + c.international_equity;
    if (equity > 0) {
      expect(c.international_equity / equity).toBeCloseTo(0.25, 1);
    }
  });
});

describe("extractTargetYear", () => {
  it("pulls year from 'Vanguard Target Retirement 2040 Fund'", () => {
    expect(extractTargetYear("Vanguard Target Retirement 2040 Fund")).toBe(2040);
  });

  it("pulls year from 'Fidelity Freedom 2050 Fund'", () => {
    expect(extractTargetYear("Fidelity Freedom 2050 Fund")).toBe(2050);
  });

  it("returns null when no 4-digit year present", () => {
    expect(extractTargetYear("Wellington Fund")).toBeNull();
  });

  it("returns null for years outside plausible range", () => {
    expect(extractTargetYear("Fund 1850 archive")).toBeNull();
    expect(extractTargetYear("Fund 2200 ridiculous")).toBeNull();
  });
});
