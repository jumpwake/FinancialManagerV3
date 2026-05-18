import type { UserProfile, MacroContext, RiskTolerance } from "../types";

/** Every dimension the engine can score. The single source of truth for the full set. */
export const ALL_DIMENSION_IDS = [
  "cost_efficiency",
  "diversification",
  "cash_efficiency",
  "macro_alignment",
  "single_stock_risk",
  "simplicity",
  "bond_balance",
  "concentration",
  "international",
  "quality_tilt",
  "asset_location",
] as const;

/** Regime-only FI targets — used when there is no user profile. */
export const FI_TARGETS_BY_REGIME: Record<string, { min: number; max: number }> = {
  "Late Cycle": { min: 0.18, max: 0.30 },
  "Mid Cycle": { min: 0.15, max: 0.25 },
  "Early Cycle": { min: 0.10, max: 0.20 },
  "Recession": { min: 0.25, max: 0.40 },
};

export const DEFAULT_FI_TARGET = { min: 0.15, max: 0.25 };

export interface DroppedDimension {
  id: string;
  label: string;
  reason: string;
}

export interface ScoringProfile {
  activeDimensionIds: Set<string>;
  droppedDimensions: DroppedDimension[];
  fiTarget: { min: number; max: number };
  cashLeniency: number;            // multiplier on idle-cash thresholds
  concentrationShift: number;      // pp (as a fraction) added to top-3 thresholds
  singleStockPenaltyScale: number; // multiplier on single-stock penalties
  qualityTiltRelaxed: boolean;
}

/** A context-free neutral profile — the default for scorers when none is threaded in. */
export const NEUTRAL_SCORING_PROFILE: ScoringProfile = {
  activeDimensionIds: new Set(ALL_DIMENSION_IDS),
  droppedDimensions: [],
  fiTarget: DEFAULT_FI_TARGET,
  cashLeniency: 1,
  concentrationShift: 0,
  singleStockPenaltyScale: 1,
  qualityTiltRelaxed: false,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Round to cents to avoid binary-float noise in the target range. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ageBandCenterFI(age: number): number {
  if (age < 30) return 0.05;
  if (age < 40) return 0.12;
  if (age < 50) return 0.20;
  if (age < 60) return 0.28;
  if (age < 70) return 0.36;
  return 0.42;
}

const RISK_FI_SHIFT: Record<RiskTolerance, number> = {
  conservative: 0.10,
  moderately_conservative: 0.05,
  moderate: 0,
  moderately_aggressive: -0.06,
  aggressive: 0, // unused once bond_balance is dropped for aggressive profiles
};

const REGIME_FI_NUDGE: Record<string, number> = {
  "Recession": 0.05,
  "Late Cycle": 0.02,
  "Mid Cycle": 0,
  "Early Cycle": -0.03,
};

function computeFiTarget(profile: UserProfile, macro: MacroContext): { min: number; max: number } {
  const center = clamp(
    ageBandCenterFI(profile.age) +
      RISK_FI_SHIFT[profile.risk_tolerance] +
      (REGIME_FI_NUDGE[macro.market_regime] ?? 0),
    0,
    0.55,
  );
  return { min: round2(Math.max(0, center - 0.05)), max: round2(center + 0.05) };
}

const RISK_CASH_MULT: Record<RiskTolerance, number> = {
  conservative: 1.5,
  moderately_conservative: 1.25,
  moderate: 1.0,
  moderately_aggressive: 0.85,
  aggressive: 0.7,
};

const RISK_CONCENTRATION_SHIFT: Record<RiskTolerance, number> = {
  conservative: -0.05,
  moderately_conservative: -0.03,
  moderate: 0,
  moderately_aggressive: 0.05,
  aggressive: 0.10,
};

const RISK_SINGLE_STOCK_SCALE: Record<RiskTolerance, number> = {
  conservative: 1.4,
  moderately_conservative: 1.2,
  moderate: 1.0,
  moderately_aggressive: 0.8,
  aggressive: 0.6,
};

/** Returns the reason bond_balance is dropped, or null when it stays graded. */
function bondDropReason(profile: UserProfile): string | null {
  if (profile.risk_tolerance === "aggressive") {
    return "Aggressive risk profile — fixed income is not part of the target allocation.";
  }
  if (
    profile.age < 35 &&
    (profile.risk_tolerance === "moderate" || profile.risk_tolerance === "moderately_aggressive")
  ) {
    return "Long horizon (under 35) with an above-conservative risk profile — bonds are de-emphasized.";
  }
  return null;
}

export function deriveScoringProfile(
  profile: UserProfile | null,
  macro: MacroContext,
): ScoringProfile {
  if (profile === null) {
    return {
      ...NEUTRAL_SCORING_PROFILE,
      activeDimensionIds: new Set(ALL_DIMENSION_IDS),
      droppedDimensions: [],
      fiTarget: FI_TARGETS_BY_REGIME[macro.market_regime] ?? DEFAULT_FI_TARGET,
    };
  }

  const cashLeniency =
    RISK_CASH_MULT[profile.risk_tolerance] * (profile.age >= 60 ? 1.3 : 1.0);

  const dropReason = bondDropReason(profile);
  const droppedDimensions: DroppedDimension[] = dropReason
    ? [{ id: "bond_balance", label: "Bond balance", reason: dropReason }]
    : [];
  const droppedIds = new Set(droppedDimensions.map((d) => d.id));
  const activeDimensionIds = new Set(
    ALL_DIMENSION_IDS.filter((id) => !droppedIds.has(id)),
  );

  return {
    activeDimensionIds,
    droppedDimensions,
    fiTarget: computeFiTarget(profile, macro),
    cashLeniency,
    concentrationShift: RISK_CONCENTRATION_SHIFT[profile.risk_tolerance],
    singleStockPenaltyScale: RISK_SINGLE_STOCK_SCALE[profile.risk_tolerance],
    qualityTiltRelaxed: profile.risk_tolerance === "aggressive",
  };
}
