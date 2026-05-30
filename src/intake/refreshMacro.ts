import fs from "node:fs";
import path from "node:path";
import { FredClient, type FredObservation } from "./fredClient";
import { fetchMacroAI, type MacroAIResult } from "./macroAi";
import {
  classifyMarketRegime,
  classifyYieldCurve,
  sectorTiltsFor,
  type MacroNumerics,
} from "./macroRules";
import type { MacroContext } from "../types";

type NumericMacroField =
  | "federal_funds_rate"
  | "cpi_yoy_headline"
  | "cpi_yoy_core"
  | "yield_curve_spread_10y_2y"
  | "vix"
  | "hy_credit_spread_oas_bps";

interface FredFetchSpec {
  seriesId: string;
  field: NumericMacroField;
  op: "latest" | "yoy";
  transform?: (raw: number) => number;
}

const FRED_SERIES: FredFetchSpec[] = [
  { seriesId: "DFF", field: "federal_funds_rate", op: "latest" },
  { seriesId: "T10Y2Y", field: "yield_curve_spread_10y_2y", op: "latest" },
  { seriesId: "VIXCLS", field: "vix", op: "latest" },
  { seriesId: "BAMLH0A0HYM2", field: "hy_credit_spread_oas_bps", op: "latest", transform: (v) => v * 100 },
  { seriesId: "CPIAUCSL", field: "cpi_yoy_headline", op: "yoy" },
  { seriesId: "CPILFESL", field: "cpi_yoy_core", op: "yoy" },
];

export interface FredFetcher {
  getLatest(seriesId: string, opts?: { lookback?: number }): Promise<FredObservation>;
  getYoYPercent(seriesId: string): Promise<FredObservation>;
}

export interface RefreshMacroDeps {
  /** Override the FRED client (for tests). When undefined and FRED_API_KEY is set, a real FredClient is constructed. */
  fredClient?: FredFetcher | null;
  /** Override the AI macro fetcher (for tests). When undefined and ANTHROPIC_API_KEY is set, the real fetchMacroAI is called. */
  fetchAI?: (referenceDate: string) => Promise<MacroAIResult>;
}

export interface RefreshMacroOptions extends RefreshMacroDeps {
  macroFile?: string;
  fredApiKey?: string;
  todayIso?: string;
  logger?: (msg: string) => void;
}

