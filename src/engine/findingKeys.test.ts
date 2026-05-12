import { describe, it, expect } from "vitest";
import { buildFindingKey } from "./findingKeys";

describe("buildFindingKey", () => {
  it("emits dimension:type for generic flags", () => {
    expect(buildFindingKey({ dimension: "diversification", type: "cash_drag" })).toBe(
      "diversification:cash_drag",
    );
  });

  it("emits dimension:type:ticker for ticker-scoped flags", () => {
    expect(
      buildFindingKey({ dimension: "concentration", type: "single_position", ticker: "NVDA" }),
    ).toBe("concentration:single_position:NVDA");
  });

  it("lowercases the dimension and type but preserves ticker casing", () => {
    expect(
      buildFindingKey({ dimension: "Concentration", type: "Single_Position", ticker: "BRK-B" }),
    ).toBe("concentration:single_position:BRK-B");
  });

  it("emits the same key for identical inputs (stability)", () => {
    const a = buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" });
    const b = buildFindingKey({ dimension: "macro_alignment", type: "lei_decline" });
    expect(a).toBe(b);
    expect(a).toBe("macro_alignment:lei_decline");
  });

  it("supports a free-form 'label' segment for duplicates", () => {
    expect(
      buildFindingKey({ dimension: "cost", type: "duplicate_funds", label: "US Total Market" }),
    ).toBe("cost:duplicate_funds:us_total_market");
  });
});
