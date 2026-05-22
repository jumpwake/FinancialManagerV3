/** Normalize variant tickers (e.g. "BRK B" → "BRK-B"). */
export function canonicalTicker(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed === "BRK B") return "BRK-B";
  return trimmed;
}
