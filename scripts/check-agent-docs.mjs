import { existsSync, readFileSync, readdirSync } from "node:fs";
import process from "node:process";

const routerPath = "AGENTS.md";
const playbookDir = "docs/agent-playbooks";
const requiredPlaybooks = [
  "docs/agent-playbooks/release.md",
  "docs/agent-playbooks/macos-signing.md",
  "docs/agent-playbooks/windows-signing.md",
  "docs/agent-playbooks/ui-review.md",
  "docs/agent-playbooks/data-imports.md",
  "docs/agent-playbooks/statistics.md"
];
const maxRouterLines = 120;
const findings = [];

const router = readText(routerPath);
const routerLinks = extractPlaybookLinks(router);
const allPlaybookFiles = listPlaybookFiles();

if (lineCount(router) > maxRouterLines) {
  findings.push(`${routerPath}: router has ${lineCount(router)} lines; keep it at or below ${maxRouterLines} and move detail into playbooks.`);
}

for (const playbook of requiredPlaybooks) {
  if (!routerLinks.includes(playbook)) {
    findings.push(`${routerPath}: missing required playbook route ${playbook}.`);
  }
}

for (const link of routerLinks) {
  if (!existsSync(link)) {
    findings.push(`${routerPath}: routed playbook does not exist: ${link}.`);
  }
}

for (const playbook of requiredPlaybooks) {
  if (!existsSync(playbook)) {
    findings.push(`${playbook}: required playbook file is missing.`);
    continue;
  }

  const text = readText(playbook);
  if (!/^#\s+\S/mu.test(text)) {
    findings.push(`${playbook}: missing top-level heading.`);
  }
  if (lineCount(text) < 8) {
    findings.push(`${playbook}: playbook is too short to be useful.`);
  }
}

for (const file of new Set([routerPath, ...requiredPlaybooks, ...routerLinks, ...allPlaybookFiles])) {
  if (existsSync(file)) {
    checkSensitiveAgentDocText(file, readText(file));
  }
}

if (findings.length) {
  console.error("Agent documentation verification failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Agent documentation verification passed.");

function readText(path) {
  return readFileSync(path, "utf8");
}

function lineCount(text) {
  return text.trimEnd().split(/\r?\n/u).length;
}

function extractPlaybookLinks(text) {
  const links = [
    ...[...text.matchAll(/`(\.?\/?docs[\/\\]agent-playbooks[\/\\][^`\s)]+\.md)`/gu)].map((match) => match[1]),
    ...[...text.matchAll(/\[[^\]]+\]\((\.?\/?docs[\/\\]agent-playbooks[\/\\][^)#\s]+\.md)(?:#[^)]+)?\)/gu)].map(
      (match) => match[1]
    )
  ];

  return [...new Set(links.map(normalizePlaybookPath))];
}

function normalizePlaybookPath(path) {
  return path.replace(/^\.?\//u, "").replaceAll("\\", "/");
}

function listPlaybookFiles() {
  if (!existsSync(playbookDir)) {
    return [];
  }

  return readdirSync(playbookDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => `${playbookDir}/${entry}`);
}

function checkSensitiveAgentDocText(file, text) {
  const checks = [
    {
      name: "local Windows user path",
      pattern: /(?:[A-Z]:[/\\]|file:\/\/\/[A-Z]:[/\\])Users[/\\][^/\\\s"')]+/iu
    },
    {
      name: "concrete artifact-signing endpoint",
      pattern: artifactSigningFlagPattern("endpoint")
    },
    {
      name: "concrete artifact-signing account",
      pattern: artifactSigningFlagPattern("account")
    },
    {
      name: "concrete artifact-signing certificate profile",
      pattern: artifactSigningFlagPattern("certificate-profile", "profile")
    },
    {
      name: "explicit code-signing Azure endpoint",
      pattern: /https:\/\/[^)\s"]*codesigning\.azure\.net/iu
    },
    {
      name: "concrete macOS Developer ID identity",
      pattern: /Developer ID Application:\s*(?!<identity>)[^"`\n]+?\([A-Z0-9]{10}\)/u
    },
    {
      name: "concrete macOS notary profile",
      pattern: cliFlagPattern("keychain-profile", "notary-profile")
    },
    {
      name: "concrete macOS notary profile",
      pattern: notarytoolStoreCredentialsPattern()
    },
    {
      name: "concrete Apple ID",
      pattern: cliFlagPattern("apple-id", "apple-id")
    },
    {
      name: "concrete Apple team id",
      pattern: cliFlagPattern("team-id", "team-id")
    }
  ];

  for (const check of checks) {
    if (check.pattern.test(text)) {
      findings.push(`${file}: contains ${check.name}; keep private release details in local notes outside git.`);
    }
  }
}

function cliFlagPattern(flag, placeholder = flag) {
  const escapedPlaceholder = escapeRegExp(`<${placeholder}>`);
  return new RegExp(
    `--${flag}(?:=\\s*|\\s+)(?:"(?!${escapedPlaceholder}")(?!\\$)[^"]+"|'(?!${escapedPlaceholder}')(?!\\$)[^']+'|(?!${escapedPlaceholder}(?:\\s|$))(?![$%"'])[^\\s"']+)`,
    "iu"
  );
}

function notarytoolStoreCredentialsPattern() {
  const escapedPlaceholder = escapeRegExp("<notary-profile>");
  return new RegExp(
    `notarytool\\s+store-credentials\\s+(?:"(?!${escapedPlaceholder}")(?!\\$)[^"]+"|'(?!${escapedPlaceholder}')(?!\\$)[^']+'|(?!${escapedPlaceholder}(?:\\s|$))(?![$%"'])[^\\s"']+)`,
    "iu"
  );
}

function artifactSigningFlagPattern(flagSuffix, placeholder = flagSuffix) {
  const escapedPlaceholder = escapeRegExp(`<${placeholder}>`);
  return new RegExp(
    `--artifact-signing-${flagSuffix}(?:=\\s*|\\s+)(?:"(?!${escapedPlaceholder}")(?!\\$)[^"]+"|'(?!${escapedPlaceholder}')(?!\\$)[^']+'|(?!${escapedPlaceholder}(?:\\s|$))(?![$%"'])[^\\s"']+)`,
    "iu"
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
