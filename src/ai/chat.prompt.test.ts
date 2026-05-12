import { describe, it, expect } from "vitest";
import { renderChatInput } from "./chat";
import type { ChatMessage, ChatScope } from "../types";

const globalScope: ChatScope = { type: "global" };

const baseAnalysis = {
  portfolio_grade: "B+",
  portfolio_score: 7.4,
  flags: [{ ticker: "CASH", severity: "yellow", title: "Idle cash 24.7%", body: "", finding_key: "diversification:cash_drag" }],
  dimension_scores: [
    { id: "diversification", label: "Diversification", score: 6.8, rating: "yellow", display_value: "—", note: "", weight: 0.15 },
  ],
  macro: { market_regime: "late_cycle", vix: 18.2, yield_curve_spread_10y_2y: 0.42 },
  aggregates: { total_value: 2_500_000, cash_weight: 0.247 },
};

describe("renderChatInput", () => {
  it("emits a global-scope context block including header, top flags, and macro", () => {
    const out = renderChatInput({
      user_message: "Why is my grade B+?",
      scope: globalScope,
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history: [],
    });
    expect(out).toMatchSnapshot();
  });

  it("scopes to a single flag when scope.type === 'flag'", () => {
    const out = renderChatInput({
      user_message: "Tell me about cash drag",
      scope: { type: "flag", finding_key: "diversification:cash_drag" },
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history: [],
    });
    expect(out).toContain("diversification:cash_drag");
  });

  it("includes the last N history turns under their scope", () => {
    const history: ChatMessage[] = [
      { id: "m1", role: "user", content: "earlier question", scope: globalScope, created_at: "2026-05-12T00:00:00Z" },
      { id: "m2", role: "assistant", content: "earlier answer", scope: globalScope, created_at: "2026-05-12T00:00:01Z" },
    ];
    const out = renderChatInput({
      user_message: "next question",
      scope: globalScope,
      analysis: baseAnalysis,
      situations: [],
      notes: [],
      history,
    });
    expect(out).toContain("earlier question");
  });
});

describe("renderChatInput dimension scope", () => {
  it("includes the targeted DimensionScore and the broader portfolio context", () => {
    const out = renderChatInput({
      user_message: "How do I raise my Diversification grade?",
      scope: { type: "dimension", dimension_id: "diversification" },
      analysis: {
        portfolio_grade: "B",
        portfolio_score: 7.1,
        dimension_scores: [
          {
            id: "diversification",
            label: "Diversification",
            score: 6,
            rating: "yellow",
            display_value: "4 asset buckets",
            note: "Distinct asset class buckets with ≥ 3% weight",
            weight: 0.12,
          },
          {
            id: "cost_efficiency",
            label: "Cost efficiency",
            score: 9,
            rating: "green",
            display_value: "0.08% blended ER",
            note: "",
            weight: 0.10,
          },
        ],
        flags: [],
        gap_items: [],
        macro: { market_regime: "Late Cycle" },
        aggregates: { total_value: 1_000_000 },
      },
      situations: [],
      notes: [],
      history: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.scope.type).toBe("dimension");
    expect(parsed.scope.dimension_id).toBe("diversification");
    expect(parsed.analysis_scope.dimension.id).toBe("diversification");
    expect(parsed.analysis_scope.dimension.score).toBe(6);
    expect(parsed.analysis_scope.portfolio_grade).toBe("B");
    expect(Array.isArray(parsed.analysis_scope.all_dimensions)).toBe(true);
    expect(parsed.analysis_scope.all_dimensions).toHaveLength(2);
  });
});

describe("renderChatInput tactical_move scope", () => {
  it("includes the targeted tactical move and the broader tactical plan", () => {
    const out = renderChatInput({
      user_message: "Why this move?",
      scope: { type: "tactical_move", move_id: "mv_1" },
      analysis: {
        portfolio_grade: "B",
        macro: { market_regime: "Late Cycle" },
        tactical_advisor: {
          tactical_plan: {
            summary: "Lift to A−",
            target_grade: "A−",
            next_7_days: [
              { id: "mv_1", category: "deploy_cash", action: "Buy $40K VBTLX", target_account: "Pre-Tax IRA", dollars: 40_000, rationale: "...", scenarios_addressed: ["yield_curve"] },
            ],
            next_30_days: [],
            scenario_resilience_notes: [],
          },
          deployment_recommendation: null,
        },
      },
      situations: [], notes: [], history: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.analysis_scope.move.id).toBe("mv_1");
    expect(parsed.analysis_scope.move.action).toMatch(/VBTLX/);
    expect(parsed.analysis_scope.tactical_plan_summary).toBe("Lift to A−");
  });
});
