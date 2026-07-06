import type { TreatmentComponents } from "./types";

const TOKEN_SPLIT = /[+\s,/]+/;

function numberAfter(prefix: string, token: string): number | null {
  const match = token.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
  return match ? Number(match[1]) : null;
}

export function parseTreatment(input: unknown): TreatmentComponents {
  const raw = String(input ?? "").trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, "");
  const tokens = normalized.split(TOKEN_SPLIT).filter(Boolean);
  const warnings: string[] = [];

  const hasCold = tokens.some((token) => token === "CS" || /^CS\d+$/.test(token));
  const hasWarm = tokens.some((token) => token === "WS" || /^WS\d+$/.test(token));
  const hasScarWh = tokens.includes("SCARWH");
  const hasScarification =
    hasScarWh || tokens.some((token) => token === "SCAR" || token.startsWith("SCAR+"));
  const hasHotWater = hasScarWh || tokens.includes("H20") || tokens.includes("HOTWATER");
  const hasGa = tokens.some((token) => token === "GA" || token.startsWith("GA"));
  const isControl = normalized === "C" || normalized.endsWith("+C");

  const coldDays = tokens.flatMap((token) => {
    if (token === "CS") return [120];
    const explicit = numberAfter("CS", token);
    return explicit === null ? [] : [explicit];
  });

  const warmDays = tokens.flatMap((token) => {
    if (token === "WS") return [84];
    const explicit = numberAfter("WS", token);
    return explicit === null ? [] : [explicit];
  });

  for (const token of tokens) {
    const known =
      token === "C" ||
      token === "CS" ||
      token === "WS" ||
      token === "SCAR" ||
      token === "SCARWH" ||
      token === "H20" ||
      token === "GA" ||
      /^CS\d+$/.test(token) ||
      /^WS\d+$/.test(token);
    if (!known) warnings.push(`Unmapped treatment token: ${token}`);
  }

  if (!raw) warnings.push("Missing treatment value");

  return {
    raw,
    normalized,
    isControl,
    hasCold,
    hasWarm,
    hasScarification,
    hasHotWater,
    hasGa,
    coldDays,
    warmDays,
    tokens,
    warnings
  };
}
