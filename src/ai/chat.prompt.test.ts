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
