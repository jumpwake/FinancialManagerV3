import { Portfolio, MacroContext, PortfolioAggregates, Flag, DimensionScore, GapItem, PlanPhase, PlanAction, ScorePoint, AccountConfig, taxTreatmentFor } from "../types";
import { scoreToGrade, FI_TARGETS_BY_REGIME, DEFAULT_FI_TARGET } from "./dimensions";
import { buildFindingKey } from "./findingKeys";

function fiTargetFor(regime: string): { min: number; max: number } {
  return FI_TARGETS_BY_REGIME[regime] ?? DEFAULT_FI_TARGET;
}

function fiTargetPctText(regime: string): string {
  const t = fiTargetFor(regime);
  return `${(t.min * 100).toFixed(0)}–${(t.max * 100).toFixed(0)}%`;
}

function regimeAdjective(regime: string): string {
  if (regime === "Recession") return "recessionary";
  return regime.toLowerCase().replace(/\s+/g, "-");
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function requireDim(dimensions: DimensionScore[], id: string): DimensionScore {
  const d = dimensions.find(d => d.id === id);
  if (!d) {
    const available = dimensions.map(d => d.id).join(", ");
    throw new Error(`generateGapItems: required dimension "${id}" not found in dimensions array. Available: ${available}`);
  }
  return d;
}

export function generateFlags(
  portfolio: Portfolio,
  agg: PortfolioAggregates,
  macro: MacroContext,
  accounts?: AccountConfig,
): Flag[] {
  const flags: Flag[] = [];
  const total = agg.total_value;

  for (const h of portfolio.holdings.filter(h => h.asset_class === "individual_stock" && h.stock_metrics)) {
    const m = h.stock_metrics!;
    const wPct = total > 0 ? ((h.market_value / total) * 100).toFixed(1) : "0";

    if (m.pe_ratio !== null && m.pe_ratio > 100 && m.eps_growth_yoy !== null && m.eps_growth_yoy < 0) {
      flags.push({
        ticker: h.ticker,
        severity: "red",
        title: `${h.ticker} — extreme valuation + declining earnings`,
        body: `P/E ${m.pe_ratio.toFixed(0)}×, EPS growth ${(m.eps_growth_yoy * 100).toFixed(1)}% YoY. Position is ${wPct}% of portfolio.`,
        finding_key: buildFindingKey({ dimension: "valuation", type: "extreme_overvaluation", ticker: h.ticker }),
      });
    } else if (m.pe_ratio !== null && m.pe_ratio > 50) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — elevated valuation`,
        body: `P/E ${m.pe_ratio.toFixed(0)}× is above sector norms. Monitor for earnings deceleration.`,
        finding_key: buildFindingKey({ dimension: "valuation", type: "elevated_pe", ticker: h.ticker }),
      });
    }

    if (m.beta !== null && m.beta > 1.5) {
      flags.push({
        ticker: h.ticker,
        severity: "yellow",
        title: `${h.ticker} — high beta`,
        body: `Beta ${m.beta.toFixed(2)} amplifies market moves. ${capitalize(regimeAdjective(macro.market_regime))} macro warrants reducing high-beta exposure.`,
        finding_key: buildFindingKey({ dimension: "macro_alignment", type: "high_beta", ticker: h.ticker }),
      });
    }
  }

  if (agg.idle_cash_weight > 0.10) {
    flags.push({
      ticker: "CASH",
      severity: "yellow",
      title: `Idle cash at ${(agg.idle_cash_weight * 100).toFixed(1)}%`,
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% of portfolio earning money-market yield. Deploy or document as intentional strategic reserve.`,
      finding_key: buildFindingKey({ dimension: "diversification", type: "cash_drag" }),
    });
  }

  if (macro.yield_curve_status === "inverted" && agg.fixed_income_weight < 0.15) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: "Inverted yield curve — bond underweight",
      body: `Yield curve spread at ${macro.yield_curve_spread_10y_2y.toFixed(2)}%. Fixed income at ${(agg.fixed_income_weight * 100).toFixed(1)}% is below the ${fiTargetPctText(macro.market_regime)} ${regimeAdjective(macro.market_regime)} target.`,
      finding_key: buildFindingKey({ dimension: "macro_alignment", type: "fi_underweight_inverted_curve" }),
    });
  }

  if (macro.lei_consecutive_declines >= 6) {
    flags.push({
      ticker: "MACRO",
      severity: "yellow",
      title: `LEI declining for ${macro.lei_consecutive_declines} consecutive months`,
      body: "Six or more consecutive LEI declines historically precede recession. Defensive positioning is warranted.",
      finding_key: buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" }),
    });
  }

  for (const group of agg.duplicate_groups) {
    flags.push({
      ticker: group.tickers.join("/"),
      severity: "yellow",
      title: `Redundant funds — ${group.label}`,
      body: `${group.tickers.join(", ")} hold near-identical underlying exposure. Combined ${(group.combined_weight * 100).toFixed(1)}% — consolidate into one.`,
      finding_key: buildFindingKey({ dimension: "cost", type: "duplicate_funds", label: group.label }),
    });
  }

  // Asset-location flags — only fire when an external transfer is actually possible.
  // Policy-locked accounts (CBP, accounts with excluded_from_deployment or conservative_only)
  // cannot move holdings out to other brokerages, so suggesting it is misleading.
  if (accounts) {
    const typeById = new Map(accounts.accounts.map(a => [a.id, a]));
    for (const h of portfolio.holdings) {
      const acct = typeById.get(h.account_id);
      if (!acct) continue;
      const isPolicyLocked =
        acct.account_type === "cash_balance_plan" ||
        acct.constraints?.excluded_from_deployment === true ||
        acct.constraints?.conservative_only === true;
      if (isPolicyLocked) continue;
      const tax = taxTreatmentFor(acct.account_type);
      const wPct = ((h.market_value / agg.total_value) * 100).toFixed(1);

      if (tax === "taxable_currently" && (h.asset_class === "balanced" || h.asset_class === "target_date")) {
        flags.push({
          ticker: h.ticker,
          severity: "yellow",
          title: `${h.ticker} in taxable — distribution drag`,
          body: `${h.ticker} (${wPct}% of portfolio) is held in ${acct.label} (taxable). Balanced and target-date funds distribute capital gains annually, taxed as ordinary income. Consider moving to a tax-deferred account.`,
          finding_key: buildFindingKey({ dimension: "asset_location", type: "taxable_balanced", ticker: h.ticker }),
        });
      }
      if (tax === "tax_deferred" && h.asset_class === "individual_stock") {
        flags.push({
          ticker: h.ticker,
          severity: "yellow",
          title: `${h.ticker} in pre-tax — LTCG benefit lost`,
          body: `${h.ticker} (${wPct}% of portfolio) is in ${acct.label} (pre-tax). Long-term capital gains tax rate is lost — gains taxed as ordinary income on withdrawal. Consider holding in a taxable account.`,
          finding_key: buildFindingKey({ dimension: "asset_location", type: "tax_deferred_individual_stock", ticker: h.ticker }),
        });
      }
    }
  }

  return flags;
}

