import { describe, expect, it } from "vitest";
import { pairedComparison } from "../../src/core/statistics";
import { parseTreatment } from "../../src/core/treatments";
import type { TrialRecord } from "../../src/core/types";

function trial(accession: string, species: string, treatment: string, pc: number): TrialRecord {
  return {
    id: `${accession}:${treatment}`,
    sourceRow: 1,
    pAccession: accession,
    sourceAccession: accession,
    species,
    treatment,
    num: 50,
    startDate: "2025-01-01",
    propaguleType: "s",
    ttd: null,
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
    treatmentComponents: parseTreatment(treatment)
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
});
