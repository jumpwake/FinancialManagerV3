import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { aiModelsLabel, DEFAULT_MODEL, modelDisplayName, refusalError } from "./models";

describe("DEFAULT_MODEL", () => {
  it("is Claude Opus 5.5", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
  });

  it("is the only place a Claude model ID is hardcoded in src/", () => {
    const srcRoot = path.resolve(__dirname, "../../..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { if (entry.name !== "node_modules") walk(full); continue; }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        if (full === path.join(__dirname, "models.ts")) continue;
        if (/["']claude-(opus|sonnet|haiku|fable)-[0-9a-z-]+["']/.test(fs.readFileSync(full, "utf-8"))) {
          offenders.push(path.relative(srcRoot, full));
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});

describe("refusalError", () => {
  it("returns null for a normal stop", () => {
    expect(refusalError("narratives", { stop_reason: "end_turn" })).toBeNull();
  });

  it("describes a refusal, including the category when present", () => {
    const err = refusalError("narratives", {
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "x" },
    } as never);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain("narratives");
    expect(err!.message).toContain("cyber");
  });
});

describe("modelDisplayName", () => {
  it.each([
    ["claude-opus-5-5", "Claude Opus 5.5"],
    ["claude-opus-5", "Claude Opus 5"],
    ["claude-sonnet-4-6", "Claude Sonnet 4.6"],
    ["claude-haiku-4-5", "Claude Haiku 4.5"],
    ["claude-fable-5-1", "Claude Fable 5.1"],
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
  ])("formats %s as %s", (id, name) => {
    expect(modelDisplayName(id)).toBe(name);
  });

  it("returns unrecognized IDs unchanged", () => {
    expect(modelDisplayName("some-other-model")).toBe("some-other-model");
    expect(modelDisplayName("")).toBe("");
  });
});

describe("aiModelsLabel", () => {
  it("returns null when no AI call ran", () => {
    expect(aiModelsLabel(undefined)).toBeNull();
    expect(aiModelsLabel({})).toBeNull();
  });

  it("shows one name when every call used the same model", () => {
    expect(aiModelsLabel({ narratives: "claude-opus-5-5", tactical_advisor: "claude-opus-5-5" })).toBe("Claude Opus 5.5");
    expect(aiModelsLabel({ tactical_advisor: "claude-opus-5-5" })).toBe("Claude Opus 5.5");
  });

  it("labels each call when the models differ", () => {
    expect(aiModelsLabel({ narratives: "claude-opus-5-5", tactical_advisor: "claude-sonnet-4-6" }))
      .toBe("Claude Opus 5.5 (narratives), Claude Sonnet 4.6 (advisor)");
  });
});
