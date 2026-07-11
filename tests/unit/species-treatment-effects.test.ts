import { describe, expect, it } from "vitest";
import { buildDashboardData } from "../../src/core/insights";
import { buildSpeciesTreatmentEffects } from "../../src/core/statistics";
import { parseTreatment } from "../../src/core/treatments";
import type { TrialRecord } from "../../src/core/types";

let nextSourceRow = 1;

function trial(
  accession: string,
  species: string,
  treatment: string,
  pc: number | null,
  overrides: Partial<TrialRecord> = {}
): TrialRecord {
  const sourceRow = overrides.sourceRow ?? nextSourceRow++;
  const propaguleType = overrides.propaguleTypeCanonical ?? "seed";
  return {
    id: overrides.id ?? `${accession}:${treatment}:${sourceRow}`,
    sourceRow,
    sourceFilename: "synthetic.xlsx",
    sourceWorksheet: "Accessions",
    workbookHash: "workbook-a",
    pAccession: accession,
    sourceAccession: `source-${accession}`,
    species,
    treatment,
    num: 50,
    startDate: "2024-01-01",
    propaguleType,
    propaguleTypeCanonical: propaguleType,
    ttd: "2024-04-01",
    pc,
    pcRaw: pc,
    pcScale: pc === null ? null : "ordinal_0_5",
    ced: null,
    wsed: null,
    csed: null,
    linerStart: null,
    linerTtd: null,
    lpc: null,
    lpcRaw: null,
    lpcScale: null,
    fourStart: null,
    fourTtd: null,
    fourPc: null,
    fourPcRaw: null,
    fourPcScale: null,
    location: null,
    status: "D",
    pcd: null,
    notes: null,
    treatmentComponents: parseTreatment(treatment, propaguleType),
    analysisEligibility: "eligible",
    replicateClassification: "unique",
    cohort: "2024",
    ...overrides
  };
}

function effectFor(
  trials: TrialRecord[],
  species: string,
  treatmentA: string,
  treatmentB: string,
  outcome: "completed" | "active" = "completed"
) {
  return buildSpeciesTreatmentEffects(trials).find(
    (effect) =>
      effect.species === species &&
      effect.treatmentA === treatmentA &&
      effect.treatmentB === treatmentB &&
      effect.outcome === outcome
  );
}

