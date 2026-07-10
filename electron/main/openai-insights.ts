import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { REQUIRED_HEADERS, type WorkbookHeaderProfile } from "../../src/core/workbook";
import type {
  ConfidenceLabel,
  AskAnswer,
  DashboardData,
  FamilySource,
  ImportResult,
  ParsedObservation,
  RecommendedTechnique,
  SpeciesInsight,
  SpeciesInsightEvidence,
  SpeciesResearchResult,
  SpeciesResearchSource,
  SpeciesResearchTechnique,
  SpeciesTaxonomyMatch,
  TrialRecord
} from "../../src/core/types";

export const OPENAI_INSIGHT_MODEL = "gpt-5.4";
export const OPENAI_MINI_MODEL = "gpt-5.4-mini";
export const OPENAI_RESEARCH_RETRY_MODEL = "gpt-5.5";
export const SPECIES_INSIGHT_SCHEMA_VERSION = "species-insight-v2";

function openAiClient(apiKey: string, timeout = 120_000, maxRetries = 1): OpenAI {
  return new OpenAI({ apiKey, timeout, maxRetries });
}

interface SpeciesResearchDiscoveryContext {
  species: string;
  taxonomy: SpeciesTaxonomyMatch | null;
  family?: string | null;
  query?: string;
}

interface WebSourceCandidate {
  url: string;
  title: string;
  matchedQuery: string;
  snippet: string;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizedWebSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  url.hash = "";
  url.hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|gclid|fbclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  const host = url.hostname;
  const path = url.pathname.toLowerCase();
  if (
    ["google.com", "bing.com", "search.yahoo.com", "duckduckgo.com"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    )
  ) {
    return null;
  }
  if (["/search", "/search/"].includes(path)) return null;
  if (!url.search && ["/", "/home", "/index", "/index.html", "/homepage"].includes(path)) return null;

  return url.toString();
}

function sourceRelevance(
  title: string,
  url: string,
  snippet: string,
  context: SpeciesResearchDiscoveryContext
): SpeciesResearchSource["relevance"] | null {
  const { species, taxonomy } = context;
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    // The normalized HTTPS URL is still usable for coarse relevance matching.
  }
  const normalizeForMatch = (value: string): string =>
    normalizeSpaces(value.toLowerCase().replace(/[^a-z0-9]+/g, " "));
  const haystack = normalizeForMatch(`${title} ${decodedUrl} ${snippet}`);
  const containsTerm = (term: string): boolean => Boolean(term) && ` ${haystack} `.includes(` ${term} `);
  const normalizedSpecies = normalizeForMatch(species);
  if (normalizedSpecies.includes(" ") && containsTerm(normalizedSpecies)) return "species";
  const genus = normalizeForMatch(taxonomy?.genus ?? normalizedSpecies.split(" ")[0] ?? "");
  if (containsTerm(genus)) return "genus";
  const family = normalizeForMatch(normalizePlantFamilyName(context.family ?? taxonomy?.family) ?? "");
  if (containsTerm(family)) return "family";
  return null;
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function citationSnippet(text: unknown, startIndex: unknown, endIndex: unknown): string | null {
  if (
    typeof text !== "string" ||
    typeof startIndex !== "number" ||
    typeof endIndex !== "number" ||
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex <= startIndex ||
    endIndex > text.length
  ) {
    return null;
  }

  const beforeCitation = text.slice(0, startIndex);
  const sentenceStart = Math.max(
    beforeCitation.lastIndexOf("."),
    beforeCitation.lastIndexOf("!"),
    beforeCitation.lastIndexOf("?"),
    beforeCitation.lastIndexOf("\n"),
    beforeCitation.lastIndexOf("\r")
  );
  const afterCitation = text.slice(endIndex);
  const sentenceEndOffsets = [".", "!", "?", "\n", "\r"]
    .map((boundary) => afterCitation.indexOf(boundary))
    .filter((offset) => offset >= 0);
  const sentenceEnd = sentenceEndOffsets.length ? endIndex + Math.min(...sentenceEndOffsets) + 1 : text.length;
  const snippet = normalizeSpaces(text.slice(sentenceStart + 1, sentenceEnd));
  if (!snippet) return null;
  return snippet.length > 480 ? `${snippet.slice(0, 477).trimEnd()}...` : snippet;
}

export function extractSpeciesResearchSources(
  response: unknown,
  context: SpeciesResearchDiscoveryContext
): SpeciesResearchSource[] {
  const defaultQuery =
    context.query ?? `${normalizeSpaces(context.species)} seed germination dormancy propagation research`;
  const searchQueriesByUrl = new Map<string, string>();
  const candidates = new Map<string, WebSourceCandidate>();
  const output = recordValue(response)?.output;
  if (!Array.isArray(output)) return [];

  const addSearchSource = (rawUrl: unknown, matchedQuery: string): void => {
    const url = normalizedWebSourceUrl(rawUrl);
    if (!url) return;
    searchQueriesByUrl.set(url, matchedQuery);
  };
  const addCitation = (
    rawUrl: unknown,
    title: unknown,
    text: unknown,
    startIndex: unknown,
    endIndex: unknown
  ): void => {
    const url = normalizedWebSourceUrl(rawUrl);
    const snippet = citationSnippet(text, startIndex, endIndex);
    if (!url || !snippet || typeof title !== "string" || !title.trim()) return;
    const existing = candidates.get(url);
    candidates.set(url, {
      url,
      title: title.trim(),
      matchedQuery: searchQueriesByUrl.get(url) ?? existing?.matchedQuery ?? defaultQuery,
      snippet: existing && existing.snippet.length >= snippet.length ? existing.snippet : snippet
    });
  };

  for (const rawItem of output) {
    const item = recordValue(rawItem);
    if (!item) continue;
    if (item.type === "web_search_call") {
      const action = recordValue(item.action);
      if (action?.type === "search") {
        const queries = Array.isArray(action.queries)
          ? action.queries.filter((query): query is string => typeof query === "string" && Boolean(query.trim()))
          : [];
        const matchedQuery = queries[0] ?? (typeof action.query === "string" ? action.query : defaultQuery);
        if (Array.isArray(action.sources)) {
          for (const rawSource of action.sources) {
            addSearchSource(recordValue(rawSource)?.url, matchedQuery);
          }
        }
      }
    }
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const rawContent of item.content) {
      const content = recordValue(rawContent);
      if (content?.type !== "output_text" || !Array.isArray(content.annotations)) continue;
      for (const rawAnnotation of content.annotations) {
        const annotation = recordValue(rawAnnotation);
        if (annotation?.type !== "url_citation") continue;
        addCitation(annotation.url, annotation.title, content.text, annotation.start_index, annotation.end_index);
      }
    }
  }

  const sources: SpeciesResearchSource[] = [];
  for (const candidate of candidates.values()) {
    const relevance = sourceRelevance(candidate.title, candidate.url, candidate.snippet, context);
    if (!relevance) continue;
    const yearMatch = candidate.title.match(/\b(?:18|19|20)\d{2}\b/);
    const url = new URL(candidate.url);
    sources.push({
      id: `openai_web:${createHash("sha256").update(candidate.url).digest("hex").slice(0, 16)}`,
      source: "openai_web",
      title: candidate.title,
      year: yearMatch ? Number(yearMatch[0]) : null,
      venue: url.hostname,
      url: candidate.url,
      doi: url.hostname === "doi.org" ? candidate.url : null,
      matchedQuery: candidate.matchedQuery,
      relevance,
      abstractSnippet: candidate.snippet
    });
    if (sources.length === 10) break;
  }
  return sources;
}

