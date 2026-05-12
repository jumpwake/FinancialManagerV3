import { useCallback, useEffect, useState } from "react";
import { AnalysisOutput, ChatScope, Situation } from "./types";
import { COLORS } from "./theme";
import AllocationBreakdown from "./sections/AllocationBreakdown";
import BenchmarkComparison from "./sections/BenchmarkComparison";
import DimensionScorecard from "./sections/DimensionScorecard";
import KeyFindings from "./sections/KeyFindings";
import RadarChart from "./sections/RadarChart";
import AdditionalTakeaways from "./sections/AdditionalTakeaways";
import Gaps from "./sections/Gaps";
import Flags from "./sections/Flags";
import { OpenSituations } from "./sections/OpenSituations";
import { Sidebar } from "./sidebar/Sidebar";

export default function App() {
  const [data, setData] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ChatScope>({ type: "global" });
  const [liveSituations, setLiveSituations] = useState<Situation[]>([]);

  const loadAnalysis = useCallback(async () => {
    try {
      const r = await fetch("/analysis.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as AnalysisOutput;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadSituations = useCallback(async () => {
    try {
      const r = await fetch("/api/situations");
      if (!r.ok) return;
      const list = (await r.json()) as Situation[];
      setLiveSituations(list);
    } catch {
      // Silently fall back to analysis.json situations
    }
  }, []);

  useEffect(() => {
    loadAnalysis();
    loadSituations();
    const id = setInterval(loadSituations, 5000);
    return () => clearInterval(id);
  }, [loadAnalysis, loadSituations]);

  const handleResolve = useCallback(
    async (sit: Situation) => {
      const reason = window.prompt(`Why is "${sit.title}" resolved?`, "completed");
      if (reason === null) return;
      await fetch(`/api/situations/${sit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed", closure_reason: reason }),
      });
      await loadSituations();
    },
    [loadSituations],
  );

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

  const typedData = data;
  // Prefer live situations from /api/situations (always current) over the
  // snapshot baked into analysis.json (stale until next `npm run analyze`).
  const situations = liveSituations.length > 0 ? liveSituations : (typedData.situations ?? []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", minHeight: "100vh" }}>
      <main style={{ padding: "2rem 1rem", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif", width: "100%" }}>
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

        <OpenSituations
          situations={situations}
          onDiscuss={(sit) => setScope({ type: "situation", situation_id: sit.id })}
          onResolve={handleResolve}
        />

        <Section label="1 — Allocation breakdown">
          <AllocationBreakdown data={typedData} />
        </Section>
        <Section label="2 — Benchmark comparison">
          <BenchmarkComparison data={typedData} />
        </Section>
        <Section label="3 — Dimension scorecard">
          <DimensionScorecard
            data={typedData}
            onDiscuss={(id) => setScope({ type: "dimension", dimension_id: id })}
          />
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
          <Gaps data={typedData} onDiscuss={(k) => setScope({ type: "gap", finding_key: k })} />
        </Section>
        <Section label="8 — Flags">
          <Flags data={typedData} onDiscuss={(k) => setScope({ type: "flag", finding_key: k })} />
        </Section>
      </main>

      <Sidebar
        scope={scope}
        onScopeChange={setScope}
        initialHistory={[]}
      />
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
