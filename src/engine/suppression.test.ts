import { describe, it, expect } from "vitest";
import { applyNoteSuppressions } from "./suppression";
import type { Flag, GapItem, Note } from "../types";

function makeNote(opts: Partial<Note> & { finding_key: string; suppress_flag: boolean }): Note {
  return {
    id: opts.id ?? "note_1",
    target: { type: "flag", finding_key: opts.finding_key },
    body: opts.body ?? "test note",
    suppress_flag: opts.suppress_flag,
    created_at: opts.created_at ?? "2026-05-12T00:00:00Z",
  };
}

function makeFlag(finding_key: string): Flag {
  return {
    ticker: "TEST",
    severity: "yellow",
    title: "Test flag",
    body: "test",
    finding_key,
  };
}

function makeGap(finding_key: string): GapItem {
  return {
    type: "amber",
    title: "Test gap",
    body: "test",
    progress: 0,
    finding_key,
  };
}

describe("applyNoteSuppressions", () => {
  it("does not modify flags when notes have suppress_flag=false", () => {
    const flags = [makeFlag("diversification:cash_drag")];
    const notes = [makeNote({ finding_key: "diversification:cash_drag", suppress_flag: false, body: "informational" })];
    const result = applyNoteSuppressions(flags, [], notes);
    expect(result.flags[0].suppressed_by).toBeUndefined();
  });

  it("annotates a flag with suppressed_by when a matching note has suppress_flag=true", () => {
    const flag = makeFlag("cost:duplicate_funds:us_total_market");
    const note = makeNote({ id: "note_dupe", finding_key: "cost:duplicate_funds:us_total_market", suppress_flag: true, body: "intentional" });
    const result = applyNoteSuppressions([flag], [], [note]);
    expect(result.flags[0].suppressed_by).toEqual({
      source: "note",
      id: "note_dupe",
      body: "intentional",
    });
  });

  it("annotates a gap item with suppressed_by when a matching note has suppress_flag=true", () => {
    const gap = makeGap("concentration:top3_overweight");
    const note = makeNote({ id: "note_g", finding_key: "concentration:top3_overweight", suppress_flag: true, body: "ok" });
    const result = applyNoteSuppressions([], [gap], [note]);
    expect(result.gaps[0].suppressed_by?.id).toBe("note_g");
  });

  it("does not modify flags whose finding_key does not match any note", () => {
    const flag = makeFlag("diversification:cash_drag");
    const note = makeNote({ finding_key: "cost:high_expense_ratio", suppress_flag: true });
    const result = applyNoteSuppressions([flag], [], [note]);
    expect(result.flags[0].suppressed_by).toBeUndefined();
  });

  it("does not mutate the input arrays (pure)", () => {
    const flags = [makeFlag("diversification:cash_drag")];
    const notes = [makeNote({ finding_key: "diversification:cash_drag", suppress_flag: true })];
    const flagsBefore = JSON.parse(JSON.stringify(flags));
    applyNoteSuppressions(flags, [], notes);
    expect(flags).toEqual(flagsBefore);
  });
});