const EvidenceSchema = z
  .object({
    sourceRow: z.number().int().positive(),
    accession: z.string(),
    treatment: z.string(),
    observation: z.string()
  })
  .strict();

const RecommendedTechniqueDraftSchema = z
  .object({
    technique: z.string().min(1),
    evidenceSummary: z.string().min(1),
    deterministicConfidence: z.enum(["Strong signal", "Promising", "Inconclusive", "Needs replication"]),
    citedRows: z.array(z.number().int().positive()).min(1).max(8),
    wouldProve: z.string().min(1),
    wouldDisprove: z.string().min(1)
  })
  .strict();

const SpeciesInsightDraftSchema = z
  .object({
    species: z.string(),
    plantFamily: z.string().min(1),
    familySource: z.enum(["workbook", "ai_inferred", "unknown"]),
    summary: z.string().min(1),
    propagationInterpretation: z.string().min(1),
    recommendedTechniques: z.array(RecommendedTechniqueDraftSchema).min(1).max(4),
    familyPropagationPattern: z.string().min(1),
    keyFindings: z.array(z.string().min(1)).min(1).max(4),
    nextSteps: z.array(z.string().min(1)).min(1).max(4),
    trialDesign: z.string().min(1),
    cautionFlags: z.array(z.string().min(1)).min(1).max(4),
    confidenceCaveat: z.string().min(1),
    researchNotes: z.array(z.string().min(1)).min(1).max(4),
    evidence: z.array(EvidenceSchema).min(1).max(5)
  })
  .strict();

const SpeciesInsightResponseSchema = z
  .object({
    speciesInsights: z.array(SpeciesInsightDraftSchema).min(1)
  })
  .strict();

const AskAnswerResponseSchema = z
  .object({
    answer: z.string().min(1),
    caveats: z.array(z.string().min(1)).min(1).max(5),
    citedRows: z.array(z.number().int().positive()).max(12)
  })
  .strict();

const SpeciesResearchTechniqueDraftSchema = z
  .object({
    technique: z.string().min(1),
    evidenceLevel: z.enum(["local_species", "species_literature", "genus_background", "family_background", "mixed"]),
    recommendation: z.string().min(1),
    evidenceSummary: z.string().min(1),
    deterministicConfidence: z.enum(["Strong signal", "Promising", "Inconclusive", "Needs replication"]),
    sourceIds: z.array(z.string().min(1)).max(8),
    localRows: z.array(z.number().int().positive()).max(8),
    protocolFrame: z.string().min(1),
    experimentalControls: z.string().min(1),
    successCriteria: z.string().min(1),
    riskChecks: z.string().min(1),
    whatToTry: z.string().min(1),
    whatWouldChangeMind: z.string().min(1)
  })
  .strict();

const SpeciesResearchResponseSchema = z
  .object({
    plantFamily: z.string().min(1),
    familySource: z.enum(["workbook", "ai_inferred", "unknown"]),
    summary: z.string().min(1),
    likelyStrategy: z.string().min(1),
    familyPattern: z.string().min(1),
    recommendedTechniques: z.array(SpeciesResearchTechniqueDraftSchema).min(1).max(5),
    protocolGaps: z.array(z.string().min(1)).min(1).max(8),
    nextTrialDesign: z.string().min(1),
    caveats: z.array(z.string().min(1)).min(1).max(6),
    evidenceNotes: z.array(z.string().min(1)).min(1).max(5)
  })
  .strict();

const HeaderAliasSchema = z
  .object({
    header: z.string(),
    canonical: z.enum([
      "P_Accession",
      "Source_Accession",
      "Species",
      "Trt",
      "Num",
      "Start",
      "PT",
      "TTD",
      "PC"
    ])
  })
  .strict();

const HeaderMappingResponseSchema = z
  .object({
    aliases: z.array(HeaderAliasSchema).max(24)
  })
  .strict();

const SPECIES_INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    speciesInsights: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          species: { type: "string", minLength: 1 },
          plantFamily: { type: "string", minLength: 1 },
          familySource: { type: "string", enum: ["workbook", "ai_inferred", "unknown"] },
          summary: { type: "string", minLength: 1 },
          propagationInterpretation: { type: "string", minLength: 1 },
          recommendedTechniques: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                technique: { type: "string", minLength: 1 },
                evidenceSummary: { type: "string", minLength: 1 },
                deterministicConfidence: {
                  type: "string",
                  enum: ["Strong signal", "Promising", "Inconclusive", "Needs replication"]
                },
                citedRows: {
                  type: "array",
                  minItems: 1,
                  maxItems: 8,
                  items: { type: "integer", minimum: 1 }
                },
                wouldProve: { type: "string", minLength: 1 },
                wouldDisprove: { type: "string", minLength: 1 }
              },
              required: [
                "technique",
                "evidenceSummary",
                "deterministicConfidence",
                "citedRows",
                "wouldProve",
                "wouldDisprove"
              ]
            }
          },
          familyPropagationPattern: { type: "string", minLength: 1 },
          keyFindings: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1 }
          },
          nextSteps: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1 }
          },
          trialDesign: { type: "string", minLength: 1 },
          cautionFlags: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1 }
          },
          confidenceCaveat: { type: "string", minLength: 1 },
          researchNotes: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string", minLength: 1 }
          },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                sourceRow: { type: "integer", minimum: 1 },
                accession: { type: "string", minLength: 1 },
                treatment: { type: "string", minLength: 1 },
                observation: { type: "string", minLength: 1 }
              },
              required: ["sourceRow", "accession", "treatment", "observation"]
            }
          }
        },
        required: [
          "species",
          "plantFamily",
          "familySource",
          "summary",
          "propagationInterpretation",
          "recommendedTechniques",
          "familyPropagationPattern",
          "keyFindings",
          "nextSteps",
          "trialDesign",
          "cautionFlags",
          "confidenceCaveat",
          "researchNotes",
          "evidence"
        ]
      }
    }
  },
  required: ["speciesInsights"]
};

