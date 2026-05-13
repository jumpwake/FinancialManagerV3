import { AnalysisOutput, Finding } from "../types";
import { COLORS } from "../theme";

function borderColorForType(type: Finding["type"]): string {
  if (type === "strength") return COLORS.green;
  if (type === "gap") return COLORS.red;
  return COLORS.accentBlue;
}

function iconLabel(finding: Finding): string {
  if (finding.type === "strength") return "✓ Strength";
  if (finding.type === "gap") return "⚠ Gap";
  return "ⓘ Note";
}

export default function KeyFindings({ data }: { data: AnalysisOutput }) {
  const findings = data.findings;

  if (!findings || findings.length === 0) {
    return (
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
        (Key findings are AI-generated — set ANTHROPIC_API_KEY and re-run.)
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
      {findings.map((finding, i) => {
        const borderColor = borderColorForType(finding.type);
        return (
          <div
            key={i}
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderLeft: `4px solid ${borderColor}`,
              borderRadius: 6,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>
              {iconLabel(finding)}
            </div>
            <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6, flex: 1 }}>
              {finding.body}
            </div>
            {finding.type === "gap" && (
              <div style={{ marginTop: 10, height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${finding.progress ?? 50}%`,
                  background: COLORS.red,
                  borderRadius: 2,
                }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
