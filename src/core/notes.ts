import type { ParsedObservation, TrialRecord } from "./types";

const DATE_PATTERN = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/;
const OBSERVATION_PATTERNS: Array<{
  kind: ParsedObservation["kind"];
  regex: RegExp;
}> = [
  { kind: "pc", regex: /\bPC\s*=?\s*(\+?\d+(?:\.\d+)?)/i },
  { kind: "germinated", regex: /\bgerminat(?:ed|ion)\s*=?\s*(\+?\d+)/i },
  { kind: "inProduction", regex: /\b(?:in production|IP)\s*=?\s*(\+?\d+)/i },
  { kind: "survival", regex: /\bS\s*=?\s*(\+?\d+)/i }
];

function inferYear(month: number, startDate: string | null): number {
  if (!startDate) return new Date().getFullYear();
  const start = new Date(startDate);
  const startMonth = start.getUTCMonth() + 1;
  return month < startMonth ? start.getUTCFullYear() + 1 : start.getUTCFullYear();
}

function parseDateFromSnippet(snippet: string, startDate: string | null): string | null {
  const match = snippet.match(DATE_PATTERN);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const rawYear = match[3];
  const year = rawYear
    ? rawYear.length === 2
      ? 2000 + Number(rawYear)
      : Number(rawYear)
    : inferYear(month, startDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseValue(raw: string): number | null {
  const value = Number(raw.replace("+", ""));
  return Number.isFinite(value) ? value : null;
}

function splitSnippets(text: string): string[] {
  return text
    .split(/;|\]|\[/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseObservationsFromTrial(trial: TrialRecord): ParsedObservation[] {
  const text = [trial.pcd, trial.notes].filter(Boolean).join("; ");
  if (!text) return [];

  const observations: ParsedObservation[] = [];
  for (const snippet of splitSnippets(text)) {
    for (const pattern of OBSERVATION_PATTERNS) {
      const match = snippet.match(pattern.regex);
      if (!match) continue;
      observations.push({
        trialId: trial.id,
        sourceRow: trial.sourceRow,
        date: parseDateFromSnippet(snippet, trial.startDate),
        kind: pattern.kind,
        value: parseValue(match[1]),
        rawSnippet: snippet,
        confidence: snippet.match(DATE_PATTERN) ? "high" : "medium"
      });
    }
  }
  return observations;
}
