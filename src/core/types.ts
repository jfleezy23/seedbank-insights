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
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  affectedRows: number;
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
  nextDate: string | null;
  nextStep: string;
  pc: number | null;
  confidence: ConfidenceLabel;
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
  pairedComparisons: PairedComparison[];
  trialQueue: TrialQueueItem[];
  dataQualityIssues: DataQualityIssue[];
  askSuggestions: string[];
}
