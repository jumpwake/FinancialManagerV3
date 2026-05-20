import { describe, it, expect } from "vitest";
import { renderPulseInput } from "./pulseCheck";
import type { Situation, Portfolio, MacroContext, Flag } from "../types";

const baseSituation: Situation = {
  id: "sit_rollover_t3",
  title: "Rollover IRA — T3 deployment",
  intent: "Deploying $600k from old IRA in 3 tranches; T1+T2 done; T3 pending.",
  status: "open",
  target_date: "2026-06-30",
  related_findings: ["diversification:cash_drag"],
  portfolio_effects: [{ type: "mark_cash_pending", amount_usd: 200000 }],
  verdict_history: [],
  created_at: "2026-05-12T00:00:00Z",
  updated_at: "2026-05-12T00:00:00Z",
  closed_at: null,
  closure_reason: null,
};

const baseMacro: MacroContext = {
  snapshot_date: "2026-05-09",
  federal_funds_rate: 4.25,
  cpi_yoy_headline: 2.8,
  cpi_yoy_core: 3.1,
  yield_curve_spread_10y_2y: 0.42,
  yield_curve_status: "normal",
  vix: 18.2,
  hy_credit_spread_oas_bps: 340,
  lei_consecutive_declines: 0,
  ism_manufacturing: 49.2,
  ism_services: 51.4,
  market_regime: "late_cycle",
  sector_overweight: [],
  sector_underweight: [],
};

const basePortfolio: Portfolio = {
  snapshot_date: "2026-05-09",
  account_label: "All Accounts",
  holdings: [],
};

describe("renderPulseInput", () => {
  it("produces a deterministic JSON string for a given input", () => {
    const out = renderPulseInput({
      situation: baseSituation,
      macro: baseMacro,
      portfolio: basePortfolio,
      related_flags: [] as Flag[],
    });
    expect(out).toMatchSnapshot();
  });

  it("includes the situation's verdict_history if present", () => {
    const sit = {
      ...baseSituation,
      verdict_history: [
        {
          run_at: "2026-04-12T00:00:00Z",
          macro_snapshot: { regime: "late_cycle", vix: 16, yield_curve_10y_2y: 0.3, hy_credit_spread_oas_bps: 300, lei_consecutive_declines: 0 },
          verdict: "hold" as const,
          confidence: "medium" as const,
          rationale: "VIX subdued.",
          suggested_action: "Wait.",
          reconsider_when: null,
        },
      ],
    };
    const out = renderPulseInput({ situation: sit, macro: baseMacro, portfolio: basePortfolio, related_flags: [] });
    expect(out).toContain("VIX subdued");
  });
});