export function generateGapItems(
  agg: PortfolioAggregates,
  dimensions: DimensionScore[],
  macro: MacroContext
): GapItem[] {
  const gaps: GapItem[] = [];

  if (agg.idle_cash_weight > 0.05) {
    gaps.push({
      title: "Cash drag",
      type: "red",
      body: `${(agg.idle_cash_weight * 100).toFixed(1)}% idle cash reducing returns. Target ≤ 3%.`,
      progress: Math.max(0, Math.round((1 - agg.idle_cash_weight / 0.30) * 100)),
      finding_key: buildFindingKey({ dimension: "diversification", type: "cash_drag" }),
    });
  }

  const stockRiskDim = requireDim(dimensions, "single_stock_risk");
  if (stockRiskDim.score < 6) {
    gaps.push({
      title: "Single-stock risk",
      type: "red",
      body: `${stockRiskDim.display_value}. Deteriorating fundamentals in high-weight positions.`,
      progress: Math.round(stockRiskDim.score * 10),
      finding_key: buildFindingKey({ dimension: "single_stock_risk", type: "high_risk" }),
    });
  }

  const bondDim = requireDim(dimensions, "bond_balance");
  if (bondDim.score < 7) {
    gaps.push({
      title: "Fixed income underweight",
      type: "amber",
      body: `${(agg.fixed_income_weight * 100).toFixed(1)}% FI vs. ${macro.market_regime} target. Add FXNAX or VBTLX weight.`,
      progress: Math.round((agg.fixed_income_weight / 0.20) * 100),
      finding_key: buildFindingKey({ dimension: "bond_balance", type: "fi_underweight" }),
    });
  }

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    gaps.push({
      title: "Fund overlap / redundancy",
      type: "amber",
      body: `${g.tickers.join(" + ")} hold nearly identical securities. Consolidate to reduce complexity.`,
      progress: 20,
      finding_key: buildFindingKey({ dimension: "simplicity", type: "fund_overlap", label: g.label }),
    });
  }

  const concDim = requireDim(dimensions, "concentration");
  if (concDim.score < 7) {
    gaps.push({
      title: "Top-3 concentration",
      type: "amber",
      body: `${(agg.top3_weight * 100).toFixed(1)}% in top 3 holdings (${agg.top3_tickers.join(", ")}). Target ≤ 45%.`,
      progress: Math.min(100, Math.round(((1 - agg.top3_weight) / 0.65) * 100)),
      finding_key: buildFindingKey({ dimension: "concentration", type: "top3_overweight" }),
    });
  }

  return gaps;
}

