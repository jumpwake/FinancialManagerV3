import * as fs from "node:fs";
import * as path from "node:path";
import type { UserContext } from "./types";
import { parseUserContext, emptyUserContext } from "./intake/parseUserContext";

export function loadUserContext(filePath: string): UserContext {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return emptyUserContext();
  }
  const raw = fs.readFileSync(abs, "utf-8");
  return parseUserContext(JSON.parse(raw));
}

export function saveUserContext(filePath: string, ctx: UserContext): void {
  const abs = path.resolve(filePath);
  const tmp = `${abs}.tmp`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(ctx, null, 2), "utf-8");
  fs.renameSync(tmp, abs);
}

export function mutateUserContext(
  filePath: string,
  mutator: (ctx: UserContext) => void,
): UserContext {
  const ctx = loadUserContext(filePath);
  mutator(ctx);
  saveUserContext(filePath, ctx);
  return ctx;
}
