import type {
  DashboardData,
  DataQualityIssue,
  ImportBatchSummary,
  ParsedObservation,
  SpeciesSummary,
  SpeciesInsight,
  TrialRecord
} from "./types";
import {
  buildAdvancedComparisons,
  buildDefaultComparisons,
  buildSpeciesTreatmentEffects,
  buildTrialQueue,
  countUnpairedScoredTreatmentArms,
  qualityIssues,
  summarizeTreatments
} from "./statistics";

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
  const speciesTreatmentEffects = buildSpeciesTreatmentEffects(trials);
  const issueKey = (issue: DataQualityIssue) => `${issue.severity}:${issue.title}:${issue.detail}`;
  const computedIssues = qualityIssues(trials);
  const issues = [...computedIssues, ...importIssues].filter((issue, index, all) => {
    const key = issueKey(issue);
    return all.findIndex((candidate) => issueKey(candidate) === key) === index;
  });
  const speciesSummaries = summarizeSpecies(trials, speciesTreatmentEffects);

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
    treatmentSummaries: summarizeTreatments(trials),
    speciesSummaries,
    speciesTreatmentEffects,
    pairedComparisons,
    advancedComparisons: buildAdvancedComparisons(trials, true),
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

function summarizeSpecies(trials: TrialRecord[], speciesTreatmentEffects: DashboardData["speciesTreatmentEffects"]): SpeciesSummary[] {
  const groups = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    groups.set(trial.species, [...(groups.get(trial.species) ?? []), trial]);
  }
  const unpairedBySpecies = countUnpairedScoredTreatmentArms(trials);

  return [...groups.entries()]
    .map(([species, rows]) => {
      const normalizedSpecies = species.trim().toLocaleLowerCase();
      const effects = speciesTreatmentEffects.filter(
        (effect) => effect.species.trim().toLocaleLowerCase() === normalizedSpecies
      );
      const treatments = new Set(rows.map((row) => row.treatment)).size;
      return {
        species,
        rows: rows.length,
        accessions: new Set(rows.map((row) => row.pAccession)).size,
        treatments,
        pcCount: rows.filter((row) => typeof row.pc === "number" && Number.isFinite(row.pc)).length,
        completedContrastCount: effects.filter((effect) => effect.outcome === "completed").length,
        activeContrastCount: effects.filter((effect) => effect.outcome === "active").length,
        unpairedScoredTreatmentCount: unpairedBySpecies.get(normalizedSpecies) ?? 0
      };
    })
    .sort((a, b) => b.rows - a.rows || a.species.localeCompare(b.species));
}