export function generatePlanPhases(
  agg: PortfolioAggregates,
  macro: MacroContext,
  baseScore: number
): { phases: PlanPhase[]; trajectory: ScorePoint[] } {
  const phases: PlanPhase[] = [];
  let runningScore = baseScore;

  // Phase 1
  const p1Actions: PlanAction[] = [];
  let p1Delta = 0;

  if (agg.pending_cash_weight > 0.05) {
    p1Actions.push({
      category: "trade",
      description: `Deploy ${(agg.pending_cash_weight * 100).toFixed(1)}% pending cash ($${(agg.pending_cash_value / 1000).toFixed(0)}K) on ${agg.pending_deployment_date ?? "scheduled date"} per existing ${agg.pending_deployment_label ?? "tranche"} plan. This is the largest single score lever.`,
      tags: ["impact"],
    });
    p1Delta += 0.4;
  }

  p1Actions.push({
    category: "trade",
    description: `Review and reduce any individual stock positions with P/E > 100 and negative EPS growth. Reinvest proceeds into Phase 2 targets.`,
    tags: ["risk_reduction"],
  });
  p1Delta += 0.25;

  if (agg.duplicate_groups.length > 0) {
    const g = agg.duplicate_groups[0];
    p1Actions.push({
      category: "rebalance",
      description: `Consolidate ${g.tickers.join(" + ")} — identical ${g.label} exposure. Keep lowest-cost fund, redeploy the rest.`,
      tags: ["simplification"],
    });
    p1Delta += 0.15;
  }

  runningScore = Math.min(10, runningScore + p1Delta);
  phases.push({
    phase: 1,
    title: "Immediate — deploy cash & reduce risk",
    timing: "Now → 30 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p1Actions,
    insight: `Macro context: ${macro.market_regime} regime with yield curve at ${macro.yield_curve_spread_10y_2y.toFixed(2)}. LEI has declined ${macro.lei_consecutive_declines} consecutive months. Lean defensive on T3 deployment — don't chase growth.`,
  });

  // Phase 2
  const p2Actions: PlanAction[] = [];
  let p2Delta = 0;

  if (agg.fixed_income_weight < 0.16) {
    p2Actions.push({
      category: "rebalance",
      description: `Increase fixed income from ${(agg.fixed_income_weight * 100).toFixed(1)}% to ${fiTargetPctText(macro.market_regime)}. ${capitalize(regimeAdjective(macro.market_regime))}${macro.yield_curve_status === "inverted" ? " with inverted yield curve" : ""} warrants adding FXNAX or VBTLX weight.`,
      tags: ["impact"],
    });
    p2Delta += 0.3;
  }

  if (macro.cpi_yoy_headline > 2.5) {
    p2Actions.push({
      category: "trade",
      description: `Add TIPS or short-duration bond position (5–7%) to hedge CPI at ${macro.cpi_yoy_headline}%. VFSUX can absorb additional weight.`,
      tags: ["inflation_hedge"],
    });
    p2Delta += 0.1;
  }

  p2Actions.push({
    category: "rebalance",
    description: `Trim QQQ and VUG if held — both are large-cap growth with near-identical holdings to a total-market fund. Redirect into XLI or increase BRK-B for quality exposure.`,
    tags: ["simplification"],
  });

  runningScore = Math.min(10, runningScore + p2Delta);
  phases.push({
    phase: 2,
    title: "Near-term — fix allocation gaps",
    timing: "30–90 days",
    projected_grade: scoreToGrade(runningScore),
    actions: p2Actions,
    insight: `Target post-rebalance: ~55% equity / 20% fixed income / 15% international / 5% balanced / 5% cash.`,
  });

  // Phase 3
  runningScore = Math.min(10, runningScore + 0.25);
  phases.push({
    phase: 3,
    title: "Platform — monitoring & automation",
    timing: "60–120 days (parallel)",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "platform",
        description: "Set weekly report cadence (Sunday night). Automate macro.json refresh + drop the latest brokerage JSON snapshot into PORTFOLIO_DIR.",
        tags: ["automation"],
      },
      {
        category: "platform",
        description: `Add threshold alerts: VIX > 25, HY spread > 450bps, any dimension score dropping > 1 point WoW, cash > 10%.`,
        tags: ["monitoring"],
      },
      {
        category: "platform",
        description: "Build score trajectory chart tracking progress over time. Persist weekly scores to a JSON history file.",
        tags: ["feature"],
      },
    ],
    insight: "The goal is making good portfolio hygiene effortless.",
  });

  // Phase 4
  runningScore = Math.min(10, runningScore + 0.15);
  phases.push({
    phase: 4,
    title: "Ongoing — quarterly rebalance cadence",
    timing: "Recurring quarterly",
    projected_grade: scoreToGrade(runningScore),
    actions: [
      {
        category: "process",
        description: "Quarterly: check sleeve weights vs. targets, trim positions ±5% off target, review macro.json for sector rotation signals.",
        tags: ["process"],
      },
      {
        category: "process",
        description: "Annual: review reference model benchmarks for structural changes. Update macro regime targets if Fed policy shifts.",
        tags: ["process"],
      },
    ],
    insight: "Once automation is running, the main job is reviewing the Sunday report.",
  });

  const cap = (s: number) => Math.min(10, Number(s.toFixed(1)));
  const trajectory: ScorePoint[] = [
    { label: "Today",          score: cap(baseScore),                                grade: scoreToGrade(baseScore) },
    { label: "After phase 1",  score: cap(baseScore + p1Delta),                     grade: scoreToGrade(baseScore + p1Delta) },
    { label: "After phase 2",  score: cap(baseScore + p1Delta + p2Delta),           grade: scoreToGrade(baseScore + p1Delta + p2Delta) },
    { label: "After phase 3",  score: cap(baseScore + p1Delta + p2Delta + 0.25),    grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.25) },
    { label: "After phase 4",  score: cap(baseScore + p1Delta + p2Delta + 0.40),    grade: scoreToGrade(baseScore + p1Delta + p2Delta + 0.40) },
  ];

  return { phases, trajectory };
}
