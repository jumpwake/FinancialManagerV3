import { AnalysisOutput } from "../types";
import { COLORS } from "../theme";

export default function AdditionalTakeaways({ data }: { data: AnalysisOutput }) {
  if (!data.narratives) {
    return (
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
        (AI takeaways not generated.)
      </div>
    );
  }

  const { additional_takeaways, phase1_macro_note } = data.narratives;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {additional_takeaways.map((item, i) => (
          <div
            key={i}
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderLeft: `3px solid ${COLORS.textMuted}`,
              borderRadius: 6,
              padding: "12px 16px",
              fontSize: 13,
              color: "#bbb",
              lineHeight: 1.7,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      {phase1_macro_note && (
        <div style={{
          background: COLORS.pendingBg,
          border: `1px solid ${COLORS.amber}`,
          borderRadius: 6,
          padding: "16px",
          fontSize: 13,
          color: COLORS.amber,
          lineHeight: 1.7,
        }}>
          <strong style={{ display: "block", marginBottom: 4, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Phase 1 Macro Note
          </strong>
          {phase1_macro_note}
        </div>
      )}
    </div>
  );
}
