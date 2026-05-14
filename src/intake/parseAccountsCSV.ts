import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AccountConfig,
  AccountMetadata,
  AccountType,
  AccountConstraints,
} from "../types";

/**
 * Plain-text accounts file (`data/accounts.csv` or `accounts.txt`).
 *
 * One row per actual brokerage sub-account, with comma-separated fields:
 *
 *   account_number, label, strategy, category [, source_file_override]
 *
 * Strategy (column 3):
 *   - Conservative   → conservative_only + excluded_from_deployment
 *   - Cash Reserve   → excluded_from_deployment
 *   - Flexible       → no constraints (default; blank works too)
 *
 * Category (column 4) maps to account_type:
 *   - Cash Balance Plan / CBP    → cash_balance_plan
 *   - Roth IRA / Roth            → roth_ira
 *   - Pre-Tax IRA / IRA          → pretax_ira
 *   - 401k                       → 401k_traditional
 *   - Roth 401k                  → 401k_roth
 *   - HSA                        → hsa
 *   - Business / Business Taxable → business_taxable
 *   - Retirement                 → pretax_ira (unless Strategy = Conservative → cash_balance_plan)
 *   - Taxable / Brokerage / (anything else) → taxable_brokerage
 *
 * Lines starting with `#` are comments. Blank lines are ignored.
 * The fifth column (source_file_override) is only needed if the
 * account_number can't be located by scanning the sample data dir.
 */

interface ParsedRow {
  account_number: string;
  label: string;
  strategy: string;
  category: string;
  source_file_override?: string;
}

function parseRows(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw.length === 0 || raw.startsWith("#")) continue;
    const fields = raw.split(",").map((f) => f.trim());
    if (fields.length < 4) {
      throw new Error(
        `parseAccountsCSV: line ${i + 1} has ${fields.length} fields, expected at least 4 (account_number, label, strategy, category). Got: "${raw}"`,
      );
    }
    rows.push({
      account_number: fields[0],
      label: fields[1],
      strategy: fields[2],
      category: fields[3],
      source_file_override: fields[4] || undefined,
    });
  }
  return rows;
}

function classify(category: string, strategy: string): {
  account_type: AccountType;
  constraints: AccountConstraints;
} {
  const cat = category.trim().toLowerCase();
  const strat = strategy.trim().toLowerCase();

  const constraints: AccountConstraints = {};
  if (strat === "conservative") {
    constraints.conservative_only = true;
    constraints.excluded_from_deployment = true;
  } else if (strat === "cash reserve") {
    constraints.excluded_from_deployment = true;
  }

  let account_type: AccountType;
  if (cat === "cash balance plan" || cat === "cbp") {
    account_type = "cash_balance_plan";
    constraints.conservative_only = true;
    constraints.excluded_from_deployment = true;
  } else if (cat === "retirement" && strat === "conservative") {
    // Conservative + Retirement is treated as CBP-like
    account_type = "cash_balance_plan";
  } else if (cat === "roth ira" || cat === "roth") {
    account_type = "roth_ira";
  } else if (cat === "roth 401k") {
    account_type = "401k_roth";
  } else if (cat === "401k" || cat === "401(k)") {
    account_type = "401k_traditional";
  } else if (cat === "pre-tax ira" || cat === "traditional ira" || cat === "ira") {
    account_type = "pretax_ira";
  } else if (cat === "hsa") {
    account_type = "hsa";
  } else if (cat === "business" || cat === "business taxable") {
    account_type = "business_taxable";
  } else if (cat === "retirement") {
    account_type = "pretax_ira";
  } else {
    account_type = "taxable_brokerage";
  }

  return { account_type, constraints };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Find the most recent YYYYMMDD-prefixed snapshot in `sampleDir` and return
 * only the JSON files from that snapshot. Lets the pipeline accept a data
 * directory that accumulates weekly drops without re-processing history.
 *
 * Files that don't match `YYYYMMDD_<broker>.json` are ignored (so things
 * like liabilities.json, qqq.csv, cache/ etc. don't trip us up).
 */
export function findLatestSnapshotFiles(sampleDir: string): { date: string; files: string[] } {
  if (!fs.existsSync(sampleDir)) return { date: "", files: [] };
  const all = fs.readdirSync(sampleDir).filter((f) => f.endsWith(".json"));
  const pattern = /^(\d{8})_[A-Za-z][A-Za-z0-9]*\.json$/;
  let latest = "";
  for (const f of all) {
    const m = f.match(pattern);
    if (m && m[1] > latest) latest = m[1];
  }
  if (!latest) return { date: "", files: [] };
  return {
    date: latest,
    files: all.filter((f) => f.startsWith(`${latest}_`)).sort(),
  };
}

/**
 * Scan the latest snapshot's broker JSON files and build a map from
 * account-number-like identifier → filename.
 * - Vanguard: each top-level object has `account_number`
 * - Fidelity: each top-level object has `account_id`
 * - Empower: uses `account_name` (fallback)
 */
function buildAccountNumberIndex(sampleDir: string): Map<string, string> {
  const index = new Map<string, string>();
  const { files } = findLatestSnapshotFiles(sampleDir);
  for (const filename of files) {
    const full = path.join(sampleDir, filename);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(full, "utf-8"));
    } catch {
      continue;
    }
    const accts = Array.isArray(raw) ? raw : [raw];
    // Derive a filename-based synthetic key for any sub-account that has no
    // usable identifier (e.g. a Robinhood export where account_number is left
    // blank). Strip YYYYMMDD_ prefix and .json suffix: "20260514_RobinhoodLuke.json" → "RobinhoodLuke".
    const synthMatch = filename.match(/^\d{8}_(.+)\.json$/);
    const synthBase = synthMatch ? synthMatch[1] : filename.replace(/\.json$/, "");
    let synthCounter = 0;
    for (const a of accts as Array<{
      account_number?: string;
      account_id?: string;
      account_name?: string;
    }>) {
      const num = (a.account_number || a.account_id || a.account_name || "").trim();
      if (num) {
        index.set(num, filename);
      } else {
        const key = synthCounter === 0 ? synthBase : `${synthBase}_${synthCounter + 1}`;
        synthCounter++;
        index.set(key, filename);
      }
    }
  }
  return index;
}

