import process from "node:process";
import { spawnPnpm, spawnTool } from "./spawn-utils.mjs";

const plans = {
  quick: [
    ["pnpm", ["run", "verify:agent-docs"]],
    ["pnpm", ["run", "workflow:lint"]],
    ["pnpm", ["run", "secret:scan"]],
    ["pnpm", ["run", "lint"]],
    ["pnpm", ["run", "typecheck"]],
    ["pnpm", ["run", "test"]]
  ],
  workflow: [
    ["pnpm", ["run", "verify:agent-docs"]],
    ["pnpm", ["run", "workflow:lint"]],
    ["pnpm", ["run", "secret:scan"]],
    ["pnpm", ["run", "secret:gitleaks"]],
    ["pnpm", ["run", "sca"]]
  ],
  full: [
    ["pnpm", ["run", "verify:agent-docs"]],
    ["pnpm", ["run", "workflow:lint"]],
    ["pnpm", ["run", "secret:scan"]],
    ["pnpm", ["run", "secret:gitleaks"]],
    ["pnpm", ["run", "lint"]],
    ["pnpm", ["run", "typecheck"]],
    ["pnpm", ["run", "test"]],
    ["pnpm", ["run", "test:ui"]],
    ["pnpm", ["run", "db:smoke"]],
    ["pnpm", ["run", "build"]],
    ["pnpm", ["run", "sca"]]
  ]
};

const mode = process.argv[2];
const passthroughArgs = process.argv.slice(3);

if (!mode || !["quick", "workflow", "full", "release"].includes(mode)) {
  console.error("Usage: node scripts/verify.mjs <quick|workflow|full|release> [release-preflight args]");
  process.exit(1);
}

if (mode === "release") {
  run("node", ["scripts/release-preflight.mjs", "--release", ...passthroughArgs]);
  runPlan("full", plans.full);
  run("pnpm", ["run", "app:build"]);
  run("pnpm", ["run", "app:smoke"]);
  process.exit(0);
}

runPlan(mode, plans[mode]);

function runPlan(planName, commands) {
  console.log(`\n== verify:${planName} ==`);
  for (const [command, args] of commands) {
    run(command, args);
  }
}

function run(command, args) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result =
    command === "pnpm"
      ? spawnPnpm(args, { stdio: "inherit" })
      : spawnTool(command, args, { stdio: "inherit" });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
