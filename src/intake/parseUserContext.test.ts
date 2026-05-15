import { describe, it, expect } from "vitest";
import { parseUserContext, emptyUserContext } from "./parseUserContext";

describe("parseUserContext", () => {
  it("accepts an empty context shape", () => {
    const ctx = parseUserContext({
      version: 1,
      situations: [],
      notes: [],
      chat_history: [],
    });
    expect(ctx.version).toBe(1);
    expect(ctx.situations).toEqual([]);
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

describe("emptyUserContext", () => {
  it("returns a valid empty UserContext that round-trips through parseUserContext", () => {
    const empty = emptyUserContext();
    expect(parseUserContext(empty)).toEqual(empty);
  });
});
