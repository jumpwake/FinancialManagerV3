import { describe, it, expect } from "vitest";
import { speculativeTickerSet, applySpeculativeSuppressions } from "./speculative";
import type { Flag, SpeculativeHold } from "../types";

const holds: SpeculativeHold[] = [
  { ticker: "TSLA", reason: "Long-term personal hold", designated_at: "2026-06-20" },
  { ticker: "NVDA", designated_at: "2026-06-20" },
];

const tslaFlag: Flag = {
  ticker: "TSLA", severity: "red", title: "TSLA — extreme valuation",
  body: "P/E 410×.", finding_key: "valuation:extreme_overvaluation:TSLA",
};
const macroFlag: Flag = {
  ticker: "MACRO", severity: "yellow", title: "LEI declining",
  body: "...", finding_key: "macro_alignment:lei_decline",
};

describe("speculativeTickerSet", () => {
  it("canonicalizes tickers", () => {
    const set = speculativeTickerSet([{ ticker: "BRK B", designated_at: "2026-06-20" }]);
    expect(set.has("BRK-B")).toBe(true);
  });
});

describe("applySpeculativeSuppressions", () => {
  it("annotates a speculative ticker's flag with its reason and leaves others untouched", () => {
    const out = applySpeculativeSuppressions([tslaFlag, macroFlag], holds, 0.036, 0.05);
    const tsla = out.find(f => f.finding_key === "valuation:extreme_overvaluation:TSLA")!;
    expect(tsla.suppressed_by).toEqual({
      source: "speculative_hold",
      id: "TSLA",
      body: "Long-term personal hold",
    });
    const macro = out.find(f => f.finding_key === "macro_alignment:lei_decline")!;
    expect(macro.suppressed_by).toBeUndefined();
  });

  it("falls back to a default body when no reason is given", () => {
    const nvdaFlag: Flag = {
      ticker: "NVDA", severity: "yellow", title: "NVDA — high beta",
      body: "Beta 2.24.", finding_key: "macro_alignment:high_beta:NVDA",
    };
    const out = applySpeculativeSuppressions([nvdaFlag], holds, 0, 0.05);
    expect(out[0].suppressed_by?.body).toBe("Held as a speculative-sleeve position");
  });

  it("does NOT append a sleeve flag when weight is at or below threshold", () => {
    const out = applySpeculativeSuppressions([], holds, 0.05, 0.05);
    expect(out.find(f => f.finding_key === "speculative_sleeve:over_threshold")).toBeUndefined();
  });

  it("appends exactly one sleeve flag when weight exceeds threshold", () => {
    const out = applySpeculativeSuppressions([], holds, 0.061, 0.05);
    const sleeve = out.filter(f => f.finding_key === "speculative_sleeve:over_threshold");
    expect(sleeve).toHaveLength(1);
    expect(sleeve[0].severity).toBe("yellow");
    expect(sleeve[0].body).toContain("6.1%");
    expect(sleeve[0].body).toContain("5%");
  });
});
