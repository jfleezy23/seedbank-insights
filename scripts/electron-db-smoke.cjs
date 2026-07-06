const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SeedBankDatabase } = require("../dist-electron/electron/main/database.js");
const { parseTreatment } = require("../dist-electron/src/core/treatments.js");

function trial(row, treatment, pc) {
  return {
    id: `P1:${treatment}:${row}`,
    sourceRow: row,
    pAccession: "P1",
    sourceAccession: "SB1",
    species: "Lomatium macrocarpum",
    treatment,
    num: 50,
    startDate: "2025-11-14",
    propaguleType: "s",
    ttd: "2026-03-16",
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

function importResult(filename) {
  const trials = [trial(2, "C", 0), trial(3, "CS", 5)];
  return {
    batch: {
      filename,
      importedAt: "2026-07-05T00:00:00.000Z",
      workbookHash: filename,
      rowCount: trials.length,
      accessionCount: 1,
      speciesCount: 1,
      treatmentCount: 2,
      warnings: ["Synthetic warning"]
    },
    trials,
    observations: [],
    issues: [
      {
        severity: "high",
        title: "Synthetic import issue",
        detail: "Import-time issues must survive persistence.",
        affectedRows: 1
      }
    ]
  };
}

const dir = mkdtempSync(path.join(os.tmpdir(), "seedbank-electron-db-"));
const db = new SeedBankDatabase(path.join(dir, "test.sqlite"));

try {
  const first = db.saveImport(importResult("first.xlsx"));
  const second = db.saveImport(importResult("second.xlsx"));

  if (first.batch?.id !== 1) throw new Error(`Expected first batch id 1, got ${first.batch?.id}`);
  if (second.batch?.id !== 2) throw new Error(`Expected second batch id 2, got ${second.batch?.id}`);
  if (db.getDashboard(1).metrics.trials !== 2) throw new Error("First batch trial count changed");
  if (db.getDashboard(2).metrics.trials !== 2) throw new Error("Second batch trial count changed");
  const issueTitles = db.getDashboard(2).dataQualityIssues.map((issue) => issue.title);
  if (!issueTitles.includes("Synthetic import issue")) {
    throw new Error("Persisted import issue was not surfaced");
  }
  console.log("Electron SQLite smoke passed");
} finally {
  db.close();
}

process.exit(0);
