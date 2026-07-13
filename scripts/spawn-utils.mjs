import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export function spawnTool(command, args, options = {}) {
  const invocation = resolveTool(command, args);
  return spawnSync(invocation.command, invocation.args, {
    ...options,
    shell: invocation.shell ?? false
  });
}

export function spawnPnpm(args, options = {}) {
  const invocation = resolvePnpm(args);
  return spawnSync(invocation.command, invocation.args, {
    ...options,
    shell: invocation.shell ?? false
  });
}

function resolveTool(command, args) {
  if (process.platform !== "win32") {
    return { command, args };
  }

  const resolved = resolveOnWindowsPath(command);
  if (!resolved) {
    return { command, args };
  }

  if (/\.(?:cmd|bat)$/iu.test(resolved)) {
    return {
      command: `call ${quoteForCmd([resolved, ...args])}`,
      args: [],
      shell: true
    };
  }

  return { command: resolved, args };
}

function resolvePnpm(args) {
  if (process.platform !== "win32") {
    return { command: "pnpm", args };
  }

  const pnpmPath = resolveOnWindowsPath("pnpm");
  if (pnpmPath && /\.cmd$/iu.test(pnpmPath)) {
    const directInvocation = resolvePnpmCmd(pnpmPath, args);
    if (directInvocation) {
      return directInvocation;
    }
  }

  return resolveTool("pnpm", args);
}

function resolvePnpmCmd(pnpmPath, args) {
  const baseDir = path.dirname(pnpmPath);
  const bundledNode = path.resolve(baseDir, "..", "..", "node", "bin", "node.exe");
  const bundledPnpm = path.resolve(baseDir, "..", "..", "node", "node_modules", "pnpm", "bin", "pnpm.mjs");

  if (existsSync(bundledNode) && existsSync(bundledPnpm)) {
    return {
      command: bundledNode,
      args: [bundledPnpm, ...args]
    };
  }

  try {
    const commandText = readFileSync(pnpmPath, "utf8").replaceAll("%~dp0", `${baseDir}${path.sep}`);
    const match = commandText.match(/"([^"]*node(?:\.exe)?)"\s+"([^"]*pnpm\.(?:mjs|cjs))"/iu);
    if (match && existsSync(match[1]) && existsSync(match[2])) {
      return {
        command: match[1],
        args: [match[2], ...args]
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveOnWindowsPath(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    shell: false
  });

  if (result.status !== 0) {
    return undefined;
  }

  const candidates = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  return candidates.find((candidate) => /\.(?:exe|cmd|bat|ps1)$/iu.test(candidate)) ?? candidates[0];
}

function quoteForCmd(args) {
  return args.map((arg) => `"${String(arg).replaceAll('"', '""')}"`).join(" ");
}
