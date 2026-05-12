import { z } from "zod";
import type { AccountConfig, AccountMetadata } from "../types";

const ACCOUNT_TYPES = [
  "roth_ira",
  "pretax_ira",
  "401k_traditional",
  "401k_roth",
  "taxable_brokerage",
  "business_taxable",
  "cash_balance_plan",
  "hsa",
] as const;

const BROKERS = ["Fidelity", "Empower", "Vanguard", "Schwab", "Other"] as const;

const constraintsSchema = z.object({
  conservative_only: z.boolean().optional(),
  cash_reserve_minimum: z.number().nonnegative().optional(),
  target_return: z.number().optional(),
  excluded_from_deployment: z.boolean().optional(),
});

const accountSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  broker: z.enum(BROKERS),
  account_type: z.enum(ACCOUNT_TYPES),
  owner: z.string().min(1),
  source_files: z.array(z.string()),
  constraints: constraintsSchema.optional(),
});

const configSchema = z.object({
  accounts: z.array(accountSchema),
});

export function parseAccounts(input: unknown): AccountConfig {
  const parsed = configSchema.parse(input);
  const seen = new Set<string>();
  for (const a of parsed.accounts) {
    if (seen.has(a.id)) {
      throw new Error(`parseAccounts: duplicate account id ${a.id}`);
    }
    seen.add(a.id);
  }
  return parsed as AccountConfig;
}

export function lookupAccountByFilename(
  cfg: AccountConfig,
  filename: string,
): AccountMetadata | undefined {
  return cfg.accounts.find((a) => a.source_files.includes(filename));
}
