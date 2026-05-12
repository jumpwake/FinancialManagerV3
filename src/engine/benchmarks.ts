import { ReferenceModel } from "../types";

export const REFERENCE_MODELS: ReferenceModel[] = [
  {
    id: "boglehead_3fund",
    label: "Boglehead 3-fund",
    description: "Passive index",
    grade: "A",
    score: 9.1,
    dimension_scores: {
      cost_efficiency: 9, diversification: 9, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 10,
      bond_balance: 7, concentration: 8, international: 9, quality_tilt: 5,
    },
  },
  {
    id: "all_weather",
    label: "All Weather",
    description: "Risk parity (Dalio)",
    grade: "A−",
    score: 8.4,
    dimension_scores: {
      cost_efficiency: 8, diversification: 10, cash_efficiency: 9,
      macro_alignment: 7, single_stock_risk: 10, simplicity: 10,
      bond_balance: 9, concentration: 9, international: 7, quality_tilt: 8,
    },
  },
  {
    id: "classic_60_40",
    label: "Classic 60/40",
    description: "Balanced",
    grade: "B+",
    score: 7.8,
    dimension_scores: {
      cost_efficiency: 8, diversification: 7, cash_efficiency: 9,
      macro_alignment: 5, single_stock_risk: 10, simplicity: 8,
      bond_balance: 9, concentration: 8, international: 6, quality_tilt: 6,
    },
  },
];
