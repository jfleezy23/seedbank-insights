import type { PropaguleType, TreatmentCodebookEntry } from "./types";

export type TreatmentGlossaryStatus =
  | "Workbook documented"
  | "Workbook row evidence"
  | "Parser pattern"
  | "Contextual inference"
  | "Needs confirmation"
  | "Active codebook";

export interface TreatmentGlossaryEntry {
  token: string;
  aliases?: string[];
  propaguleType: PropaguleType | "any";
  label: string;
  meaning: string;
  status: TreatmentGlossaryStatus;
  details?: string;
  examples?: string[];
}

function normalizeGlossaryToken(token: string): string {
  const normalized = token.trim().toUpperCase();
  if (normalized === "H20") return "H2O";
  if (normalized === "GA3" || normalized === "GA-3") return "GA";
  return normalized;
}

export const TREATMENT_GLOSSARY_ENTRIES: TreatmentGlossaryEntry[] = [
  {
    token: "C",
    propaguleType: "seed",
    label: "Control",
    meaning: "Untreated seed control.",
    status: "Workbook documented",
    details: "In compound seed treatments, C is the no-treatment baseline and the following token describes the added condition."
  },
  {
    token: "CS",
    propaguleType: "seed",
    label: "Cold stratification",
    meaning: "Moist cold stratification. The workbook dictionary defines the default as 120 days at 5°C.",
    status: "Workbook documented",
    examples: ["CS", "WS+CS", "SCAR+CS"]
  },
  {
    token: "WS",
    propaguleType: "seed",
    label: "Warm stratification",
    meaning: "Moist warm stratification. The workbook dictionary defines the default as 84 days at 25°C.",
    status: "Workbook documented",
    examples: ["WS+CS", "WS30+CS"]
  },
  {
    token: "GA",
    aliases: ["GA3", "GA-3"],
    propaguleType: "seed",
    label: "Gibberellic acid",
    meaning: "GA seed soak. The workbook dictionary defines this as 1000 ppm GA for 24 hours.",
    status: "Workbook documented",
    details: "The parser treats GA3 and GA-3 as the same GA family, but the exact workbook code is GA."
  },
  {
    token: "H2O",
    aliases: ["H20"],
    propaguleType: "seed",
    label: "Hot water soak",
    meaning: "One-minute near-boiling water soak.",
    status: "Workbook documented",
    details: "The workbook uses H20; the parser normalizes that common typo to H2O."
  },
  {
    token: "SCAR",
    propaguleType: "seed",
    label: "Scarification",
    meaning: "Mechanical scarification between two pieces of sandpaper.",
    status: "Workbook documented"
  },
  {
    token: "C->WS",
    propaguleType: "seed",
    label: "Control period, then warm stratification",
    meaning: "A control observation period followed by warm stratification before the rest of the sequence.",
    status: "Workbook documented",
    details: "The workbook header defines a control-period end date for C->WS+CS trials."
  },
  {
    token: "A",
    propaguleType: "stem_cutting",
    label: "Auxin treatment",
    meaning: "Stem cutting treated with 1000 ppm auxin.",
    status: "Workbook documented"
  },
  {
    token: "C",
    propaguleType: "stem_cutting",
    label: "No auxin",
    meaning: "Stem cutting control with 0 ppm auxin.",
    status: "Workbook documented"
  },
  {
    token: "B",
    propaguleType: "stem_cutting",
    label: "Basal cutting",
    meaning: "Basal cutting position, just below the apical cutting.",
    status: "Workbook documented"
  },
  {
    token: "P",
    propaguleType: "stem_cutting",
    label: "Apical cutting",
    meaning: "Apical stem cutting position.",
    status: "Workbook documented",
    details: "The workbook notes that all cuttings are 10 cm apical unless B is specified."
  },
  {
    token: "C",
    propaguleType: "division",
    label: "Division control",
    meaning: "Division with no additional treatment.",
    status: "Workbook documented"
  },
  {
    token: "E",
    propaguleType: "seed",
    label: "Ethephon",
    meaning: "Ethephon seed treatment. Workbook notes identify E as Ethephon at 14 ppm / 100 µM in the current data.",
    status: "Workbook row evidence",
    details: "Not in the embedded treatment dictionary, so keep it descriptive until the treatment codebook explicitly maps it."
  },
  {
    token: "D",
    propaguleType: "seed",
    label: "Dark incubation",
    meaning: "Likely dark germination/incubation condition.",
    status: "Contextual inference",
    details: "Inferred from paired C+D / C+L and GA+D / GA+L trial blocks. Confirm with the userbase before using for formal treatment claims."
  },
  {
    token: "L",
    propaguleType: "seed",
    label: "Light incubation",
    meaning: "Likely light-exposed germination/incubation condition.",
    status: "Contextual inference",
    details: "Inferred from paired C+D / C+L and GA+D / GA+L trial blocks. Confirm with the userbase before using for formal treatment claims."
  },
  {
    token: "SCARWH",
    propaguleType: "seed",
    label: "Scarification plus hot-water variant",
    meaning: "Workbook-local token that the parser treats as scarification plus hot water.",
    status: "Needs confirmation",
    details: "The exact WH workflow is not defined in the embedded treatment dictionary."
  },
  {
    token: "GA*",
    propaguleType: "seed",
    label: "GA variant with undocumented asterisk",
    meaning: "Probably a GA-family treatment, but the asterisk is not defined in the workbook dictionary.",
    status: "Needs confirmation",
    details: "Do not merge GA* with GA in formal analysis until the codebook defines the asterisk."
  }
];

