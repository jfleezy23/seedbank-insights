import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { chmod, rm } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TOOLS = {
  actionlint: {
    version: "1.7.12",
    repo: "rhysd/actionlint",
    binary: process.platform === "win32" ? "actionlint.exe" : "actionlint",
    checksumAsset(version) {
      return `actionlint_${version}_checksums.txt`;
    },
    releaseAsset(version) {
      const platform = platformName({
        darwin: "darwin",
        linux: "linux",
        win32: "windows"
      });
      const arch = archName({
        x64: "amd64",
        arm64: "arm64",
        ia32: "386"
      });
      const extension = process.platform === "win32" ? "zip" : "tar.gz";
      return `actionlint_${version}_${platform}_${arch}.${extension}`;
    },
    defaultArgs: []
  },
  gitleaks: {
    version: "8.30.1",
    repo: "gitleaks/gitleaks",
    binary: process.platform === "win32" ? "gitleaks.exe" : "gitleaks",
    checksumAsset(version) {
      return `gitleaks_${version}_checksums.txt`;
    },
    releaseAsset(version) {
      const platform = platformName({
        darwin: "darwin",
        linux: "linux",
        win32: "windows"
      });
      const arch = archName({
        x64: "x64",
        arm64: "arm64",
        ia32: "x32"
      });
      const extension = process.platform === "win32" ? "zip" : "tar.gz";
      return `gitleaks_${version}_${platform}_${arch}.${extension}`;
    },
    defaultArgs: ["detect", "--source", ".", "--redact", "--verbose", "--no-banner"]
  }
};

const toolName = process.argv[2];
const tool = TOOLS[toolName];

if (!tool) {
  console.error(`Usage: node scripts/run-release-tool.mjs <${Object.keys(TOOLS).join("|")}> [args...]`);
  process.exit(1);
}

const extraArgs = process.argv.slice(3);
const repoRoot = process.cwd();
const cacheRoot = path.join(repoRoot, "node_modules", ".cache", "seedbank-tools", toolName, tool.version);
const archivePath = path.join(cacheRoot, tool.releaseAsset(tool.version));
const checksumPath = path.join(cacheRoot, tool.checksumAsset(tool.version));
const extractDir = path.join(cacheRoot, "extracted");
const binaryPath = path.join(cacheRoot, tool.binary);

mkdirSync(cacheRoot, { recursive: true });

await ensureToolInstalled();

const args = extraArgs.length ? extraArgs : tool.defaultArgs;
const result = spawnSync(binaryPath, args, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

async function ensureToolInstalled() {
  if (existsSync(binaryPath)) return;

  const archiveUrl = releaseUrl(tool.repo, tool.version, path.basename(archivePath));
  const checksumUrl = releaseUrl(tool.repo, tool.version, path.basename(checksumPath));

  console.log(`Installing ${toolName} ${tool.version}...`);
  await downloadFile(archiveUrl, archivePath);
  await downloadFile(checksumUrl, checksumPath);
  verifyChecksum(archivePath, checksumPath);

  await rm(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  const tarArgs = path.extname(archivePath) === ".zip"
    ? ["-xf", archivePath, "-C", extractDir]
    : ["-xzf", archivePath, "-C", extractDir];
  const extract = spawnSync("tar", tarArgs, { stdio: "inherit", shell: false });
  if (extract.error || extract.status !== 0) {
    console.error(extract.error?.message ?? `Unable to extract ${path.basename(archivePath)}.`);
    process.exit(extract.status ?? 1);
  }

  const extractedBinary = findFile(extractDir, tool.binary);
  if (!extractedBinary) {
    console.error(`Unable to locate ${tool.binary} in ${path.basename(archivePath)}.`);
    process.exit(1);
  }

  await copyBinary(extractedBinary, binaryPath);
  await chmod(binaryPath, 0o755);
}

function platformName(mapping) {
  const value = mapping[process.platform];
  if (!value) throw new Error(`Unsupported platform for ${toolName}: ${process.platform}`);
  return value;
}

function archName(mapping) {
  const value = mapping[process.arch];
  if (!value) throw new Error(`Unsupported architecture for ${toolName}: ${process.arch}`);
  return value;
}

function releaseUrl(repo, version, assetName) {
  return `https://github.com/${repo}/releases/download/v${version}/${assetName}`;
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        response.resume();
        if (!response.headers.location) {
          reject(new Error(`Redirect from ${url} did not include a location.`));
          return;
        }
        if (redirects > 5) {
          reject(new Error(`Too many redirects while downloading ${url}.`));
          return;
        }
        downloadFile(response.headers.location, destination, redirects + 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed for ${url}: HTTP ${response.statusCode}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function verifyChecksum(archive, checksums) {
  const assetName = path.basename(archive);
  const line = readFileSync(checksums, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(assetName));

  if (!line) {
    console.error(`No checksum entry found for ${assetName}.`);
    process.exit(1);
  }

  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (actual !== expected) {
    console.error(`Checksum mismatch for ${assetName}.`);
    process.exit(1);
  }
}

async function copyBinary(source, destination) {
  const { copyFile } = await import("node:fs/promises");
  await copyFile(source, destination);
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      const nested = findFile(fullPath, filename);
      if (nested) return nested;
    } else if (entry === filename) {
      return fullPath;
    }
  }
  return null;
}
