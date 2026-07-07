import { describe, expect, it } from "vitest";
import { buildDashboardData } from "../../src/core/insights";
import { buildTrialQueue, pairedComparison, qualityIssues, summarizeTreatments } from "../../src/core/statistics";
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
    expect(comparison.additionalTrialsNeeded).toBe(0);
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

  it("builds varied row-specific trial queue actions", () => {
    const queue = buildTrialQueue([
      trial("P1", "Species one", "CS", null, { sourceRow: 11, status: "D" }),
      trial("P2", "Species two", "C", 4, { sourceRow: 12, status: "ND", lpc: null }),
      trial("P3", "Species three", "WS", 2, { sourceRow: 13, status: null }),
      trial("P4", "Species four", "GA3", 3, { sourceRow: 14, status: "ND", notes: "2 germinated" })
    ]);

    expect(queue.map((item) => item.nextStep)).toEqual(
      expect.arrayContaining([
        "Record PC score for row 11.",
        "Resolve ND follow-up for promising row 12.",
        "Set D/ND status for row 13.",
        "Review notes for row 14."
      ])
    );
    expect(new Set(queue.map((item) => item.blockedMetric))).toEqual(new Set(["PC", "D|ND", "Notes"]));
    expect(queue[0].priority).toBe("high");
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
