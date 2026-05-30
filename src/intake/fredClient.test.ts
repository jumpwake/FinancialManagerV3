import { describe, test, expect, vi, beforeEach } from "vitest";
import { FredClient, FredError } from "./fredClient";

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(body: unknown, init?: { status?: number; ok?: boolean }) {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  globalThis.fetch = vi.fn().mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("FredClient.getLatest", () => {
  test("returns the most recent valid observation as a number", async () => {
    mockFetchOnce({
      observations: [
        { date: "2026-05-26", value: "4.33", realtime_start: "x", realtime_end: "y" },
      ],
    });
    const client = new FredClient("test-key");
    const obs = await client.getLatest("DFF");
    expect(obs).toEqual({ date: "2026-05-26", value: 4.33 });
  });

  test("hits the v1 endpoint with api_key query param and JSON parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ observations: [{ date: "2026-05-26", value: "4.33" }] }),
      text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new FredClient("test-key");
    await client.getLatest("DFF");

    const url = (fetchMock.mock.calls[0][0] as URL).toString();
    expect(url).toContain("/fred/series/observations");
    expect(url).not.toContain("/fred/v2/");
    expect(url).toContain("series_id=DFF");
    expect(url).toContain("api_key=test-key");
    expect(url).toContain("file_type=json");
    expect(url).toContain("sort_order=desc");
    expect(url).toContain("limit=1");
  });

  test("skips '.' missing-value observations and returns next valid", async () => {
    mockFetchOnce({
      observations: [
        { date: "2026-05-26", value: "." },
        { date: "2026-05-25", value: "." },
        { date: "2026-05-24", value: "4.30" },
      ],
    });
    const client = new FredClient("test-key");
    const obs = await client.getLatest("DFF", { lookback: 5 });
    expect(obs).toEqual({ date: "2026-05-24", value: 4.30 });
  });

  test("throws FredError on HTTP error response", async () => {
    mockFetchOnce({ error_message: "Bad API key" }, { status: 400, ok: false });
    const client = new FredClient("bad-key");
    await expect(client.getLatest("DFF")).rejects.toBeInstanceOf(FredError);
  });

  test("retries on 429 and succeeds when a later attempt is OK", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "0" }), // 0s → essentially immediate
        json: async () => ({ error_code: 429, error_message: "Too Many Requests" }),
        text: async () => "429",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ observations: [{ date: "2026-05-28", value: "3.62" }] }),
        text: async () => "",
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new FredClient("test-key");
    const obs = await client.getLatest("DFF");
    expect(obs).toEqual({ date: "2026-05-28", value: 3.62 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("gives up after retries are exhausted and throws FredError", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "0" }),
      json: async () => ({ error_code: 429, error_message: "Too Many Requests" }),
      text: async () => "429",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new FredClient("test-key");
    await expect(client.getLatest("DFF")).rejects.toBeInstanceOf(FredError);
    // Initial attempt + 3 retries
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test("throws FredError when all observations are missing values", async () => {
    mockFetchOnce({
      observations: [
        { date: "2026-05-26", value: "." },
        { date: "2026-05-25", value: "." },
      ],
    });
    const client = new FredClient("test-key");
    await expect(client.getLatest("DFF", { lookback: 2 })).rejects.toBeInstanceOf(FredError);
  });

  test("throws FredError when observations array is empty", async () => {
    mockFetchOnce({ observations: [] });
    const client = new FredClient("test-key");
    await expect(client.getLatest("MISSING")).rejects.toBeInstanceOf(FredError);
  });
});

describe("FredClient.getYoYPercent", () => {
  test("computes year-over-year percent change from two observations 12+ months apart", async () => {
    mockFetchOnce({
      observations: [
        { date: "2026-04-01", value: "315.000" },
        { date: "2026-03-01", value: "314.500" },
        { date: "2026-02-01", value: "313.900" },
        { date: "2026-01-01", value: "313.500" },
        { date: "2025-12-01", value: "312.800" },
        { date: "2025-11-01", value: "312.200" },
        { date: "2025-10-01", value: "311.500" },
        { date: "2025-09-01", value: "310.800" },
        { date: "2025-08-01", value: "310.000" },
        { date: "2025-07-01", value: "309.500" },
        { date: "2025-06-01", value: "308.700" },
        { date: "2025-05-01", value: "308.000" },
        { date: "2025-04-01", value: "307.346" },
      ],
    });
    const client = new FredClient("test-key");
    const yoy = await client.getYoYPercent("CPIAUCSL");
    // (315.000 / 307.346 - 1) * 100 ≈ 2.49%
    expect(yoy.value).toBeCloseTo(2.49, 1);
    expect(yoy.date).toBe("2026-04-01");
  });

  test("throws FredError when only one observation is available", async () => {
    mockFetchOnce({
      observations: [{ date: "2026-04-01", value: "315.000" }],
    });
    const client = new FredClient("test-key");
    await expect(client.getYoYPercent("CPIAUCSL")).rejects.toBeInstanceOf(FredError);
  });
});
