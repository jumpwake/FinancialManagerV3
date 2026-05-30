import { describe, test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshMacro, type FredFetcher } from "./refreshMacro";
import type { MacroAIResult } from "./macroAi";
import { FredError, type FredObservation } from "./fredClient";
import { parseMacro } from "./parseMacro";

const PREVIOUS_MACRO = {
  snapshot_date: "2026-05-10",
  federal_funds_rate: 4.75,
  cpi_yoy_headline: 2.8,
  cpi_yoy_core: 2.6,
  yield_curve_spread_10y_2y: -0.12,
  yield_curve_status: "inverted",
  vix: 18.4,
  hy_credit_spread_oas_bps: 345,
  lei_consecutive_declines: 6,
  ism_manufacturing: 49.2,
  ism_services: 53.1,
  market_regime: "Late Cycle",
  sector_overweight: ["healthcare"],
  sector_underweight: ["consumer_discretionary"],
};

interface FredMockEntry {
  date: string;
  value: number;
}

class StubFredFetcher implements FredFetcher {
  constructor(
    private latest: Record<string, FredMockEntry | Error>,
    private yoy: Record<string, FredMockEntry | Error>,
  ) {}

  async getLatest(seriesId: string): Promise<FredObservation> {
    const v = this.latest[seriesId];
    if (!v) throw new FredError(`stub missing series ${seriesId}`);
    if (v instanceof Error) throw v;
    return v;
  }

  async getYoYPercent(seriesId: string): Promise<FredObservation> {
    const v = this.yoy[seriesId];
    if (!v) throw new FredError(`stub missing yoy series ${seriesId}`);
    if (v instanceof Error) throw v;
    return v;
  }
}

