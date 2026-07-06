import OpenAI from "openai";
import { z } from "zod";
import { REQUIRED_HEADERS, type WorkbookHeaderProfile } from "../../src/core/workbook";
import type {
  ConfidenceLabel,
  AskAnswer,
  DashboardData,
  ImportResult,
  ParsedObservation,
  SpeciesInsight,
  SpeciesInsightEvidence,
  TrialRecord
} from "../../src/core/types";

export const OPENAI_INSIGHT_MODEL = "gpt-5.5";
export const SPECIES_INSIGHT_SCHEMA_VERSION = "species-insight-v1";

const EvidenceSchema = z
  .object({
    sourceRow: z.number().int().positive(),
    accession: z.string(),
    treatment: z.string(),
    observation: z.string()
  })
  .strict();

const SpeciesInsightDraftSchema = z
  .object({
    species: z.string(),
    summary: z.string().min(1),
    propagationInterpretation: z.string().min(1),
    keyFindings: z.array(z.string().min(1)).min(1).max(4),
    nextSteps: z.array(z.string().min(1)).min(1).max(4),
    trialDesign: z.string().min(1),
    cautionFlags: z.array(z.string().min(1)).min(1).max(4),
    confidenceCaveat: z.string().min(1),
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
          species: { type: "string" },
          summary: { type: "string" },
          propagationInterpretation: { type: "string" },
          keyFindings: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" }
          },
          nextSteps: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" }
          },
          trialDesign: { type: "string" },
          cautionFlags: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: { type: "string" }
          },
          confidenceCaveat: { type: "string" },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                sourceRow: { type: "integer" },
                accession: { type: "string" },
                treatment: { type: "string" },
                observation: { type: "string" }
              },
              required: ["sourceRow", "accession", "treatment", "observation"]
            }
          }
        },
        required: [
          "species",
          "summary",
          "propagationInterpretation",
          "keyFindings",
          "nextSteps",
          "trialDesign",
          "cautionFlags",
          "confidenceCaveat",
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
  deterministicConfidence: ConfidenceLabel;
  trials: Array<{
    sourceRow: number;
    accession: string;
    sourceAccession: string;
    treatment: string;
    pc: number | null;
    lpc: number | null;
    fourPc: number | null;
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

const CONFIDENCE_LABELS: ConfidenceLabel[] = ["Strong signal", "Promising", "Inconclusive", "Needs replication"];

function confidenceLabelsInText(text: string): ConfidenceLabel[] {
  const found: ConfidenceLabel[] = [];
  for (const label of CONFIDENCE_LABELS) {
    const expression = new RegExp(`\\b${label.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (expression.test(text)) found.push(label);
  }
  return found;
}

function assertNoConfidenceUpgrade(textParts: string[], ceiling: ConfidenceLabel, source: string): void {
  const ceilingRank = confidenceRank(ceiling);
  for (const text of textParts) {
    for (const label of confidenceLabelsInText(text)) {
      if (confidenceRank(label) > ceilingRank) {
        throw new Error(`${source} attempted to upgrade deterministic confidence from ${ceiling} to ${label}.`);
      }
    }
  }
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
    .map(([species, trials]) => ({
      species,
      deterministicConfidence: deterministicSpeciesConfidence(trials),
      trials: trials
        .slice()
        .sort((a, b) => a.sourceRow - b.sourceRow)
        .slice(0, 14)
        .map((trial) => ({
          sourceRow: trial.sourceRow,
          accession: trial.pAccession,
          sourceAccession: trial.sourceAccession,
          treatment: trial.treatment,
          pc: trial.pc,
          lpc: trial.lpc,
          fourPc: trial.fourPc,
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
    }))
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
        draft.summary,
        draft.propagationInterpretation,
        ...draft.keyFindings,
        ...draft.nextSteps,
        draft.trialDesign,
        ...draft.cautionFlags,
        draft.confidenceCaveat
      ],
      context.deterministicConfidence,
      `Species insight for ${context.species}`
    );
    const evidence = hydrateEvidence(context, draft.evidence);
    insights.push({
      species: context.species,
      deterministicConfidence: context.deterministicConfidence,
      summary: draft.summary,
      propagationInterpretation: draft.propagationInterpretation,
      keyFindings: draft.keyFindings,
      nextSteps: draft.nextSteps,
      trialDesign: draft.trialDesign,
      cautionFlags: draft.cautionFlags,
      confidenceCaveat: draft.confidenceCaveat,
      evidence: evidence.length ? evidence : fallbackEvidence(context),
      generatedBy: "openai",
      model,
      generatedAt
    });
  }

  return insights;
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

  const client = new OpenAI({ apiKey });
  const generatedAt = new Date().toISOString();
  const response = await client.responses.create({
    model: OPENAI_INSIGHT_MODEL,
    instructions:
      "You are a botanist and seed-bank scientist with decades of propagation experience. Interpret the provided PSU-style propagation evidence for each species. Produce species-specific propagation interpretation: likely dormancy/handling hypothesis from the submitted rows, what method looks worth repeating, what evidence is missing, and a practical next-trial design. Do not change deterministic confidence labels, do not overstate underpowered findings, and cite only source rows present in the payload. Do not provide URLs; the app attaches vetted reference links separately.",
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
  const client = new OpenAI({ apiKey });
  const createdAt = new Date().toISOString();
  const response = await client.responses.create({
    model: OPENAI_INSIGHT_MODEL,
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
    OPENAI_INSIGHT_MODEL,
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
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: OPENAI_INSIGHT_MODEL,
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