const ASK_ANSWER_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    caveats: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" }
    },
    citedRows: {
      type: "array",
      maxItems: 12,
      items: { type: "integer" }
    }
  },
  required: ["answer", "caveats", "citedRows"]
};

const SPECIES_RESEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    plantFamily: { type: "string", minLength: 1 },
    familySource: { type: "string", enum: ["workbook", "ai_inferred", "unknown"] },
    summary: { type: "string", minLength: 1 },
    likelyStrategy: { type: "string", minLength: 1 },
    familyPattern: { type: "string", minLength: 1 },
    recommendedTechniques: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          technique: { type: "string", minLength: 1 },
          evidenceLevel: {
            type: "string",
            enum: ["local_species", "species_literature", "genus_background", "family_background", "mixed"]
          },
          recommendation: { type: "string", minLength: 1 },
          evidenceSummary: { type: "string", minLength: 1 },
          deterministicConfidence: {
            type: "string",
            enum: ["Strong signal", "Promising", "Inconclusive", "Needs replication"]
          },
          sourceIds: {
            type: "array",
            maxItems: 8,
            items: { type: "string", minLength: 1 }
          },
          localRows: {
            type: "array",
            maxItems: 8,
            items: { type: "integer", minimum: 1 }
          },
          protocolFrame: { type: "string", minLength: 1 },
          experimentalControls: { type: "string", minLength: 1 },
          successCriteria: { type: "string", minLength: 1 },
          riskChecks: { type: "string", minLength: 1 },
          whatToTry: { type: "string", minLength: 1 },
          whatWouldChangeMind: { type: "string", minLength: 1 }
        },
        required: [
          "technique",
          "evidenceLevel",
          "recommendation",
          "evidenceSummary",
          "deterministicConfidence",
          "sourceIds",
          "localRows",
          "protocolFrame",
          "experimentalControls",
          "successCriteria",
          "riskChecks",
          "whatToTry",
          "whatWouldChangeMind"
        ]
      }
    },
    protocolGaps: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string", minLength: 1 }
    },
    nextTrialDesign: { type: "string", minLength: 1 },
    caveats: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string", minLength: 1 }
    },
    evidenceNotes: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string", minLength: 1 }
    }
  },
  required: [
    "plantFamily",
    "familySource",
    "summary",
    "likelyStrategy",
    "familyPattern",
    "recommendedTechniques",
    "protocolGaps",
    "nextTrialDesign",
    "caveats",
    "evidenceNotes"
  ]
};

const HEADER_MAPPING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    aliases: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          header: { type: "string" },
          canonical: { type: "string", enum: REQUIRED_HEADERS }
        },
        required: ["header", "canonical"]
      }
    }
  },
  required: ["aliases"]
};

interface SpeciesContext {
  species: string;
  family: string | null;
  deterministicConfidence: ConfidenceLabel;
  trials: Array<{
    sourceRow: number;
    accession: string;
    sourceAccession: string;
    family: string | null;
    treatment: string;
    treatmentComponents: TrialRecord["treatmentComponents"];
    pc: number | null;
    pcRaw: number | null;
    pcScale: TrialRecord["pcScale"];
    lpc: number | null;
    lpcRaw: number | null;
    lpcScale: TrialRecord["lpcScale"];
    fourPc: number | null;
    fourPcRaw: number | null;
    fourPcScale: TrialRecord["fourPcScale"];
    status: "D" | "ND" | null;
    notes: string | null;
  }>;
  observations: Array<{
    sourceRow: number;
    kind: ParsedObservation["kind"];
    value: number | null;
    date: string | null;
    rawSnippet: string;
  }>;
}

function confidenceRank(label: ConfidenceLabel): number {
  switch (label) {
    case "Strong signal":
      return 4;
    case "Promising":
      return 3;
    case "Inconclusive":
      return 2;
    case "Needs replication":
      return 1;
  }
}

function capConfidence(label: ConfidenceLabel, ceiling: ConfidenceLabel): ConfidenceLabel {
  return confidenceRank(label) > confidenceRank(ceiling) ? ceiling : label;
}

const CONFIDENCE_LABELS: ConfidenceLabel[] = ["Strong signal", "Promising", "Inconclusive", "Needs replication"];

function confidenceLabelsInText(text: string): ConfidenceLabel[] {
  const found: ConfidenceLabel[] = [];
  for (const label of CONFIDENCE_LABELS) {
    const expression = new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (expression.test(text)) found.push(label);
  }
  return found;
}

function negatesConfidenceLabel(text: string, label: ConfidenceLabel): boolean {
  const expression = new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (!isConfidenceLabelOccurrenceNegated(text, match.index)) {
      return false;
    }
  }
  return true;
}

function isConfidenceLabelOccurrenceNegated(text: string, index: number): boolean {
  const sentenceStart = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf(";", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1),
    text.lastIndexOf("\n", index - 1),
    text.lastIndexOf("\r", index - 1)
  );
  const before = text.slice(sentenceStart + 1, index).toLowerCase();
  return /\b(no|not|without|lack(?:s|ing)?|insufficient|underpowered|did not find|do not treat as)\b/.test(before);
}

function assertNoConfidenceUpgrade(textParts: string[], ceiling: ConfidenceLabel, source: string): void {
  const ceilingRank = confidenceRank(ceiling);
  for (const text of textParts) {
    for (const label of confidenceLabelsInText(text)) {
      if (confidenceRank(label) > ceilingRank && !negatesConfidenceLabel(text, label)) {
        throw new Error(`${source} attempted to upgrade deterministic confidence from ${ceiling} to ${label}.`);
      }
    }
  }
}

function sanitizeConfidenceLanguage(text: string, ceiling: ConfidenceLabel): string {
  let sanitized = text;
  for (const [index, label] of CONFIDENCE_LABELS.entries()) {
    if (confidenceRank(label) <= confidenceRank(ceiling)) continue;
    const labelPattern = label.replace(/\s+/g, "\\s+");
    const marker = `__CONFIDENCE_DOWNGRADE_${index}__`;
    sanitized = sanitized.replace(new RegExp(`\\b(?:a|an)\\s+${labelPattern}\\b`, "gi"), (match, offset: number) =>
      isConfidenceLabelOccurrenceNegated(sanitized, offset) ? match : marker
    );
    sanitized = sanitized.replace(new RegExp(`\\b${labelPattern}\\b`, "gi"), (match, offset: number) =>
      isConfidenceLabelOccurrenceNegated(sanitized, offset) ? match : `not yet ${label}`
    );
    sanitized = sanitized.split(marker).join(`not yet a ${label}`);
  }
  return sanitized;
}

