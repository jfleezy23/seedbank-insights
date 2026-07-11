import type {
  AdvancedPairRow,
  AdvancedComparison,
  AdvancedSpeciesRow,
  ConfidenceLabel,
  DataQualityIssue,
  PairedComparison,
  PropaguleType,
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
    const key = `${propaguleType(trial)}\u0000${trial.treatment || "Unknown"}`;
    groups.set(key, [...(groups.get(key) ?? []), trial]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const [type, treatment] = key.split("\u0000") as [PropaguleType, string];
      const pcValues = rows.map((row) => row.pc).filter(definedScore);
      const pcScales = new Set(
        rows
          .filter((row) => definedScore(row.pc))
          .map((row) => row.pcScale)
          .filter((scale): scale is NonNullable<TrialRecord["pcScale"]> => Boolean(scale))
      );
      const lpcValues = rows.map((row) => row.lpc).filter(definedScore);
      const fourPcValues = rows.map((row) => row.fourPc).filter(definedScore);
      const species = new Set(rows.map((row) => row.species)).size;
      const accessions = new Set(rows.map((row) => row.pAccession)).size;
      const pcMean = mean(pcValues) === null ? null : round(mean(pcValues) as number, 2);
      const pcGe4Rate = pcValues.length
        ? round(pcValues.filter((value) => value >= 4).length / pcValues.length, 3)
        : null;
      const confidence = confidenceForTreatment(rows.length, species, pcValues.length, pcMean, pcGe4Rate);
      const pcScale: TreatmentSummary["pcScale"] =
        pcScales.size === 0 ? null : pcScales.size === 1 ? [...pcScales][0] : "mixed";
      const warning =
        confidence === "Needs replication"
          ? "One-off or nearly one-off treatment result. Do not generalize yet."
          : confidence === "Inconclusive"
            ? "Too few completed propagation scores for a firm call."
            : "Use paired comparisons before ranking this treatment across species.";
      return {
        treatment,
        propaguleType: type,
        pcScale,
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

  const orderedValues = [...values].sort((a, b) => a - b);
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const sample: number[] = [];
    for (let j = 0; j < orderedValues.length; j += 1) {
      sample.push(orderedValues[Math.floor(random() * orderedValues.length)]);
    }
    means.push(mean(sample) ?? 0);
  }
  return [round(percentile(means, 0.025), 2), round(percentile(means, 0.975), 2)];
}

function confidenceForComparison(
  n: number,
  speciesCount: number,
  improved: number,
  worse: number,
  meanDiff: number,
  ciLow: number,
  ciHigh: number
): ConfidenceLabel {
  const nonTies = improved + worse;
  const directionConsistency = nonTies ? Math.max(improved, worse) / nonTies : 0;
  const intervalCrossesZero = ciLow <= 0 && ciHigh >= 0;
  const positiveEffect = meanDiff > 0 && ciLow > 0 && improved > worse;

  if (n < 3) return "Needs replication";
  if (n < 5 || intervalCrossesZero || !positiveEffect) return "Inconclusive";
  if (
    n >= 10 &&
    speciesCount >= 5 &&
    directionConsistency >= 0.6 &&
    Math.abs(meanDiff) >= 1 &&
    !intervalCrossesZero
  ) {
    return "Strong signal";
  }
  if (directionConsistency >= 0.6 && Math.abs(meanDiff) >= 0.75) return "Promising";
  return "Inconclusive";
}

function additionalPairsToReviewThreshold(n: number, speciesCount: number, confidence: ConfidenceLabel): number {
  if (confidence === "Strong signal") return 0;
  const pairShortfall = n < 5 ? 5 - n : n < 10 ? 10 - n : 0;
  const speciesShortfall = Math.max(0, 5 - speciesCount);
  return Math.max(pairShortfall, speciesShortfall);
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
  const propaguleTypes = new Set(trials.filter((trial) => trial.pc !== null).map(propaguleType));
  if (propaguleTypes.size > 1) {
    throw new Error("pairedComparison accepts one propagule type at a time; use buildDefaultComparisons for mixed data.");
  }
  const byAccession = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    if (trial.pc === null) continue;
    const pairKey = experimentalUnitKey(trial);
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
  const speciesCount = new Set(examples.map((example) => example.species.trim().toLowerCase())).size;
  const confidence = confidenceForComparison(
    diffs.length,
    speciesCount,
    improved,
    worse,
    meanDiff,
    ciLow,
    ciHigh
  );

  return {
    baseline,
    treatment,
    n: diffs.length,
    speciesCount,
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
    additionalTrialsNeeded: additionalPairsToReviewThreshold(diffs.length, speciesCount, confidence),
    replicationTargetBasis:
      "Minimum paired rows and species needed for the next evidence-tier review; this is not a statistical power estimate.",
    examples: examples.sort((a, b) => b.diff - a.diff).slice(0, 8)
  };
}

export function buildDefaultComparisons(trials: TrialRecord[]): PairedComparison[] {
  // The dashboard is decision support, not a formal analysis. It deliberately
  // includes active outcomes and suppresses formal p-values; the Advanced
  // Analysis workspace is completed-trials-only by default.
  const comparisons = buildAdvancedComparisons(trials, false).map<PairedComparison>((comparison) => ({
    baseline: comparison.baseline,
    treatment: comparison.treatment,
    n: comparison.pairCount,
    speciesCount: comparison.speciesCount,
    sourceCount: comparison.sourceCount,
    propaguleType: comparison.propaguleType,
    completedOnly: false,
    improved: comparison.wins,
    tied: comparison.ties,
    worse: comparison.losses,
    meanDiff: comparison.speciesMeanDiff,
    medianDiff: comparison.medianDiff,
    ciLow: comparison.ciLow,
    ciHigh: comparison.ciHigh,
    nonTieWinRate: comparison.nonTieWinRate,
    speciesMeanDiff: comparison.speciesMeanDiff,
    adjustedPValue: null,
    confidence: comparison.confidence,
    falsePositiveRisk:
      "Operational comparison includes active outcomes and is not a formal hypothesis test. Use completed-trial Advanced Analysis before making a statistical claim.",
    falseNegativeRisk:
      comparison.ties > comparison.wins + comparison.losses
        ? "Many paired outcomes are tied; review the non-tie direction and cohort detail."
        : "Review species and cohort breadth before changing a protocol.",
    additionalTrialsNeeded: Math.max(0, 10 - comparison.speciesCount),
    replicationTargetBasis: "Additional completed species needed for formal-review eligibility; this is not a power estimate.",
    examples: pairedComparison(
      trials.filter(
        (trial) =>
          definedScore(trial.pc) &&
          propaguleType(trial) === comparison.propaguleType &&
          (trial.treatment === comparison.baseline || trial.treatment === comparison.treatment)
      ),
      comparison.baseline,
      comparison.treatment
    ).examples
  }));
  if (comparisons.length <= 1) return comparisons;
  return comparisons.map((comparison) => ({
    ...comparison,
    falsePositiveRisk: `${comparison.falsePositiveRisk} This workbook scan evaluated ${comparisons.length} paired treatment contrasts, so rank and direction should be confirmed rather than read as a corrected significance test.`
  }));
}

interface PairEffect {
  species: string;
  source: string;
  cohort: string;
  diff: number;
}

function propaguleType(trial: TrialRecord): PropaguleType {
  if (trial.propaguleTypeCanonical) return trial.propaguleTypeCanonical;
  const raw = trial.propaguleType?.trim().toLowerCase();
  if (raw === "s" || raw === "seed") return "seed";
  if (raw === "sc" || raw === "cs" || raw === "stem cutting" || raw === "stem_cutting") return "stem_cutting";
  if (raw === "d" || raw === "division") return "division";
  return "unknown";
}

function experimentalUnitKey(trial: TrialRecord): string {
  return [
    // A natural key is only meaningful within the immutable workbook version
    // that supplied it. This prevents false pairs across selected cohorts.
    trial.workbookHash ??
      (trial.importBatchId ? `batch:${trial.importBatchId}` : trial.sourceId ? `source:${trial.sourceId}` : "unscoped"),
    trial.pAccession,
    trial.sourceAccession || "<missing-source>",
    trial.species.trim().toLowerCase(),
    propaguleType(trial),
    trial.cohort?.trim().toLocaleLowerCase() || "<unknown-cohort>"
  ].join("|||");
}

function cohortForRows(rows: TrialRecord[]): string {
  const cohorts = [...new Set(rows.map((row) => row.cohort?.trim()).filter((value): value is string => Boolean(value)))];
  if (cohorts.length === 1) return cohorts[0];
  return cohorts.length ? "Mixed cohort" : "Unknown";
}

function clusterInterval(speciesEffects: Map<string, number>, iterations = 2000): [number, number] {
  // Species are intentionally equal-weighted here: this is the species-clustered
  // estimand used by Advanced Analysis, not a row-weighted accession interval.
  const values = [...speciesEffects.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
  if (values.length < 2) {
    const value = values[0] ?? 0;
    return [value, value];
  }
  let seed = 1729;
  const random = () => {
    seed = (seed * 48271) % 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const estimates: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < values.length; index += 1) {
      total += values[Math.floor(random() * values.length)];
    }
    estimates.push(total / values.length);
  }
  return [percentile(estimates, 0.025), percentile(estimates, 0.975)];
}

function exactSignPValue(wins: number, losses: number): number | null {
  const n = wins + losses;
  if (!n) return null;
  const tail = Math.min(wins, losses);
  let probability = 0.5 ** n;
  // cumulative starts with k=0. Each loop advances to k+1, so k < tail includes
  // the exact tail boundary without adding one binomial term too many.
  let cumulative = probability;
  for (let k = 0; k < tail; k += 1) {
    probability *= (n - k) / (k + 1);
    cumulative += probability;
  }
  return Math.min(1, cumulative * 2);
}

function holmAdjust(comparisons: AdvancedComparison[]): void {
  const eligible = comparisons
    .filter((comparison) => comparison.rawPValue !== null)
    .sort((left, right) => (left.rawPValue ?? 1) - (right.rawPValue ?? 1));
  let previous = 0;
  eligible.forEach((comparison, index) => {
    const adjusted = Math.min(1, (comparison.rawPValue ?? 1) * (eligible.length - index));
    comparison.adjustedPValue = Math.max(previous, adjusted);
    previous = comparison.adjustedPValue;
  });
}

function evidenceTier(
  comparison: AdvancedComparison,
  raw: {
    speciesMeanDiff: number;
    ciLow: number;
    ciHigh: number;
    cohortDirections: Array<{ cohort: string; speciesCount: number; meanDiff: number }>;
  } = comparison
): ConfidenceLabel {
  const nonTiedSpecies = comparison.speciesWins + comparison.speciesLosses;
  const speciesWinRate = nonTiedSpecies ? comparison.speciesWins / nonTiedSpecies : 0;
  const direction = Math.max(speciesWinRate, 1 - speciesWinRate);
  const effect = Math.abs(raw.speciesMeanDiff);
  const positiveEffect = raw.speciesMeanDiff > 0 && raw.ciLow > 0 && comparison.speciesWins > comparison.speciesLosses;
  const repeatedCohorts = raw.cohortDirections.filter(
    (cohort) => cohort.speciesCount >= 5 && Math.sign(cohort.meanDiff) === Math.sign(raw.speciesMeanDiff)
  ).length;
  if (comparison.speciesCount < 5 || nonTiedSpecies < 5) return "Needs replication";
  if (
    raw.ciLow <= 0 && raw.ciHigh >= 0 ||
    comparison.adjustedPValue === null ||
    comparison.adjustedPValue >= 0.05 ||
    !positiveEffect
  ) return "Inconclusive";
  if (
    comparison.speciesCount >= 30 &&
    nonTiedSpecies >= 20 &&
    effect >= 1 &&
    direction >= 0.75 &&
    comparison.adjustedPValue < 0.01 &&
    repeatedCohorts >= 2
  ) return "Strong signal";
  if (comparison.speciesCount >= 10 && effect >= 0.5 && direction >= 0.67) return "Promising";
  return "Inconclusive";
}

export function buildAdvancedAnalysisRows(
  trials: TrialRecord[],
  completedOnly = true
): { pairRows: AdvancedPairRow[]; speciesRows: AdvancedSpeciesRow[] } {
  const analyzable = trials.filter(
    (trial) =>
      definedScore(trial.pc) &&
      propaguleType(trial) !== "unknown" &&
      trial.analysisEligibility !== "quarantined" &&
      trial.replicateClassification !== "ambiguous_duplicate" &&
      (!completedOnly || trial.status === "D")
  );
  const units = new Map<string, TrialRecord[]>();
  for (const trial of analyzable) {
    const key = experimentalUnitKey(trial);
    units.set(key, [...(units.get(key) ?? []), trial]);
  }
  const pairRows: AdvancedPairRow[] = [];
  for (const rows of units.values()) {
    const byTreatment = new Map<string, TrialRecord[]>();
    for (const row of rows) {
      if (!definedScore(row.pc)) continue;
      byTreatment.set(row.treatment, [...(byTreatment.get(row.treatment) ?? []), row]);
    }
    const treatmentScores = [...byTreatment.entries()]
      .map(([treatment, treatmentRows]) => ({
        treatment,
        rows: treatmentRows,
        score: median(treatmentRows.map((row) => row.pc as number)) ?? 0
      }))
      .sort((left, right) => left.treatment.localeCompare(right.treatment));
    for (let left = 0; left < treatmentScores.length; left += 1) {
      for (let right = left + 1; right < treatmentScores.length; right += 1) {
        let baseline = treatmentScores[left];
        let treatment = treatmentScores[right];
        if (treatment.treatment === "C" || (baseline.treatment.endsWith("+C") && !treatment.treatment.endsWith("+C"))) {
          [baseline, treatment] = [treatment, baseline];
        }
        const first = rows[0];
        const type = propaguleType(first);
        const sourceRows = (armRows: TrialRecord[]) =>
          [...new Set(armRows.map((row) => row.sourceRow))].sort((a, b) => a - b).join("|");
        const provenance = (armRows: TrialRecord[]) => ({
          filename: [...new Set(armRows.map((row) => row.sourceFilename ?? ""))].sort().join("|"),
          worksheet: [...new Set(armRows.map((row) => row.sourceWorksheet ?? ""))].sort().join("|"),
          workbookHash: [...new Set(armRows.map((row) => row.workbookHash ?? ""))].sort().join("|")
        });
        const baselineProvenance = provenance(baseline.rows);
        const treatmentProvenance = provenance(treatment.rows);
        pairRows.push({
          comparisonId: [type, baseline.treatment, treatment.treatment].join(":"),
          propaguleType: type,
          baseline: baseline.treatment,
          treatment: treatment.treatment,
          pAccession: first.pAccession,
          sourceAccession: first.sourceAccession,
          species: first.species,
          cohort: cohortForRows(rows),
          baselineScore: round(baseline.score, 2),
          treatmentScore: round(treatment.score, 2),
          diff: round(treatment.score - baseline.score, 2),
          sourceFilename: baselineProvenance.filename,
          worksheet: baselineProvenance.worksheet,
          workbookHash: baselineProvenance.workbookHash,
          sourceRows: sourceRows([...baseline.rows, ...treatment.rows]),
          baselineSourceFilename: baselineProvenance.filename,
          baselineWorksheet: baselineProvenance.worksheet,
          baselineWorkbookHash: baselineProvenance.workbookHash,
          baselineSourceRows: sourceRows(baseline.rows),
          treatmentSourceFilename: treatmentProvenance.filename,
          treatmentWorksheet: treatmentProvenance.worksheet,
          treatmentWorkbookHash: treatmentProvenance.workbookHash,
          treatmentSourceRows: sourceRows(treatment.rows)
        });
      }
    }
  }
  const speciesGroups = new Map<string, AdvancedPairRow[]>();
  for (const row of pairRows) {
    const key = `${row.comparisonId}\u0000${row.species.trim().toLowerCase()}`;
    speciesGroups.set(key, [...(speciesGroups.get(key) ?? []), row]);
  }
  const speciesRows = [...speciesGroups.values()].map<AdvancedSpeciesRow>((rows) => ({
    comparisonId: rows[0].comparisonId,
    propaguleType: rows[0].propaguleType,
    baseline: rows[0].baseline,
    treatment: rows[0].treatment,
    species: rows[0].species,
    pairCount: rows.length,
    meanDiff: round(mean(rows.map((row) => row.diff)) ?? 0, 3)
  }));
  return { pairRows, speciesRows };
}

export function buildAdvancedComparisons(
  trials: TrialRecord[],
  completedOnly = true
): AdvancedComparison[] {
  const analyzable = trials.filter(
    (trial) =>
      definedScore(trial.pc) &&
      propaguleType(trial) !== "unknown" &&
      trial.analysisEligibility !== "quarantined" &&
      trial.replicateClassification !== "ambiguous_duplicate" &&
      (!completedOnly || trial.status === "D")
  );
  const units = new Map<string, TrialRecord[]>();
  for (const trial of analyzable) {
    const key = experimentalUnitKey(trial);
    units.set(key, [...(units.get(key) ?? []), trial]);
  }
  const effects = new Map<string, PairEffect[]>();
  for (const rows of units.values()) {
    const byTreatment = new Map<string, number[]>();
    for (const row of rows) {
      if (!definedScore(row.pc)) continue;
      byTreatment.set(row.treatment, [...(byTreatment.get(row.treatment) ?? []), row.pc]);
    }
    const treatmentScores = [...byTreatment.entries()]
      .map(([treatment, scores]) => [treatment, median(scores) ?? 0] as const)
      .sort(([left], [right]) => left.localeCompare(right));
    for (let left = 0; left < treatmentScores.length; left += 1) {
      for (let right = left + 1; right < treatmentScores.length; right += 1) {
        let [baseline, baselineScore] = treatmentScores[left];
        let [treatment, treatmentScore] = treatmentScores[right];
        if (treatment === "C" || (baseline.endsWith("+C") && !treatment.endsWith("+C"))) {
          [baseline, treatment] = [treatment, baseline];
          [baselineScore, treatmentScore] = [treatmentScore, baselineScore];
        }
        const first = rows[0];
        const key = [propaguleType(first), baseline, treatment].join("\u0000");
        effects.set(key, [
          ...(effects.get(key) ?? []),
          {
            species: first.species.trim().toLowerCase(),
            source: first.sourceAccession || first.pAccession,
            cohort: cohortForRows(rows),
            diff: round(treatmentScore - baselineScore, 2)
          }
        ]);
      }
    }
  }
  const comparisons: AdvancedComparison[] = [];
  const rawMetricsByComparisonId = new Map<
    string,
    {
      speciesMeanDiff: number;
      ciLow: number;
      ciHigh: number;
      cohortDirections: Array<{ cohort: string; speciesCount: number; meanDiff: number }>;
    }
  >();
  for (const [key, pairEffects] of effects.entries()) {
    const [type, baseline, treatment] = key.split("\u0000") as [PropaguleType, string, string];
    const bySpecies = new Map<string, number[]>();
    for (const effect of pairEffects) {
      bySpecies.set(effect.species, [...(bySpecies.get(effect.species) ?? []), effect.diff]);
    }
    const speciesEffects = new Map(
      [...bySpecies.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([species, values]) => [species, mean(values) ?? 0])
    );
    const values = pairEffects.map((effect) => effect.diff);
    const speciesValues = [...speciesEffects.values()];
    const wins = values.filter((value) => value > 0).length;
    const losses = values.filter((value) => value < 0).length;
    const ties = values.length - wins - losses;
    const speciesWins = speciesValues.filter((value) => value > 0).length;
    const speciesLosses = speciesValues.filter((value) => value < 0).length;
    const documented = analyzable
      .filter((trial) => propaguleType(trial) === type && [baseline, treatment].includes(trial.treatment))
      .every((trial) => trial.analysisEligibility === "eligible");
    const formalEligible = completedOnly && documented && speciesEffects.size >= 10 && speciesWins + speciesLosses >= 5;
    const byCohort = new Map<string, PairEffect[]>();
    pairEffects.forEach((effect) =>
      byCohort.set(effect.cohort, [...(byCohort.get(effect.cohort) ?? []), effect])
    );
    const [ciLow, ciHigh] = clusterInterval(speciesEffects);
    const cohortDirectionsRaw = [...byCohort.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cohort, cohortEffects]) => {
        const byCohortSpecies = new Map<string, number[]>();
        for (const effect of cohortEffects) {
          byCohortSpecies.set(effect.species, [...(byCohortSpecies.get(effect.species) ?? []), effect.diff]);
        }
        const speciesValues = [...byCohortSpecies.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, effects]) => mean(effects) ?? 0);
        return {
          cohort,
          speciesCount: speciesValues.length,
          meanDiff: mean(speciesValues) ?? 0
        };
      });
    const speciesMeanDiff = mean(speciesValues) ?? 0;
    const comparisonId = [type, baseline, treatment].join(":");
    rawMetricsByComparisonId.set(comparisonId, {
      speciesMeanDiff,
      ciLow,
      ciHigh,
      cohortDirections: cohortDirectionsRaw
    });
    comparisons.push({
      id: comparisonId,
      propaguleType: type,
      baseline,
      treatment,
      pairCount: values.length,
      speciesCount: speciesEffects.size,
      sourceCount: new Set(pairEffects.map((effect) => effect.source)).size,
      completedOnly,
      wins,
      ties,
      losses,
      speciesWins,
      speciesTies: speciesValues.length - speciesWins - speciesLosses,
      speciesLosses,
      nonTieWinRate: wins + losses ? round(wins / (wins + losses), 3) : null,
      medianDiff: round(median(values) ?? 0, 2),
      speciesMeanDiff: round(speciesMeanDiff, 2),
      ciLow: round(ciLow, 2),
      ciHigh: round(ciHigh, 2),
      rawPValue: formalEligible ? exactSignPValue(speciesWins, speciesLosses) : null,
      adjustedPValue: null,
      cohortDirections: cohortDirectionsRaw.map((cohort) => ({ ...cohort, meanDiff: round(cohort.meanDiff, 2) })),
      confidence: "Inconclusive",
      formalEligible,
      eligibilityReasons: [
        !completedOnly ? "Sensitivity analysis includes active outcomes; formal p-values are intentionally suppressed." : null,
        !documented ? "One or more treatment tokens are not mapped in the active codebook." : null,
        speciesEffects.size < 10 ? "Fewer than 10 species." : null,
        speciesWins + speciesLosses < 5 ? "Fewer than 5 non-tied species." : null
      ].filter((reason): reason is string => Boolean(reason))
    });
  }
  // Multiplicity correction is scoped per propagule type because seed,
  // cutting, and division PC endpoints have different meanings.
  for (const type of ["seed", "stem_cutting", "division"] as const) {
    holmAdjust(comparisons.filter((comparison) => comparison.propaguleType === type));
  }
  comparisons.forEach((comparison) => {
    const raw = rawMetricsByComparisonId.get(comparison.id) ?? {
      speciesMeanDiff: comparison.speciesMeanDiff,
      ciLow: comparison.ciLow,
      ciHigh: comparison.ciHigh,
      cohortDirections: comparison.cohortDirections
    };
    comparison.confidence = evidenceTier(comparison, raw);
  });
  return comparisons.sort(
    (left, right) =>
      confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
      right.pairCount - left.pairCount ||
      right.speciesCount - left.speciesCount
  );
}