/**
 * Default classification for an account that wasn't named in the CSV.
 * Inferred from the broker filename — used to fill in everything the user
 * didn't bother to list as an exception.
 */
function defaultClassification(filename: string): {
  account_type: AccountType;
  label_hint: string;
} {
  const f = filename.toLowerCase();
  if (/roth/.test(f)) return { account_type: "roth_ira", label_hint: "Roth IRA" };
  if (/retirement|401k|401\(k\)/.test(f)) return { account_type: "pretax_ira", label_hint: "Retirement" };
  if (/hsa/.test(f)) return { account_type: "hsa", label_hint: "HSA" };
  if (/business/.test(f)) return { account_type: "business_taxable", label_hint: "Business" };
  return { account_type: "taxable_brokerage", label_hint: "Brokerage" };
}

export function parseAccountsCSV(text: string, sampleDir: string): AccountConfig {
  const rows = parseRows(text);
  const numIndex = buildAccountNumberIndex(sampleDir);

  const accounts: AccountMetadata[] = [];
  const seenIds = new Set<string>();
  const claimedAccountNumbers = new Set<string>();

  for (const row of rows) {
    const { account_type, constraints } = classify(row.category, row.strategy);
    const source_file = row.source_file_override ?? numIndex.get(row.account_number);
    if (!source_file) {
      console.warn(
        `  ⚠ accounts.csv: account_number "${row.account_number}" (${row.label}) not found in any broker file in ${sampleDir} — skipping row`,
      );
      continue;
    }
    let id = slugify(row.label);
    if (!id) id = slugify(row.account_number);
    let unique = id;
    let n = 2;
    while (seenIds.has(unique)) {
      unique = `${id}_${n++}`;
    }
    seenIds.add(unique);
    claimedAccountNumbers.add(row.account_number);

    accounts.push({
      id: unique,
      label: row.label,
      broker: inferBroker(source_file),
      account_type,
      owner: "you",
      source_files: [source_file],
      account_numbers: [row.account_number],
      ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
    });
  }

  // Auto-fill: any sub-account in the broker files that the user didn't list
  // gets a default entry based on filename heuristics. This is the "exceptions
  // only" mode — user writes only the special accounts (CBP, Conservative
  // Business) and the rest gets sane defaults.
  for (const [accountNumber, filename] of numIndex) {
    if (claimedAccountNumbers.has(accountNumber)) continue;
    const def = defaultClassification(filename);
    let id = slugify(`${def.label_hint}_${accountNumber.slice(-6)}`);
    let unique = id;
    let n = 2;
    while (seenIds.has(unique)) {
      unique = `${id}_${n++}`;
    }
    seenIds.add(unique);
    accounts.push({
      id: unique,
      label: `${def.label_hint} (${accountNumber.slice(-6)})`,
      broker: inferBroker(filename),
      account_type: def.account_type,
      owner: "you",
      source_files: [filename],
      account_numbers: [accountNumber],
    });
  }

  return { accounts };
}

function inferBroker(filename: string): AccountMetadata["broker"] {
  if (/fidelity/i.test(filename)) return "Fidelity";
  if (/empower/i.test(filename)) return "Empower";
  if (/vanguard/i.test(filename)) return "Vanguard";
  if (/schwab/i.test(filename)) return "Schwab";
  if (/robinhood/i.test(filename)) return "Robinhood";
  return "Other";
}
