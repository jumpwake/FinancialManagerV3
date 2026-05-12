import { AnalysisOutput, Flag } from "../types";
import { COLORS } from "../theme";

export default function Flags({ data }: { data: AnalysisOutput }) {
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
        <FlagRow key={i} flag={flag} />
      ))}
    </div>
  );
}

function FlagRow({ flag }: { flag: Flag }) {
  const isRed = flag.severity === "red";
  const severityColor = isRed ? COLORS.red : COLORS.amber;
  const severityBg = isRed ? "rgba(226, 75, 74, 0.12)" : "rgba(186, 117, 23, 0.12)";

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: "12px 14px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
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

      {/* Title + body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 3 }}>
          {flag.title}
        </div>
        <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6 }}>
          {flag.body}
        </div>
      </div>
    </div>
  );
}
