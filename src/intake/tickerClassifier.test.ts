import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadTickerMetadata,
  lookupTicker,
  resetTickerMetadataCache,
  TickerMetadataFileSchema,
  classifyTickers,
} from "./tickerClassifier";
import { canonicalTicker } from "./tickerMetadata";
import { todayIso } from "../report/app/ai/today";

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
  },
}));

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

describe("canonicalTicker via lookupTicker — preferred shares", () => {
  beforeEach(() => {
    fs.writeFileSync(tmpFile, JSON.stringify({
      version: 1,
      tickers: {
        "SF-C": {
          asset_class: "individual_stock", expense_ratio: null, stock_metrics: {
            pe_ratio: null, ev_ebitda: null, fcf_yield: null, roe: null,
            eps_growth_yoy: null, revenue_growth_yoy: null, net_debt_ebitda: null,
            beta: 0.35, analyst_consensus: null,
          }, classified_at: "2026-09-01",
        },
      },
    }));
    loadTickerMetadata(tmpFile);
  });

  it("canonicalizes Vanguard's 'SF PRC' to 'SF-C'", () => {
    expect(lookupTicker("SF PRC")?.asset_class).toBe("individual_stock");
  });

  it("leaves a plain ticker that merely starts with PR alone", () => {
    expect(lookupTicker("PRU")).toBeNull();
    expect(canonicalTicker("PRU")).toBe("PRU");
  });
});

describe("classifyTickers persistence", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    fs.writeFileSync(tmpFile, JSON.stringify({ version: 1, tickers: {} }));
    loadTickerMetadata(tmpFile);
  });

  // Entries get a source URL by default — the classifier rejects sourceless
  // entries (except "unknown") now that it can search the web.
  const respond = (entries: Record<string, unknown>[]) => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({
        entries: entries.map(e => ({ sources: ["https://example.com/fund"], ...e })),
      }) }],
    });
  };

  it("keys the entry by the requested symbol even when Claude echoes a different one", async () => {
    respond([{
      symbol: "SF.C",
      asset_class: "individual_stock",
      expense_ratio: null,
      stock_metrics: {
        pe_ratio: null, ev_ebitda: null, fcf_yield: null, roe: null,
        eps_growth_yoy: null, revenue_growth_yoy: null, net_debt_ebitda: null,
        beta: 0.35, analyst_consensus: null,
      },
      classified_at: "2026-09-01",
    }]);

    const merged = await classifyTickers(["SF PRC"], tmpFile);

    expect(Object.keys(merged.tickers)).toEqual(["SF-C"]);
    expect(lookupTicker("SF PRC")?.asset_class).toBe("individual_stock");
  });

  it("matches entries to requests by symbol, not position, when the order differs", async () => {
    respond([
      { symbol: "TLT", asset_class: "us_bond_short", expense_ratio: 0.0015, classified_at: "2026-09-01" },
      { symbol: "VXUS", asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-09-01" },
    ]);

    const merged = await classifyTickers(["VXUS", "TLT"], tmpFile);

    expect(merged.tickers.VXUS?.asset_class).toBe("international_equity");
    expect(merged.tickers.TLT?.asset_class).toBe("us_bond_short");
  });

  it("does not write entries for symbols that were never requested", async () => {
    respond([
      { symbol: "VXUS", asset_class: "international_equity", expense_ratio: 0.0007, classified_at: "2026-09-01" },
      { symbol: "SPY", asset_class: "us_equity_large_cap", expense_ratio: 0.0009, classified_at: "2026-09-01" },
    ]);

    const merged = await classifyTickers(["VXUS"], tmpFile);

    expect(Object.keys(merged.tickers)).toEqual(["VXUS"]);
  });
});