function sanitizeResearchNarrative(
  parsed: z.infer<typeof SpeciesResearchResponseSchema>,
  ceiling: ConfidenceLabel
): z.infer<typeof SpeciesResearchResponseSchema> {
  return {
    ...parsed,
    plantFamily: sanitizeConfidenceLanguage(parsed.plantFamily, ceiling),
    summary: sanitizeConfidenceLanguage(parsed.summary, ceiling),
    likelyStrategy: sanitizeConfidenceLanguage(parsed.likelyStrategy, ceiling),
    familyPattern: sanitizeConfidenceLanguage(parsed.familyPattern, ceiling),
    protocolGaps: parsed.protocolGaps.map((gap) => sanitizeConfidenceLanguage(gap, ceiling)),
    nextTrialDesign: sanitizeConfidenceLanguage(parsed.nextTrialDesign, ceiling),
    caveats: parsed.caveats.map((caveat) => sanitizeConfidenceLanguage(caveat, ceiling)),
    evidenceNotes: parsed.evidenceNotes.map((note) => sanitizeConfidenceLanguage(note, ceiling)),
    recommendedTechniques: parsed.recommendedTechniques.map((recommendation) => ({
      ...recommendation,
      technique: sanitizeConfidenceLanguage(recommendation.technique, ceiling),
      recommendation: sanitizeConfidenceLanguage(recommendation.recommendation, ceiling),
      evidenceSummary: sanitizeConfidenceLanguage(recommendation.evidenceSummary, ceiling),
      protocolFrame: sanitizeConfidenceLanguage(recommendation.protocolFrame, ceiling),
      experimentalControls: sanitizeConfidenceLanguage(recommendation.experimentalControls, ceiling),
      successCriteria: sanitizeConfidenceLanguage(recommendation.successCriteria, ceiling),
      riskChecks: sanitizeConfidenceLanguage(recommendation.riskChecks, ceiling),
      whatToTry: sanitizeConfidenceLanguage(recommendation.whatToTry, ceiling),
      whatWouldChangeMind: sanitizeConfidenceLanguage(recommendation.whatWouldChangeMind, ceiling)
    }))
  };
}

function highestConfidenceLabel(labels: ConfidenceLabel[]): ConfidenceLabel {
  return labels.reduce<ConfidenceLabel>(
    (highest, label) => (confidenceRank(label) > confidenceRank(highest) ? label : highest),
    "Needs replication"
  );
}

function maxConfidenceFromContext(value: unknown): ConfidenceLabel {
  const labels: ConfidenceLabel[] = [];

  function visit(current: unknown, key = "", depth = 0): void {
    if (depth > 8 || current === null || current === undefined) return;
    if (
      typeof current === "string" &&
      (key === "confidence" || key === "deterministicConfidence") &&
      CONFIDENCE_LABELS.includes(current as ConfidenceLabel)
    ) {
      labels.push(current as ConfidenceLabel);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, key, depth + 1);
      return;
    }
    if (typeof current === "object") {
      for (const [childKey, childValue] of Object.entries(current)) {
        visit(childValue, childKey, depth + 1);
      }
    }
  }

  visit(value);
  return labels.length ? highestConfidenceLabel(labels) : "Inconclusive";
}

function normalizePlantFamilyName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /^unknown$/i.test(trimmed)) return null;
  const familyMatch = trimmed.match(/\b[A-Z][a-z]+aceae\b/);
  return familyMatch?.[0] ?? trimmed;
}

function deterministicSpeciesConfidence(trials: TrialRecord[]): ConfidenceLabel {
  const pcValues = trials.map((trial) => trial.pc).filter((value): value is number => typeof value === "number");
  const treatmentCount = new Set(trials.map((trial) => trial.treatment)).size;
  const highScoreCount = pcValues.filter((value) => value >= 4).length;

  if (trials.length < 3 || treatmentCount < 2) return "Needs replication";
  if (pcValues.length < 3) return "Inconclusive";
  if (trials.length >= 8 && treatmentCount >= 3 && highScoreCount / pcValues.length >= 0.65) return "Strong signal";
  if (highScoreCount > 0) return "Promising";
  return "Inconclusive";
}

function fallbackEvidence(context: SpeciesContext): SpeciesInsightEvidence[] {
  return context.trials.slice(0, 3).map((trial) => ({
    sourceRow: trial.sourceRow,
    accession: trial.accession,
    treatment: trial.treatment,
    observation:
      trial.pc === null
        ? `PC not recorded; status ${trial.status ?? "unknown"}`
        : `PC ${trial.pc}; status ${trial.status ?? "unknown"}`
  }));
}

function evidenceObservation(context: SpeciesContext, trial: SpeciesContext["trials"][number]): string {
  const observations = context.observations
    .filter((observation) => observation.sourceRow === trial.sourceRow)
    .slice(0, 2)
    .map((observation) => {
      const value = observation.value === null ? "" : ` ${observation.value}`;
      const date = observation.date ? ` on ${observation.date}` : "";
      return `${observation.kind}${value}${date}: ${observation.rawSnippet}`;
    });

  if (observations.length) return observations.join("; ");
  if (trial.pc !== null) return `PC ${trial.pc}; status ${trial.status ?? "unknown"}`;
  if (trial.lpc !== null) return `LPC ${trial.lpc}; status ${trial.status ?? "unknown"}`;
  if (trial.fourPc !== null) return `4PC ${trial.fourPc}; status ${trial.status ?? "unknown"}`;
  return `PC not recorded; status ${trial.status ?? "unknown"}`;
}

function hydrateEvidence(context: SpeciesContext, draftEvidence: z.infer<typeof EvidenceSchema>[]): SpeciesInsightEvidence[] {
  const trialByRow = new Map(context.trials.map((trial) => [trial.sourceRow, trial]));
  const seenRows = new Set<number>();
  const evidence: SpeciesInsightEvidence[] = [];

  for (const item of draftEvidence) {
    if (seenRows.has(item.sourceRow)) continue;
    const trial = trialByRow.get(item.sourceRow);
    if (!trial) continue;
    seenRows.add(item.sourceRow);
    evidence.push({
      sourceRow: trial.sourceRow,
      accession: trial.accession,
      treatment: trial.treatment,
      observation: evidenceObservation(context, trial)
    });
  }

  return evidence;
}

function normalizeFamily(context: SpeciesContext, draft: z.infer<typeof SpeciesInsightDraftSchema>): {
  plantFamily: string;
  familySource: FamilySource;
} {
  const contextFamily = normalizePlantFamilyName(context.family);
  if (contextFamily) return { plantFamily: contextFamily, familySource: "workbook" };
  const family = normalizePlantFamilyName(draft.plantFamily);
  if (!family || draft.familySource === "unknown") {
    return { plantFamily: "Unknown", familySource: "unknown" };
  }
  return { plantFamily: family, familySource: "ai_inferred" };
}

