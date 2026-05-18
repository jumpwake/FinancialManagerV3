import { PortfolioAggregates, DimensionScore, Rating, MacroContext, Portfolio, AccountConfig, AccountType, Holding, taxTreatmentFor } from "../types";
import { FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET, NEUTRAL_SCORING_PROFILE, deriveScoringProfile } from "./riskProfile";
import type { ScoringProfile } from "./riskProfile";

export function toRating(score: number): Rating {
  if (score >= 7.5) return "green";
  if (score >= 5.0) return "yellow";
  return "red";
}

export function scoreCostEfficiency(agg: PortfolioAggregates): DimensionScore {
  const erPct = agg.blended_expense_ratio * 100;
  const score =
    erPct <= 0.05 ? 10 :
    erPct <= 0.10 ? 9 :
    erPct <= 0.20 ? 7 :
    erPct <= 0.35 ? 5 :
    erPct <= 0.50 ? 3 : 1;

  return {
    id: "cost_efficiency",
    label: "Cost efficiency",
    score,
    rating: toRating(score),
    display_value: `~${erPct.toFixed(2)}% blended ER`,
    note: "Blended expense ratio across all fund holdings",
    weight: 0.09,
  };
}

export function scoreSimplicity(agg: PortfolioAggregates): DimensionScore {
  const extraFromSameAccountDups = agg.duplicate_groups.reduce(
    (sum, g) => sum + (g.tickers.length - 1),
    0,
  );
  const extraFromCrossAccount = agg.cross_account_groups.reduce(
    (sum, g) => sum + (g.tickers_by_account.length - 1),
    0,
  );
  const effective = agg.holding_count - extraFromSameAccountDups - extraFromCrossAccount;

  const score =
    effective <= 5  ? 10 :
    effective <= 8  ? 8 :
    effective <= 12 ? 6 :
    effective <= 16 ? 4 : 2;

  return {
    id: "simplicity",
    label: "Simplicity",
    score,
    rating: toRating(score),
    display_value: effective !== agg.holding_count
      ? `${effective} effective positions (${agg.holding_count} across accounts)`
      : `${effective} holdings`,
    note: "Cross-broker duplicates (FSKAX≡VTSAX, XLV in two accounts, etc.) count once",
    weight: 0.07,
  };
}

export function scoreConcentration(
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const t3 = agg.top3_weight;
  const shift = sp.concentrationShift;
  const score =
    t3 <= 0.35 + shift ? 10 :
    t3 <= 0.45 + shift ? 8 :
    t3 <= 0.55 + shift ? 6 :
    t3 <= 0.65 + shift ? 4 : 2;

  return {
    id: "concentration",
    label: "Concentration",
    score,
    rating: toRating(score),
    display_value: `Top 3: ${(t3 * 100).toFixed(1)}% (${agg.top3_tickers.join(", ")})`,
    note: "Top-3 holding weight as share of total portfolio",
    weight: 0.11,
  };
}

export function scoreInternational(agg: PortfolioAggregates): DimensionScore {
  const intl = agg.international_weight;
  const score =
    intl >= 0.15 && intl <= 0.30 ? 10 :
    intl >= 0.10                 ? 8 :
    intl >= 0.05                 ? 6 :
    intl >= 0.02                 ? 4 : 2;

  return {
    id: "international",
    label: "International exposure",
    score,
    rating: toRating(score),
    display_value: `${(intl * 100).toFixed(1)}% international`,
    note: "Target 15–30% for a globally diversified portfolio",
    weight: 0.06,
  };
}

export function scoreCashEfficiency(
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const idle = agg.idle_cash_weight;
  const L = sp.cashLeniency;
  const score =
    idle <= 0.02 * L ? 10 :
    idle <= 0.05 * L ? 8 :
    idle <= 0.08 * L ? 7 :
    idle <= 0.12 * L ? 5 :
    idle <= 0.20 * L ? 3 : 1;

  const display = agg.pending_cash_weight > 0
    ? `${(idle * 100).toFixed(1)}% idle + ${(agg.pending_cash_weight * 100).toFixed(1)}% pending`
    : `${(idle * 100).toFixed(1)}% idle`;

  return {
    id: "cash_efficiency",
    label: "Cash efficiency",
    score,
    rating: toRating(score),
    display_value: display,
    note: "Pending deployment cash is excluded from penalty — it has an active plan",
    weight: 0.11,
  };
}

