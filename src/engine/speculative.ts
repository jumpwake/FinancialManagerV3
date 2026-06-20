import type { Flag, SpeculativeHold } from "../types";
import { canonicalTicker } from "../intake/tickerMetadata";
import { buildFindingKey } from "./findingKeys";

/** Canonicalized set of speculative tickers for membership checks. */
export function speculativeTickerSet(holds: SpeculativeHold[]): Set<string> {
  return new Set(holds.map(h => canonicalTicker(h.ticker)));
}

/**
 * Mutes per-name flags for speculative-sleeve tickers (annotating, not dropping,
 * to mirror applyNoteSuppressions) and appends a single sleeve-size flag when the
 * combined sleeve weight exceeds the configured threshold.
 */
export function applySpeculativeSuppressions(
  flags: Flag[],
  holds: SpeculativeHold[],
  sleeveWeight: number,
  threshold: number,
): Flag[] {
  const reasonByTicker = new Map(holds.map(h => [canonicalTicker(h.ticker), h.reason]));

  const annotated: Flag[] = flags.map(f => {
    const canonical = canonicalTicker(f.ticker);
    if (!reasonByTicker.has(canonical)) return f;
    const reason = reasonByTicker.get(canonical);
    return {
      ...f,
      suppressed_by: {
        source: "speculative_hold" as const,
        id: f.ticker,
        body: reason ?? "Held as a speculative-sleeve position",
      },
    };
  });

  if (sleeveWeight > threshold) {
    const tickers = [...reasonByTicker.keys()].join(", ");
    annotated.push({
      ticker: "SPECULATIVE",
      severity: "yellow",
      title: `Speculative sleeve at ${(sleeveWeight * 100).toFixed(1)}% of portfolio`,
      body: `Combined speculative-sleeve weight (${tickers}) is ${(sleeveWeight * 100).toFixed(1)}%, above your ${(threshold * 100).toFixed(0)}% threshold. These names are exempt from per-position scoring — re-confirm the sleeve is still intentionally sized.`,
      finding_key: buildFindingKey({ dimension: "speculative_sleeve", type: "over_threshold" }),
    });
  }

  return annotated;
}