function fallbackTechniqueRecommendation(
  context: SpeciesContext,
  evidence: SpeciesInsightEvidence[]
): RecommendedTechnique {
  const bestTrial =
    context.trials
      .slice()
      .filter((trial) => typeof trial.pc === "number")
      .sort((a, b) => (b.pc ?? -1) - (a.pc ?? -1))[0] ?? context.trials[0];
  const citedRows = bestTrial ? [bestTrial.sourceRow] : evidence.map((item) => item.sourceRow).slice(0, 1);

  return {
    technique: bestTrial?.treatment ?? "Paired control and candidate treatment",
    evidenceSummary: bestTrial
      ? `Local row ${bestTrial.sourceRow} is the best available cited lead, but it still needs replication.`
      : "No treatment can be recommended until the import contains species-level trial rows.",
    deterministicConfidence: context.deterministicConfidence,
    citedRows,
    wouldProve: "Repeated paired accessions show the same direction while downstream survival remains acceptable.",
    wouldDisprove: "Control or alternative trays match or beat the candidate after replication, or survival drops after germination."
  };
}

function hydrateRecommendedTechniques(
  context: SpeciesContext,
  draftRecommendations: Array<z.infer<typeof RecommendedTechniqueDraftSchema>>,
  evidence: SpeciesInsightEvidence[]
): RecommendedTechnique[] {
  const allowedRows = new Set(context.trials.map((trial) => trial.sourceRow));
  const recommendations: RecommendedTechnique[] = [];

  for (const recommendation of draftRecommendations) {
    const deterministicConfidence = capConfidence(
      recommendation.deterministicConfidence,
      context.deterministicConfidence
    );
    const citedRows = [...new Set(recommendation.citedRows.filter((row) => allowedRows.has(row)))];
    if (!citedRows.length) continue;
    recommendations.push({
      technique: recommendation.technique,
      evidenceSummary: recommendation.evidenceSummary,
      deterministicConfidence,
      citedRows,
      wouldProve: recommendation.wouldProve,
      wouldDisprove: recommendation.wouldDisprove
    });
  }

  return recommendations.length ? recommendations : [fallbackTechniqueRecommendation(context, evidence)];
}

function contextForSpecies(importResult: ImportResult, species: string): SpeciesContext | null {
  return buildSpeciesInsightContexts(importResult).find((context) => context.species === species) ?? null;
}

function researchFamily(
  context: SpeciesContext,
  taxonomy: SpeciesTaxonomyMatch | null,
  draft?: z.infer<typeof SpeciesResearchResponseSchema>
): { plantFamily: string | null; familySource: FamilySource } {
  const contextFamily = normalizePlantFamilyName(context.family);
  if (contextFamily) return { plantFamily: contextFamily, familySource: "workbook" };
  const taxonomyFamily = normalizePlantFamilyName(taxonomy?.family);
  if (taxonomyFamily) return { plantFamily: taxonomyFamily, familySource: "ai_inferred" };
  const draftFamily = normalizePlantFamilyName(draft?.plantFamily);
  if (draftFamily && draft?.familySource !== "unknown") {
    return { plantFamily: draftFamily, familySource: "ai_inferred" };
  }
  return { plantFamily: null, familySource: "unknown" };
}

function localEvidenceForResearch(context: SpeciesContext): SpeciesInsightEvidence[] {
  return fallbackEvidence(context).slice(0, 5);
}

function noSourceResearchResult({
  species,
  context,
  taxonomy,
  generatedAt,
  reason,
  sources = [],
  model = null
}: {
  species: string;
  context: SpeciesContext;
  taxonomy: SpeciesTaxonomyMatch | null;
  generatedAt: string;
  reason?: string;
  sources?: SpeciesResearchSource[];
  model?: string | null;
}): SpeciesResearchResult {
  const family = researchFamily(context, taxonomy);
  const sourceReason =
    reason ??
    "OpenAI could not produce a valid local-evidence germination assessment. The app is withholding protocol advice rather than inventing it.";
  return {
    species,
    status: "no_sources",
    plantFamily: family.plantFamily,
    familySource: family.familySource,
    deterministicConfidence: context.deterministicConfidence,
    summary: sourceReason,
    likelyStrategy:
      "Use the local workbook evidence only as a trial-planning clue before treating any method as a protocol.",
    familyPattern:
      family.plantFamily === null
        ? "Family context is unresolved for this taxon."
        : `${family.plantFamily} context was identified, but the workbook evidence still owns the treatment assessment.`,
    recommendedTechniques: [],
    protocolGaps: [
      "No external source claim survived source-ID and local-row citation validation.",
      "Treat local workbook treatment codes as local protocols unless the codebook defines temperature, duration, substrate, moisture, and light conditions."
    ],
    nextTrialDesign:
      "Repeat the best local candidate against a control across multiple accessions, and record PC plus liner or 4-inch survival before changing production practice.",
    caveats: [
      "Technique claims must be grounded in local workbook rows.",
      "Deterministic confidence labels remain authoritative.",
      "Missing reference context is not evidence that a treatment will fail."
    ],
    evidenceNotes: [sourceReason],
    localEvidence: localEvidenceForResearch(context),
    sources,
    generatedAt,
    model
  };
}

function localResearchPayload(importResult: ImportResult, context: SpeciesContext, taxonomy: SpeciesTaxonomyMatch | null) {
  const rowSet = new Set(context.trials.map((trial) => trial.sourceRow));
  const family = context.family ?? taxonomy?.family ?? null;
  const normalizedFamily = normalizePlantFamilyName(family)?.toLowerCase() ?? null;
  const genus = taxonomy?.genus ?? context.species.split(/\s+/)[0] ?? null;
  const relatedTrials = importResult.trials
    .filter((trial) => {
      if (rowSet.has(trial.sourceRow)) return false;
      if (normalizedFamily && normalizePlantFamilyName(trial.family)?.toLowerCase() === normalizedFamily) return true;
      return genus ? trial.species.startsWith(`${genus} `) : false;
    })
    .sort((a, b) => a.sourceRow - b.sourceRow)
    .slice(0, 12)
    .map((trial) => ({
      sourceRow: trial.sourceRow,
      species: trial.species,
      family: trial.family ?? null,
      treatment: trial.treatment,
      treatmentComponents: trial.treatmentComponents,
      pc: trial.pc,
      pcRaw: trial.pcRaw ?? trial.pc,
      pcScale: trial.pcScale ?? null,
      lpc: trial.lpc,
      lpcRaw: trial.lpcRaw ?? trial.lpc,
      lpcScale: trial.lpcScale ?? null,
      fourPc: trial.fourPc,
      fourPcRaw: trial.fourPcRaw ?? trial.fourPc,
      fourPcScale: trial.fourPcScale ?? null,
      status: trial.status
    }));

  return {
    species: context.species,
    deterministicConfidence: context.deterministicConfidence,
    selectedTrials: context.trials,
    observations: context.observations,
    relatedFamilyOrGenusTrials: relatedTrials
  };
}

