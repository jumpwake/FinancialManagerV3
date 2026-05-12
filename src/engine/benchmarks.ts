import { ReferenceModel } from "../types";
import { scoreToGrade } from "./dimensions";

interface ReferenceModelSeed {
  id: string;
  label: string;
  description: string;
  dimension_scores: Record<string, number>;
}

const SEEDS: ReferenceModelSeed[] = [
  {
    id: "boglehead_3fund",
    label: "Boglehead 3-fund",
    description: "Passive index",
    dimension_scores: {
      cost_efficiency: 9, diversification: 9, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 10,
      bond_balance: 7, concentration: 8, international: 9, quality_tilt: 5,
      asset_location: 7,
    },
  },
  {
    id: "all_weather",
    label: "All Weather",
    description: "Risk parity (Dalio)",
    dimension_scores: {
      cost_efficiency: 8, diversification: 10, cash_efficiency: 9,
      macro_alignment: 7, single_stock_risk: 10, simplicity: 10,
      bond_balance: 9, concentration: 9, international: 7, quality_tilt: 8,
      asset_location: 7,
    },
  },
  {
    id: "classic_60_40",
    label: "Classic 60/40",
    description: "Balanced",
    dimension_scores: {
      cost_efficiency: 8, diversification: 7, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 8,
      bond_balance: 9, concentration: 8, international: 6, quality_tilt: 6,
      asset_location: 7,
    },
  },
];

// Engine weights per dimension (must match dimensions.ts).
// Stable values; benchmarks.test.ts asserts consistency with computePortfolioScore.
const WEIGHTS: Record<string, number> = {
  cost_efficiency: 0.09,
  diversification: 0.11,
  cash_efficiency: 0.11,
  macro_alignment: 0.09,
  single_stock_risk: 0.11,
  simplicity: 0.07,
  bond_balance: 0.11,
  concentration: 0.11,
  international: 0.06,
  quality_tilt: 0.06,
  asset_location: 0.08,
};

function deriveScore(dim_scores: Record<string, number>): number {
  return Object.entries(dim_scores).reduce(
    (sum, [id, score]) => sum + score * (WEIGHTS[id] ?? 0),
    0,
  );
}

export const REFERENCE_MODELS: ReferenceModel[] = SEEDS.map(seed => {
  const score = Number(deriveScore(seed.dimension_scores).toFixed(2));
  return {
    ...seed,
    score,
    grade: scoreToGrade(score),
  };
});
