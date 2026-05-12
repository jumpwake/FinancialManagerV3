import { describe, it, expect } from "vitest";
import { parseAccounts, lookupAccountByFilename } from "./parseAccounts";

describe("parseAccounts", () => {
  it("accepts a valid account config", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "fidelity_retirement",
          label: "Fidelity Retirement",
          broker: "Fidelity",
          account_type: "pretax_ira",
          owner: "you",
          source_files: ["20260509_FidelityRetirement.json"],
        },
      ],
    });
    expect(cfg.accounts).toHaveLength(1);
    expect(cfg.accounts[0].id).toBe("fidelity_retirement");
  });

  it("accepts constraints", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "vanguard_business",
          label: "Vanguard Business",
          broker: "Vanguard",
          account_type: "business_taxable",
          owner: "business",
          source_files: ["20260509_VanguardBusiness.json"],
          constraints: {
            cash_reserve_minimum: 50_000,
            excluded_from_deployment: true,
          },
        },
      ],
    });
    expect(cfg.accounts[0].constraints?.excluded_from_deployment).toBe(true);
  });

  it("rejects unknown account_type", () => {
    expect(() =>
      parseAccounts({
        accounts: [
          {
            id: "x",
            label: "x",
            broker: "Vanguard",
            account_type: "magical_unicorn",
            owner: "you",
            source_files: [],
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects duplicate account ids", () => {
    expect(() =>
      parseAccounts({
        accounts: [
          { id: "dup", label: "A", broker: "Fidelity", account_type: "roth_ira", owner: "you", source_files: ["a.json"] },
          { id: "dup", label: "B", broker: "Fidelity", account_type: "roth_ira", owner: "you", source_files: ["b.json"] },
        ],
      }),
    ).toThrow(/duplicate/i);
  });
});

describe("lookupAccountByFilename", () => {
  it("finds an account by source filename (exact match)", () => {
    const cfg = parseAccounts({
      accounts: [
        {
          id: "fid",
          label: "Fid",
          broker: "Fidelity",
          account_type: "pretax_ira",
          owner: "you",
          source_files: ["20260509_FidelityRetirement.json"],
        },
      ],
    });
    const a = lookupAccountByFilename(cfg, "20260509_FidelityRetirement.json");
    expect(a?.id).toBe("fid");
  });

  it("returns undefined when no account claims the file", () => {
    const cfg = parseAccounts({ accounts: [] });
    expect(lookupAccountByFilename(cfg, "missing.json")).toBeUndefined();
  });
});