function hydrateResearchTechniques(
  context: SpeciesContext,
  sources: SpeciesResearchSource[],
  draftRecommendations: Array<z.infer<typeof SpeciesResearchTechniqueDraftSchema>>
): SpeciesResearchTechnique[] {
  const allowedSourceIds = new Set(sources.map((source) => source.id));
  const allowedRows = new Set(context.trials.map((trial) => trial.sourceRow));
  const techniques: SpeciesResearchTechnique[] = [];

  for (const recommendation of draftRecommendations) {
    const deterministicConfidence = capConfidence(
      recommendation.deterministicConfidence,
      context.deterministicConfidence
    );
    const localRows = [...new Set(recommendation.localRows.filter((row) => allowedRows.has(row)))];
    const sourceIds = [...new Set(recommendation.sourceIds.filter((sourceId) => allowedSourceIds.has(sourceId)))];
    if (!localRows.length) continue;
    const evidenceLevel =
      !sourceIds.length && localRows.length && recommendation.evidenceLevel !== "local_species"
        ? "local_species"
        : recommendation.evidenceLevel;
    if (evidenceLevel === "mixed" && (!localRows.length || !sourceIds.length)) continue;
    if (
      ["species_literature", "genus_background", "family_background"].includes(evidenceLevel) &&
      !sourceIds.length
    ) {
      continue;
    }
    techniques.push({
      technique: recommendation.technique,
      evidenceLevel,
      recommendation: recommendation.recommendation,
      evidenceSummary: recommendation.evidenceSummary,
      deterministicConfidence,
      sourceIds,
      localRows,
      protocolFrame: recommendation.protocolFrame,
      experimentalControls: recommendation.experimentalControls,
      successCriteria: recommendation.successCriteria,
      riskChecks: recommendation.riskChecks,
      whatToTry: recommendation.whatToTry,
      whatWouldChangeMind: recommendation.whatWouldChangeMind
    });
  }

  return techniques;
}

export function buildSpeciesInsightContexts(result: ImportResult): SpeciesContext[] {
  const observationsByTrial = new Map<string, ParsedObservation[]>();
  for (const observation of result.observations) {
    observationsByTrial.set(observation.trialId, [
      ...(observationsByTrial.get(observation.trialId) ?? []),
      observation
    ]);
  }

  const bySpecies = new Map<string, TrialRecord[]>();
  for (const trial of result.trials) {
    bySpecies.set(trial.species, [...(bySpecies.get(trial.species) ?? []), trial]);
  }

  return [...bySpecies.entries()]
    .map(([species, trials]) => {
      const family = trials.find((trial) => trial.family)?.family ?? null;
      return {
        species,
        family,
        deterministicConfidence: deterministicSpeciesConfidence(trials),
        trials: trials
          .slice()
          .sort((a, b) => a.sourceRow - b.sourceRow)
          .slice(0, 14)
          .map((trial) => ({
            sourceRow: trial.sourceRow,
            accession: trial.pAccession,
            sourceAccession: trial.sourceAccession,
            family: trial.family ?? null,
            treatment: trial.treatment,
            treatmentComponents: trial.treatmentComponents,
            pc: trial.pc,
            pcRaw: trial.pcRaw ?? trial.pc,
            pcScale: trial.pcScale ?? null,
            lpc: trial.lpc,
            lpcRaw: trial.lpcRaw ?? trial.lpc,
            lpcScale: trial.lpcScale ?? null,
            fourPc: trial.fourPc,
            fourPcRaw: trial.fourPcRaw ?? trial.fourPc,
            fourPcScale: trial.fourPcScale ?? null,
            status: trial.status,
            notes: trial.notes
          })),
        observations: trials
          .flatMap((trial) => observationsByTrial.get(trial.id) ?? [])
          .slice(0, 8)
          .map((observation) => ({
            sourceRow: observation.sourceRow,
            kind: observation.kind,
            value: observation.value,
            date: observation.date,
            rawSnippet: observation.rawSnippet
          }))
      };
    })
    .sort(
      (a, b) =>
        confidenceRank(b.deterministicConfidence) - confidenceRank(a.deterministicConfidence) ||
        b.trials.length - a.trials.length ||
        a.species.localeCompare(b.species)
    );
}

export function parseSpeciesInsightResponse(
  responseText: string,
  contexts: SpeciesContext[],
  model = OPENAI_INSIGHT_MODEL,
  generatedAt = new Date().toISOString()
): SpeciesInsight[] {
  const parsed = SpeciesInsightResponseSchema.parse(JSON.parse(responseText));
  const contextBySpecies = new Map(contexts.map((context) => [context.species, context]));
  const insights: SpeciesInsight[] = [];

  for (const draft of parsed.speciesInsights) {
    const context = contextBySpecies.get(draft.species);
    if (!context) continue;
    assertNoConfidenceUpgrade(
      [
        draft.plantFamily,
        draft.summary,
        draft.propagationInterpretation,
        draft.familyPropagationPattern,
        ...draft.keyFindings,
        ...draft.nextSteps,
        draft.trialDesign,
        ...draft.cautionFlags,
        draft.confidenceCaveat,
        ...draft.researchNotes,
        ...draft.recommendedTechniques.flatMap((recommendation) => [
          recommendation.technique,
          recommendation.evidenceSummary,
          recommendation.wouldProve,
          recommendation.wouldDisprove
        ])
      ],
      context.deterministicConfidence,
      `Species insight for ${context.species}`
    );
    const evidence = hydrateEvidence(context, draft.evidence);
    const normalizedFamily = normalizeFamily(context, draft);
    const recommendedTechniques = hydrateRecommendedTechniques(
      context,
      draft.recommendedTechniques,
      evidence.length ? evidence : fallbackEvidence(context)
    );
    insights.push({
      species: context.species,
      deterministicConfidence: context.deterministicConfidence,
      plantFamily: normalizedFamily.plantFamily,
      familySource: normalizedFamily.familySource,
      summary: draft.summary,
      propagationInterpretation: draft.propagationInterpretation,
      recommendedTechniques,
      familyPropagationPattern: draft.familyPropagationPattern,
      keyFindings: draft.keyFindings,
      nextSteps: draft.nextSteps,
      trialDesign: draft.trialDesign,
      cautionFlags: draft.cautionFlags,
      confidenceCaveat: draft.confidenceCaveat,
      researchNotes: draft.researchNotes,
      evidence: evidence.length ? evidence : fallbackEvidence(context),
      generatedBy: "openai",
      model,
      generatedAt
    });
  }

  return insights;
}

