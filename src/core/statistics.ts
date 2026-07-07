import type {
  ConfidenceLabel,
  DataQualityIssue,
  PairedComparison,
  TreatmentSummary,
  TrialQueueItem,
  TrialRecord
} from "./types";

function definedScore(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function confidenceForTreatment(
  summaryRows: number,
  species: number,
  pcCount: number,
  pcMean: number | null,
  pcGe4Rate: number | null
): ConfidenceLabel {
  if (summaryRows <= 1 || species <= 1) return "Needs replication";
  if (pcCount < 5) return "Inconclusive";
  if (pcCount < 10 || species < 5) return "Promising";
  return pcMean !== null && pcMean >= 4 && (pcGe4Rate ?? 0) >= 0.6 ? "Strong signal" : "Promising";
}

export function summarizeTreatments(trials: TrialRecord[]): TreatmentSummary[] {
  const groups = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    const key = trial.treatment || "Unknown";
    groups.set(key, [...(groups.get(key) ?? []), trial]);
  }

  return [...groups.entries()]
    .map(([treatment, rows]) => {
      const pcValues = rows.map((row) => row.pc).filter(definedScore);
      const lpcValues = rows.map((row) => row.lpc).filter(definedScore);
      const fourPcValues = rows.map((row) => row.fourPc).filter(definedScore);
      const species = new Set(rows.map((row) => row.species)).size;
      const accessions = new Set(rows.map((row) => row.pAccession)).size;
      const pcMean = mean(pcValues) === null ? null : round(mean(pcValues) as number, 2);
      const pcGe4Rate = pcValues.length
        ? round(pcValues.filter((value) => value >= 4).length / pcValues.length, 3)
        : null;
      const confidence = confidenceForTreatment(rows.length, species, pcValues.length, pcMean, pcGe4Rate);
      const warning =
        confidence === "Needs replication"
          ? "One-off or nearly one-off treatment result. Do not generalize yet."
          : confidence === "Inconclusive"
            ? "Too few completed propagation scores for a firm call."
            : "Use paired comparisons before ranking this treatment across species.";
      return {
        treatment,
        rows: rows.length,
        species,
        accessions,
        pcCount: pcValues.length,
        pcMean,
        pcMedian: median(pcValues),
        pcGe4Rate,
        lpcMean: mean(lpcValues) === null ? null : round(mean(lpcValues) as number, 2),
        fourPcMean: mean(fourPcValues) === null ? null : round(mean(fourPcValues) as number, 2),
        confidence,
        warning
      };
    })
    .sort((a, b) => (b.pcMean ?? -1) - (a.pcMean ?? -1) || b.pcCount - a.pcCount);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function bootstrapInterval(values: number[], iterations = 600): [number, number] {
  if (values.length < 2) {
    const single = values[0] ?? 0;
    return [single, single];
  }

  let seed = 1729;
  const random = () => {
    seed = (seed * 48271) % 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample: number[] = [];
    for (let j = 0; j < values.length; j += 1) {
      sample.push(values[Math.floor(random() * values.length)]);
    }
    means.push(mean(sample) ?? 0);
  }
  return [round(percentile(means, 0.025), 2), round(percentile(means, 0.975), 2)];
}

function confidenceForComparison(
  n: number,
  improved: number,
  worse: number,
  meanDiff: number,
  ciLow: number,
  ciHigh: number
): ConfidenceLabel {
  const directionConsistency = n ? Math.max(improved, worse) / n : 0;
  const intervalCrossesZero = ciLow <= 0 && ciHigh >= 0;

  if (n < 3) return "Needs replication";
  if (n < 5 || intervalCrossesZero) return "Inconclusive";
  if (n >= 10 && directionConsistency >= 0.6 && Math.abs(meanDiff) >= 1 && !intervalCrossesZero) {
    return "Strong signal";
  }
  if (directionConsistency >= 0.6 && Math.abs(meanDiff) >= 0.75) return "Promising";
  return "Inconclusive";
}

function additionalTrialsNeeded(n: number, confidence: ConfidenceLabel): number {
  if (confidence === "Strong signal") return 0;
  if (n < 5) return 5 - n;
  if (n < 10) return 10 - n;
  return 3;
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

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function rowList(rows: TrialRecord[]): number[] {
  return [...new Set(rows.map((row) => row.sourceRow))].sort((a, b) => a - b);
}

function speciesList(rows: TrialRecord[]): string[] {
  return uniqueSorted(rows.map((row) => row.species));
}

function treatmentList(rows: TrialRecord[]): string[] {
  return uniqueSorted(rows.map((row) => row.treatment));
}

export function pairedComparison(
  trials: TrialRecord[],
  baseline: string,
  treatment: string
): PairedComparison {
  const byAccession = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    if (trial.pc === null) continue;
    const pairKey = `${trial.pAccession}|||${trial.species.trim().toLowerCase()}`;
    byAccession.set(pairKey, [...(byAccession.get(pairKey) ?? []), trial]);
  }

  const examples: PairedComparison["examples"] = [];
  const diffs: number[] = [];
  for (const rows of byAccession.values()) {
    const baseRows = rows.filter((row) => row.treatment === baseline && definedScore(row.pc));
    const candidateRows = rows.filter((row) => row.treatment === treatment && definedScore(row.pc));
    const baseScore = round(mean(baseRows.map((row) => row.pc).filter(definedScore)) ?? Number.NaN, 2);
    const candidateScore = round(mean(candidateRows.map((row) => row.pc).filter(definedScore)) ?? Number.NaN, 2);
    const candidate = candidateRows[0];
    if (!candidate || !Number.isFinite(baseScore) || !Number.isFinite(candidateScore)) continue;
    const diff = round(candidateScore - baseScore, 2);
    diffs.push(diff);
    examples.push({
      accession: candidate.pAccession,
      species: candidate.species,
      baselineScore: baseScore,
      treatmentScore: candidateScore,
      diff
    });
  }

  const [ciLow, ciHigh] = bootstrapInterval(diffs);
  const improved = diffs.filter((diff) => diff > 0).length;
  const tied = diffs.filter((diff) => diff === 0).length;
  const worse = diffs.filter((diff) => diff < 0).length;
  const meanDiff = round(mean(diffs) ?? 0, 2);
  const medianDiff = round(median(diffs) ?? 0, 2);
  const confidence = confidenceForComparison(diffs.length, improved, worse, meanDiff, ciLow, ciHigh);

  return {
    baseline,
    treatment,
    n: diffs.length,
    improved,
    tied,
    worse,
    meanDiff,
    medianDiff,
    ciLow,
    ciHigh,
    confidence,
    falsePositiveRisk:
      confidence === "Strong signal"
        ? "Lower, but still confirm across more species before protocol-wide rollout."
        : "Elevated. Result may be a species mix, date, or rare-treatment artifact.",
    falseNegativeRisk:
      confidence === "Inconclusive" || confidence === "Needs replication"
        ? "Elevated. The treatment may work, but this dataset is underpowered."
        : "Moderate. Continue replication before retiring alternatives.",
    additionalTrialsNeeded: additionalTrialsNeeded(diffs.length, confidence),
    examples: examples.sort((a, b) => b.diff - a.diff).slice(0, 8)
  };
}

export function buildDefaultComparisons(trials: TrialRecord[]): PairedComparison[] {
  return [
    pairedComparison(trials, "C", "CS"),
    pairedComparison(trials, "CS", "WS+CS"),
    pairedComparison(trials, "C", "WS30+CS"),
    pairedComparison(trials, "SCAR+C", "SCAR+CS")
  ]
    .filter((comparison) => comparison.n > 0)
    .sort(
      (a, b) =>
        confidenceRank(b.confidence) - confidenceRank(a.confidence) ||
        b.n - a.n ||
        Math.abs(b.meanDiff) - Math.abs(a.meanDiff)
    );
}

export function buildTrialQueue(trials: TrialRecord[]): TrialQueueItem[] {
  return trials
    .map((trial) => {
      const next = trial.ttd ?? trial.linerTtd ?? trial.fourTtd ?? trial.csed ?? trial.wsed ?? trial.startDate;
      const confidence: ConfidenceLabel =
        trial.pc !== null && trial.pc >= 4 ? "Promising" : trial.pc === null ? "Needs replication" : "Inconclusive";

      let priority: TrialQueueItem["priority"] = "low";
      let blockedMetric: TrialQueueItem["blockedMetric"] = "Replication";
      let nextStep = "Add a paired replicate before treating this row as evidence.";
      let reason = "Current evidence is too thin to separate treatment effect from accession noise.";

      if (trial.status === null) {
        priority = "high";
        blockedMetric = "D|ND";
        nextStep = `Set D/ND status for row ${trial.sourceRow}.`;
        reason = "Completion status is needed before this row can be interpreted as active, failed, or settled.";
      } else if (trial.pc === null) {
        priority = trial.status === "D" ? "high" : "medium";
        blockedMetric = "PC";
        nextStep = `Record PC score for row ${trial.sourceRow}.`;
        reason =
          trial.status === "D"
            ? "The trial is marked done, but missing PC blocks treatment comparison."
            : "The row cannot contribute to germination evidence until PC is recorded or the trial remains active.";
      } else if (trial.status === "ND" && trial.pc >= 4) {
        priority = "medium";
        blockedMetric = "D|ND";
        nextStep = `Resolve ND follow-up for promising row ${trial.sourceRow}.`;
        reason = "High germination on an active row can shift recommendations once completion and survival are known.";
      } else if (trial.pc >= 4 && trial.lpc === null) {
        priority = "medium";
        blockedMetric = "LPC";
        nextStep = `Record liner survival for row ${trial.sourceRow}.`;
        reason = "Good germination is not enough if seedlings fail during liner production.";
      } else if (trial.lpc !== null && trial.lpc >= 4 && trial.fourPc === null) {
        priority = "low";
        blockedMetric = "4PC";
        nextStep = `Record 4-inch survival for row ${trial.sourceRow}.`;
        reason = "Production follow-through confirms whether a germination win becomes usable plants.";
      } else if (trial.notes || trial.pcd) {
        priority = "low";
        blockedMetric = "Notes";
        nextStep = `Review notes for row ${trial.sourceRow}.`;
        reason = "The notes may contain counts, rescue handling, contamination, or timing details that affect interpretation.";
      }

      return {
        accession: trial.pAccession,
        species: trial.species,
        treatment: trial.treatment,
        status: trial.status,
        priority,
        nextDate: next,
        nextStep,
        reason,
        sourceRows: [trial.sourceRow],
        blockedMetric,
        pc: trial.pc,
        confidence
      };
    })
    .filter((item) => item.status !== "D" || item.blockedMetric !== "Replication")
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return (
        priorityOrder[a.priority] - priorityOrder[b.priority] ||
        String(a.nextDate ?? "9999").localeCompare(String(b.nextDate ?? "9999")) ||
        a.species.localeCompare(b.species)
      );
    })
    .slice(0, 18);
}

