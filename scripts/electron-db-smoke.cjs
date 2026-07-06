const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BetterSqlite = require("better-sqlite3");
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
    observations: [
      {
        trialId: trials[1].id,
        sourceRow: 3,
        date: "2026-03-16",
        kind: "pc",
        value: 5,
        rawSnippet: "3/16/2026 PC 5",
        confidence: "high"
      }
    ],
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
  const reconstructed = db.getImportResult(2);
  if (!reconstructed) throw new Error("Expected reconstructed import result");
  if (reconstructed.trials.length !== 2) throw new Error("Reconstructed trial count changed");
  if (reconstructed.observations.length !== 1) throw new Error("Reconstructed observation count changed");
  if (reconstructed.issues.length !== 1) throw new Error("Reconstructed import issue count changed");
  if (reconstructed.batch.warnings[0] !== "Synthetic warning") {
    throw new Error("Reconstructed batch warnings changed");
  }

  const legacyPath = path.join(dir, "legacy.sqlite");
  const legacyDb = new SeedBankDatabase(legacyPath);
  const legacySaved = legacyDb.saveImport(importResult("legacy.xlsx"));
  legacyDb.close();

  const rawLegacy = new BetterSqlite(legacyPath);
  rawLegacy.pragma("foreign_keys = OFF");
  rawLegacy.exec(`
    CREATE TABLE observations_legacy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trial_id TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      observed_date TEXT,
      kind TEXT NOT NULL,
      value REAL,
      raw_snippet TEXT NOT NULL,
      confidence TEXT NOT NULL
    );
    INSERT INTO observations_legacy (
      id, trial_id, source_row, observed_date, kind, value, raw_snippet, confidence
    )
    SELECT id, trial_id, source_row, observed_date, kind, value, raw_snippet, confidence
    FROM observations;
    DROP TABLE observations;
    ALTER TABLE observations_legacy RENAME TO observations;
    PRAGMA user_version = 1;
  `);
  rawLegacy.close();

  const migratedLegacy = new SeedBankDatabase(legacyPath);
  const migratedImport = migratedLegacy.getImportResult(legacySaved.batch?.id);
  if (!migratedImport) throw new Error("Expected migrated legacy import result");
  if (migratedImport.observations.length !== 1) {
    throw new Error("Legacy observation import_batch_id migration did not preserve observations");
  }
  migratedLegacy.close();

  console.log("Electron SQLite smoke passed");
} finally {
  db.close();
}

process.exit(0);