export function parseSpeciesResearchResponse({
  responseText,
  species,
  context,
  taxonomy,
  sources,
  model = OPENAI_INSIGHT_MODEL,
  generatedAt = new Date().toISOString()
}: {
  responseText: string;
  species: string;
  context: SpeciesContext;
  taxonomy: SpeciesTaxonomyMatch | null;
  sources: SpeciesResearchSource[];
  model?: string;
  generatedAt?: string;
}): SpeciesResearchResult {
  const parsed = sanitizeResearchNarrative(
    SpeciesResearchResponseSchema.parse(JSON.parse(responseText)),
    context.deterministicConfidence
  );
  assertNoConfidenceUpgrade(
    [
      parsed.plantFamily,
      parsed.summary,
      parsed.likelyStrategy,
      parsed.familyPattern,
      parsed.nextTrialDesign,
      ...parsed.protocolGaps,
      ...parsed.caveats,
      ...parsed.evidenceNotes,
      ...parsed.recommendedTechniques.flatMap((recommendation) => [
        recommendation.technique,
        recommendation.evidenceLevel,
        recommendation.recommendation,
        recommendation.evidenceSummary,
        recommendation.protocolFrame,
        recommendation.experimentalControls,
        recommendation.successCriteria,
        recommendation.riskChecks,
        recommendation.whatToTry,
        recommendation.whatWouldChangeMind
      ])
    ],
    context.deterministicConfidence,
    `Species research for ${context.species}`
  );
  const family = researchFamily(context, taxonomy, parsed);
  const recommendedTechniques = hydrateResearchTechniques(context, sources, parsed.recommendedTechniques);
  if (!recommendedTechniques.length) {
    return noSourceResearchResult({
      species,
      context,
      taxonomy,
      generatedAt,
      sources,
      model,
      reason: "No valid local-row germination technique survived validation, so the AI narrative was withheld."
    });
  }

  return {
    species,
    status: "ready",
    plantFamily: family.plantFamily,
    familySource: family.familySource,
    deterministicConfidence: context.deterministicConfidence,
    summary: parsed.summary,
    likelyStrategy: parsed.likelyStrategy,
    familyPattern: parsed.familyPattern,
    recommendedTechniques,
    protocolGaps: parsed.protocolGaps,
    nextTrialDesign: parsed.nextTrialDesign,
    caveats: sources.length
      ? parsed.caveats
      : [
          ...parsed.caveats.slice(0, 5),
          "Web discovery returned no vetted source, so these technique candidates rely only on cited local workbook rows."
        ],
    evidenceNotes: parsed.evidenceNotes,
    localEvidence: localEvidenceForResearch(context),
    sources,
    generatedAt,
    model
  };
}

export function parseAskAnswerResponse(
  responseText: string,
  allowedRows: Set<number>,
  model = OPENAI_INSIGHT_MODEL,
  createdAt = new Date().toISOString(),
  confidenceCeiling: ConfidenceLabel = "Inconclusive"
): AskAnswer {
  const parsed = AskAnswerResponseSchema.parse(JSON.parse(responseText));
  assertNoConfidenceUpgrade([parsed.answer, ...parsed.caveats], confidenceCeiling, "Ask answer");
  return {
    answer: parsed.answer,
    caveats: parsed.caveats,
    citedRows: parsed.citedRows.filter((row) => allowedRows.has(row)),
    model,
    createdAt
  };
}

export function parseHeaderMappingResponse(responseText: string, profile: WorkbookHeaderProfile): Record<string, string> {
  const parsed = HeaderMappingResponseSchema.parse(JSON.parse(responseText));
  const rawHeaders = new Set(profile.headers);
  const aliases: Record<string, string> = {};
  for (const alias of parsed.aliases) {
    if (!rawHeaders.has(alias.header)) continue;
    aliases[alias.header] = alias.canonical;
  }
  return aliases;
}

export async function discoverSpeciesResearchSources({
  apiKey,
  species,
  taxonomy,
  family = null
}: {
  apiKey: string;
  species: string;
  taxonomy: SpeciesTaxonomyMatch | null;
  family?: string | null;
}): Promise<SpeciesResearchSource[]> {
  const query = `${normalizeSpaces(species)} seed germination dormancy propagation research`;
  const client = openAiClient(apiKey, 60_000, 0);
  const response = await client.responses.create({
    model: OPENAI_MINI_MODEL,
    instructions:
      "You must perform a web search. Find authoritative, directly relevant sources for seed germination, dormancy, propagation, or closely related genus/family methods for the requested taxon. Prefer primary literature, government, university, botanical garden, and seed-bank sources. Avoid generic homepages, search-result pages, commercial summaries, and sources that do not support a propagation claim. Give a concise research note in which every factual source claim is immediately backed by a URL citation, and name the relevant species, genus, or family in the cited sentence so the application can vet what each link supports.",
    input: JSON.stringify({ species, family, taxonomy, query }),
    reasoning: { effort: "low" },
    max_output_tokens: 3000,
    store: false,
    tools: [{ type: "web_search", search_context_size: "medium" }],
    tool_choice: "auto",
    include: ["web_search_call.action.sources"]
  });
  return extractSpeciesResearchSources(response, { species, taxonomy, family, query });
}

export async function generateSpeciesInsights({
  apiKey,
  importResult,
  dashboard
}: {
  apiKey: string;
  importResult: ImportResult;
  dashboard: DashboardData;
}): Promise<SpeciesInsight[]> {
  const contexts = buildSpeciesInsightContexts(importResult);
  if (!contexts.length) return [];

  const client = openAiClient(apiKey);
  const generatedAt = new Date().toISOString();
  const response = await client.responses.create({
    model: OPENAI_INSIGHT_MODEL,
    instructions:
      "You are a botanist and seed-bank scientist with decades of propagation experience. Interpret the provided PSU-style propagation evidence for each species as an evidence-backed species and family propagation assessment. For each species, identify the plant family from the workbook family field when present; otherwise infer it cautiously from the taxon and mark familySource as ai_inferred, or unknown when uncertain. Recommend germination techniques only when you cite source rows present in that species payload. Explain what the cited rows suggest, what family-level germination or dormancy pattern may be relevant, what would prove or disprove the technique, and the next practical trial design. Preserve deterministic confidence labels exactly, do not overstate underpowered findings, and never hide data-quality warnings. Do not provide URLs; the app attaches vetted reference links separately.",
    input: JSON.stringify({
      batch: dashboard.batch,
      guardrails: dashboard.dataQualityIssues,
      speciesContexts: contexts
    }),
    reasoning: { effort: "medium" },
    max_output_tokens: 6500,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "species_insight_response",
        description: "Cached species-level propagation insights for SeedBank Insights.",
        strict: true,
        schema: SPECIES_INSIGHT_JSON_SCHEMA
      }
    }
  });

  return parseSpeciesInsightResponse(response.output_text, contexts, OPENAI_INSIGHT_MODEL, generatedAt);
}

