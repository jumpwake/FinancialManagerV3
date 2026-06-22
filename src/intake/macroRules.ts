export interface MacroNumerics {
  federal_funds_rate: number;
  cpi_yoy_headline: number;
  cpi_yoy_core: number;
  yield_curve_spread_10y_2y: number;
  vix: number;
  hy_credit_spread_oas_bps: number;
  lei_consecutive_declines: number;
  ism_manufacturing: number;
  ism_services: number;
}

export type MarketRegime = "Late Cycle" | "Mid Cycle" | "Early Cycle" | "Recession";

export function classifyYieldCurve(spread10y2y: number): string {
  if (spread10y2y < 0) return "inverted";
  if (spread10y2y < 0.5) return "flat";
  return "normal";
}

export function classifyMarketRegime(m: MacroNumerics): MarketRegime {
  // Recession: LEI in sustained decline AND manufacturing contracting hard
  if (m.lei_consecutive_declines >= 6 && m.ism_manufacturing < 47) {
    return "Recession";
  }

  // Late Cycle: curve flat/inverted AND mfg contracting,
  //   OR widening credit spreads with mfg below 50
  const curveSignal = m.yield_curve_spread_10y_2y < 0.5;
  const leiSignal = m.lei_consecutive_declines >= 3;
  const ismContracting = m.ism_manufacturing < 50;
  const creditWidening = m.hy_credit_spread_oas_bps > 400;

  if ((curveSignal || leiSignal) && (ismContracting || creditWidening)) {
    return "Late Cycle";
  }

  // Early Cycle: steep curve with strong expansion
  if (m.yield_curve_spread_10y_2y > 1.5 && m.ism_manufacturing > 53) {
    return "Early Cycle";
  }

  return "Mid Cycle";
}

/**
 * Canonical GICS-style sector vocabulary. A holding's `sector_tag` and every
 * string in SECTOR_TILTS must be drawn from this set — macro-alignment scoring
 * joins the two by exact string match (`dimensions.ts` sector tilt loop), so a
 * tilt string outside this vocabulary can never match a holding and is dead.
 * Keep in sync with the sector list in the ticker classifier prompt
 * (`tickerClassifier.ts`).
 */
export const SECTOR_TAGS = [
  "utilities",
  "healthcare",
  "technology",
  "consumer_staples",
  "industrials",
  "energy",
  "financials",
  "real_estate",
  "materials",
  "communication_services",
  "consumer_discretionary",
] as const;

const SECTOR_TILTS: Record<MarketRegime, { overweight: string[]; underweight: string[] }> = {
  "Late Cycle": {
    overweight: ["healthcare", "consumer_staples", "utilities"],
    underweight: ["consumer_discretionary", "real_estate"],
  },
  "Mid Cycle": {
    overweight: ["technology", "industrials", "financials"],
    underweight: ["utilities", "consumer_staples"],
  },
  "Early Cycle": {
    overweight: ["consumer_discretionary", "financials", "industrials"],
    underweight: ["utilities", "consumer_staples"],
  },
  Recession: {
    overweight: ["consumer_staples", "utilities", "healthcare"],
    underweight: ["consumer_discretionary", "financials", "real_estate"],
  },
};

export function sectorTiltsFor(regime: MarketRegime): { overweight: string[]; underweight: string[] } {
  return SECTOR_TILTS[regime];
}
