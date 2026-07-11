import { describe, expect, it } from "vitest";
import { buildDashboardData } from "../../src/core/insights";
import {
  buildDefaultComparisons,
  buildTrialQueue,
  pairedComparison,
  qualityIssues,
  summarizeTreatments
} from "../../src/core/statistics";
import { parseTreatment } from "../../src/core/treatments";
import type { TrialRecord } from "../../src/core/types";

function trial(
  accession: string,
  species: string,
  treatment: string,
  pc: number | null,
  overrides: Partial<TrialRecord> = {}
): TrialRecord {
  return {
    id: `${accession}:${treatment}`,
    sourceRow: overrides.sourceRow ?? 1,
    pAccession: accession,
    sourceAccession: overrides.sourceAccession ?? accession,
    species,
    treatment,
    num: overrides.num ?? 50,
    startDate: overrides.startDate ?? "2025-01-01",
    propaguleType: overrides.propaguleType ?? "s",
    ttd: overrides.ttd ?? null,
    pc,
    ced: overrides.ced ?? null,
    wsed: overrides.wsed ?? null,
    csed: overrides.csed ?? null,
    linerStart: overrides.linerStart ?? null,
    linerTtd: overrides.linerTtd ?? null,
    lpc: overrides.lpc ?? null,
    fourStart: overrides.fourStart ?? null,
    fourTtd: overrides.fourTtd ?? null,
    fourPc: overrides.fourPc ?? null,
    location: overrides.location ?? null,
    status: overrides.status ?? "D",
    pcd: overrides.pcd ?? null,
    notes: overrides.notes ?? null,
    treatmentComponents: overrides.treatmentComponents ?? parseTreatment(treatment),
    ...overrides
  };
}