export function scoreDiversification(agg: PortfolioAggregates): DimensionScore {
  const buckets: Record<string, number> = {
    us_equity: agg.equity_weight - agg.individual_stock_weight,
    international: agg.international_weight,
    fixed_income: agg.fixed_income_weight,
    balanced: agg.balanced_weight,
    individual_stock: agg.individual_stock_weight,
  };
  const filledBuckets = Object.values(buckets).filter(w => w >= 0.03).length;
  let score = filledBuckets >= 5 ? 10 : filledBuckets === 4 ? 8 : filledBuckets === 3 ? 6 : filledBuckets === 2 ? 4 : 2;
  score = Math.max(1, score - agg.duplicate_groups.length);

  return {
    id: "diversification",
    label: "Diversification",
    score,
    rating: toRating(score),
    display_value: `${filledBuckets} asset buckets`,
    note: "Distinct asset class buckets with ≥ 3% weight; penalized for overlapping funds",
    weight: 0.11,
  };
}

export function scoreMacroAlignment(agg: PortfolioAggregates, macro: MacroContext): DimensionScore {
  let score = 5;
  for (const sh of agg.sector_holdings) {
    if (macro.sector_overweight.includes(sh.sector_tag) && sh.combined_weight >= 0.01) {
      score += 1;
    }
    if (macro.sector_underweight.includes(sh.sector_tag) && sh.combined_weight >= 0.03) {
      score -= 1.5;
    }
  }
  score = Math.max(1, Math.min(10, score));

  return {
    id: "macro_alignment",
    label: "Macro alignment",
    score,
    rating: toRating(score),
    display_value: `${macro.market_regime} regime`,
    note: `Sector tilts vs. macro overweights: ${macro.sector_overweight.join(", ") || "(none)"}`,
    weight: 0.09,
  };
}

export function scoreBondBalance(
  agg: PortfolioAggregates,
  macro: MacroContext,
  sp?: ScoringProfile,
): DimensionScore {
  const fi = agg.fixed_income_weight;
  const target =
    sp?.fiTarget ?? FI_TARGETS_BY_REGIME[macro.market_regime] ?? DEFAULT_FI_TARGET;

  const score =
    fi >= target.min && fi <= target.max ? 9 :
    fi > target.max                      ? 7 :
    fi >= target.min * 0.8               ? 7 :
    fi >= target.min * 0.5               ? 5 : 3;

  return {
    id: "bond_balance",
    label: "Bond balance",
    score,
    rating: toRating(score),
    display_value: `${(fi * 100).toFixed(1)}% FI (target ${(target.min * 100).toFixed(0)}–${(target.max * 100).toFixed(0)}%)`,
    note: `Target range for ${macro.market_regime} regime`,
    weight: 0.11,
  };
}

export function scoreSingleStockRisk(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const total = agg.total_value;
  const stocks = portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics);

  if (stocks.length === 0) {
    return {
      id: "single_stock_risk",
      label: "Single-stock risk",
      score: 10,
      rating: "green",
      display_value: "No individual stocks",
      note: "No single-stock exposure",
      weight: 0.11,
    };
  }

  let totalPenalty = 0;
  const flaggedTickers: string[] = [];
  for (const s of stocks) {
    const m = s.stock_metrics!;
    const w = s.market_value / total;
    let penalty = 0;

    if (m.pe_ratio !== null && m.pe_ratio > 100) penalty += 2;
    else if (m.pe_ratio !== null && m.pe_ratio > 50) penalty += 1;

    if (m.eps_growth_yoy !== null && m.eps_growth_yoy < -0.15) penalty += 1.5;
    if (m.beta !== null && m.beta > 1.5) penalty += 1;
    if (m.revenue_growth_yoy !== null && m.revenue_growth_yoy < 0) penalty += 1;

    if (penalty > 0) {
      flaggedTickers.push(s.ticker);
      const stockShare = agg.individual_stock_weight > 0 ? w / agg.individual_stock_weight : 0;
      totalPenalty += penalty * stockShare;
    }
  }

  const score = Math.max(1, 10 - totalPenalty * sp.singleStockPenaltyScale);

  return {
    id: "single_stock_risk",
    label: "Single-stock risk",
    score,
    rating: toRating(score),
    display_value: flaggedTickers.length > 0 ? `${flaggedTickers.join(", ")} flagged` : "No flags",
    note: "Penalizes stocks with P/E > 100, negative EPS growth, high beta, or declining revenue",
    weight: 0.12,
  };
}

export function scoreToGrade(score: number): string {
  if (score >= 9.0) return "A+";
  if (score >= 8.5) return "A";
  if (score >= 8.0) return "A−";
  if (score >= 7.5) return "B+";
  if (score >= 7.0) return "B";
  if (score >= 6.5) return "B−";
  if (score >= 6.0) return "C+";
  if (score >= 5.5) return "C";
  if (score >= 5.0) return "C−";
  if (score >= 4.5) return "D+";
  if (score >= 4.0) return "D";
  return "F";
}

