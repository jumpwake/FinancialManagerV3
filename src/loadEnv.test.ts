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

  it("returns user=null, dev=false and loads .env when no flags are passed", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "LOADENV_TEST=base\n");
    const result = loadEnv({ cwd: tmpDir, argv: ["node", "script.js"] });
    expect(result.user).toBeNull();
    expect(result.dev).toBe(false);
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

  it("throws when --user is passed without a name", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "");
    expect(() =>
      loadEnv({
        cwd: tmpDir,
        argv: ["node", "script.js", "--user"],
      }),
    ).toThrow(/--user requires/);
  });

  it("layers .env.development over .env and .env.<user> when --dev is passed", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "PUBLISH_API_BASE=https://prod.example\nSHARED=keep\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".env.kevin"),
      "PUSH_TOKEN=kevin-token\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".env.development"),
      "PUBLISH_API_BASE=http://localhost:5000\n",
    );
    const result = loadEnv({
      cwd: tmpDir,
      argv: ["node", "script.js", "--user", "kevin", "--dev"],
    });
    expect(result.user).toBe("kevin");
    expect(result.dev).toBe(true);
    expect(process.env.PUBLISH_API_BASE).toBe("http://localhost:5000");
    expect(process.env.PUSH_TOKEN).toBe("kevin-token");
    expect(process.env.SHARED).toBe("keep");
  });

  it("--dev works without --user", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".env"),
      "PUBLISH_API_BASE=https://prod.example\n",
    );
    fs.writeFileSync(
      path.join(tmpDir, ".env.development"),
      "PUBLISH_API_BASE=http://localhost:5000\n",
    );
    const result = loadEnv({
      cwd: tmpDir,
      argv: ["node", "script.js", "--dev"],
    });
    expect(result.user).toBeNull();
    expect(result.dev).toBe(true);
    expect(process.env.PUBLISH_API_BASE).toBe("http://localhost:5000");
  });

  it("throws when --dev is passed but .env.development is missing", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "");
    expect(() =>
      loadEnv({
        cwd: tmpDir,
        argv: ["node", "script.js", "--dev"],
      }),
    ).toThrow(/--dev but .*\.env\.development not found/);
  });
});
