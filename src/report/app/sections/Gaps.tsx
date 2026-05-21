import { AnalysisOutput, GapItem } from "../types";
import { COLORS } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

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

interface Props {
  data: AnalysisOutput;
  onDiscuss?: (finding_key: string) => void;
}

export default function Gaps({ data, onDiscuss }: Props) {
  const isMobile = useIsMobile();
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
        const isSuppressed = !!gap.suppressed_by;
        return (
          <div
            key={`${gap.finding_key ?? "gap"}-${i}`}
            style={{
              background: isSuppressed ? "transparent" : COLORS.card,
              border: isSuppressed ? "1px dashed #555" : `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              opacity: isSuppressed ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 16, color }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color }}>{gap.title}</span>
              {isSuppressed && (
                <span style={{
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "#1a3a2a",
                  color: "#4ade80",
                  fontSize: 10,
                  fontWeight: 600,
                }}>
                  💬 suppressed
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6, flex: 1, marginBottom: 12 }}>
              {gap.body}
            </div>
            {isSuppressed && gap.suppressed_by && (
              <div style={{ marginBottom: 10, fontSize: 11, color: "#888", fontStyle: "italic" }}>
                Suppressed by your note: "{gap.suppressed_by.body}"
              </div>
            )}
            <div style={{ height: 4, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, gap.progress))}%`,
                background: color,
                borderRadius: 2,
                transition: "width 0.3s ease",
              }} />
            </div>
            {onDiscuss && (
              <div
                style={{
                  display: isMobile ? "grid" : "flex",
                  gridTemplateColumns: isMobile ? "1fr" : undefined,
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  onClick={() => onDiscuss(gap.finding_key)}
                  title="Discuss in chat"
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    background: "transparent",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 4,
                    color: COLORS.text,
                    cursor: "pointer",
                    width: isMobile ? "100%" : undefined,
                  }}
                >
                  💬 Discuss
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