export function qualityIssues(trials: TrialRecord[]): DataQualityIssue[] {
  const missingPcRows = trials.filter((trial) => trial.pc === null);
  const missingStatusRows = trials.filter((trial) => trial.status === null);
  const missingSourceRows = trials.filter((trial) => !trial.sourceAccession);
  const missingPropaguleRows = trials.filter((trial) => !trial.propaguleType);
  const rareTreatmentSummaries = summarizeTreatments(trials).filter((summary) => summary.rows < 3);
  const rareTreatmentRows = trials.filter((trial) =>
    rareTreatmentSummaries.some((summary) => summary.treatment === trial.treatment)
  );
  const unmappedTokenRows = trials.filter((trial) => trial.treatmentComponents.warnings.length);
  const noteRows = trials.filter((trial) => trial.notes || trial.pcd);
  const highPcNoLinerRows = trials.filter((trial) => trial.pc !== null && trial.pc >= 4 && trial.lpc === null);
  const issues: DataQualityIssue[] = [];

  if (missingPcRows.length) {
    issues.push({
      id: "missing-pc",
      severity: "medium",
      category: "fix_first",
      title: "Missing propagation scores",
      detail: "Rows without PC cannot support treatment success calls.",
      impact: "Treatment comparisons undercount active or completed rows, which can create false negatives.",
      action: "Enter PC when known, or leave the trial active and keep it out of success ranking.",
      affectedRows: missingPcRows.length,
      sourceRows: rowList(missingPcRows),
      species: speciesList(missingPcRows),
      treatments: treatmentList(missingPcRows),
      metric: "PC"
    });
  }
  if (missingStatusRows.length) {
    issues.push({
      id: "missing-status",
      severity: "low",
      category: "fix_first",
      title: "Missing done status",
      detail: "Completion status is required to distinguish active trials from settled outcomes.",
      impact: "Rows can be mistaken for failures or successes before they are actually done.",
      action: "Fill D/ND before using these rows as settled evidence.",
      affectedRows: missingStatusRows.length,
      sourceRows: rowList(missingStatusRows),
      species: speciesList(missingStatusRows),
      treatments: treatmentList(missingStatusRows),
      metric: "D|ND"
    });
  }
  if (missingSourceRows.length) {
    issues.push({
      id: "missing-source-accession",
      severity: "medium",
      category: "fix_first",
      title: "Missing source accession",
      detail: "Rows without Source_Accession are retained, but provenance should be reviewed before broad conclusions.",
      impact: "Provenance gaps make accession-level pairing and repeatability checks weaker.",
      action: "Backfill source accession or mark the row as provenance-limited in review notes.",
      affectedRows: missingSourceRows.length,
      sourceRows: rowList(missingSourceRows),
      species: speciesList(missingSourceRows),
      treatments: treatmentList(missingSourceRows),
      metric: "Source_Accession"
    });
  }
  if (missingPropaguleRows.length) {
    issues.push({
      id: "missing-propagule-type",
      severity: "low",
      category: "fix_first",
      title: "Missing propagule type",
      detail: "A missing PT value limits future support for cutting/division workflows.",
      impact: "Propagation type gaps make mixed seed, cutting, and division workflows harder to separate later.",
      action: "Fill PT where available, especially before comparing unlike propagation methods.",
      affectedRows: missingPropaguleRows.length,
      sourceRows: rowList(missingPropaguleRows),
      species: speciesList(missingPropaguleRows),
      treatments: treatmentList(missingPropaguleRows),
      metric: "PT"
    });
  }
  if (rareTreatmentSummaries.length) {
    issues.push({
      id: "rare-treatment-replication",
      severity: "high",
      category: "replication",
      title: "Rare treatment false-positive risk",
      detail: "Several treatment strings appear fewer than three times. These must be labeled as replication needs.",
      impact: "A one-off high PC can look like a working protocol when it may be accession-specific noise.",
      action: "Repeat rare treatment codes against matched controls before promoting them.",
      affectedRows: rareTreatmentRows.length,
      sourceRows: rowList(rareTreatmentRows),
      species: speciesList(rareTreatmentRows),
      treatments: rareTreatmentSummaries.map((summary) => summary.treatment),
      metric: "Replication"
    });
  }
  if (unmappedTokenRows.length) {
    issues.push({
      id: "unmapped-treatment-tokens",
      severity: "medium",
      category: "codebook",
      title: "Unmapped treatment tokens",
      detail: "Some treatment strings contain tokens outside the current parser vocabulary.",
      impact: "Unknown treatment codes can split equivalent protocols or hide meaningful treatment components.",
      action: "Review the treatment codebook and add aliases only when the lab meaning is confirmed.",
      affectedRows: unmappedTokenRows.length,
      sourceRows: rowList(unmappedTokenRows),
      species: speciesList(unmappedTokenRows),
      treatments: treatmentList(unmappedTokenRows),
      metric: "Trt"
    });
  }
  if (highPcNoLinerRows.length) {
    issues.push({
      id: "germination-without-liner-followup",
      severity: "medium",
      category: "follow_up",
      title: "High germination without liner follow-up",
      detail: "Rows with PC 4-5 still need production survival checks before being treated as a complete success.",
      impact: "A germination method can look successful even if seedlings fail after transfer.",
      action: "Record LPC and later 4PC for high-PC rows before turning them into protocol recommendations.",
      affectedRows: highPcNoLinerRows.length,
      sourceRows: rowList(highPcNoLinerRows),
      species: speciesList(highPcNoLinerRows),
      treatments: treatmentList(highPcNoLinerRows),
      metric: "LPC"
    });
  }
  if (noteRows.length) {
    issues.push({
      id: "notes-contain-evidence",
      severity: "low",
      category: "notes",
      title: "Notes contain usable evidence",
      detail: "Counts extracted from notes should retain raw snippets for audit.",
      impact: "Unreviewed notes can contain germination counts, contamination, rescue handling, or production context.",
      action: "Review raw snippets before treating extracted observations as clean outcome data.",
      affectedRows: noteRows.length,
      sourceRows: rowList(noteRows),
      species: speciesList(noteRows),
      treatments: treatmentList(noteRows),
      metric: "Notes"
    });
  }

  return issues;
}