export async function generateSpeciesResearch({
  apiKey,
  species,
  importResult,
  dashboard,
  taxonomy,
  sources
}: {
  apiKey: string;
  species: string;
  importResult: ImportResult;
  dashboard: DashboardData;
  taxonomy: SpeciesTaxonomyMatch | null;
  sources: SpeciesResearchSource[];
}): Promise<SpeciesResearchResult> {
  const context = contextForSpecies(importResult, species);
  if (!context) throw new Error(`No local trial rows found for ${species}.`);
  const generatedAt = new Date().toISOString();

  const client = openAiClient(apiKey);
  const instructions =
    "You are a senior seed-bank propagation scientist advising researchers who need to get difficult native seeds to germinate faster without overclaiming. Produce a protocol-oriented research assessment for the selected species using the provided local workbook evidence, taxonomy context, and vetted web sources. Good output helps design the next experiment: it separates germination from seedling/production success, names the exact workbook treatment code being evaluated, and states controls, replication needs, success criteria, failure criteria, and risk checks such as viability/fill, contamination, abnormal seedlings, unequal seed numbers, incomplete ND outcomes, and rescue/converted treatments. The pc, lpc, and fourPc fields are normalized 0-5 analysis values. Always inspect pcRaw/pcScale, lpcRaw/lpcScale, and fourPcRaw/fourPcScale: when a scale is percent_0_100, its Raw field is the exact percentage and the normalized value is only its 0-5 class; never report the normalized class as the raw observation. When scale metadata is missing or invalid, do not infer an exact percentage. Do not invent operational details. If CS, WS, GA, smoke, substrate, light, temperature, moisture, or duration are not defined in the payload, say to repeat the local code exactly and list the missing protocol fields as protocolGaps. Every technique must cite one or more localRows from the selected species payload as its local relevance anchor. Every literature-backed claim or technique must also cite one or more exact sourceIds from vettedSources; never invent a source ID. Do not present general family or genus knowledge as a verified protocol. Preserve deterministic confidence labels exactly; never upgrade them and never hide caveats. If vettedSources is empty, useful local_species technique candidates may still be returned, but explicitly caveat that no external source was available. Always produce useful local_species technique candidates from the workbook rows unless the local workbook evidence itself is unusable.";
  const input = JSON.stringify({
    batch: dashboard.batch,
    dataQualityIssues: dashboard.dataQualityIssues,
    taxonomy,
    localEvidence: localResearchPayload(importResult, context, taxonomy),
    vettedSources: sources
  });
  const requestSynthesis = async (model: string, retry: boolean): Promise<string> => {
    const response = await client.responses.create({
      model,
      instructions: retry
        ? `${instructions} Retry requirement: return concise, complete JSON. Keep the assessment practical; prefer two or three high-value techniques over exhaustive wording.`
        : instructions,
      input,
      reasoning: { effort: "medium" },
      max_output_tokens: retry ? 9000 : 7000,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "seedbank_species_research",
          description: "Source-backed germination research assessment for one selected species.",
          strict: true,
          schema: SPECIES_RESEARCH_JSON_SCHEMA
        }
      }
    });
    return response.output_text;
  };

  let responseText: string;
  try {
    responseText = await requestSynthesis(OPENAI_INSIGHT_MODEL, false);
  } catch {
    return noSourceResearchResult({
      species,
      context,
      taxonomy,
      generatedAt,
      sources,
      model: null,
      reason:
        "OpenAI synthesis was unavailable, so the app is showing local evidence without generated technique advice."
    });
  }

  try {
    const result = parseSpeciesResearchResponse({
      responseText,
      species,
      context,
      taxonomy,
      sources,
      model: OPENAI_INSIGHT_MODEL,
      generatedAt
    });
    if (result.status === "ready") return result;
  } catch {
    // A malformed or invalid structured synthesis gets one higher-capability retry below.
  }

  try {
    const retryText = await requestSynthesis(OPENAI_RESEARCH_RETRY_MODEL, true);
    const result = parseSpeciesResearchResponse({
      responseText: retryText,
      species,
      context,
      taxonomy,
      sources,
      model: OPENAI_RESEARCH_RETRY_MODEL,
      generatedAt
    });
    if (result.status === "ready") return result;
  } catch {
    // The deterministic fallback below intentionally omits unvalidated model narrative.
  }

  return noSourceResearchResult({
    species,
    context,
    taxonomy,
    generatedAt,
    sources,
    model: null,
    reason:
      "OpenAI synthesis did not return a valid local-row assessment, so the app is showing local evidence without generated technique advice."
  });
}

export async function answerSpreadsheetQuestion({
  apiKey,
  question,
  context
}: {
  apiKey: string;
  question: string;
  context: unknown;
}): Promise<AskAnswer> {
  const contextObject = context as { trials?: Array<{ sourceRow?: number }> };
  const allowedRows = new Set(
    (contextObject.trials ?? [])
      .map((trial) => trial.sourceRow)
      .filter((row): row is number => typeof row === "number")
  );
  const client = openAiClient(apiKey);
  const createdAt = new Date().toISOString();
  const response = await client.responses.create({
    model: OPENAI_MINI_MODEL,
    instructions:
      "You are a botanist and seed-bank scientist with decades of propagation experience. Answer the user's question using only the provided SeedBank Insights payload. Preserve deterministic confidence labels exactly. If the evidence is underpowered, say so plainly. Cite source rows only when they are present in the payload.",
      input: JSON.stringify({ question, context }),
    reasoning: { effort: "medium" },
    max_output_tokens: 1600,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "seedbank_ask_answer",
        description: "A bounded answer to a spreadsheet evidence question.",
        strict: true,
        schema: ASK_ANSWER_JSON_SCHEMA
      }
    }
  });
  return parseAskAnswerResponse(
    response.output_text,
    allowedRows,
    OPENAI_MINI_MODEL,
    createdAt,
    maxConfidenceFromContext(context)
  );
}

export async function suggestHeaderAliases({
  apiKey,
  profile
}: {
  apiKey: string;
  profile: WorkbookHeaderProfile;
}): Promise<Record<string, string>> {
  if (!profile.missingHeaders.length) return {};
  const client = openAiClient(apiKey);
  const response = await client.responses.create({
    model: OPENAI_MINI_MODEL,
    instructions:
      "Map spreadsheet headers to the requested SeedBank canonical headers. Return only mappings you are confident about. Do not invent headers that are not present.",
    input: JSON.stringify({
      canonicalHeaders: REQUIRED_HEADERS,
      worksheetName: profile.worksheetName,
      headers: profile.headers,
      missingHeaders: profile.missingHeaders
    }),
    reasoning: { effort: "low" },
    max_output_tokens: 1200,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: "seedbank_header_aliases",
        description: "Aliases from observed spreadsheet headers to SeedBank canonical headers.",
        strict: true,
        schema: HEADER_MAPPING_JSON_SCHEMA
      }
    }
  });
  return parseHeaderMappingResponse(response.output_text, profile);
}
