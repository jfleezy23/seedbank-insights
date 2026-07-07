import type {
  ConfidenceLabel,
  DashboardData,
  DataQualityIssue,
  ImportBatchSummary,
  ParsedObservation,
  SpeciesSummary,
  SpeciesInsight,
  TrialRecord
} from "./types";
import { buildDefaultComparisons, buildTrialQueue, qualityIssues, summarizeTreatments } from "./statistics";

export function buildDashboardData(
  trials: TrialRecord[],
  observations: ParsedObservation[],
  batch: ImportBatchSummary | null,
  importIssues: DataQualityIssue[] = [],
  speciesInsights: SpeciesInsight[] = []
): DashboardData {
  const accessionCount = new Set(trials.map((trial) => trial.pAccession)).size;
  const speciesCount = new Set(trials.map((trial) => trial.species)).size;
  const treatmentCount = new Set(trials.map((trial) => trial.treatment)).size;
  const doneCount = trials.filter((trial) => trial.status === "D").length;
  const pairedComparisons = buildDefaultComparisons(trials);
  const issueKey = (issue: DataQualityIssue) => `${issue.severity}:${issue.title}:${issue.detail}`;
  const computedIssues = qualityIssues(trials);
  const issues = [...computedIssues, ...importIssues].filter((issue, index, all) => {
    const key = issueKey(issue);
    return all.findIndex((candidate) => issueKey(candidate) === key) === index;
  });
  const speciesSummaries = summarizeSpecies(trials);

  return {
    batch,
    metrics: {
      trials: trials.length,
      accessions: accessionCount,
      species: speciesCount,
      treatments: treatmentCount,
      doneRate: trials.length ? Math.round((doneCount / trials.length) * 100) / 100 : 0,
      observationsExtracted: observations.length
    },
    treatmentSummaries: summarizeTreatments(trials).slice(0, 12),
    speciesSummaries,
    pairedComparisons,
    trialQueue: buildTrialQueue(trials),
    dataQualityIssues: issues,
    askSuggestions: [
      "Which treatment has the strongest paired evidence?",
      "Where are we underpowered and at risk of false negatives?",
      "Which ND trials have high PC scores but missing production follow-up?",
      "Which treatment strings need replication before we trust them?"
    ],
    speciesInsights,
    aiInsightStatus: {
      configured: false,
      state: speciesInsights.length ? "ready" : "not_configured",
      message: speciesInsights.length
        ? "Cached species insights are available for this import."
        : "OpenAI is not configured. Deterministic insights are available.",
      model: speciesInsights[0]?.model ?? null,
      generatedAt: speciesInsights[0]?.generatedAt ?? null
    },
    speciesResearchCacheStatus: null
  };
}

function summarizeSpecies(trials: TrialRecord[]): SpeciesSummary[] {
  const groups = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    groups.set(trial.species, [...(groups.get(trial.species) ?? []), trial]);
  }

  return [...groups.entries()]
    .map(([species, rows]) => {
      const treatmentMeans = [...new Set(rows.map((row) => row.treatment))]
        .map((treatment) => {
          const pcValues = rows
            .filter((row) => row.treatment === treatment && typeof row.pc === "number")
            .map((row) => row.pc as number);
          const mean = pcValues.length
            ? Math.round((pcValues.reduce((sum, value) => sum + value, 0) / pcValues.length) * 100) / 100
            : null;
          return { treatment, mean, count: pcValues.length };
        })
        .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1) || b.count - a.count);
      const pcCount = rows.filter((row) => typeof row.pc === "number").length;
      const highScores = rows.filter((row) => typeof row.pc === "number" && row.pc >= 4).length;
      const treatments = new Set(rows.map((row) => row.treatment)).size;
      const confidence: ConfidenceLabel =
        rows.length < 3 || treatments < 2
          ? "Needs replication"
          : pcCount < 3
            ? "Inconclusive"
            : highScores > 0
              ? "Promising"
              : "Inconclusive";
      return {
        species,
        rows: rows.length,
        accessions: new Set(rows.map((row) => row.pAccession)).size,
        treatments,
        pcCount,
        bestTreatment: treatmentMeans[0]?.mean === null ? null : treatmentMeans[0]?.treatment ?? null,
        bestPcMean: treatmentMeans[0]?.mean ?? null,
        confidence
      };
    })
    .sort((a, b) => b.rows - a.rows || a.species.localeCompare(b.species));
}
