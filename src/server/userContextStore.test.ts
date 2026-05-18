import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadUserContext,
  saveUserContext,
  mutateUserContext,
} from "./userContextStore";
import { emptyUserContext } from "../intake/parseUserContext";

let tmpDir: string;
let filePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-test-"));
  filePath = path.join(tmpDir, "user-context.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadUserContext", () => {
  it("returns an empty context when the file does not exist", () => {
    const ctx = loadUserContext(filePath);
    expect(ctx.situations).toEqual([]);
    expect(ctx.notes).toEqual([]);
    expect(ctx.chat_history).toEqual([]);
  });

  it("returns the parsed file when it exists", () => {
    fs.writeFileSync(filePath, JSON.stringify(emptyUserContext()));
    const ctx = loadUserContext(filePath);
    expect(ctx.version).toBe(2);
  });

  it("migrates a persisted v1 file to v2 on load", () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ version: 1, situations: [], notes: [], chat_history: [] }),
    );
    const ctx = loadUserContext(filePath);
    expect(ctx.version).toBe(2);
    expect(ctx.profile).toBeNull();
  });

  it("throws on corrupt JSON", () => {
    fs.writeFileSync(filePath, "{ not json");
    expect(() => loadUserContext(filePath)).toThrow();
  });
});

describe("saveUserContext", () => {
  it("writes atomically — no .tmp left behind on success", () => {
    saveUserContext(filePath, emptyUserContext());
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  it("round-trips through loadUserContext", () => {
    const original = emptyUserContext();
    saveUserContext(filePath, original);
    expect(loadUserContext(filePath)).toEqual(original);
  });
});

describe("mutateUserContext", () => {
  it("applies the mutation function and persists", () => {
    saveUserContext(filePath, emptyUserContext());
    mutateUserContext(filePath, (ctx) => {
      ctx.notes.push({
        id: "note_1",
        target: { type: "flag", finding_key: "diversification:cash_drag" },
        body: "rollover",
        suppress_flag: true,
        created_at: "2026-05-12T00:00:00Z",
      });
    });
    const ctx = loadUserContext(filePath);
    expect(ctx.notes).toHaveLength(1);
    expect(ctx.notes[0].id).toBe("note_1");
  });

  it("creates the file on first mutate if it doesn't exist", () => {
    mutateUserContext(filePath, (ctx) => {
      ctx.notes.push({
        id: "note_seed",
        target: { type: "global", finding_key: "" },
        body: "seed",
        suppress_flag: false,
        created_at: "2026-05-12T00:00:00Z",
      });
    });
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
