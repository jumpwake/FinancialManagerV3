import { AnalysisOutput, DimensionScore } from "../types";
import { COLORS, ratingColor } from "../theme";

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

export default function DimensionScorecard({ data }: { data: AnalysisOutput }) {
  const dimensions: DimensionScore[] = data.dimension_scores;
  const refs = data.reference_models; // expect 3: boglehead, all_weather, classic_60_40

  const yourColBg = "rgba(74, 159, 212, 0.06)";

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
          </tr>
        </thead>
        <tbody>
          {dimensions.map((dim, i) => (
            <tr
              key={dim.id}
              style={{ borderBottom: i < dimensions.length - 1 ? `1px solid ${COLORS.border}` : undefined }}
            >
              {/* Dimension label */}
              <td style={{ padding: "9px 14px" }}>
                <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{dim.label}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                  {dim.note.length > 60 ? dim.note.slice(0, 57) + "..." : dim.note}
                </div>
              </td>

              {/* Your portfolio cell */}
              <td style={{ padding: "9px 14px", background: yourColBg }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Dot rating={dim.rating} />
                  <span style={{ fontSize: 12, color: COLORS.text }}>{dim.display_value}</span>
                </div>
              </td>

              {/* Reference model cells */}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
