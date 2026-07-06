import type {
  DashboardData,
  DataQualityIssue,
  ImportBatchSummary,
  ParsedObservation,
  TrialRecord
} from "./types";
import { buildDefaultComparisons, buildTrialQueue, qualityIssues, summarizeTreatments } from "./statistics";

export function buildDashboardData(
  trials: TrialRecord[],
  observations: ParsedObservation[],
  batch: ImportBatchSummary | null,
  importIssues: DataQualityIssue[] = []
): DashboardData {
  const accessionCount = new Set(trials.map((trial) => trial.pAccession)).size;
  const speciesCount = new Set(trials.map((trial) => trial.species)).size;
  const treatmentCount = new Set(trials.map((trial) => trial.treatment)).size;
  const doneCount = trials.filter((trial) => trial.status === "D").length;
  const pairedComparisons = buildDefaultComparisons(trials);
  const issueKey = (issue: DataQualityIssue) => `${issue.severity}:${issue.title}:${issue.detail}`;
  const issues = [...importIssues, ...qualityIssues(trials)].filter((issue, index, all) => {
    const key = issueKey(issue);
    return all.findIndex((candidate) => issueKey(candidate) === key) === index;
  });

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
    pairedComparisons,
    trialQueue: buildTrialQueue(trials),
    dataQualityIssues: issues,
    askSuggestions: [
      "Which treatment has the strongest paired evidence?",
      "Where are we underpowered and at risk of false negatives?",
      "Which ND trials have high PC scores but missing production follow-up?",
      "Which treatment strings need replication before we trust them?"
    ]
  };
}
