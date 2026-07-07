export type ConfidenceLabel =
  | "Strong signal"
  | "Promising"
  | "Inconclusive"
  | "Needs replication";

export type ObservationKind =
  | "pc"
  | "germinated"
  | "inProduction"
  | "survival"
  | "note";

export interface TreatmentComponents {
  raw: string;
  normalized: string;
  isControl: boolean;
  hasCold: boolean;
  hasWarm: boolean;
  hasScarification: boolean;
  hasHotWater: boolean;
  hasGa: boolean;
  coldDays: number[];
  warmDays: number[];
  tokens: string[];
  warnings: string[];
}

export interface TrialRecord {
  id: string;
  importBatchId?: number;
  sourceRow: number;
  pAccession: string;
  sourceAccession: string;
  species: string;
  family?: string | null;
  treatment: string;
  num: number | null;
  startDate: string | null;
  propaguleType: string | null;
  ttd: string | null;
  pc: number | null;
  ced: string | null;
  wsed: string | null;
  csed: string | null;
  linerStart: string | null;
  linerTtd: string | null;
  lpc: number | null;
  fourStart: string | null;
  fourTtd: string | null;
  fourPc: number | null;
  location: string | null;
  status: "D" | "ND" | null;
  pcd: string | null;
  notes: string | null;
  treatmentComponents: TreatmentComponents;
}

export interface ParsedObservation {
  trialId: string;
  sourceRow: number;
  date: string | null;
  kind: ObservationKind;
  value: number | null;
  rawSnippet: string;
  confidence: "high" | "medium" | "low";
}

export interface DataQualityIssue {
  id?: string;
  severity: "high" | "medium" | "low";
  category?: "fix_first" | "replication" | "codebook" | "notes" | "follow_up";
  title: string;
  detail: string;
  impact?: string;
  action?: string;
  affectedRows: number;
  sourceRows?: number[];
  species?: string[];
  treatments?: string[];
  metric?: string;
}

export interface SpeciesInsightEvidence {
  sourceRow: number;
  accession: string;
  treatment: string;
  observation: string;
}

export interface SpeciesResourceLink {
  label: string;
  source: string;
  url: string;
  purpose: string;
}

export interface SpeciesTaxonomyMatch {
  requestedName: string;
  canonicalName: string | null;
  scientificName: string | null;
  rank: string | null;
  status: string | null;
  matchType: string | null;
  confidence: number | null;
  usageKey: number | null;
  genus: string | null;
  family: string | null;
}

export interface SpeciesResearchSource {
  id: string;
  source: "manual";
  title: string;
  year: number | null;
  venue: string | null;
  url: string;
  doi: string | null;
  matchedQuery: string;
  relevance: "species" | "genus" | "family";
  abstractSnippet: string | null;
}

export interface SpeciesResearchTechnique {
  technique: string;
  evidenceLevel: "local_species" | "species_literature" | "genus_background" | "family_background" | "mixed";
  recommendation: string;
  evidenceSummary: string;
  deterministicConfidence: ConfidenceLabel;
  sourceIds: string[];
  localRows: number[];
  protocolFrame: string;
  experimentalControls: string;
  successCriteria: string;
  riskChecks: string;
  whatToTry: string;
  whatWouldChangeMind: string;
}

export interface SpeciesResearchResult {
  species: string;
  status: "ready" | "no_sources";
  plantFamily: string | null;
  familySource: FamilySource;
  deterministicConfidence: ConfidenceLabel;
  summary: string;
  likelyStrategy: string;
  familyPattern: string;
  recommendedTechniques: SpeciesResearchTechnique[];
  protocolGaps: string[];
  nextTrialDesign: string;
  caveats: string[];
  evidenceNotes: string[];
  localEvidence: SpeciesInsightEvidence[];
  sources: SpeciesResearchSource[];
  generatedAt: string;
  model: string | null;
}

export type FamilySource = "workbook" | "ai_inferred" | "unknown";

