import { MacroContext } from "../../src/types";

export function makeMacro(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    snapshot_date: "2026-05-11",
    federal_funds_rate: 4.5,
    cpi_yoy_headline: 2.5,
    cpi_yoy_core: 2.4,
    yield_curve_spread_10y_2y: 0.10,
    yield_curve_status: "normal",
    vix: 16.0,
    hy_credit_spread_oas_bps: 320,
    lei_consecutive_declines: 0,
    ism_manufacturing: 51.0,
    ism_services: 53.0,
    market_regime: "Mid Cycle",
    sector_overweight: [],
    sector_underweight: [],
    ...overrides,
  };
}
