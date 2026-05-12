import type { Flag, GapItem, Note, FlagSuppressionRef } from "../types";

function findSuppressingNote(finding_key: string, notes: Note[]): Note | undefined {
  return notes.find(n => n.suppress_flag && n.target.finding_key === finding_key);
}

export function applyNoteSuppressions(
  flags: Flag[],
  gaps: GapItem[],
  notes: Note[],
): { flags: Flag[]; gaps: GapItem[] } {
  const annotateFlag = (f: Flag): Flag => {
    const note = findSuppressingNote(f.finding_key, notes);
    if (!note) return { ...f };
    const ref: FlagSuppressionRef = { source: "note", id: note.id, body: note.body };
    return { ...f, suppressed_by: ref };
  };

  const annotateGap = (g: GapItem): GapItem => {
    const note = findSuppressingNote(g.finding_key, notes);
    if (!note) return { ...g };
    const ref: FlagSuppressionRef = { source: "note", id: note.id, body: note.body };
    return { ...g, suppressed_by: ref };
  };

  return {
    flags: flags.map(annotateFlag),
    gaps: gaps.map(annotateGap),
  };
}
