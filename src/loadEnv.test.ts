import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadEnv } from "./loadEnv";

describe("loadEnv", () => {
  let tmpDir: string;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "loadenv-"));
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      process.env[k] = v;
    }
  });

  it("returns user=null and loads .env when no --user is passed", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "LOADENV_TEST=base\n");
    const result = loadEnv({ cwd: tmpDir, argv: ["node", "script.js"] });
    expect(result.user).toBeNull();
    expect(process.env.LOADENV_TEST).toBe("base");
  });

  it("layers .env.<user> over .env when --user is passed", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "LOADENV_TEST=base\nLOADENV_SHARED=keep\n",
    );
    fs.writeFileSync(path.join(tmpDir, ".env.luke"), "LOADENV_TEST=luke\n");
    const result = loadEnv({
      cwd: tmpDir,
      argv: ["node", "script.js", "--user", "luke"],
    });
    expect(result.user).toBe("luke");
    expect(process.env.LOADENV_TEST).toBe("luke");
    expect(process.env.LOADENV_SHARED).toBe("keep");
  });

  it("throws when --user names a missing .env.<user> file", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "");
    expect(() =>
      loadEnv({
        cwd: tmpDir,
        argv: ["node", "script.js", "--user", "ghost"],
      }),
    ).toThrow(/--user ghost/);
  });
});
