import { createRequire } from "node:module";
import * as path from "node:path";

const require = createRequire(import.meta.url);

/**
 * Absolute path to a dependency's CLI entry point, e.g. binPath("tsx") →
 * node_modules/tsx/dist/cli.mjs.
 *
 * Spawn these with `process.execPath` rather than shelling out to `npx <name>`:
 * `npx` isn't directly executable on Windows (it's npx.cmd), which forces
 * `shell: true`, and an args array combined with `shell: true` is concatenated
 * unescaped — a command-injection hazard that Node warns about as DEP0190.
 * Running the resolved JS file under the current node binary sidesteps both,
 * and drops a process layer while it's at it.
 */
export function binPath(pkg: string, binName: string = pkg): string {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const { bin } = require(pkgJsonPath) as { bin?: string | Record<string, string> };
  const rel = typeof bin === "string" ? bin : bin?.[binName];
  if (!rel) throw new Error(`${pkg} declares no "${binName}" bin entry in its package.json`);
  return path.join(path.dirname(pkgJsonPath), rel);
}
