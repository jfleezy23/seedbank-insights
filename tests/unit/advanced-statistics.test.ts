import { describe, expect, it } from "vitest";
import { buildAdvancedAnalysisRows, buildAdvancedComparisons } from "../../src/core/statistics";
import { parseTreatment } from "../../src/core/treatments";
import type { PropaguleType, TrialRecord } from "../../src/core/types";

function row(
  accession: string,
  species: string,
  treatment: string,
  pc: number,
  propaguleType: PropaguleType = "seed",
  cohort = "2024"
): TrialRecord {
  return {
    id: `${accession}:${treatment}:${pc}`,
    sourceRow: Number(accession.replace(/\D/g, "")) || 1,
    sourceFilename: "synthetic.xlsx",
    sourceWorksheet: "Accessions",
    workbookHash: "synthetic-hash",
    pAccession: accession,
    sourceAccession: `S-${accession}`,
    species,
    treatment,
    num: 50,
    startDate: "2024-01-01",
    propaguleType: propaguleType,
    propaguleTypeCanonical: propaguleType,
    ttd: "2024-04-01",
    pc,
    ced: null,
    wsed: null,
    csed: null,
    linerStart: null,
    linerTtd: null,
    lpc: null,
    fourStart: null,
    fourTtd: null,
    fourPc: null,
    location: null,
    status: "D",
    pcd: null,
    notes: null,
    treatmentComponents: parseTreatment(treatment, propaguleType),
    analysisEligibility: "eligible",
    cohort
  };
}

describe("advanced statistics", () => {
  it("never pools propagule types and is deterministic", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", 1),
      row(`P${index}`, `Species ${index}`, "CS", 4),
      row(`Q${index}`, `Cutting ${index}`, "C", 1, "stem_cutting"),
      row(`Q${index}`, `Cutting ${index}`, "A", 3, "stem_cutting")
    ]).flat();
    const first = buildAdvancedComparisons(trials);
    expect(first).toEqual(buildAdvancedComparisons(trials));
    expect(first.map((comparison) => comparison.propaguleType)).toEqual(
      expect.arrayContaining(["seed", "stem_cutting"])
    );
    expect(first.every((comparison) => comparison.speciesCount === 12)).toBe(true);
  });

  it("suppresses p-values below the species and non-tie thresholds", () => {
    const trials = Array.from({ length: 9 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", 2),
      row(`P${index}`, `Species ${index}`, "CS", index < 4 ? 3 : 2)
    ]).flat();
    const comparison = buildAdvancedComparisons(trials)[0];
    expect(comparison.rawPValue).toBeNull();
    expect(comparison.formalEligible).toBe(false);
    expect(comparison.confidence).toBe("Needs replication");
  });

  it("includes the exact sign-test tail boundary", () => {
    const trials = Array.from({ length: 10 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", 2),
      row(`P${index}`, `Species ${index}`, "CS", index === 0 ? 3 : 1)
    ]).flat();

    const comparison = buildAdvancedComparisons(trials)[0];

    expect(comparison.rawPValue).toBeCloseTo(0.021484375, 10);
  });

  it("requires repeated cohorts for a strong signal and exports median replicate pairs", () => {
    const trials = Array.from({ length: 30 }, (_, index) => {
      const cohort = index < 15 ? "2023" : "2024";
      return [
        row(`P${index}`, `Species ${index}`, "C", 1, "seed", cohort),
        row(`P${index}`, `Species ${index}`, "C", 3, "seed", cohort),
        row(`P${index}`, `Species ${index}`, "CS", 4, "seed", cohort)
      ];
    }).flat();
    const comparison = buildAdvancedComparisons(trials)[0];
    expect(comparison.confidence).toBe("Strong signal");
    expect(comparison.adjustedPValue).toBeLessThan(0.01);
    const exported = buildAdvancedAnalysisRows(trials);
    expect(exported.pairRows).toHaveLength(30);
    expect(exported.pairRows[0]).toMatchObject({ baselineScore: 2, treatmentScore: 4, diff: 2 });
    expect(exported.speciesRows).toHaveLength(30);
  });

  it("keeps statistically clear negative treatment effects inconclusive instead of promising", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", 5),
      row(`P${index}`, `Species ${index}`, "CS", 1)
    ]).flat();

    const comparison = buildAdvancedComparisons(trials)[0];

    expect(comparison.speciesMeanDiff).toBeLessThan(0);
    expect(comparison.adjustedPValue).not.toBeNull();
    expect(comparison.confidence).toBe("Inconclusive");
  });

  it("does not reverse contrasts when the candidate treatment ends with +C", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "GA", 2),
      row(`P${index}`, `Species ${index}`, "GA+C", 4)
    ]).flat();

    const comparison = buildAdvancedComparisons(trials)[0];
    const exported = buildAdvancedAnalysisRows(trials);

    expect(comparison).toMatchObject({ baseline: "GA", treatment: "GA+C", speciesMeanDiff: 2 });
    expect(exported.pairRows[0]).toMatchObject({ baseline: "GA", treatment: "GA+C", diff: 2 });
  });

  it("never pairs an accession across different immutable workbook cohorts", () => {
    const firstCohort = row("P1", "Species one", "C", 1);
    const secondCohort = row("P1", "Species one", "CS", 5);
    secondCohort.workbookHash = "other-workbook-hash";

    expect(buildAdvancedComparisons([firstCohort, secondCohort])).toEqual([]);
  });

  it("never pairs an accession across distinct cohorts within one immutable workbook", () => {
    const firstCohort = row("P1", "Species one", "C", 1, "seed", "2023");
    const secondCohort = row("P1", "Species one", "CS", 5, "seed", "2024");

    expect(buildAdvancedComparisons([firstCohort, secondCohort])).toEqual([]);
  });

  it("suppresses formal p-values in the explicitly operational active-trial sensitivity analysis", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", 1),
      row(`P${index}`, `Species ${index}`, "CS", 4)
    ]).flat();
    trials[0].status = "ND";

    const comparison = buildAdvancedComparisons(trials, false)[0];
    expect(comparison.completedOnly).toBe(false);
    expect(comparison.rawPValue).toBeNull();
    expect(comparison.adjustedPValue).toBeNull();
    expect(comparison.eligibilityReasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/Sensitivity analysis includes active outcomes/)] )
    );
  });

  it("keeps clustered estimates stable when input rows arrive in a different order", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      row(`P${index}`, `Species ${index}`, "C", index % 3),
      row(`P${index}`, `Species ${index}`, "CS", 3 + (index % 2))
    ]).flat();
    expect(buildAdvancedComparisons([...trials].reverse())).toEqual(buildAdvancedComparisons(trials));
  });
});
