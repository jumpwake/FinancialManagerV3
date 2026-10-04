// Brokerages render preferred shares as "<TICKER> PR<SERIES>" (Vanguard's
// "SF PRC" is Stifel Financial's series C preferred). The canonical form used
// everywhere else — including data/ticker-metadata.json — is "SF-C".
const PREFERRED_SHARE = /^([A-Z]{1,5}) PR([A-Z])$/;

/** Normalize variant tickers (e.g. "BRK B" → "BRK-B", "SF PRC" → "SF-C"). */
export function canonicalTicker(symbol: string): string {
  const trimmed = symbol.trim();
  if (trimmed === "BRK B") return "BRK-B";
  const preferred = trimmed.match(PREFERRED_SHARE);
  if (preferred) return `${preferred[1]}-${preferred[2]}`;
  return trimmed;
}
