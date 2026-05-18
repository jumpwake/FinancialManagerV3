import { Radar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { AnalysisOutput } from "../types";
import { COLORS } from "../theme";

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

// 7 axes — drop international and quality_tilt for visual clarity
const RADAR_DIMS = [
  "cost_efficiency",
  "diversification",
  "cash_efficiency",
  "macro_alignment",
  "single_stock_risk",
  "simplicity",
  "bond_balance",
];

const RADAR_LABELS: Record<string, string> = {
  cost_efficiency:  "Cost",
  diversification:  "Diversification",
  cash_efficiency:  "Cash",
  macro_alignment:  "Macro",
  single_stock_risk:"Single Stock",
  simplicity:       "Simplicity",
  bond_balance:     "Bonds",
};

interface LegendEntry {
  color: string;
  label: string;
  score: number;
  borderDash?: number[];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function RadarChart({ data }: { data: AnalysisOutput }) {
  const dims = data.dimension_scores;
  const refs = data.reference_models;

  // Only plot axes whose dimension is actually graded — a dropped dimension
  // (e.g. bond_balance for an aggressive profile) must not show a dead 0 spoke.
  const activeIds = new Set(dims.map((d) => d.id));
  const radarDims = RADAR_DIMS.filter((id) => activeIds.has(id));

  function portfolioValues(): number[] {
    return radarDims.map(id => dims.find(d => d.id === id)?.score ?? 0);
  }

  function refValues(m: AnalysisOutput["reference_models"][0]): number[] {
    return radarDims.map(id => m.dimension_scores[id] ?? 0);
  }

  const blueColor = COLORS.accentBlue;
  const tealColor = "#2a8a6a";
  const amberColor = "#a8743a";
  const grayColor = "#888";

  const refDatasets = refs.map((m, i) => {
    const color = i === 0 ? tealColor : i === 1 ? amberColor : grayColor;
    return {
      label: m.label,
      data: refValues(m),
      borderColor: color,
      backgroundColor: hexToRgba(color, 0.07),
      borderDash: [5, 5],
      pointRadius: 3,
      borderWidth: 1.5,
    };
  });

  const chartData = {
    labels: radarDims.map(id => RADAR_LABELS[id]),
    datasets: [
      {
        label: data.portfolio.account_label,
        data: portfolioValues(),
        borderColor: blueColor,
        backgroundColor: hexToRgba(blueColor, 0.12),
        borderDash: [],
        pointRadius: 4,
        borderWidth: 2,
      },
      ...refDatasets,
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
    },
    scales: {
      r: {
        min: 0,
        max: 10,
        ticks: {
          stepSize: 2,
          color: COLORS.textMuted,
          font: { size: 10 },
          backdropColor: "transparent",
        },
        grid: { color: hexToRgba("#ffffff", 0.1) },
        angleLines: { color: hexToRgba("#ffffff", 0.1) },
        pointLabels: { color: COLORS.text, font: { size: 11 } },
      },
    },
  };

  // Legend entries
  const legendEntries: LegendEntry[] = [
    { color: blueColor, label: data.portfolio.account_label, score: data.portfolio_score },
    ...refs.map((m, i) => ({
      color: i === 0 ? tealColor : i === 1 ? amberColor : grayColor,
      label: m.label,
      score: m.score,
      borderDash: [5, 5],
    })),
  ];

  return (
    <div>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <Radar data={chartData} options={chartOptions as never} />
      </div>

      {/* Custom legend */}
      <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        {legendEntries.map(entry => (
          <div key={entry.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 14,
              height: 3,
              background: entry.color,
              borderRadius: 2,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: COLORS.text }}>{entry.label}</span>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>{entry.score.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
