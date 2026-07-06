import type { ParsedObservation, TrialRecord } from "./types";

const DATE_PATTERN = /(^|[^\d])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?!\d)/g;
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
  for (const match of snippet.matchAll(DATE_PATTERN)) {
    const rawMonth = match[2];
    const rawDay = match[3];
    const rawYear = match[4];
    const after = snippet.slice((match.index ?? 0) + match[0].length).trimStart();
    if (!rawYear && /^of\b/i.test(after)) continue;

    const month = Number(rawMonth);
    const day = Number(rawDay);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = rawYear
      ? rawYear.length === 2
        ? 2000 + Number(rawYear)
        : Number(rawYear)
      : inferYear(month, startDate);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) continue;
    return date.toISOString().slice(0, 10);
  }
  return null;
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
    const observedDate = parseDateFromSnippet(snippet, trial.startDate);
    for (const pattern of OBSERVATION_PATTERNS) {
      const match = snippet.match(pattern.regex);
      if (!match) continue;
      observations.push({
        trialId: trial.id,
        sourceRow: trial.sourceRow,
        date: observedDate,
        kind: pattern.kind,
        value: parseValue(match[1]),
        rawSnippet: snippet,
        confidence: observedDate ? "high" : "medium"
      });
    }
  }
  return observations;
}
