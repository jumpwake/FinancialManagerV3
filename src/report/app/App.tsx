import { useEffect, useState } from "react";
import { AnalysisOutput } from "./types";
import { COLORS } from "./theme";
import AllocationBreakdown from "./sections/AllocationBreakdown";
import BenchmarkComparison from "./sections/BenchmarkComparison";
import DimensionScorecard from "./sections/DimensionScorecard";
import KeyFindings from "./sections/KeyFindings";
import RadarChart from "./sections/RadarChart";
import AdditionalTakeaways from "./sections/AdditionalTakeaways";
import Gaps from "./sections/Gaps";
import Flags from "./sections/Flags";

export default function App() {
  const [data, setData] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/analysis.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: AnalysisOutput) => setData(json))
      .catch(err => setError(err.message || String(err)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "2rem", color: COLORS.red }}>
        Failed to load analysis: {error}
        <div style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }}>
          Did you run <code>npm run analyze</code> first? It writes <code>output/analysis.json</code>.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: "2rem", color: COLORS.textMuted }}>Loading analysis...</div>;
  }

  const typedData = data as AnalysisOutput;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4, color: COLORS.text }}>
          {typedData.portfolio.account_label}
        </h1>
        <p style={{ fontSize: 13, color: COLORS.textMuted }}>
          Generated {new Date(typedData.generated_at).toLocaleDateString()} ·{" "}
          {typedData.portfolio.holdings.length} holdings · Grade{" "}
          <strong style={{ color: COLORS.text }}>{typedData.portfolio_grade}</strong>{" "}
          ({typedData.portfolio_score.toFixed(1)}/10)
        </p>
        {typedData.narratives?.headline_summary && (
          <p style={{ fontSize: 14, color: "#bbb", marginTop: 12, lineHeight: 1.6 }}>
            {typedData.narratives.headline_summary}
          </p>
        )}
      </div>

      <Section label="1 — Allocation breakdown">
        <AllocationBreakdown data={typedData} />
      </Section>
      <Section label="2 — Benchmark comparison">
        <BenchmarkComparison data={typedData} />
      </Section>
      <Section label="3 — Dimension scorecard">
        <DimensionScorecard data={typedData} />
      </Section>
      <Section label="4 — Key findings">
        <KeyFindings data={typedData} />
      </Section>
      <Section label="5 — Radar">
        <RadarChart data={typedData} />
      </Section>
      <Section label="6 — Additional takeaways">
        <AdditionalTakeaways data={typedData} />
      </Section>
      <Section label="7 — Gaps">
        <Gaps data={typedData} />
      </Section>
      <Section label="8 — Flags">
        <Flags data={typedData} />
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <p style={{
        fontSize: 11,
        fontWeight: 500,
        color: COLORS.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 12,
      }}>
        {label}
      </p>
      {children}
    </div>
  );
}
