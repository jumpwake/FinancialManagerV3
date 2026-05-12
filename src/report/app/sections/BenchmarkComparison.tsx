import { AnalysisOutput } from "../types";
import { COLORS } from "../theme";

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return COLORS.green;
  if (grade.startsWith("B")) return COLORS.accentBlue;
  if (grade.startsWith("C")) return COLORS.amber;
  return COLORS.red;
}

export default function BenchmarkComparison({ data }: { data: AnalysisOutput }) {
  const portfolioCard = {
    id: "portfolio",
    label: data.portfolio.account_label,
    description: "Your portfolio",
    grade: data.portfolio_grade,
    score: data.portfolio_score,
    isPortfolio: true,
  };

  const refCards = data.reference_models.map(m => ({
    id: m.id,
    label: m.label,
    description: m.description,
    grade: m.grade,
    score: m.score,
    isPortfolio: false,
  }));

  const cards = [portfolioCard, ...refCards];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {cards.map(card => (
          <div
            key={card.id}
            style={{
              flex: 1,
              minWidth: 160,
              background: COLORS.card,
              border: card.isPortfolio
                ? `2px solid ${COLORS.accentBlue}`
                : `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{
              display: "inline-block",
              fontSize: 10,
              color: COLORS.textMuted,
              background: "#222",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: "2px 6px",
              marginBottom: 14,
            }}>
              {card.description}
            </div>
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              color: gradeColor(card.grade),
              lineHeight: 1,
              marginBottom: 6,
              letterSpacing: "-0.02em",
            }}>
              {card.grade}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              {card.score.toFixed(1)} / 10
            </div>
          </div>
        ))}
      </div>

      {/* AI benchmark context */}
      {data.narratives ? (
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "14px 16px",
          fontSize: 14,
          color: "#bbb",
          lineHeight: 1.7,
        }}>
          {data.narratives.benchmark_context}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
          (AI narratives not generated — set ANTHROPIC_API_KEY and re-run.)
        </div>
      )}
    </div>
  );
}
