import { config } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LoadEnvOptions {
  /** Working directory to look up `.env` / `.env.<user>` against. Defaults to `process.cwd()`. */
  cwd?: string;
  /** argv to scan for `--user <name>`. Defaults to `process.argv`. */
  argv?: string[];
}

export interface LoadEnvResult {
  user: string | null;
}

/**
 * Load `.env`, then `.env.<user>` on top of it when `--user <name>` is on argv.
 * Throws if `--user <name>` is given but `.env.<name>` does not exist — a typo
 * should never silently fall back to a different user's context.
 */
export function loadEnv(opts: LoadEnvOptions = {}): LoadEnvResult {
  const cwd = opts.cwd ?? process.cwd();
  const argv = opts.argv ?? process.argv;

  config({ path: path.join(cwd, ".env") });

  const idx = argv.indexOf("--user");
  if (idx > -1 && !argv[idx + 1]) {
    throw new Error("--user requires a name argument (e.g. --user luke)");
  }
  const user = idx > -1 ? argv[idx + 1] : null;
  if (user) {
    const envPath = path.join(cwd, `.env.${user}`);
    if (!fs.existsSync(envPath)) {
      throw new Error(`--user ${user} but ${envPath} not found`);
    }
    config({ path: envPath, override: true });
  }
  return { user };
}