export const TREATMENT_SYNTAX_GLOSSARY: TreatmentGlossaryEntry[] = [
  {
    token: "+",
    propaguleType: "any",
    label: "Combined or sequential treatment tokens",
    meaning: "The treatment string contains multiple protocol tokens.",
    status: "Parser pattern",
    examples: ["WS+CS", "SCAR+CS", "GA+L"]
  },
  {
    token: "->",
    propaguleType: "any",
    label: "Protocol transition",
    meaning: "The trial moved from one named treatment state into another.",
    status: "Parser pattern",
    examples: ["C->WS+CS"]
  },
  {
    token: "CS# / WS#",
    propaguleType: "seed",
    label: "Explicit stratification duration",
    meaning: "A numeric suffix is interpreted as a day count for that stratification step.",
    status: "Parser pattern",
    examples: ["CS16", "WS30"]
  },
  {
    token: "D/ND",
    propaguleType: "any",
    label: "Status, not treatment",
    meaning: "Done / Not Done belongs to the trial status column and is not a germination treatment.",
    status: "Parser pattern"
  },
  {
    token: "PT=CS",
    propaguleType: "any",
    label: "Column-specific meaning",
    meaning: "In the PT column, CS means stem cutting. In the Trt column, CS means cold stratification.",
    status: "Parser pattern"
  }
];

function matchesEntry(entry: TreatmentGlossaryEntry, token: string): boolean {
  const normalizedAliases = (entry.aliases ?? []).map(normalizeGlossaryToken);
  return normalizeGlossaryToken(entry.token) === token || normalizedAliases.includes(token);
}

export function findTreatmentGlossaryEntry(
  rawToken: string,
  propaguleType: PropaguleType,
  codebook: TreatmentCodebookEntry[] = []
): TreatmentGlossaryEntry | null {
  const token = normalizeGlossaryToken(rawToken);
  const custom = codebook.find(
    (entry) =>
      entry.active &&
      !entry.builtIn &&
      entry.propaguleType === propaguleType &&
      normalizeGlossaryToken(entry.token) === token
  );
  if (custom) {
    return {
      token: custom.token,
      propaguleType: custom.propaguleType,
      label: custom.label,
      meaning: custom.meaning,
      status: "Active codebook",
      details: `User-mapped codebook version ${custom.version}.`
    };
  }

  if (propaguleType === "seed" && /^CS\d+$/.test(token)) {
    return {
      token,
      propaguleType: "seed",
      label: `Cold stratification for ${token.replace("CS", "")} days`,
      meaning: "Explicit-duration cold stratification.",
      status: "Parser pattern",
      details: "The base CS code is workbook documented; the numeric suffix is parsed as days."
    };
  }

  if (propaguleType === "seed" && /^WS\d+$/.test(token)) {
    return {
      token,
      propaguleType: "seed",
      label: `Warm stratification for ${token.replace("WS", "")} days`,
      meaning: "Explicit-duration warm stratification.",
      status: "Parser pattern",
      details: "The base WS code is workbook documented; the numeric suffix is parsed as days."
    };
  }

  if (propaguleType === "seed" && token === "C->WS") {
    return TREATMENT_GLOSSARY_ENTRIES.find((entry) => entry.token === "C->WS") ?? null;
  }

  const candidates = TREATMENT_GLOSSARY_ENTRIES.filter((entry) => matchesEntry(entry, token));
  return (
    candidates.find((entry) => entry.propaguleType === propaguleType) ??
    candidates.find((entry) => entry.propaguleType === "any") ??
    null
  );
}
