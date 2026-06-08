import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadTickerMetadata,
  lookupTicker,
  resetTickerMetadataCache,
  TickerMetadataFileSchema,
} from "./tickerClassifier";

let tmpFile: string;

beforeEach(() => {
  resetTickerMetadataCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ticker-meta-"));
  tmpFile = path.join(dir, "ticker-metadata.json");
});

describe("loadTickerMetadata", () => {
  it("returns empty map when file is missing", () => {
    const file = loadTickerMetadata(tmpFile);
    expect(file).toEqual({ version: 1, tickers: {} });
  });

  it("parses and returns a well-formed file", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: {
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
      },
    }));
    const file = loadTickerMetadata(tmpFile);
    expect(file.tickers.VXUS?.asset_class).toBe("international_equity");
  });

  it("caches per-process; reset clears it", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ version: 1, tickers: {} }));
    loadTickerMetadata(tmpFile);
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: { VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" } },
    }));
    // Without reset, the cache is still empty
    expect(loadTickerMetadata(tmpFile).tickers.VXUS).toBeUndefined();
    resetTickerMetadataCache();
    expect(loadTickerMetadata(tmpFile).tickers.VXUS?.asset_class).toBe("international_equity");
  });
});

describe("TickerMetadataFileSchema", () => {
  it("accepts every asset_class variant including 'unknown'", () => {
    const file = {
      version: 1 as const,
      tickers: {
        VTSAX: { asset_class: "us_equity_total_market", expense_ratio: 0.0004, classified_at: "2026-05-22" },
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
        XLU: { asset_class: "us_equity_sector", expense_ratio: 0.0008, sector_tag: "utilities", classified_at: "2026-05-22" },
        VWENX: {
          asset_class: "balanced", expense_ratio: 0.0017,
          underlying_composition: { us_equity: 0.6, international_equity: 0.05, fixed_income: 0.35, cash: 0.0 },
          classified_at: "2026-05-22",
        },
        FAKETICKER: { asset_class: "unknown", classified_at: "2026-05-22", notes: "unrecognized" },
      },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).not.toThrow();
  });

  it("rejects us_equity_sector without sector_tag", () => {
    const file = {
      version: 1,
      tickers: { XLU: { asset_class: "us_equity_sector", expense_ratio: 0.0008, classified_at: "2026-05-22" } },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).toThrow();
  });

  it("rejects balanced without underlying_composition", () => {
    const file = {
      version: 1,
      tickers: { VWENX: { asset_class: "balanced", expense_ratio: 0.0017, classified_at: "2026-05-22" } },
    };
    expect(() => TickerMetadataFileSchema.parse(file)).toThrow();
  });
});

describe("crypto asset class", () => {
  it("TickerMetadataFileSchema accepts a crypto entry (minimal shape)", () => {
    const parsed = TickerMetadataFileSchema.parse({
      version: 1,
      tickers: {
        FBTC: { asset_class: "crypto", expense_ratio: 0.0025, classified_at: "2026-06-08" },
      },
    });
    expect(parsed.tickers.FBTC.asset_class).toBe("crypto");
  });
});

describe("lookupTicker", () => {
  beforeEach(() => {
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: {
        VXUS: { asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-05-22" },
        "BRK-B": { asset_class: "individual_stock", expense_ratio: null, stock_metrics: {
          pe_ratio: 26.12, ev_ebitda: null, fcf_yield: null, roe: null,
          eps_growth_yoy: null, revenue_growth_yoy: null, net_debt_ebitda: null,
          beta: 0.622, analyst_consensus: 3.41,
        }, classified_at: "2026-05-22" },
      },
    }));
    loadTickerMetadata(tmpFile);
  });

  it("returns metadata for a known ticker", () => {
    expect(lookupTicker("VXUS")?.asset_class).toBe("international_equity");
  });

  it("returns null for an unknown ticker", () => {
    expect(lookupTicker("FAKETICKER")).toBeNull();
  });

  it("canonicalizes 'BRK B' to 'BRK-B'", () => {
    expect(lookupTicker("BRK B")?.asset_class).toBe("individual_stock");
  });
});
