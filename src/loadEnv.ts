import { config } from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

export interface LoadEnvOptions {
  /** Working directory to look up `.env` / `.env.<user>` against. Defaults to `process.cwd()`. */
  cwd?: string;
  /** argv to scan for `--user <name>` and `--dev`. Defaults to `process.argv`. */
  argv?: string[];
}

export interface LoadEnvResult {
  user: string | null;
  dev: boolean;
}

/**
 * Load env files in layered order (later wins):
 *   1. `.env`                  — shared base (always loaded)
 *   2. `.env.<user>`           — per-user overlay, when `--user <name>` is on argv
 *   3. `.env.development`      — local-mode overlay, when `--dev` is on argv
 *
 * Throws if `--user <name>` names a missing file (a typo should never silently
 * fall back to a different user's context). Same for `--dev` if `.env.development`
 * is missing — opting into dev mode without the file is a configuration error.
 */
export function loadEnv(opts: LoadEnvOptions = {}): LoadEnvResult {
  const cwd = opts.cwd ?? process.cwd();
  const argv = opts.argv ?? process.argv;

  config({ path: path.join(cwd, ".env") });

  const userIdx = argv.indexOf("--user");
  if (userIdx > -1 && !argv[userIdx + 1]) {
    throw new Error("--user requires a name argument (e.g. --user luke)");
  }
  const user = userIdx > -1 ? argv[userIdx + 1] : null;
  if (user) {
    const envPath = path.join(cwd, `.env.${user}`);
    if (!fs.existsSync(envPath)) {
      throw new Error(`--user ${user} but ${envPath} not found`);
    }
    config({ path: envPath, override: true });
  }

  const dev = argv.includes("--dev");
  if (dev) {
    const devPath = path.join(cwd, ".env.development");
    if (!fs.existsSync(devPath)) {
      throw new Error(`--dev but ${devPath} not found`);
    }
    config({ path: devPath, override: true });
  }

  return { user, dev };
}
