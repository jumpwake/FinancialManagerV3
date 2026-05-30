export interface FredObservation {
  date: string;
  value: number;
}

export class FredError extends Error {
  constructor(message: string, public readonly seriesId?: string) {
    super(message);
    this.name = "FredError";
  }
}

interface RawObservation {
  date: string;
  value: string;
}

interface ObservationsResponse {
  observations?: RawObservation[];
  error_message?: string;
}

// FRED v1 endpoint: api_key goes in the query string. FRED v2 lives at
// /fred/v2/... with Authorization: Bearer auth, but requires a separate
// developer-portal registration that isn't a drop-in for the v1 API key —
// migrate when that's sorted on the account side.
const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

export class FredClient {
  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("FredClient: apiKey is required");
  }

  /**
   * Fetches the most recent non-missing observation for a series.
   * `lookback` controls how many recent observations to inspect when skipping "." gaps.
   */
  async getLatest(seriesId: string, opts?: { lookback?: number }): Promise<FredObservation> {
    const lookback = opts?.lookback ?? 1;
    const data = await this.fetchObservations(seriesId, lookback);
    for (const obs of data) {
      if (obs.value !== ".") {
        const value = Number(obs.value);
        if (Number.isFinite(value)) return { date: obs.date, value };
      }
    }
    throw new FredError(
      `No valid observation in last ${lookback} for series ${seriesId}`,
      seriesId,
    );
  }

  /**
   * Fetches last ~13 months of a monthly series and computes year-over-year percent change
   * between the latest value and the value from 12 calendar months earlier.
   */
  async getYoYPercent(seriesId: string): Promise<FredObservation> {
    const data = await this.fetchObservations(seriesId, 14);
    const valid = data
      .filter((o) => o.value !== ".")
      .map((o) => ({ date: o.date, value: Number(o.value) }))
      .filter((o) => Number.isFinite(o.value));

    if (valid.length < 2) {
      throw new FredError(
        `Need at least 2 valid observations for YoY of ${seriesId}, got ${valid.length}`,
        seriesId,
      );
    }

    const latest = valid[0];
    const target = priorYearObservation(latest.date, valid.slice(1));
    if (!target) {
      throw new FredError(
        `No comparable observation ~12mo prior to ${latest.date} for ${seriesId}`,
        seriesId,
      );
    }

    const yoy = (latest.value / target.value - 1) * 100;
    return { date: latest.date, value: yoy };
  }

  private async fetchObservations(seriesId: string, limit: number): Promise<RawObservation[]> {
    const url = new URL(FRED_BASE_URL);
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", String(limit));

    // FRED's documented limit is 120/min but a sub-second burst limiter exists
    // — back-to-back calls (6 in <1s during macro refresh) reliably 429.
    // Retry with exponential backoff; honor Retry-After if FRED sets it.
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new FredError(`Network error fetching ${seriesId}: ${msg}`, seriesId);
      }

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : 500 * Math.pow(2, attempt); // 500ms, 1s, 2s
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      if (!response.ok) {
        let body = "";
        try {
          body = await response.text();
        } catch {
          // ignore
        }
        throw new FredError(
          `FRED returned ${response.status} for ${seriesId}: ${body}`,
          seriesId,
        );
      }

      const json = (await response.json()) as ObservationsResponse;
      if (json.error_message) {
        throw new FredError(`FRED error for ${seriesId}: ${json.error_message}`, seriesId);
      }
      if (!json.observations || json.observations.length === 0) {
        throw new FredError(`No observations returned for ${seriesId}`, seriesId);
      }
      return json.observations;
    }

    // Loop exits only via return or throw above; this is unreachable.
    throw new FredError(`Exhausted retries for ${seriesId}`, seriesId);
  }
}

/**
 * From a list of older observations (sorted newest-first), return the one whose date
 * is closest to 12 calendar months before `latestDate`. Returns null if none found
 * within a 2-month tolerance window.
 */
function priorYearObservation(
  latestDate: string,
  older: { date: string; value: number }[],
): { date: string; value: number } | null {
  const latest = new Date(latestDate);
  const targetTime = new Date(latest.getFullYear() - 1, latest.getMonth(), latest.getDate()).getTime();
  const TWO_MONTHS_MS = 62 * 24 * 60 * 60 * 1000;

  let best: { date: string; value: number } | null = null;
  let bestDelta = Infinity;
  for (const obs of older) {
    const delta = Math.abs(new Date(obs.date).getTime() - targetTime);
    if (delta < bestDelta && delta <= TWO_MONTHS_MS) {
      bestDelta = delta;
      best = obs;
    }
  }
  return best;
}
