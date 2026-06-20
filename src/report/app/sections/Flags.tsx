import { AnalysisOutput, Flag, SpeculativeHold } from "../types";
import { COLORS } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  data: AnalysisOutput;
  onDiscuss?: (finding_key: string) => void;
  speculativeHolds?: SpeculativeHold[];
  onAddHold?: (ticker: string, reason?: string) => void;
  onRemoveHold?: (ticker: string) => void;
}

export default function Flags({ data, onDiscuss, speculativeHolds, onAddHold, onRemoveHold }: Props) {
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

  const sleeveWeight = data.aggregates.speculative_sleeve_weight ?? 0;
  const publishedTickers = data.aggregates.speculative_sleeve_tickers ?? [];
  // Tickers the user has designated this session (optimistic, pre-publish).
  const liveTickers = (speculativeHolds ?? []).map((h) => h.ticker);
  const heldLive = new Set(liveTickers);
  // Banner shows the union of published sleeve tickers and live additions.
  const bannerTickers = Array.from(new Set([...publishedTickers, ...liveTickers]));
  // A flag is eligible for "add to sleeve" only if it names an individual stock.
  const stockTickers = new Set(
    data.portfolio.holdings
      .filter((h) => h.asset_class === "individual_stock")
      .map((h) => h.ticker),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bannerTickers.length > 0 && (
        <div style={{
          fontSize: 12,
          color: "#888",
          padding: "6px 10px",
          border: "1px dashed #444",
          borderRadius: 6,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}>
          <span>Speculative sleeve: {(sleeveWeight * 100).toFixed(1)}% (excluded from risk scoring)</span>
          {bannerTickers.map((t) => (
            <span key={t} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "monospace",
              background: "#222",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              padding: "1px 6px",
            }}>
              {t}
              {onRemoveHold && (
                <button
                  onClick={() => onRemoveHold(t)}
                  title={`Remove ${t} from speculative sleeve`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {flags.map((flag, i) => (
        <FlagRow
          key={`${flag.finding_key ?? "flag"}-${i}`}
          flag={flag}
          isHeldLive={heldLive.has(flag.ticker)}
          isEligible={stockTickers.has(flag.ticker)}
          onDiscuss={onDiscuss}
          onAddHold={onAddHold}
        />
      ))}
    </div>
  );
}

function FlagRow({
  flag, isHeldLive, isEligible, onDiscuss, onAddHold,
}: {
  flag: Flag;
  isHeldLive: boolean;
  isEligible: boolean;
  onDiscuss?: (key: string) => void;
  onAddHold?: (ticker: string, reason?: string) => void;
}) {
  const isRed = flag.severity === "red";
  const isSuppressed = !!flag.suppressed_by;
  // Mute when published-suppressed OR designated live this session.
  const muted = isSuppressed || isHeldLive;
  const severityColor = isRed ? COLORS.red : COLORS.amber;
  const severityBg = isRed ? "rgba(226, 75, 74, 0.12)" : "rgba(186, 117, 23, 0.12)";
  const isMobile = useIsMobile();

  return (
    <div style={{
      background: muted ? "transparent" : COLORS.card,
      border: muted ? "1px dashed #555" : `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      opacity: muted ? 0.6 : 1,
    }}>
      {/* Row 1: severity + ticker (and desktop discuss on the right) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        }}>
          {flag.severity}
        </span>
        <span style={{
          minWidth: 0,
          fontSize: 11,
          fontWeight: 600,
          color: COLORS.text,
          background: "#222",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 4,
          padding: "2px 7px",
          fontFamily: "monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {flag.ticker}
        </span>
        <div style={{ flex: 1 }} />
        {isEligible && !muted && onAddHold && !isMobile && (
          <button
            onClick={() => onAddHold(flag.ticker)}
            title="Hold deliberately — add to speculative sleeve"
            style={{
              flexShrink: 0,
              fontSize: 12,
              padding: "2px 8px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: COLORS.text,
              cursor: "pointer",
            }}
          >
            ⊘ Hold deliberately
          </button>
        )}
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
            }}
          >
            💬 Discuss
          </button>
        )}
      </div>

      {/* Row 2: title — own row, full card width */}
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", overflowWrap: "anywhere", minWidth: 0 }}>
        <span>{flag.title}</span>
        {muted && (
          <span style={{
            padding: "1px 5px",
            borderRadius: 3,
            background: "#1a3a2a",
            color: "#4ade80",
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            speculative
          </span>
        )}
      </div>

      {/* Row 3: body — own row, full card width */}
      <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6, overflowWrap: "anywhere", minWidth: 0 }}>
        {flag.body}
      </div>

      {isSuppressed && flag.suppressed_by ? (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          {flag.suppressed_by.source === "speculative_hold"
            ? `Speculative-sleeve hold — excluded from scoring${flag.suppressed_by.body ? `: "${flag.suppressed_by.body}"` : ""}`
            : `Suppressed by your note: "${flag.suppressed_by.body}"`}
        </div>
      ) : isHeldLive ? (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          Speculative-sleeve hold — applies to scoring on the next report refresh.
        </div>
      ) : null}

      {onDiscuss && isMobile && (
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
      )}
    </div>
  );
}