describe("classifyTickers — web search and current date", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    fs.writeFileSync(tmpFile, JSON.stringify({ version: 1, tickers: {} }));
    loadTickerMetadata(tmpFile);
  });

  const ok = (entries: Record<string, unknown>[], preamble = "") => ({
    stop_reason: "end_turn",
    content: [
      ...(preamble ? [{ type: "text", text: preamble }] : []),
      { type: "text", text: JSON.stringify({ entries }) },
    ],
  });
  const vxus = { symbol: "VXUS", asset_class: "international_equity", expense_ratio: 0.0005, sources: ["https://investor.vanguard.com/vxus"] };

  it("gives Claude the web_search tool and today's date", async () => {
    mockCreate.mockResolvedValue(ok([vxus]));
    await classifyTickers(["VXUS"], tmpFile);

    const params = mockCreate.mock.calls[0][0];
    expect(params.tools).toEqual([expect.objectContaining({ type: "web_search_20260209", name: "web_search" })]);
    const user = JSON.parse(params.messages[0].content);
    expect(user.today).toBe(todayIso());
    expect(user.symbols).toEqual(["VXUS"]);
  });

  it("stamps classified_at with today's date, ignoring any date Claude returns", async () => {
    mockCreate.mockResolvedValue(ok([{ ...vxus, classified_at: "2025-01-24" }]));
    const merged = await classifyTickers(["VXUS"], tmpFile);
    expect(merged.tickers.VXUS?.classified_at).toBe(todayIso());
  });

  it("persists the source URLs with the entry", async () => {
    mockCreate.mockResolvedValue(ok([vxus]));
    await classifyTickers(["VXUS"], tmpFile);
    const onDisk = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
    expect(onDisk.tickers.VXUS.sources).toEqual(["https://investor.vanguard.com/vxus"]);
  });

  it("parses the JSON even when Claude writes a preamble before it", async () => {
    mockCreate.mockResolvedValue(ok([vxus], "I'll search for VXUS. Here is the result:"));
    const merged = await classifyTickers(["VXUS"], tmpFile);
    expect(merged.tickers.VXUS?.asset_class).toBe("international_equity");
  });

  it("continues the turn when the API returns pause_turn", async () => {
    mockCreate
      .mockResolvedValueOnce({ stop_reason: "pause_turn", content: [{ type: "text", text: "Searching…" }] })
      .mockResolvedValueOnce(ok([vxus]));
    const merged = await classifyTickers(["VXUS"], tmpFile);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const second = mockCreate.mock.calls[1][0];
    expect(second.messages.at(-1)).toEqual({ role: "assistant", content: [{ type: "text", text: "Searching…" }] });
    expect(merged.tickers.VXUS?.asset_class).toBe("international_equity");
  });

  describe("rejects implausible entries instead of saving them", () => {
    const cases: [string, Record<string, unknown>][] = [
      ["an expense ratio above 3%", { ...vxus, expense_ratio: 0.05 }],
      ["a negative expense ratio", { ...vxus, expense_ratio: -0.001 }],
      ["no source URLs", { ...vxus, sources: [] }],
      ["a non-http source", { ...vxus, sources: ["from memory"] }],
      ["notes saying the fund was liquidated", { ...vxus, notes: "Fund was liquidated in 2022" }],
      ["notes saying the ticker was delisted", { ...vxus, notes: "Delisted after merger" }],
      ["a balanced composition that does not sum to 1", {
        symbol: "VXUS", asset_class: "balanced", expense_ratio: 0.0017, sources: ["https://x.com/a"],
        underlying_composition: { us_equity: 0.5, international_equity: 0.1, fixed_income: 0.3, cash: 0 },
      }],
    ];
    for (const [label, entry] of cases) {
      it(label, async () => {
        mockCreate.mockResolvedValue(ok([entry]));
        const merged = await classifyTickers(["VXUS"], tmpFile);
        expect(merged.tickers.VXUS).toBeUndefined();
      });
    }

    it("still accepts an 'unknown' entry without sources", async () => {
      mockCreate.mockResolvedValue(ok([{ symbol: "ZZZZ", asset_class: "unknown", notes: "no public market data found" }]));
      const merged = await classifyTickers(["ZZZZ"], tmpFile);
      expect(merged.tickers.ZZZZ?.asset_class).toBe("unknown");
    });

    it("saves the valid entries from a batch that also contains a rejected one", async () => {
      mockCreate.mockResolvedValue(ok([vxus, { symbol: "SPCX", asset_class: "us_equity_sector", sector_tag: "financials", expense_ratio: 0.0095, notes: "liquidated in 2022", sources: ["https://x.com/s"] }]));
      const merged = await classifyTickers(["VXUS", "SPCX"], tmpFile);
      expect(Object.keys(merged.tickers)).toEqual(["VXUS"]);
    });
  });
});
