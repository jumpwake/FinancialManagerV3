import { describe, it, expect } from "vitest";
import { buildMacroAIPrompt, MACRO_AI_SYSTEM_PROMPT, extractJsonCandidates } from "./macroAi";

describe("macroAi prompt", () => {
  it("system prompt names LEI streak + both ISM PMIs", () => {
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("lei_consecutive_declines");
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("ism_manufacturing");
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("ism_services");
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("as_of_date");
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("source_notes");
  });

  it("system prompt instructs JSON-only output", () => {
    expect(MACRO_AI_SYSTEM_PROMPT).toContain("ONLY a JSON object");
  });

  it("user prompt includes the reference date", () => {
    expect(buildMacroAIPrompt("2026-05-30")).toContain("2026-05-30");
  });

  it("user prompt defaults to today when no date passed", () => {
    const msg = buildMacroAIPrompt();
    const today = new Date().toISOString().slice(0, 10);
    expect(msg).toContain(today);
  });
});

describe("extractJsonCandidates", () => {
  const expectedObj = { lei_consecutive_declines: 0, ism_manufacturing: 52.7, ism_services: 53.6 };

  it("extracts JSON from a fenced block", () => {
    const text = 'Some prose.\n```json\n{"lei_consecutive_declines": 0, "ism_manufacturing": 52.7, "ism_services": 53.6}\n```\n';
    const candidates = extractJsonCandidates(text);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).find(p => p !== null);
    expect(parsed).toEqual(expect.objectContaining(expectedObj));
  });

  it("extracts trailing JSON after a preamble (the actual failure mode from the real run)", () => {
    const text = "I'll search for all three indicators. " +
      "I now have all the data needed. Let me compile the findings:\n\n" +
      "- LEI rose +0.1% in April 2026, streak = 0.\n" +
      "- ISM Manufacturing: 52.7\n" +
      "- ISM Services: 53.6\n\n" +
      '{"lei_consecutive_declines": 0, "ism_manufacturing": 52.7, "ism_services": 53.6, "as_of_date": "2026-05-22", "source_notes": "Conference Board + ISM"}';
    const candidates = extractJsonCandidates(text);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).find(p => p !== null);
    expect(parsed).toEqual(expect.objectContaining(expectedObj));
  });

  it("handles nested objects via brace balance", () => {
    const text = "preamble\n{\"a\": 1, \"nested\": {\"b\": 2, \"c\": {\"d\": 3}}, \"e\": 4}";
    const candidates = extractJsonCandidates(text);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).find(p => p !== null);
    expect(parsed).toEqual({ a: 1, nested: { b: 2, c: { d: 3 } }, e: 4 });
  });

  it("handles strings containing braces (doesn't confuse them with structure)", () => {
    const text = 'noise {"k": "value with } brace inside", "n": 5}';
    const candidates = extractJsonCandidates(text);
    const parsed = candidates.map(c => { try { return JSON.parse(c); } catch { return null; } }).find(p => p !== null);
    expect(parsed).toEqual({ k: "value with } brace inside", n: 5 });
  });

  it("returns the raw text as a final fallback when nothing else matches", () => {
    const candidates = extractJsonCandidates("not json at all");
    // The last candidate should be the raw text
    expect(candidates[candidates.length - 1]).toBe("not json at all");
  });
});
