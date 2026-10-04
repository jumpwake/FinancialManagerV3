import { describe, it, expect } from "vitest";
import { todayIso } from "./today";
import { renderPulseInput } from "./pulseCheck";
import { renderChatInput } from "./chat";
import { renderTacticalInput } from "../../../ai/tacticalAdvisor";
import type { MacroContext } from "../types";

describe("todayIso", () => {
  it("formats the LOCAL calendar date as YYYY-MM-DD (not the UTC date)", () => {
    // 11:30pm local on Oct 4 — toISOString() would roll to Oct 5 in US time zones.
    expect(todayIso(new Date(2026, 9, 4, 23, 30))).toBe("2026-10-04");
    expect(todayIso(new Date(2026, 0, 9, 0, 5))).toBe("2026-01-09");
  });
});

describe("AI inputs carry today's date", () => {
  const macro = { market_regime: "late_cycle" } as MacroContext;

  it("pulse check input includes today", () => {
    const out = JSON.parse(renderPulseInput({
      situation: { title: "t", intent: "i", target_date: null, portfolio_effects: [], verdict_history: [] } as never,
      macro,
      portfolio: { snapshot_date: "2026-05-09", account_label: "All", holdings: [] },
      related_flags: [],
      today: "2026-10-04",
    }));
    expect(out.today).toBe("2026-10-04");
  });

  it("chat input includes today", () => {
    const out = JSON.parse(renderChatInput({
      user_message: "hi", scope: { type: "global" }, analysis: {}, situations: [], notes: [], history: [],
      today: "2026-10-04",
    }));
    expect(out.today).toBe("2026-10-04");
  });

  it("tactical advisor input includes today", () => {
    const out = JSON.parse(renderTacticalInput({
      portfolio: { snapshot_date: "2026-05-09", account_label: "All", holdings: [] },
      aggregates: {} as never, macro: macro as never, dimension_scores: [], portfolio_score: 7,
      portfolio_grade: "B", flags: [], gap_items: [], accounts: { accounts: [] }, open_situations: [],
      today: "2026-10-04",
    }));
    expect(out.today).toBe("2026-10-04");
  });

  it("defaults to the current local date when today is omitted", () => {
    const out = JSON.parse(renderChatInput({
      user_message: "hi", scope: { type: "global" }, analysis: {}, situations: [], notes: [], history: [],
    }));
    expect(out.today).toBe(todayIso());
  });
});