describe("pairedComparison", () => {
  it("labels one-off wins as replication needs", () => {
    const comparison = pairedComparison(
      [trial("P1", "Species one", "C", 0), trial("P1", "Species one", "CS", 5)],
      "C",
      "CS"
    );
    expect(comparison.confidence).toBe("Needs replication");
    expect(comparison.falsePositiveRisk).toMatch(/Elevated/);
  });

  it("rejects mixed propagule inputs instead of pooling their outcomes", () => {
    const seedControl = trial("P1", "Species one", "C", 1);
    const seedTreatment = trial("P1", "Species one", "CS", 4);
    const cuttingControl = trial("Q1", "Cutting one", "C", 1, { propaguleType: "stem cutting" });

    expect(() => pairedComparison([seedControl, seedTreatment, cuttingControl], "C", "CS")).toThrow(/one propagule type/i);
  });

  it("does not promote mixed evidence to strong signal", () => {
    const trials = [
      trial("P1", "A", "CS", 5),
      trial("P1", "A", "WS+CS", 4),
      trial("P2", "B", "CS", 3),
      trial("P2", "B", "WS+CS", 4),
      trial("P3", "C", "CS", 2),
      trial("P3", "C", "WS+CS", 2),
      trial("P4", "D", "CS", 5),
      trial("P4", "D", "WS+CS", 3),
      trial("P5", "E", "CS", 1),
      trial("P5", "E", "WS+CS", 3)
    ];
    const comparison = pairedComparison(trials, "CS", "WS+CS");
    expect(comparison.confidence).not.toBe("Strong signal");
  });

  it("can identify a replicated directional signal", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      trial(`P${index}`, `Species ${index}`, "C", index % 3),
      trial(`P${index}`, `Species ${index}`, "CS", 4 + (index % 2))
    ]).flat();
    const comparison = pairedComparison(trials, "C", "CS");
    expect(comparison.confidence).toBe("Strong signal");
    expect(comparison.speciesCount).toBe(12);
    expect(comparison.additionalTrialsNeeded).toBe(0);
    expect(comparison.replicationTargetBasis).toMatch(/not a statistical power estimate/i);
  });

  it("does not promote a replicated negative treatment effect as promising", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      trial(`P${index}`, `Species ${index}`, "C", 5),
      trial(`P${index}`, `Species ${index}`, "CS", 1)
    ]).flat();

    const comparison = pairedComparison(trials, "C", "CS");

    expect(comparison.meanDiff).toBeLessThan(0);
    expect(comparison.confidence).toBe("Inconclusive");
  });

  it("does not call repeated accessions from one species a strong signal", () => {
    const trials = Array.from({ length: 12 }, (_, index) => [
      trial(`P${index}`, "Species one", "C", 1),
      trial(`P${index}`, "Species one", "CS", 4)
    ]).flat();
    const comparison = pairedComparison(trials, "C", "CS");
    expect(comparison.n).toBe(12);
    expect(comparison.speciesCount).toBe(1);
    expect(comparison.confidence).not.toBe("Strong signal");
  });

  it("discovers treatment pairs from the workbook instead of a hard-coded shortlist", () => {
    const trials = [
      trial("P1", "Species one", "C", 1),
      trial("P1", "Species one", "SMOKE", 4),
      trial("P2", "Species two", "C", 2),
      trial("P2", "Species two", "SMOKE", 5)
    ];
    const comparisons = buildDefaultComparisons(trials);
    expect(comparisons).toEqual(
      expect.arrayContaining([expect.objectContaining({ baseline: "C", treatment: "SMOKE", n: 2 })])
    );
    expect(comparisons[0].examples.length).toBeGreaterThan(0);
  });

  it("uses operational evidence tiers for dashboard comparisons without formal p-values", () => {
    const comparisons = buildDefaultComparisons(
      Array.from({ length: 12 }, (_, index) => [
        trial(`P${index}`, `Species ${index}`, "C", 1),
        trial(`P${index}`, `Species ${index}`, "CS", 4)
      ]).flat()
    );

    expect(comparisons[0]).toMatchObject({
      baseline: "C",
      treatment: "CS",
      adjustedPValue: null,
      confidence: "Strong signal"
    });
  });

  it("does not dilute directional consistency with tied operational pairs", () => {
    const trials = Array.from({ length: 10 }, (_, index) => [
      trial(`P${index}`, `Species ${index}`, "C", 2),
      trial(`P${index}`, `Species ${index}`, "CS", index < 5 ? 5 : 2)
    ]).flat();

    const comparison = pairedComparison(trials, "C", "CS");

    expect(comparison.improved).toBe(5);
    expect(comparison.tied).toBe(5);
    expect(comparison.worse).toBe(0);
    expect(comparison.confidence).toBe("Strong signal");
  });

  it("averages duplicate treatment rows before paired comparison", () => {
    const comparison = pairedComparison(
      [
        trial("P1", "Species one", "C", 0),
        trial("P1", "Species one", "C", 2),
        trial("P1", "Species one", "CS", 4),
        trial("P1", "Species one", "CS", 5),
        trial("P2", "Species two", "C", 1),
        trial("P2", "Species two", "CS", 4)
      ],
      "C",
      "CS"
    );
    expect(comparison.n).toBe(2);
    expect(comparison.examples.find((example) => example.accession === "P1")).toMatchObject({
      baselineScore: 1,
      treatmentScore: 4.5,
      diff: 3.5
    });
  });

  it("allows replicated treatment summaries to reach strong signal", () => {
    const trials = Array.from({ length: 12 }, (_, index) =>
      trial(`P${index}`, `Species ${index % 6}`, "CS", index % 4 === 0 ? 4 : 5)
    );
    const summary = summarizeTreatments(trials)[0];
    expect(summary.confidence).toBe("Strong signal");
  });

  it("does not silently cap treatment summaries or trial queue items", () => {
    const manyTreatments = Array.from({ length: 15 }, (_, index) =>
      trial(`P${index}`, `Species ${index}`, `T${index}`, 2, { sourceRow: index + 1 })
    );
    const manyQueueItems = Array.from({ length: 25 }, (_, index) =>
      trial(`Q${index}`, `Queue species ${index}`, "CS", null, {
        sourceRow: index + 100,
        status: "D"
      })
    );

    expect(buildDashboardData(manyTreatments, [], null).treatmentSummaries).toHaveLength(15);
    expect(buildTrialQueue(manyQueueItems)).toHaveLength(25);
  });

  it("preserves row-level PC score scale in treatment summaries", () => {
    const summary = summarizeTreatments([
      trial("P1", "Species one", "CS", 80, { pcScale: "percent_0_100" }),
      trial("P2", "Species two", "CS", 60, { pcScale: "percent_0_100" })
    ])[0];

    expect(summary.pcScale).toBe("percent_0_100");
    expect(summary.pcMean).toBe(70);
  });

  it("builds varied row-specific trial queue actions", () => {
    const queue = buildTrialQueue([
      trial("P1", "Species one", "CS", null, { sourceRow: 11, status: "D" }),
      trial("P2", "Species two", "C", 4, { sourceRow: 12, status: "ND", lpc: null }),
      trial("P3", "Species three", "WS", 2, { sourceRow: 13, status: null }),
      trial("P4", "Species four", "GA3", 3, { sourceRow: 14, status: "ND", notes: "2 germinated" })
    ]);

    expect(queue.map((item) => item.nextStep)).toEqual(
      expect.arrayContaining([
        "Record a PC score or confirm that the trial remains active.",
        "Resolve the ND follow-up and record the settled outcome.",
        "Set D/ND status for the affected row.",
        "Review notes for counts, rescue handling, and protocol detail."
      ])
    );
    expect(new Set(queue.map((item) => item.blockedMetric))).toEqual(new Set(["PC", "D|ND", "Notes"]));
    expect(queue[0].priority).toBe("high");
  });

  it("uses the latest recorded lifecycle date as queue reference context", () => {
    const queue = buildTrialQueue([
      trial("P1", "Species one", "CS", 5, {
        sourceRow: 15,
        status: "ND",
        startDate: "2025-01-01",
        ttd: "2025-03-01",
        linerStart: "2025-04-15"
      })
    ]);
    expect(queue[0].nextDate).toBe("2025-04-15");
  });

  it("builds actionable data-quality issues with row and species targets", () => {
    const issues = qualityIssues([
      trial("P1", "Species one", "WS XX", null, {
        sourceRow: 21,
        sourceAccession: "",
        status: "ND",
        treatmentComponents: parseTreatment("WS XX")
      }),
      trial("P2", "Species two", "CS", 5, { sourceRow: 22, status: "D", lpc: null, notes: "Strong germination" })
    ]);

    expect(issues.find((issue) => issue.id === "missing-pc")).toMatchObject({
      category: "fix_first",
      sourceRows: [21],
      species: ["Species one"],
      metric: "PC"
    });
    expect(issues.find((issue) => issue.id === "unmapped-treatment-tokens")).toMatchObject({
      category: "codebook",
      sourceRows: [21],
      treatments: ["WS XX"]
    });
    expect(issues.find((issue) => issue.id === "rare-treatment-replication")).toMatchObject({
      category: "replication",
      affectedRows: 2
    });
  });

  it("computes missing propagule type with row-level metadata", () => {
    const issues = qualityIssues([
      trial("P1", "Species one", "CS", 3, {
        sourceRow: 31,
        propaguleType: null
      })
    ]);

    expect(issues.find((issue) => issue.id === "missing-propagule-type")).toMatchObject({
      category: "fix_first",
      sourceRows: [31],
      species: ["Species one"],
      metric: "PT"
    });
  });

  it("prefers rich computed issues over lightweight persisted duplicates", () => {
    const dashboard = buildDashboardData(
      [
        trial("P1", "Species one", "CS", 3, {
          sourceRow: 41,
          sourceAccession: ""
        })
      ],
      [],
      null,
      [
        {
          severity: "medium",
          title: "Missing source accession",
          detail: "Rows without Source_Accession are retained, but provenance should be reviewed before broad conclusions.",
          affectedRows: 1
        }
      ]
    );

    expect(dashboard.dataQualityIssues.find((issue) => issue.title === "Missing source accession")).toMatchObject({
      id: "missing-source-accession",
      category: "fix_first",
      sourceRows: [41],
      species: ["Species one"],
      metric: "Source_Accession"
    });
  });
});
