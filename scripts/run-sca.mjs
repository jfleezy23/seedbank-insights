import process from "node:process";
import { spawnPnpm } from "./spawn-utils.mjs";

const result = spawnPnpm(["audit", "--audit-level", "moderate"], {
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