export async function refreshMacro(opts: RefreshMacroOptions = {}): Promise<MacroContext> {
  const macroFile = opts.macroFile ?? path.join(process.cwd(), "data", "macro.json");
  const log = opts.logger ?? ((m: string) => console.log(`refresh-macro: ${m}`));
  const today = opts.todayIso ?? new Date().toISOString().slice(0, 10);

  const previous = readExisting(macroFile);

  // ── FRED fetches ──────────────────────────────────────────────────────────
  const numerics: Record<NumericMacroField, number> = {
    federal_funds_rate: previous.federal_funds_rate,
    cpi_yoy_headline: previous.cpi_yoy_headline,
    cpi_yoy_core: previous.cpi_yoy_core,
    yield_curve_spread_10y_2y: previous.yield_curve_spread_10y_2y,
    vix: previous.vix,
    hy_credit_spread_oas_bps: previous.hy_credit_spread_oas_bps,
  };

  const fredClient =
    opts.fredClient !== undefined
      ? opts.fredClient
      : buildFredClient(opts.fredApiKey ?? process.env.FRED_API_KEY);

  if (!fredClient) {
    log("FRED_API_KEY unset; skipping FRED fetch, using existing macro.json values");
  } else {
    for (let i = 0; i < FRED_SERIES.length; i++) {
      const spec = FRED_SERIES[i];
      // Small inter-call delay to avoid FRED's sub-second burst limiter.
      // FredClient also retries on 429, so this is belt-and-suspenders.
      if (i > 0) await new Promise((r) => setTimeout(r, 150));
      try {
        const obs =
          spec.op === "yoy"
            ? await fredClient.getYoYPercent(spec.seriesId)
            : await fredClient.getLatest(spec.seriesId, { lookback: 7 });
        const raw = spec.transform ? spec.transform(obs.value) : obs.value;
        const value = roundForField(spec.field, raw);
        numerics[spec.field] = value;
        log(`FRED ${spec.seriesId} → ${spec.field} = ${value} (${obs.date})`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        log(
          `FRED ${spec.seriesId} failed (${detail}); keeping previous ${spec.field} = ${previous[spec.field]}`,
        );
      }
    }
  }

  // ── AI macro completion (LEI, ISM) ────────────────────────────────────────
  let lei = previous.lei_consecutive_declines;
  let ismMfg = previous.ism_manufacturing;
  let ismSvc = previous.ism_services;

  const aiFn = opts.fetchAI ?? (process.env.ANTHROPIC_API_KEY ? fetchMacroAI : null);
  if (!aiFn) {
    log("ANTHROPIC_API_KEY unset; skipping AI macro completion, using existing LEI/ISM values");
  } else {
    try {
      const ai = await aiFn(today);
      lei = ai.lei_consecutive_declines;
      ismMfg = ai.ism_manufacturing;
      ismSvc = ai.ism_services;
      log(
        `AI macro: LEI declines=${lei}, ISM mfg=${ismMfg}, ISM svc=${ismSvc} (${ai.as_of_date}; ${ai.source_notes})`,
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      log(`AI macro fetch failed (${detail}); keeping previous LEI/ISM values`);
    }
  }

  // ── Rules engine + derived fields ─────────────────────────────────────────
  const fullNumerics: MacroNumerics = {
    ...numerics,
    lei_consecutive_declines: lei,
    ism_manufacturing: ismMfg,
    ism_services: ismSvc,
  };
  const regime = classifyMarketRegime(fullNumerics);
  const yieldCurveStatus = classifyYieldCurve(fullNumerics.yield_curve_spread_10y_2y);
  const tilts = sectorTiltsFor(regime);

  // ── Assemble + persist ────────────────────────────────────────────────────
  const refreshed: MacroContext = {
    snapshot_date: today,
    federal_funds_rate: fullNumerics.federal_funds_rate,
    cpi_yoy_headline: fullNumerics.cpi_yoy_headline,
    cpi_yoy_core: fullNumerics.cpi_yoy_core,
    yield_curve_spread_10y_2y: fullNumerics.yield_curve_spread_10y_2y,
    yield_curve_status: yieldCurveStatus,
    vix: fullNumerics.vix,
    hy_credit_spread_oas_bps: fullNumerics.hy_credit_spread_oas_bps,
    lei_consecutive_declines: fullNumerics.lei_consecutive_declines,
    ism_manufacturing: fullNumerics.ism_manufacturing,
    ism_services: fullNumerics.ism_services,
    market_regime: regime,
    sector_overweight: tilts.overweight,
    sector_underweight: tilts.underweight,
  };
  fs.writeFileSync(macroFile, JSON.stringify(refreshed, null, 2) + "\n");
  log(`wrote ${macroFile} (regime=${regime}, yield_curve=${yieldCurveStatus})`);
  return refreshed;
}

function readExisting(macroFile: string): MacroContext {
  if (!fs.existsSync(macroFile)) {
    throw new Error(
      `refreshMacro: ${macroFile} not found; cannot establish fallback values`,
    );
  }
  return JSON.parse(fs.readFileSync(macroFile, "utf-8")) as MacroContext;
}

function buildFredClient(apiKey: string | undefined): FredClient | null {
  if (!apiKey) return null;
  return new FredClient(apiKey);
}

/**
 * Per-field precision for what gets written to macro.json. FRED returns
 * floats with up to 17 digits of representation noise (e.g. 2.74330943...);
 * round to what's actually meaningful for each indicator.
 */
function roundForField(field: NumericMacroField, value: number): number {
  switch (field) {
    case "hy_credit_spread_oas_bps":
      return Math.round(value); // basis points — integers
    case "federal_funds_rate":
    case "cpi_yoy_headline":
    case "cpi_yoy_core":
    case "yield_curve_spread_10y_2y":
    case "vix":
      return Number(value.toFixed(2));
    default:
      return value;
  }
}
