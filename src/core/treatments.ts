import type { PropaguleType, TreatmentCodebookEntry, TreatmentComponents } from "./types";

const TOKEN_SPLIT = /[+\s,/]+/;

function numberAfter(prefix: string, token: string): number | null {
  const match = token.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
  return match ? Number(match[1]) : null;
}

function normalizeToken(token: string): string {
  return token === "H20" ? "H2O" : token;
}

export const BUILT_IN_TREATMENT_CODEBOOK: TreatmentCodebookEntry[] = [
  ["seed", "C", "Control", "Untreated seed control"],
  ["seed", "CS", "Cold stratification", "Cold stratification; default duration comes from the workbook codebook"],
  ["seed", "WS", "Warm stratification", "Warm stratification; default duration comes from the workbook codebook"],
  ["seed", "GA", "Gibberellic acid", "Gibberellic acid treatment"],
  ["seed", "H2O", "Hot water", "Near-boiling water soak"],
  ["seed", "SCAR", "Scarification", "Mechanical scarification"],
  ["seed", "C->WS", "Control to warm stratification", "Control observation followed by warm stratification"],
  ["stem_cutting", "C", "No auxin", "Cutting control with no auxin"],
  ["stem_cutting", "A", "Auxin", "Auxin-treated cutting"],
  ["stem_cutting", "B", "Basal cutting", "Basal cutting position"],
  ["stem_cutting", "P", "Apical cutting", "Apical cutting position"],
  ["division", "C", "Division control", "Division with no additional treatment"]
].map(([propaguleType, token, label, meaning], index) => ({
  id: -(index + 1),
  version: 1,
  propaguleType: propaguleType as PropaguleType,
  token,
  label,
  meaning,
  active: true,
  builtIn: true
}));

function codebookTokens(
  propaguleType: PropaguleType,
  entries: TreatmentCodebookEntry[]
): Set<string> {
  return new Set(
    [...BUILT_IN_TREATMENT_CODEBOOK, ...entries]
      .filter((entry) => entry.active && entry.propaguleType === propaguleType)
      .map((entry) => entry.token.toUpperCase())
  );
}

export function parseTreatment(
  input: unknown,
  propaguleType: PropaguleType = "seed",
  codebook: TreatmentCodebookEntry[] = []
): TreatmentComponents {
  const raw = String(input ?? "").trim();
  const tokens = raw
    .toUpperCase()
    .split(TOKEN_SPLIT)
    .map((token) => normalizeToken(token.trim()))
    .filter(Boolean);
  const normalized = tokens.join("+");
  const warnings: string[] = [];
  const seedTreatment = propaguleType === "seed";

  const hasCold = seedTreatment && tokens.some((token) => token === "CS" || /^CS\d+$/.test(token));
  const hasWarm = seedTreatment && tokens.some((token) => token === "WS" || /^WS\d+$/.test(token) || token.endsWith("->WS"));
  const hasScarWh = seedTreatment && tokens.includes("SCARWH");
  const hasScarification = hasScarWh || (seedTreatment && tokens.some((token) => token === "SCAR"));
  const hasHotWater = hasScarWh || (seedTreatment && (tokens.includes("H2O") || tokens.includes("HOTWATER")));
  const hasGa = seedTreatment && tokens.some((token) => /^GA-?\d*$/.test(token));
  const isControl = tokens.length === 1 ? tokens[0] === "C" : tokens[tokens.length - 1] === "C";

  const coldDays = tokens.flatMap((token) => {
    if (!seedTreatment) return [];
    if (token === "CS") return [120];
    const explicit = numberAfter("CS", token);
    return explicit === null ? [] : [explicit];
  });

  const warmDays = tokens.flatMap((token) => {
    if (!seedTreatment) return [];
    if (token === "WS") return [84];
    const explicit = numberAfter("WS", token);
    return explicit === null ? [] : [explicit];
  });

  const documented = codebookTokens(propaguleType, codebook);
  for (const token of tokens) {
    const known =
      documented.has(token) ||
      (propaguleType === "seed" &&
        (token === "C" ||
          token === "CS" ||
          token === "WS" ||
          token === "SCAR" ||
          token === "SCARWH" ||
          token === "H2O" ||
          /^GA-?\d*$/.test(token) ||
          /^CS\d+$/.test(token) ||
          /^WS\d+$/.test(token)));
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
