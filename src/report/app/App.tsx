import { useEffect, useState } from "react";

// Loose type — the real shape lives in src/types.ts but this file lives under
// a different tsconfig root (the Vite app), so we don't import the engine types.
// Replace with a proper import in the next task if it makes sense.
interface AnalysisOutput {
  generated_at: string;
  portfolio: { account_label: string; snapshot_date: string; holdings: unknown[] };
  portfolio_score: number;
  portfolio_grade: string;
  narratives?: {
    headline_summary: string;
    benchmark_context: string;
    strengths: string[];
    gaps: string[];
    additional_takeaways: string[];
    phase1_macro_note: string;
  } | null;
  [k: string]: unknown;
}

export default function App() {
  const [data, setData] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/analysis.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(err => setError(err.message || String(err)));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "2rem", color: "#E24B4A" }}>
        Failed to load analysis: {error}
        <div style={{ color: "#888", marginTop: 8, fontSize: 13 }}>
          Did you run <code>npm run analyze</code> first? It writes <code>output/analysis.json</code>.
        </div>
      </div>
    );
  }

  if (!data) return <div style={{ padding: "2rem", color: "#888" }}>Loading analysis...</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>
          {data.portfolio.account_label}
        </h1>
        <p style={{ fontSize: 13, color: "#888" }}>
          Generated {new Date(data.generated_at).toLocaleDateString()} · {data.portfolio.holdings.length} holdings · Grade <strong>{data.portfolio_grade}</strong> ({data.portfolio_score.toFixed(1)}/10)
        </p>
        {data.narratives?.headline_summary && (
          <p style={{ fontSize: 14, color: "#bbb", marginTop: 12, lineHeight: 1.6 }}>
            {data.narratives.headline_summary}
          </p>
        )}
      </div>
      <div style={{ padding: 16, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888" }}>
        TODO: Render the 8 sections (allocation, benchmark, scorecard, key findings, radar, takeaways, gaps, flags).
      </div>
    </div>
  );
}
