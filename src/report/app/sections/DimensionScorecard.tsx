import { useState } from "react";
import { AnalysisOutput, DimensionScore } from "../types";
import { COLORS, ratingColor } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

function toRating(score: number): "green" | "yellow" | "red" {
  if (score >= 7.5) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

function Dot({ rating }: { rating: "green" | "yellow" | "red" }) {
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: ratingColor(rating),
      marginRight: 6,
      flexShrink: 0,
    }} />
  );
}

interface Props {
  data: AnalysisOutput;
  onDiscuss?: (dimension_id: string) => void;
}

export default function DimensionScorecard({ data, onDiscuss }: Props) {
  const dimensions: DimensionScore[] = data.dimension_scores;
  const refs = data.reference_models;
  const dropped = data.dropped_dimensions ?? [];
  const yourColBg = "rgba(74, 159, 212, 0.06)";
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isMobile) {
    return (
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
        {dimensions.map((dim, i) => {
          const isOpen = expanded.has(dim.id);
          return (
            <div key={dim.id} style={{ borderBottom: i < dimensions.length - 1 || dropped.length > 0 ? `1px solid ${COLORS.border}` : undefined }}>
              <button
                type="button"
                onClick={() => toggleExpand(dim.id)}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "pointer",
                  color: COLORS.text,
                  textAlign: "left",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dim.label}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: COLORS.accentBlue, fontWeight: 600 }}>{dim.score.toFixed(1)}</span>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>{isOpen ? "▾" : "▸"}</span>
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: "0 14px 12px 36px", background: yourColBg }}>
                  <div style={{ fontSize: 12, color: COLORS.accentBlue, fontWeight: 600, marginBottom: 6 }}>
                    {dim.display_value}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginBottom: 6 }}>
                    {dim.note}
                  </div>
                  {refs.map((r) => {
                    const refScore = r.dimension_scores[dim.id] ?? 0;
                    const rating = toRating(refScore);
                    return (
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: COLORS.textMuted }}>
                        <span>{r.label}</span>
                        <span style={{ color: COLORS.text, display: "flex", alignItems: "center" }}>
                          <Dot rating={rating} />
                          <span>{refScore.toFixed(0)}</span>
                        </span>
                      </div>
                    );
                  })}
                  {onDiscuss && (
                    <button
                      type="button"
                      onClick={() => onDiscuss(dim.id)}
                      style={{
                        marginTop: 8,
                        background: "transparent",
                        border: `1px solid ${COLORS.border}`,
                        color: COLORS.textMuted,
                        padding: "4px 10px",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      💬 Discuss
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {dropped.map((dd) => (
          <div key={dd.id} style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>{dd.label}</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: "italic", marginTop: 2 }}>
              Not graded for your risk profile · {dd.reason}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 8,
      overflow: "hidden",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
            <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500, width: "34%" }}>
              Dimension
            </th>
            <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.accentBlue, fontWeight: 500, background: yourColBg }}>
              Yours
            </th>
            {refs.map(r => (
              <th key={r.id} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>
                {r.label}
              </th>
            ))}
            {onDiscuss && <th style={{ padding: "10px 14px", width: 40 }} />}
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dim, i) => (
            <tr
              key={dim.id}
              style={{ borderBottom: i < dimensions.length - 1 ? `1px solid ${COLORS.border}` : undefined }}
            >
              <td style={{ padding: "9px 14px" }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{dim.label}</span>
                </div>
              </td>
              <td style={{ padding: "9px 14px", background: yourColBg }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 12, color: COLORS.text }}>{dim.display_value}</span>
                </div>
              </td>
              {refs.map(r => {
                const refScore = r.dimension_scores[dim.id] ?? 0;
                const rating = toRating(refScore);
                return (
                  <td key={r.id} style={{ padding: "9px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <Dot rating={rating} />
                      <span style={{ fontSize: 12, color: COLORS.text }}>{refScore.toFixed(0)}</span>
                    </div>
                  </td>
                );
              })}
              {onDiscuss && (
                <td style={{ padding: "9px 14px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => onDiscuss(dim.id)}
                    title={`Discuss ${dim.label}`}
                    style={{
                      background: "transparent",
                      border: `1px solid ${COLORS.border}`,
                      color: COLORS.textMuted,
                      padding: "2px 6px",
                      borderRadius: 4,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    💬
                  </button>
                </td>
              )}
            </tr>
          ))}
          {dropped.map((dd) => (
            <tr key={dd.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>
                  {dd.label}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {dd.reason}
                </div>
              </td>
              <td
                colSpan={1 + refs.length + (onDiscuss ? 1 : 0)}
                style={{ padding: "9px 14px", fontSize: 12, color: COLORS.textMuted, fontStyle: "italic" }}
              >
                Not graded for your risk profile
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
