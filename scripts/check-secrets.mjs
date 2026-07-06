import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_BYTES = 2 * 1024 * 1024;

const rules = [
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{24,}\b/
  },
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
  },
  {
    name: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/
  },
  {
    name: "OPENAI_API_KEY assignment",
    pattern: /\bOPENAI_API_KEY\s*=\s*["']?[^"'\s#]+/
  }
];

function listCandidateFiles() {
  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8"
    });
  } catch (error) {
    console.error("Unable to list files with git for secret scanning.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  return output
    .split("\0")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isLikelyBinary(buffer) {
  return buffer.includes(0);
}

const findings = [];

for (const file of listCandidateFiles()) {
  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }
  if (buffer.length > MAX_BYTES || isLikelyBinary(buffer)) continue;

  const text = buffer.toString("utf8");
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      findings.push({ file, rule: rule.name });
    }
  }
}

if (findings.length) {
  console.error("Secret-shaped values were found. Values are intentionally not printed.");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.rule}`);
  }
  process.exit(1);
}

console.log("No secret-shaped values found.");
