import { spawn } from "node:child_process";
import { loadEnv } from "../src/loadEnv";
import { binPath } from "./binPath";

loadEnv();

const child = spawn(
  process.execPath,
  [binPath("vite"), "src/report/app", "--open"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
