import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnTool } from "./spawn-utils.mjs";

const failures = [];
const warnings = [];
const notes = [];
const options = parseArgs(process.argv.slice(2));

check("expected branch or tag", checkRef);
check("clean worktree", checkCleanWorktree);
check("GitHub CLI authentication", checkGhAuth);
check("Sonar workflow and latest run link", checkSonarWorkflow);
check("no raw workbook/cache/database/build files staged", checkStagedFiles);
check("app version matches intended release line", checkVersion);

if (options.release || options.windowsSigningEnv) {
  check("Windows signing toolchain", checkWindowsSigningTools);
  check("Azure CLI authenticated", checkAzureAuth);
}

console.log("\nRelease preflight summary");
console.log("=========================");

for (const note of notes) {
  console.log(`- ${note}`);
}

if (warnings.length) {
  console.log("\nWarnings");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (failures.length) {
  console.log("\nFailures");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nAll required preflight checks passed.");

function parseArgs(args) {
  const parsed = {
    branch: "main",
    release: false,
    windowsSigningEnv: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--release") {
      parsed.release = true;
    } else if (arg === "--windows-signing-env") {
      parsed.windowsSigningEnv = true;
    } else if (arg === "--branch") {
      parsed.branch = readValue(args, ++index, arg);
    } else if (arg === "--tag") {
      parsed.tag = readValue(args, ++index, arg);
    } else if (arg === "--version") {
      parsed.version = readValue(args, ++index, arg);
    } else if (arg === "--line") {
      parsed.line = readValue(args, ++index, arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else if (arg === "--") {
      continue;
    } else {
      failures.push(`Unknown release-preflight argument: ${arg}`);
    }
  }

  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    failures.push(`Missing value for ${flag}`);
    return "";
  }
  return value;
}

function printHelpAndExit() {
  console.log(`Usage: node scripts/release-preflight.mjs [options]

Options:
  --release                 Run release-level preflight, including Windows signing checks on Windows.
  --windows-signing-env     Check the signing environment in addition to common preflight checks.
  --branch <name>           Expected branch when not checking out a release tag. Defaults to main.
  --tag <tag>               Require HEAD to match the supplied release tag.
  --version <version>       Require package.json version to match exactly.
  --line <major.minor>      Require package.json version to stay on the supplied release line.
`);
  process.exit(0);
}

function check(name, fn) {
  try {
    fn();
    notes.push(`${name}: ok`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkRef() {
  const head = command("git", ["rev-parse", "HEAD"]).stdout.trim();

  if (options.tag) {
    const tagHead = command("git", ["rev-list", "-n", "1", options.tag]).stdout.trim();
    if (head !== tagHead) {
      throw new Error(`HEAD ${head} does not match tag ${options.tag} (${tagHead}).`);
    }
    notes.push(`release tag: ${options.tag}`);
    return;
  }

  const branch = command("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  if (branch === "HEAD") {
    throw new Error("detached HEAD; pass --tag <tag> if this is intentional.");
  }
  if (branch !== options.branch) {
    throw new Error(`expected branch ${options.branch}, found ${branch}.`);
  }
}

function checkCleanWorktree() {
  const status = command("git", ["status", "--porcelain=v1"]).stdout.trim();
  if (status) {
    throw new Error("worktree is not clean.");
  }
}

function checkGhAuth() {
  command("gh", ["auth", "status"]);
}

function checkSonarWorkflow() {
  const workflowPath = ".github/workflows/sonarqube.yml";
  if (!existsSync(workflowPath)) {
    throw new Error(`${workflowPath} is missing.`);
  }

  const result = command("gh", [
    "run",
    "list",
    "--workflow",
    workflowPath,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,url,headSha,createdAt"
  ]);

  const runs = JSON.parse(result.stdout);
  const latest = runs[0];
  if (!latest) {
    throw new Error("no Sonar workflow runs were found.");
  }

  notes.push(`latest Sonar run: ${latest.url} (${latest.status}/${latest.conclusion ?? "no conclusion"})`);
}

function checkStagedFiles() {
  const staged = command("git", ["diff", "--cached", "--name-only", "-z"]).stdout.split("\0").filter(Boolean);
  const blocked = staged.filter(isBlockedStagedPath);
  if (blocked.length) {
    throw new Error(`blocked staged files: ${blocked.join(", ")}`);
  }
}

function isBlockedStagedPath(file) {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return (
    normalized.startsWith("data/raw/") ||
    normalized.startsWith("assets/ai-response-cache/") ||
    normalized.startsWith("dist/") ||
    normalized.startsWith("dist-electron/") ||
    normalized.startsWith("release/") ||
    normalized.startsWith("playwright-report/") ||
    normalized.startsWith("test-results/") ||
    normalized === ".env" ||
    normalized.startsWith(".env.") ||
    /\.(xlsx|xls|csv|tsv|sqlite|sqlite-shm|sqlite-wal|db|log)$/u.test(normalized)
  );
}

function checkVersion() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const version = packageJson.version;
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/u.test(version)) {
    throw new Error(`package.json version is not semver-like: ${version}`);
  }

  if (options.version && version !== options.version) {
    throw new Error(`expected version ${options.version}, found ${version}.`);
  }

  const releaseLine = options.line ?? version.split(".").slice(0, 2).join(".");
  if (!version.startsWith(`${releaseLine}.`)) {
    throw new Error(`expected release line ${releaseLine}.x, found ${version}.`);
  }

  if (!options.version && !options.line) {
    warnings.push(`No --version or --line supplied; using package.json release line ${releaseLine}.x.`);
  }
}

function checkWindowsSigningTools() {
  if (process.platform !== "win32") {
    warnings.push("Windows signing toolchain skipped because this host is not Windows.");
    return;
  }

  const signtool = findSigntool();
  if (!signtool) {
    throw new Error("signtool.exe was not found in PATH or Windows Kits.");
  }
  notes.push(`signtool: ${signtool}`);

  command("sign", ["--help"]);
}

function checkAzureAuth() {
  if (process.platform !== "win32") {
    warnings.push("Azure signing auth skipped because this host is not Windows.");
    return;
  }

  command("az", ["account", "show", "--output", "json"]);
}

function findSigntool() {
  const whereResult = spawnSync("where.exe", ["signtool"], {
    encoding: "utf8",
    shell: false
  });
  if (whereResult.status === 0) {
    return whereResult.stdout.split(/\r?\n/u).find(Boolean);
  }

  const kitsRoot = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  if (!existsSync(kitsRoot)) return undefined;

  const candidates = [];
  for (const versionDir of readdirSync(kitsRoot)) {
    const candidate = path.join(kitsRoot, versionDir, "x64", "signtool.exe");
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      candidates.push(candidate);
    }
  }

  return candidates.sort().at(-1);
}

function command(commandName, args) {
  const result = spawnTool(commandName, args, {
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    throw new Error(stderr || stdout || `${commandName} ${args.join(" ")} exited with ${result.status}`);
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}