export interface RecommendedTechnique {
  technique: string;
  evidenceSummary: string;
  deterministicConfidence: ConfidenceLabel;
  citedRows: number[];
  wouldProve: string;
  wouldDisprove: string;
}

export interface SpeciesInsight {
  species: string;
  deterministicConfidence: ConfidenceLabel;
  plantFamily?: string;
  familySource?: FamilySource;
  summary: string;
  propagationInterpretation?: string;
  recommendedTechniques?: RecommendedTechnique[];
  familyPropagationPattern?: string;
  keyFindings: string[];
  nextSteps: string[];
  trialDesign?: string;
  cautionFlags?: string[];
  confidenceCaveat: string;
  researchNotes?: string[];
  evidence: SpeciesInsightEvidence[];
  generatedBy: "openai" | "deterministic";
  model: string | null;
  generatedAt: string | null;
}

export interface AiInsightStatus {
  configured: boolean;
  state: "not_configured" | "not_generated" | "ready" | "error";
  message: string;
  model: string | null;
  generatedAt: string | null;
}

export interface AskAnswer {
  answer: string;
  caveats: string[];
  citedRows: number[];
  model: string;
  createdAt: string;
}

export interface ImportBatchSummary {
  id?: number;
  filename: string;
  importedAt: string;
  workbookHash: string;
  rowCount: number;
  accessionCount: number;
  speciesCount: number;
  treatmentCount: number;
  warnings: string[];
}

export interface ImportResult {
  batch: ImportBatchSummary;
  trials: TrialRecord[];
  observations: ParsedObservation[];
  issues: DataQualityIssue[];
}

export interface TreatmentSummary {
  treatment: string;
  rows: number;
  species: number;
  accessions: number;
  pcCount: number;
  pcMean: number | null;
  pcMedian: number | null;
  pcGe4Rate: number | null;
  lpcMean: number | null;
  fourPcMean: number | null;
  confidence: ConfidenceLabel;
  warning: string;
}

export interface SpeciesSummary {
  species: string;
  rows: number;
  accessions: number;
  treatments: number;
  pcCount: number;
  bestTreatment: string | null;
  bestPcMean: number | null;
  confidence: ConfidenceLabel;
}

export interface PairedComparison {
  baseline: string;
  treatment: string;
  n: number;
  improved: number;
  tied: number;
  worse: number;
  meanDiff: number;
  medianDiff: number;
  ciLow: number;
  ciHigh: number;
  confidence: ConfidenceLabel;
  falsePositiveRisk: string;
  falseNegativeRisk: string;
  additionalTrialsNeeded: number;
  examples: Array<{
    accession: string;
    species: string;
    baselineScore: number;
    treatmentScore: number;
    diff: number;
  }>;
}

export interface TrialQueueItem {
  accession: string;
  species: string;
  treatment: string;
  status: "D" | "ND" | null;
  priority: "high" | "medium" | "low";
  nextDate: string | null;
  nextStep: string;
  reason: string;
  sourceRows: number[];
  blockedMetric: "PC" | "D|ND" | "LPC" | "4PC" | "Notes" | "Replication";
  pc: number | null;
  confidence: ConfidenceLabel;
}

export interface SpeciesResearchCacheStatus {
  batchId: number | null;
  cacheVersion: string;
  totalSpecies: number;
  researchedSpecies: number;
  missingSpecies: string[];
  generatedAtLatest: string | null;
}

export interface DashboardData {
  batch: ImportBatchSummary | null;
  metrics: {
    trials: number;
    accessions: number;
    species: number;
    treatments: number;
    doneRate: number;
    observationsExtracted: number;
  };
  treatmentSummaries: TreatmentSummary[];
  speciesSummaries: SpeciesSummary[];
  pairedComparisons: PairedComparison[];
  trialQueue: TrialQueueItem[];
  dataQualityIssues: DataQualityIssue[];
  askSuggestions: string[];
  speciesInsights: SpeciesInsight[];
  aiInsightStatus: AiInsightStatus;
  speciesResearchCacheStatus?: SpeciesResearchCacheStatus | null;
}