let tmpDir: string;
let macroFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "macro-refresh-"));
  macroFile = path.join(tmpDir, "macro.json");
  fs.writeFileSync(macroFile, JSON.stringify(PREVIOUS_MACRO, null, 2));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("refreshMacro", () => {
  test("rewrites macro.json with fresh FRED + AI values and derived regime", async () => {
    const fred = new StubFredFetcher(
      {
        DFF: { date: "2026-05-26", value: 4.33 },
        T10Y2Y: { date: "2026-05-26", value: 0.49 },
        VIXCLS: { date: "2026-05-26", value: 15.2 },
        BAMLH0A0HYM2: { date: "2026-05-26", value: 3.10 }, // → 310 bps
      },
      {
        CPIAUCSL: { date: "2026-04-01", value: 2.49 },
        CPILFESL: { date: "2026-04-01", value: 2.35 },
      },
    );
    const aiResult: MacroAIResult = {
      lei_consecutive_declines: 2,
      ism_manufacturing: 51.5,
      ism_services: 54.2,
      as_of_date: "2026-05-01",
      source_notes: "ISM release 2026-05-01",
    };

    const refreshed = await refreshMacro({
      macroFile,
      todayIso: "2026-05-30",
      fredClient: fred,
      fetchAI: async () => aiResult,
      logger: () => undefined,
    });

    expect(refreshed.snapshot_date).toBe("2026-05-30");
    expect(refreshed.federal_funds_rate).toBe(4.33);
    expect(refreshed.yield_curve_spread_10y_2y).toBe(0.49);
    expect(refreshed.yield_curve_status).toBe("flat");
    expect(refreshed.vix).toBe(15.2);
    expect(refreshed.hy_credit_spread_oas_bps).toBeCloseTo(310, 5);
    expect(refreshed.cpi_yoy_headline).toBe(2.49);
    expect(refreshed.cpi_yoy_core).toBe(2.35);
    expect(refreshed.lei_consecutive_declines).toBe(2);
    expect(refreshed.ism_manufacturing).toBe(51.5);
    expect(refreshed.ism_services).toBe(54.2);
    expect(refreshed.market_regime).toBe("Mid Cycle");
    expect(refreshed.sector_overweight).toContain("technology");
    expect(refreshed.sector_underweight).toContain("utilities");

    // File on disk matches and parses through parseMacro
    const onDisk = JSON.parse(fs.readFileSync(macroFile, "utf-8"));
    expect(() => parseMacro(onDisk)).not.toThrow();
    expect(onDisk.federal_funds_rate).toBe(4.33);
  });

  test("falls back to previous value when one FRED series fails", async () => {
    const fred = new StubFredFetcher(
      {
        DFF: { date: "2026-05-26", value: 4.33 },
        T10Y2Y: new FredError("503 unavailable", "T10Y2Y"),
        VIXCLS: { date: "2026-05-26", value: 15.2 },
        BAMLH0A0HYM2: { date: "2026-05-26", value: 3.10 },
      },
      {
        CPIAUCSL: { date: "2026-04-01", value: 2.49 },
        CPILFESL: { date: "2026-04-01", value: 2.35 },
      },
    );
    const aiResult: MacroAIResult = {
      lei_consecutive_declines: 2,
      ism_manufacturing: 51.5,
      ism_services: 54.2,
      as_of_date: "2026-05-01",
      source_notes: "test",
    };

    const refreshed = await refreshMacro({
      macroFile,
      todayIso: "2026-05-30",
      fredClient: fred,
      fetchAI: async () => aiResult,
      logger: () => undefined,
    });

    // T10Y2Y kept previous value
    expect(refreshed.yield_curve_spread_10y_2y).toBe(PREVIOUS_MACRO.yield_curve_spread_10y_2y);
    // Other FRED series still refreshed
    expect(refreshed.federal_funds_rate).toBe(4.33);
    expect(refreshed.vix).toBe(15.2);
  });

  test("falls back entirely when fredClient is null (no FRED_API_KEY)", async () => {
    const aiResult: MacroAIResult = {
      lei_consecutive_declines: 2,
      ism_manufacturing: 51.5,
      ism_services: 54.2,
      as_of_date: "2026-05-01",
      source_notes: "test",
    };

    const refreshed = await refreshMacro({
      macroFile,
      todayIso: "2026-05-30",
      fredClient: null,
      fetchAI: async () => aiResult,
      logger: () => undefined,
    });

    // All FRED-sourced fields kept previous values
    expect(refreshed.federal_funds_rate).toBe(PREVIOUS_MACRO.federal_funds_rate);
    expect(refreshed.yield_curve_spread_10y_2y).toBe(PREVIOUS_MACRO.yield_curve_spread_10y_2y);
    expect(refreshed.vix).toBe(PREVIOUS_MACRO.vix);
    expect(refreshed.cpi_yoy_headline).toBe(PREVIOUS_MACRO.cpi_yoy_headline);
    // AI fields refreshed
    expect(refreshed.lei_consecutive_declines).toBe(2);
    expect(refreshed.ism_manufacturing).toBe(51.5);
    // snapshot_date still bumped
    expect(refreshed.snapshot_date).toBe("2026-05-30");
  });

  test("falls back on AI failure but still refreshes FRED fields", async () => {
    const fred = new StubFredFetcher(
      {
        DFF: { date: "2026-05-26", value: 4.33 },
        T10Y2Y: { date: "2026-05-26", value: 0.49 },
        VIXCLS: { date: "2026-05-26", value: 15.2 },
        BAMLH0A0HYM2: { date: "2026-05-26", value: 3.10 },
      },
      {
        CPIAUCSL: { date: "2026-04-01", value: 2.49 },
        CPILFESL: { date: "2026-04-01", value: 2.35 },
      },
    );

    const refreshed = await refreshMacro({
      macroFile,
      todayIso: "2026-05-30",
      fredClient: fred,
      fetchAI: async () => {
        throw new Error("Anthropic 503");
      },
      logger: () => undefined,
    });

    // FRED values refreshed
    expect(refreshed.federal_funds_rate).toBe(4.33);
    expect(refreshed.yield_curve_spread_10y_2y).toBe(0.49);
    // AI fields kept previous
    expect(refreshed.lei_consecutive_declines).toBe(PREVIOUS_MACRO.lei_consecutive_declines);
    expect(refreshed.ism_manufacturing).toBe(PREVIOUS_MACRO.ism_manufacturing);
    expect(refreshed.ism_services).toBe(PREVIOUS_MACRO.ism_services);
  });

  test("re-classifies regime + sector tilts from refreshed numerics", async () => {
    // Start from "Late Cycle" macro.json. New values point to recession.
    const fred = new StubFredFetcher(
      {
        DFF: { date: "2026-05-26", value: 5.25 },
        T10Y2Y: { date: "2026-05-26", value: -0.6 },
        VIXCLS: { date: "2026-05-26", value: 28.0 },
        BAMLH0A0HYM2: { date: "2026-05-26", value: 6.50 }, // 650 bps
      },
      {
        CPIAUCSL: { date: "2026-04-01", value: 3.1 },
        CPILFESL: { date: "2026-04-01", value: 3.0 },
      },
    );
    const aiResult: MacroAIResult = {
      lei_consecutive_declines: 9,
      ism_manufacturing: 44.5,
      ism_services: 47.0,
      as_of_date: "2026-05-01",
      source_notes: "test",
    };

    const refreshed = await refreshMacro({
      macroFile,
      todayIso: "2026-05-30",
      fredClient: fred,
      fetchAI: async () => aiResult,
      logger: () => undefined,
    });

    expect(refreshed.market_regime).toBe("Recession");
    expect(refreshed.yield_curve_status).toBe("inverted");
    expect(refreshed.sector_overweight).toContain("consumer_staples");
    expect(refreshed.sector_underweight).toContain("financials");
  });

  test("throws when macro.json doesn't exist (no fallback source)", async () => {
    fs.rmSync(macroFile);
    await expect(
      refreshMacro({ macroFile, todayIso: "2026-05-30", fredClient: null, logger: () => undefined }),
    ).rejects.toThrow(/not found/);
  });
});
