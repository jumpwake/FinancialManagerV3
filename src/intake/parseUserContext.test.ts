import { describe, it, expect } from "vitest";
import { parseUserContext, emptyUserContext } from "./parseUserContext";

describe("parseUserContext", () => {
  it("migrates a version-1 context to version 2 with a null profile", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(2);
    expect(ctx.profile).toBeNull();
    expect(ctx.situations).toEqual([]);
  });

  it("accepts a version-2 context with a populated profile", () => {
    const ctx = parseUserContext({
      version: 2,
      profile: { age: 42, risk_tolerance: "moderately_aggressive" },
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(2);
    expect(ctx.profile).toEqual({ age: 42, risk_tolerance: "moderately_aggressive" });
  });

  it("accepts a version-2 context with a null profile", () => {
    const ctx = parseUserContext({
      version: 2,
      profile: null,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.profile).toBeNull();
  });

  it("rejects a profile with an out-of-range age", () => {
    expect(() =>
      parseUserContext({
        version: 2,
        profile: { age: 12, risk_tolerance: "moderate" },
        situations: [],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });

  it("rejects a profile with an unknown risk_tolerance", () => {
    expect(() =>
      parseUserContext({
        version: 2,
        profile: { age: 40, risk_tolerance: "extreme" },
        situations: [],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });

  it("accepts a fully populated situation with portfolio_effects", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [
        {
          id: "sit_test",
          title: "Rollover T3",
          intent: "Deploy remaining $200k",
          status: "open",
          target_date: "2026-06-30",
          related_findings: ["diversification:cash_drag"],
          portfolio_effects: [
            { type: "mark_cash_pending", amount_usd: 200000, deployment_label: "T3" },
          ],
          verdict_history: [],
          created_at: "2026-05-12T11:45:00Z",
          updated_at: "2026-05-12T11:47:24Z",
          closed_at: null,
          closure_reason: null,
        },
      ],
      notes: [],
      chat_history: [],
    });
    expect(ctx.situations[0].portfolio_effects[0].type).toBe("mark_cash_pending");
  });

  it("rejects an unknown PortfolioEffect.type", () => {
    expect(() =>
      parseUserContext({
        version: 1,
        situations: [
          {
            id: "x",
            title: "x",
            intent: "x",
            status: "open",
            target_date: null,
            related_findings: [],
            portfolio_effects: [{ type: "wat", amount_usd: 0 }],
            verdict_history: [],
            created_at: "2026-05-12T00:00:00Z",
            updated_at: "2026-05-12T00:00:00Z",
            closed_at: null,
            closure_reason: null,
          },
        ],
        notes: [],
        chat_history: [],
      }),
    ).toThrow();
  });

  it("rejects unknown version", () => {
    expect(() =>
      parseUserContext({ version: 99, situations: [], notes: [], chat_history: [] }),
    ).toThrow();
  });

  it("accepts chat messages scoped to a dimension or tactical_move", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [],
      notes: [],
      chat_history: [
        {
          id: "msg_dim",
          role: "user",
          content: "Why is bond balance low?",
          scope: { type: "dimension", dimension_id: "bond_balance" },
          created_at: "2026-05-15T15:00:00Z",
        },
        {
          id: "msg_move",
          role: "assistant",
          content: "Consider adding AGG.",
          scope: { type: "tactical_move", move_id: "mv_1" },
          created_at: "2026-05-15T15:00:05Z",
        },
      ],
    });
    expect(ctx.chat_history[0].scope.type).toBe("dimension");
    expect(ctx.chat_history[0].scope.dimension_id).toBe("bond_balance");
    expect(ctx.chat_history[1].scope.type).toBe("tactical_move");
    expect(ctx.chat_history[1].scope.move_id).toBe("mv_1");
  });
});

describe("parseUserContext — speculative sleeve", () => {
  const base = {
    version: 2,
    profile: null,
    situations: [],
    notes: [],
    chat_history: [],
  };

  it("parses speculative_holds", () => {
    const ctx = parseUserContext({
      ...base,
      speculative_holds: [
        { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
        { ticker: "NVDA", designated_at: "2026-06-20" },
      ],
      speculative_sleeve_threshold: 0.05,
    });
    expect(ctx.speculative_holds).toHaveLength(2);
    expect(ctx.speculative_holds[0].ticker).toBe("TSLA");
    expect(ctx.speculative_holds[1].reason).toBeUndefined();
    expect(ctx.speculative_sleeve_threshold).toBe(0.05);
  });

  it("defaults speculative_holds to [] and threshold to 0.05 when absent", () => {
    const ctx = parseUserContext(base);
    expect(ctx.speculative_holds).toEqual([]);
    expect(ctx.speculative_sleeve_threshold).toBe(0.05);
  });
});

describe("emptyUserContext", () => {
  it("returns a valid empty UserContext that round-trips through parseUserContext", () => {
    const empty = emptyUserContext();
    expect(parseUserContext(empty)).toEqual(empty);
  });
});