export function buildTrialQueue(trials: TrialRecord[]): TrialQueueItem[] {
  const rows = trials
    .map((trial) => {
      const recordedDates = [
        trial.startDate,
        trial.ced,
        trial.wsed,
        trial.csed,
        trial.ttd,
        trial.linerStart,
        trial.linerTtd,
        trial.fourStart,
        trial.fourTtd
      ]
        .filter((value): value is string => Boolean(value))
        .sort();
      const next = recordedDates[recordedDates.length - 1] ?? null;

      let priority: TrialQueueItem["priority"] = "low";
      let blockedMetric: TrialQueueItem["blockedMetric"] = "Replication";
      let nextStep = "Add a paired replicate before treating this row as evidence.";
      let reason = "Current evidence is too thin to separate treatment effect from accession noise.";

      if (trial.status === null) {
        priority = "high";
        blockedMetric = "D|ND";
        nextStep = "Set D/ND status for the affected row.";
        reason = "Completion status is needed before this row can be interpreted as active, failed, or settled.";
      } else if (trial.pc === null) {
        priority = trial.status === "D" ? "high" : "medium";
        blockedMetric = "PC";
        nextStep = "Record a PC score or confirm that the trial remains active.";
        reason =
          trial.status === "D"
            ? "The trial is marked done, but missing PC blocks treatment comparison."
            : "The row cannot contribute to germination evidence until PC is recorded or the trial remains active.";
      } else if (trial.status === "ND" && trial.pc >= 4) {
        priority = "medium";
        blockedMetric = "D|ND";
        nextStep = "Resolve the ND follow-up and record the settled outcome.";
        reason = "High germination on an active row can shift recommendations once completion and survival are known.";
      } else if (trial.pc >= 4 && trial.lpc === null) {
        priority = "medium";
        blockedMetric = "LPC";
        nextStep = "Record liner survival for the high-PC germination result.";
        reason = "Good germination is not enough if seedlings fail during liner production.";
      } else if (trial.lpc !== null && trial.lpc >= 4 && trial.fourPc === null) {
        priority = "low";
        blockedMetric = "4PC";
        nextStep = "Record 4-inch survival for the successful liner result.";
        reason = "Production follow-through confirms whether a germination win becomes usable plants.";
      } else if (trial.notes || trial.pcd) {
        priority = "low";
        blockedMetric = "Notes";
        nextStep = "Review notes for counts, rescue handling, and protocol detail.";
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
        pc: trial.pc
      };
    })
    .filter((item) => item.status !== "D" || item.blockedMetric !== "Replication");

  const grouped = new Map<string, TrialQueueItem>();
  for (const item of rows) {
    const key = [item.species, item.treatment, item.status ?? "", item.blockedMetric, item.nextStep].join("|||");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, item);
      continue;
    }
    existing.accession = uniqueSorted([...existing.accession.split(", "), item.accession]).join(", ");
    existing.sourceRows = [...new Set([...existing.sourceRows, ...item.sourceRows])].sort((a, b) => a - b);
    if ((item.nextDate ?? "") > (existing.nextDate ?? "")) existing.nextDate = item.nextDate;
    if (existing.pc !== item.pc) existing.pc = null;
  }

  return [...grouped.values()].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      String(a.nextDate ?? "9999").localeCompare(String(b.nextDate ?? "9999")) ||
      a.species.localeCompare(b.species)
    );
  });
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
