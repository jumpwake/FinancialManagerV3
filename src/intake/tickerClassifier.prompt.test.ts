import { describe, it, expect } from "vitest";
import { buildClassifyPrompt, CLASSIFY_SYSTEM_PROMPT } from "./tickerClassifier";

describe("classifyTickers prompt", () => {
  it("includes the system rules", () => {
    expect(CLASSIFY_SYSTEM_PROMPT).toMatchSnapshot();
  });

  it("formats the user message with the ticker list", () => {
    const msg = buildClassifyPrompt(["VXUS", "VTIAX", "TLT"]);
    expect(msg).toMatchSnapshot();
  });
});
