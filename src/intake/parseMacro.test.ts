import { describe, test, expect } from "vitest";
import { parseMacro } from "./parseMacro";

const VALID_MACRO = {
  snapshot_date: "2026-05-10",
  federal_funds_rate: 4.75,
  cpi_yoy_headline: 2.8,
  cpi_yoy_core: 2.6,
  yield_curve_spread_10y_2y: -0.12,
  yield_curve_status: "inverted",
  vix: 18.4,
  hy_credit_spread_oas_bps: 345,
  lei_consecutive_declines: 6,
  ism_manufacturing: 49.2,
  ism_services: 53.1,
  market_regime: "Late Cycle",
  sector_overweight: ["healthcare"],
  sector_underweight: ["consumer_discretionary"],
};

describe("parseMacro", () => {
  test("accepts a valid macro object", () => {
    const m = parseMacro(VALID_MACRO);
    expect(m.market_regime).toBe("Late Cycle");
    expect(m.lei_consecutive_declines).toBe(6);
  });

  test("rejects missing federal_funds_rate", () => {
    const { federal_funds_rate, ...bad } = VALID_MACRO;
    expect(() => parseMacro(bad)).toThrow();
  });

  test("rejects non-array sector_overweight", () => {
    const bad = { ...VALID_MACRO, sector_overweight: "healthcare" };
    expect(() => parseMacro(bad)).toThrow();
  });

  test("loads the dev doc sample data/macro.json", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/macro.json"), "utf-8"));
    expect(() => parseMacro(raw)).not.toThrow();
  });
});