export function computePortfolioScore(dimensions: DimensionScore[]): number {
  const weightSum = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (weightSum === 0) return 0;
  return dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / weightSum;
}

export function scoreAllDimensions(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
  scoringProfile?: ScoringProfile,
): DimensionScore[] {
  // No profile threaded in → fall back to the regime-only, all-dimensions-active
  // profile, which reproduces today's behavior exactly.
  const sp = scoringProfile ?? deriveScoringProfile(null, macro);

  const all: DimensionScore[] = [
    scoreCostEfficiency(agg),
    scoreDiversification(agg),
    scoreCashEfficiency(agg, sp),
    scoreMacroAlignment(agg, macro),
    scoreSingleStockRisk(portfolio, agg, sp),
    scoreSimplicity(agg),
    scoreBondBalance(agg, macro, sp),
    scoreConcentration(agg, sp),
    scoreInternational(agg),
    scoreQualityTilt(portfolio, agg, sp),
    scoreAssetLocation(portfolio, accounts),
  ];

  return all.filter((d) => sp.activeDimensionIds.has(d.id));
}

const QUALITY_TICKERS: Record<string, number> = {
  "BRK-B": 1.5, "VWENX": 1.5, "XLV": 1.0, "XLU": 1.0,
  "XLP": 1.0, "VFSUX": 0.5, "FXNAX": 0.5, "VBTLX": 0.5,
};

const GROWTH_CLASSES = new Set<string>([
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
]);

export function scoreQualityTilt(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  sp: ScoringProfile = NEUTRAL_SCORING_PROFILE,
): DimensionScore {
  const total = agg.total_value;
  let raw = 0;
  for (const h of portfolio.holdings) {
    if (QUALITY_TICKERS[h.ticker]) {
      const wt = Math.min(2, total > 0 ? (h.market_value / total) / 0.02 : 0);
      raw += QUALITY_TICKERS[h.ticker] * wt;
    }
  }
  const floor = sp.qualityTiltRelaxed ? 5 : 1;
  const score = Math.min(10, Math.max(floor, raw * 2.5));

  return {
    id: "quality_tilt",
    label: "Quality / defensive tilt",
    score,
    rating: toRating(score),
    display_value: score >= 7 ? "Strong defensive tilt" : score >= 5 ? "Moderate" : "Weak",
    note: "Presence of quality/defensive/dividend-oriented holdings",
    weight: 0.06,
  };
}

export function scoreAssetLocation(
  portfolio: Portfolio,
  accounts: AccountConfig | undefined,
): DimensionScore {
  if (!accounts || accounts.accounts.length === 0) {
    return {
      id: "asset_location",
      label: "Asset location",
      score: 7,
      rating: toRating(7),
      display_value: "Neutral (no account model)",
      note: "Set up data/accounts.json with account_type per account to enable tax-aware scoring",
      weight: 0.08,
    };
  }

  const typeById = new Map<string, AccountType>();
  for (const a of accounts.accounts) typeById.set(a.id, a.account_type);

  const total = portfolio.holdings.reduce((s, h) => s + h.market_value, 0);
  const w = (h: Holding) => (total > 0 ? h.market_value / total : 0);

  let raw = 7;

  for (const h of portfolio.holdings) {
    const t = typeById.get(h.account_id);
    if (!t) continue;
    const tax = taxTreatmentFor(t);
    const wt = w(h);

    // Penalties
    if (tax === "taxable_currently" && (h.asset_class === "balanced" || h.asset_class === "target_date")) {
      raw -= wt * 30;
    }
    if (tax === "tax_deferred" && GROWTH_CLASSES.has(h.asset_class)) {
      raw -= wt * 20;
    }
    if (tax === "tax_deferred" && h.asset_class === "individual_stock") {
      raw -= wt * 20;
    }
    if (tax === "tax_free_growth" && h.asset_class === "us_equity_total_market") {
      raw -= wt * 10;
    }

    // Bonuses
    if (tax === "tax_free_growth" && (GROWTH_CLASSES.has(h.asset_class) || h.asset_class === "individual_stock")) {
      raw += wt * 20;
    }
    if (tax === "tax_deferred" && (h.asset_class === "us_bond_aggregate" || h.asset_class === "us_bond_short" || h.asset_class === "us_bond_tips" || h.asset_class === "balanced")) {
      raw += wt * 10;
    }
  }

  const score = Math.max(1, Math.min(10, raw));
  return {
    id: "asset_location",
    label: "Asset location",
    score,
    rating: toRating(score),
    display_value: score >= 8 ? "Strong placement" : score >= 6 ? "Reasonable" : "Inefficient — move tax-heavy assets",
    note: "Tax-efficiency of asset placement across Roth / Pre-Tax / Taxable accounts",
    weight: 0.08,
  };
}
