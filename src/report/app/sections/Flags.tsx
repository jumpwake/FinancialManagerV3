import { AnalysisOutput, Flag } from "../types";
import { COLORS } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  data: AnalysisOutput;
  onDiscuss?: (finding_key: string) => void;
}

export default function Flags({ data, onDiscuss }: Props) {
  const flags = [...data.flags].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "red" ? -1 : 1;
  });

  if (flags.length === 0) {
    return (
      <div style={{
        background: "rgba(29, 158, 117, 0.08)",
        border: `1px solid ${COLORS.green}`,
        borderRadius: 6,
        padding: "14px 16px",
        fontSize: 13,
        color: COLORS.green,
        fontWeight: 500,
      }}>
        No critical flags this week.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {flags.map((flag, i) => (
        <FlagRow key={`${flag.finding_key ?? "flag"}-${i}`} flag={flag} onDiscuss={onDiscuss} />
      ))}
    </div>
  );
}

function FlagRow({ flag, onDiscuss }: { flag: Flag; onDiscuss?: (key: string) => void }) {
  const isRed = flag.severity === "red";
  const isSuppressed = !!flag.suppressed_by;
  const severityColor = isRed ? COLORS.red : COLORS.amber;
  const severityBg = isRed ? "rgba(226, 75, 74, 0.12)" : "rgba(186, 117, 23, 0.12)";
  const isMobile = useIsMobile();

  return (
    <div style={{
      background: isSuppressed ? "transparent" : COLORS.card,
      border: isSuppressed ? "1px dashed #555" : `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: "12px 14px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      opacity: isSuppressed ? 0.6 : 1,
    }}>
      {/* Severity badge */}
      <span style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 700,
        color: severityColor,
        background: severityBg,
        border: `1px solid ${severityColor}`,
        borderRadius: 3,
        padding: "2px 6px",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginTop: 1,
      }}>
        {flag.severity}
      </span>

      {/* Ticker pill */}
      <span style={{
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 600,
        color: COLORS.text,
        background: "#222",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 4,
        padding: "2px 7px",
        marginTop: 1,
        fontFamily: "monospace",
      }}>
        {flag.ticker}
      </span>

      {/* Title + body + action row */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{flag.title}</span>
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
        <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6 }}>
          {flag.body}
        </div>
        {isSuppressed && flag.suppressed_by && (
          <div style={{ marginTop: 4, fontSize: 11, color: "#888", fontStyle: "italic" }}>
            Suppressed by your note: "{flag.suppressed_by.body}"
          </div>
        )}
        {/* Discuss button — action row (desktop: inline; mobile: full-width below body) */}
        {onDiscuss && isMobile && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 8,
              marginTop: 10,
            }}
          >
            <button
              onClick={() => onDiscuss(flag.finding_key)}
              title="Discuss in chat"
              style={{
                fontSize: 12,
                padding: "2px 8px",
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 4,
                color: COLORS.text,
                cursor: "pointer",
                width: "100%",
              }}
            >
              💬 Discuss
            </button>
          </div>
        )}
      </div>

      {/* Discuss button — desktop only (inline at end of row) */}
      {onDiscuss && !isMobile && (
        <button
          onClick={() => onDiscuss(flag.finding_key)}
          title="Discuss in chat"
          style={{
            flexShrink: 0,
            fontSize: 12,
            padding: "2px 8px",
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.text,
            cursor: "pointer",
            marginTop: 1,
          }}
        >
          💬 Discuss
        </button>
      )}
    </div>
  );
}
