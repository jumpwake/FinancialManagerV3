import { describe, it, expect } from "vitest";
import { renderTacticalInput, outputSchema } from "./tacticalAdvisor";

describe("outputSchema tactical move category tolerance", () => {
  const move = (category: string) => ({
    id: "mv_1",
    category,
    action: "Add fixed income",
    target_account: "Pre-Tax IRA",
    dollars: 40_000,
    rationale: "…",
    scenarios_addressed: ["yield_curve"],
  });
  const wrap = (m: unknown) => ({
    deployment_recommendation: null,
    tactical_plan: {
      summary: "…",
      target_grade: "B+",
      next_7_days: [],
      next_30_days: [m],
      scenario_resilience_notes: ["a", "b"],
    },
  });

  it("coerces an out-of-enum move category to 'rebalance' instead of failing the whole parse", () => {
    // Reproduces the observed failure: the model emitted a next_30_days move
    // whose category was outside the enum, which used to throw and discard the
    // entire advisor output.
    const result = outputSchema.safeParse(wrap(move("increase_allocation")));
    expect(result.success).toBe(true);
    expect(result.data!.tactical_plan.next_30_days[0].category).toBe("rebalance");
  });

  it("preserves a valid move category unchanged", () => {
    const result = outputSchema.safeParse(wrap(move("scenario_hedge")));
    expect(result.success).toBe(true);
    expect(result.data!.tactical_plan.next_30_days[0].category).toBe("scenario_hedge");
  });
});

describe("renderTacticalInput", () => {
  it("includes account model, composition, macro, dimension scores, flags, gaps, open situations", () => {
    const out = renderTacticalInput({
      portfolio: {
        snapshot_date: "2026-05-12",
        account_label: "All Accounts",
        holdings: [
          {
            ticker: "VWENX", label: "Wellington", market_value: 100_000,
            asset_class: "balanced", account_id: "vng_personal",
            is_cash: false, is_pending_deployment: false, expense_ratio: 0.0017,
            underlying_composition: { us_equity: 0.60, international_equity: 0.05, fixed_income: 0.35, cash: 0 },
          },
        ],
      },
      aggregates: {
        total_value: 100_000, equity_weight: 0.6, fixed_income_weight: 0.35,
        international_weight: 0.05, cash_weight: 0, idle_cash_weight: 0,
        constrained_cash_weight: 0, pending_cash_weight: 0, pending_cash_value: 0,
        individual_stock_weight: 0, crypto_weight: 0, balanced_weight: 1.0, holding_count: 1,
        top3_weight: 1.0, top3_tickers: ["VWENX"], blended_expense_ratio: 0.0017,
        duplicate_groups: [], cross_account_groups: [], sector_holdings: [],
      },
      macro: {
        snapshot_date: "2026-05-10", federal_funds_rate: 4.75, cpi_yoy_headline: 2.8,
        cpi_yoy_core: 2.6, yield_curve_spread_10y_2y: -0.12, yield_curve_status: "inverted",
        vix: 18.4, hy_credit_spread_oas_bps: 345, lei_consecutive_declines: 6,
        ism_manufacturing: 49.2, ism_services: 53.1, market_regime: "Late Cycle",
        sector_overweight: ["healthcare"], sector_underweight: ["real_estate"],
      },
      dimension_scores: [
        { id: "diversification", label: "Diversification", score: 6, rating: "yellow", display_value: "4 buckets", note: "", weight: 0.11 },
      ],
      portfolio_score: 7.1, portfolio_grade: "B",
      flags: [],
      gap_items: [],
      accounts: {
        accounts: [
          { id: "vng_personal", label: "Vanguard Personal", broker: "Vanguard",
            account_type: "taxable_brokerage", owner: "you",
            source_files: ["20260509_VanguardPersonal.json"] },
        ],
      },
      open_situations: [],
      speculative_holds: [
        { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
      ],
    });

    const parsed = JSON.parse(out);
    expect(parsed.portfolio.holdings[0].underlying_composition).toBeDefined();
    expect(parsed.accounts.accounts[0].account_type).toBe("taxable_brokerage");
    expect(parsed.macro.market_regime).toBe("Late Cycle");
    expect(parsed.dimension_scores[0].score).toBe(6);
    expect(parsed.speculative_holds).toHaveLength(1);
    expect(parsed.speculative_holds[0].ticker).toBe("TSLA");
  });
});
