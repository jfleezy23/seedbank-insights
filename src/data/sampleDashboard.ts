import { buildDashboardData } from "../core/insights";
import { parseTreatment } from "../core/treatments";
import type { DashboardData, TrialRecord } from "../core/types";

function trial(partial: Partial<TrialRecord> & Pick<TrialRecord, "pAccession" | "species" | "treatment" | "pc">): TrialRecord {
  const sourceRow = partial.sourceRow ?? 1;
  return {
    id: `${partial.pAccession}:${partial.treatment}:${sourceRow}`,
    sourceRow,
    pAccession: partial.pAccession,
    sourceAccession: partial.sourceAccession ?? partial.pAccession.replace("P", "SB"),
    species: partial.species,
    treatment: partial.treatment,
    num: partial.num ?? 50,
    startDate: partial.startDate ?? "2025-11-14",
    propaguleType: partial.propaguleType ?? "s",
    ttd: partial.ttd ?? "2026-03-20",
    pc: partial.pc,
    ced: null,
    wsed: null,
    csed: partial.csed ?? "2026-03-16",
    linerStart: partial.linerStart ?? null,
    linerTtd: partial.linerTtd ?? null,
    lpc: partial.lpc ?? null,
    fourStart: null,
    fourTtd: null,
    fourPc: partial.fourPc ?? null,
    location: null,
    status: partial.status ?? "ND",
    pcd: partial.pcd ?? null,
    notes: partial.notes ?? null,
    treatmentComponents: parseTreatment(partial.treatment)
  };
}

const sampleTrials: TrialRecord[] = [
  trial({ pAccession: "P2025-0086", species: "Lomatium macrocarpum", treatment: "C", pc: 0 }),
  trial({ pAccession: "P2025-0086", species: "Lomatium macrocarpum", treatment: "CS", pc: 5 }),
  trial({ pAccession: "P2025-0079", species: "Triteleia hyacinthina", treatment: "C", pc: 0 }),
  trial({ pAccession: "P2025-0079", species: "Triteleia hyacinthina", treatment: "CS", pc: 5 }),
  trial({ pAccession: "P2025-0064", species: "Calochortus tolmiei", treatment: "CS", pc: 4 }),
  trial({ pAccession: "P2025-0064", species: "Calochortus tolmiei", treatment: "WS+CS", pc: 5 }),
  trial({ pAccession: "P2025-0066", species: "Chlorogalum pomeridianum", treatment: "CS", pc: 5 }),
  trial({ pAccession: "P2025-0066", species: "Chlorogalum pomeridianum", treatment: "WS+CS", pc: 3 }),
  trial({ pAccession: "P2025-0072", species: "Lupinus microcarpus", treatment: "SCAR+C", pc: 5 }),
  trial({ pAccession: "P2025-0072", species: "Lupinus microcarpus", treatment: "SCAR+CS", pc: 5 }),
  trial({ pAccession: "P2025-0094", species: "Lupinus albifrons", treatment: "SCAR+C", pc: 2 }),
  trial({ pAccession: "P2025-0094", species: "Lupinus albifrons", treatment: "SCAR+CS", pc: 4 })
];

export const sampleDashboard: DashboardData = buildDashboardData(sampleTrials, [], {
  filename: "Sample PSU-style workbook",
  importedAt: new Date().toISOString(),
  workbookHash: "sample",
  rowCount: sampleTrials.length,
  accessionCount: new Set(sampleTrials.map((trial) => trial.pAccession)).size,
  speciesCount: new Set(sampleTrials.map((trial) => trial.species)).size,
  treatmentCount: new Set(sampleTrials.map((trial) => trial.treatment)).size,
  warnings: ["Sample data only"]
});