describe("buildSpeciesTreatmentEffects", () => {
  it("emits every within-unit arm pair and orients an exact C control as treatment B", () => {
    const effects = buildSpeciesTreatmentEffects([
      trial("P1", "Species one", "C", 1),
      trial("P1", "Species one", "CS", 4),
      trial("P1", "Species one", "GA", 3)
    ]);

    expect(effects).toHaveLength(3);
    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ treatmentA: "CS", treatmentB: "C", controlTreatment: "C", meanDiff: 3 }),
        expect.objectContaining({ treatmentA: "GA", treatmentB: "C", controlTreatment: "C", meanDiff: 2 }),
        expect.objectContaining({ treatmentA: "CS", treatmentB: "GA", controlTreatment: null, meanDiff: 1 })
      ])
    );
  });

  it("separates completed, active, and propagule-specific effects", () => {
    const effects = buildSpeciesTreatmentEffects([
      trial("P1", "Species one", "C", 1),
      trial("P1", "Species one", "CS", 4),
      trial("P2", "Species one", "C", 1, { status: "ND" }),
      trial("P2", "Species one", "CS", 3, { status: "ND" }),
      trial("P3", "Species one", "C", 1, {
        propaguleType: "stem cutting",
        propaguleTypeCanonical: "stem_cutting"
      }),
      trial("P3", "Species one", "CS", 3, {
        propaguleType: "stem cutting",
        propaguleTypeCanonical: "stem_cutting"
      }),
      trial("P4", "Species one", "C", 1, { status: null }),
      trial("P4", "Species one", "CS", 5, { status: null })
    ]);

    expect(effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "completed", propaguleType: "seed", pairCount: 1 }),
        expect.objectContaining({ outcome: "active", propaguleType: "seed", pairCount: 1 }),
        expect.objectContaining({ outcome: "completed", propaguleType: "stem_cutting", pairCount: 1 })
      ])
    );
    expect(effects).toHaveLength(3);
  });

  it("uses median genuine replicates, preserves provenance, and excludes invalid or incompatible rows", () => {
    const rows = [
      trial("P1", "Species one", "C", 1, {
        sourceRow: 10,
        replicateClassification: "genuine_replicate",
        ttd: "2024-03-01",
        sourceFilename: "alpha.xlsx"
      }),
      trial("P1", "Species one", "C", 3, {
        sourceRow: 11,
        replicateClassification: "genuine_replicate",
        ttd: "2024-03-02",
        sourceFilename: "alpha.xlsx"
      }),
      trial("P1", "Species one", "C", 5, {
        sourceRow: 12,
        replicateClassification: "ambiguous_duplicate",
        ttd: "2024-03-03"
      }),
      trial("P1", "Species one", "CS", 4, { sourceRow: 13, ttd: "2024-03-04", sourceFilename: "alpha.xlsx" }),
      trial("P2", "Unknown propagule", "C", 1, { propaguleType: null, propaguleTypeCanonical: "unknown" }),
      trial("P2", "Unknown propagule", "CS", 4, { propaguleType: null, propaguleTypeCanonical: "unknown" }),
      trial("P3", "Quarantined", "C", 1, { analysisEligibility: "quarantined" }),
      trial("P3", "Quarantined", "CS", 4, { analysisEligibility: "quarantined" }),
      trial("P4", "Invalid", "C", Number.NaN),
      trial("P4", "Invalid", "CS", 4),
      trial("P5", "Different workbook", "C", 1),
      trial("P5", "Different workbook", "CS", 4, { workbookHash: "workbook-b" }),
      trial("P6", "Different cohort", "C", 1),
      trial("P6", "Different cohort", "CS", 4, { cohort: "2025" }),
      trial("P7", "Different source", "C", 1, { sourceAccession: "source-a" }),
      trial("P7", "Different source", "CS", 4, { sourceAccession: "source-b" })
    ];

    const effect = effectFor(rows, "Species one", "CS", "C");
    expect(effect).toMatchObject({ pairCount: 1, meanDiff: 2, medianDiff: 2 });
    expect(effect?.evidence).toEqual([
      expect.objectContaining({
        pAccession: "P1",
        sourceAccession: "source-P1",
        scoreA: 4,
        scoreB: 2,
        diff: 2,
        sourceFilename: "alpha.xlsx",
        worksheet: "Accessions",
        workbookHash: "workbook-a",
        sourceRows: [10, 11, 13],
        recordedAt: "2024-03-04"
      })
    ]);
    expect(buildSpeciesTreatmentEffects(rows).map((candidate) => candidate.species)).toEqual(["Species one"]);
  });

  it("keeps treatment arms inside each workbook while retaining separately matched pairs in a combined scope", () => {
    const rows = [
      trial("P1", "Combined species", "C", 1, { workbookHash: "workbook-a", cohort: "2024" }),
      trial("P1", "Combined species", "CS", 4, { workbookHash: "workbook-a", cohort: "2024" }),
      trial("P1", "Combined species", "C", 1, { workbookHash: "workbook-b", cohort: "2025" }),
      trial("P1", "Combined species", "CS", 3, { workbookHash: "workbook-b", cohort: "2025" }),
      trial("P2", "Unpaired across workbooks", "C", 1, { workbookHash: "workbook-a", cohort: "2024" }),
      trial("P2", "Unpaired across workbooks", "CS", 5, { workbookHash: "workbook-b", cohort: "2024" })
    ];

    const effect = effectFor(rows, "Combined species", "CS", "C");
    expect(effect).toMatchObject({ pairCount: 2, meanDiff: 2.5 });
    expect(effect?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workbookHash: "workbook-a", cohort: "2024", diff: 3 }),
        expect.objectContaining({ workbookHash: "workbook-b", cohort: "2025", diff: 2 })
      ])
    );
    expect(buildSpeciesTreatmentEffects(rows).some((candidate) => candidate.species === "Unpaired across workbooks")).toBe(false);
  });

  it("assigns every local verdict without upgrading undocumented treatment codes", () => {
    const rows: TrialRecord[] = [
      trial("O1", "One", "C", 1),
      trial("O1", "One", "CS", 2),
      trial("E1", "Early", "C", 1),
      trial("E1", "Early", "CS", 2),
      trial("E2", "Early", "C", 1),
      trial("E2", "Early", "CS", 2),
      ...[1, 2, 3].flatMap((index) => [
        trial(`L${index}`, "Lift", "C", 1),
        trial(`L${index}`, "Lift", "CS", 3)
      ]),
      ...[1, 2, 3].flatMap((index) => [
        trial(`D${index}`, "Lower", "C", 4),
        trial(`D${index}`, "Lower", "CS", 1)
      ]),
      trial("M1", "Mixed", "C", 2),
      trial("M1", "Mixed", "CS", 3),
      trial("M2", "Mixed", "C", 2),
      trial("M2", "Mixed", "CS", 1),
      trial("M3", "Mixed", "C", 2),
      trial("M3", "Mixed", "CS", 2),
      ...[1, 2, 3].flatMap((index) => [
        trial(`U${index}`, "Undocumented", "C", 1),
        trial(`U${index}`, "Undocumented", "MYSTERY", 5, { analysisEligibility: "descriptive_only" })
      ])
    ];

    const verdictBySpecies = new Map(buildSpeciesTreatmentEffects(rows).map((effect) => [effect.species, effect]));
    expect(verdictBySpecies.get("One")).toMatchObject({ verdict: "one_observed_result", higherCount: 1, tiedCount: 0, lowerCount: 0 });
    expect(verdictBySpecies.get("Early")).toMatchObject({ verdict: "early_local_pattern" });
    expect(verdictBySpecies.get("Lift")).toMatchObject({ verdict: "consistent_local_lift" });
    expect(verdictBySpecies.get("Lower")).toMatchObject({ verdict: "consistent_lower_response" });
    expect(verdictBySpecies.get("Mixed")).toMatchObject({ verdict: "mixed_local_response" });
    expect(verdictBySpecies.get("Undocumented")).toMatchObject({
      treatmentA: "MYSTERY",
      treatmentB: "C",
      descriptiveOnly: true,
      verdict: "descriptive_only"
    });
  });

  it("uses percentage points only when every paired PC arm is explicitly percentage scaled and is deterministic", () => {
    const percentageRows = [
      trial("P1", "Percent", "C", 3, { pcRaw: 50, pcScale: "percent_0_100" }),
      trial("P1", "Percent", "CS", 5, { pcRaw: 80, pcScale: "percent_0_100" }),
      trial("P2", "Percent", "C", 4, { pcRaw: 75, pcScale: "percent_0_100" }),
      trial("P2", "Percent", "CS", 5, { pcRaw: 100, pcScale: "percent_0_100" }),
      trial("M1", "Mixed scale", "C", 2, { pcRaw: 2, pcScale: "ordinal_0_5" }),
      trial("M1", "Mixed scale", "CS", 4, { pcRaw: 80, pcScale: "percent_0_100" })
    ];

    const percent = effectFor(percentageRows, "Percent", "CS", "C");
    const mixed = effectFor(percentageRows, "Mixed scale", "CS", "C");
    expect(percent).toMatchObject({ scorePresentation: "percentage_points", exactPercentageDelta: 27.5 });
    expect(mixed).toMatchObject({ scorePresentation: "pc_class", exactPercentageDelta: null });
    expect(buildSpeciesTreatmentEffects([...percentageRows].reverse())).toEqual(buildSpeciesTreatmentEffects(percentageRows));
  });

  it("keeps LPC and 4PC paired outcomes separate from the germination verdict", () => {
    const rows = [
      trial("P1", "Follow up", "C", 1, { lpc: 1, fourPc: 2 }),
      trial("P1", "Follow up", "CS", 3, { lpc: 4, fourPc: 5 }),
      trial("P2", "Follow up", "C", 1, { lpc: null, fourPc: null }),
      trial("P2", "Follow up", "CS", 3, { lpc: 5, fourPc: 5 })
    ];

    const effect = effectFor(rows, "Follow up", "CS", "C");
    expect(effect).toMatchObject({ pairCount: 2, verdict: "early_local_pattern" });
    expect(effect?.followUps).toEqual([
      { endpoint: "lpc", pairCount: 1, treatmentAMean: 4, treatmentBMean: 1, meanDifference: 3 },
      { endpoint: "four_pc", pairCount: 1, treatmentAMean: 5, treatmentBMean: 2, meanDifference: 3 }
    ]);
  });

  it("adds only count-based species summaries and reports unpaired scored treatment arms", () => {
    const dashboard = buildDashboardData(
      [
        trial("P1", "No pair", "C", 1),
        trial("P2", "No pair", "CS", 4),
        trial("P3", "Paired", "C", 1),
        trial("P3", "Paired", "CS", 4),
        trial("P4", "Paired", "C", 1, { status: "ND" }),
        trial("P4", "Paired", "CS", 3, { status: "ND" })
      ],
      [],
      null
    );

    expect(dashboard.speciesTreatmentEffects.map((effect) => effect.species)).toEqual(["Paired", "Paired"]);
    expect(dashboard.speciesSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          species: "No pair",
          rows: 2,
          pcCount: 2,
          completedContrastCount: 0,
          activeContrastCount: 0,
          unpairedScoredTreatmentCount: 2
        }),
        expect.objectContaining({
          species: "Paired",
          rows: 4,
          pcCount: 4,
          completedContrastCount: 1,
          activeContrastCount: 1,
          unpairedScoredTreatmentCount: 0
        })
      ])
    );
  });
});
