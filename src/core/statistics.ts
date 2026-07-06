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

function confidenceForTreatment(summaryRows: number, species: number, pcCount: number): ConfidenceLabel {
  if (summaryRows <= 1 || species <= 1) return "Needs replication";
  if (pcCount < 5) return "Inconclusive";
  if (pcCount < 10 || species < 5) return "Promising";
  return "Promising";
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
      const confidence = confidenceForTreatment(rows.length, species, pcValues.length);
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
        pcMean: mean(pcValues) === null ? null : round(mean(pcValues) as number, 2),
        pcMedian: median(pcValues),
        pcGe4Rate: pcValues.length
          ? round(pcValues.filter((value) => value >= 4).length / pcValues.length, 3)
          : null,
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
    const base = rows.find((row) => row.treatment === baseline && definedScore(row.pc));
    const candidate = rows.find((row) => row.treatment === treatment && definedScore(row.pc));
    if (!base || !candidate || !definedScore(base.pc) || !definedScore(candidate.pc)) continue;
    const diff = candidate.pc - base.pc;
    diffs.push(diff);
    examples.push({
      accession: candidate.pAccession,
      species: candidate.species,
      baselineScore: base.pc,
      treatmentScore: candidate.pc,
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
    .filter((trial) => trial.status !== "D")
    .map((trial) => {
      const next =
        trial.ttd ?? trial.linerTtd ?? trial.fourTtd ?? trial.csed ?? trial.wsed ?? trial.startDate;
      const confidence: ConfidenceLabel =
        trial.pc !== null && trial.pc >= 4 ? "Promising" : trial.pc === null ? "Needs replication" : "Inconclusive";
      return {
        accession: trial.pAccession,
        species: trial.species,
        treatment: trial.treatment,
        status: trial.status,
        nextDate: next,
        nextStep: trial.pc === null ? "Record propagation class" : "Complete production follow-up",
        pc: trial.pc,
        confidence
      };
    })
    .sort((a, b) => String(a.nextDate ?? "9999").localeCompare(String(b.nextDate ?? "9999")))
    .slice(0, 18);
}

export function qualityIssues(trials: TrialRecord[]): DataQualityIssue[] {
  const missingPc = trials.filter((trial) => trial.pc === null).length;
  const missingStatus = trials.filter((trial) => trial.status === null).length;
  const rareTreatments = summarizeTreatments(trials).filter((summary) => summary.rows < 3).length;
  const noteRows = trials.filter((trial) => trial.notes || trial.pcd).length;
  const issues: DataQualityIssue[] = [];

  if (missingPc) {
    issues.push({
      severity: "medium",
      title: "Missing propagation scores",
      detail: "Rows without PC cannot support treatment success calls.",
      affectedRows: missingPc
    });
  }
  if (missingStatus) {
    issues.push({
      severity: "low",
      title: "Missing done status",
      detail: "Completion status is required to distinguish active trials from settled outcomes.",
      affectedRows: missingStatus
    });
  }
  if (rareTreatments) {
    issues.push({
      severity: "high",
      title: "Rare treatment false-positive risk",
      detail: "Several treatment strings appear fewer than three times. These must be labeled as replication needs.",
      affectedRows: rareTreatments
    });
  }
  if (noteRows) {
    issues.push({
      severity: "low",
      title: "Notes contain usable evidence",
      detail: "Counts extracted from notes should retain raw snippets for audit.",
      affectedRows: noteRows
    });
  }

  return issues;
}
