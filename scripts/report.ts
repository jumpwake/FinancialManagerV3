import { spawn } from "node:child_process";
import { loadEnv } from "../src/loadEnv";

loadEnv();

const child = spawn(
  "npx",
  ["vite", "src/report/app", "--open"],
  {
    stdio: "inherit",
    env: process.env,
    shell: true,
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
