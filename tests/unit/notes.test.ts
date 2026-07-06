import { describe, expect, it } from "vitest";
import { parseObservationsFromTrial } from "../../src/core/notes";
import { parseTreatment } from "../../src/core/treatments";
import type { TrialRecord } from "../../src/core/types";

const baseTrial: TrialRecord = {
  id: "P1:CS:2",
  sourceRow: 2,
  pAccession: "P1",
  sourceAccession: "SB1",
  species: "Lomatium macrocarpum",
  treatment: "CS",
  num: 50,
  startDate: "2025-11-14",
  propaguleType: "s",
  ttd: null,
  pc: 5,
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
  status: "ND",
  pcd: "[3/16/26 PC=3]",
  notes: "3/20/26 germinated = 23, IP=+14;",
  treatmentComponents: parseTreatment("CS")
};

describe("parseObservationsFromTrial", () => {
  it("extracts propagation class, germinated counts, and in-production counts", () => {
    const observations = parseObservationsFromTrial(baseTrial);
    expect(observations.map((observation) => observation.kind)).toEqual([
      "pc",
      "germinated",
      "inProduction"
    ]);
    expect(observations[0].date).toBe("2026-03-16");
    expect(observations[1].value).toBe(23);
    expect(observations[2].value).toBe(14);
  });
});
