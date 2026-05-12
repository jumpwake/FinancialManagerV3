export const COLORS = {
  bg: "#111",
  card: "#1a1a1a",
  border: "#2a2a2a",
  text: "#f0f0f0",
  textMuted: "#888",
  accentBlue: "#4a9fd4",
  green: "#1D9E75",
  amber: "#BA7517",
  red: "#E24B4A",
  pendingBg: "#2a1f00",

  // Donut palette
  donut: {
    us_equity: "#3a9e5f",
    cash: "#5a5a5a",
    international: "#4a5fa0",
    fixed_income: "#4a7ac4",
    individual_stock: "#a05030",
    sector_tech: "#c48830",
    sector_utilities: "#7a9060",
    sector_nasdaq: "#903080",
    sector_financials: "#a0a060",
    balanced: "#7a4a90",
    other: "#666",
  },
};

export function ratingColor(rating: "green" | "yellow" | "red"): string {
  if (rating === "green") return COLORS.green;
  if (rating === "yellow") return COLORS.amber;
  return COLORS.red;
}
