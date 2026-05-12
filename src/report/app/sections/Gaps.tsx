import { AnalysisOutput, GapItem } from "../types";
import { COLORS } from "../theme";

function gapColor(type: GapItem["type"]): string {
  if (type === "red") return COLORS.red;
  if (type === "amber") return COLORS.amber;
  return COLORS.accentBlue;
}

function gapIcon(type: GapItem["type"]): string {
  if (type === "red") return "⚠";
  if (type === "amber") return "△";
  return "ⓘ";
}

export default function Gaps({ data }: { data: AnalysisOutput }) {
  const gaps = data.gap_items;

  if (!gaps || gaps.length === 0) {
    return (
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
        No active gaps.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {gaps.map((gap, i) => {
        const color = gapColor(gap.type);
        const icon = gapIcon(gap.type);
        return (
          <div
            key={i}
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16, color }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color }}>{gap.title}</span>
            </div>
            <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6, flex: 1, marginBottom: 12 }}>
              {gap.body}
            </div>
            <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, gap.progress))}%`,
                background: color,
                borderRadius: 2,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
