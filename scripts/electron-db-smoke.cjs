const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BetterSqlite = require("better-sqlite3");
const { SeedBankDatabase } = require("../dist-electron/electron/main/database.js");
const { parseTreatment } = require("../dist-electron/src/core/treatments.js");

function trial(row, treatment, pc, accession = "P1") {
  return {
    id: `${accession}:${treatment}:${row}`,
    sourceRow: row,
    pAccession: accession,
    sourceAccession: `SB-${accession}`,
    species: "Lomatium macrocarpum",
    treatment,
    num: 50,
    startDate: "2025-11-14",
    propaguleType: "s",
    ttd: "2026-03-16",
    pc,
    pcRaw: pc === 5 ? 90 : pc,
    pcScale: pc === 5 ? "percent_0_100" : "ordinal_0_5",
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
    treatmentComponents: parseTreatment(treatment)
    ,propaguleTypeCanonical: "seed"
    ,analysisEligibility: "eligible"
    ,rawCellValues: { pc }
    ,normalizedCellValues: { pc }
  };
}

function importResult(filename, accession = "P1") {
  const trials = [trial(2, "C", 0, accession), trial(3, "CS", 5, accession)];
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
      ,sourcePath: path.join(dir, filename)
      ,worksheetName: "Accessions"
      ,populatedRowCount: trials.length
      ,quarantinedRowCount: 0
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
        id: "synthetic-import-issue",
        severity: "high",
        category: "fix_first",
        title: "Synthetic import issue",
        detail: "Import-time issues must survive persistence.",
        affectedRows: 1,
        sourceRows: [3],
        species: ["Lomatium macrocarpum"],
        metric: "PC"
      }
    ],
    quarantinedRows: []
  };
}

const dir = mkdtempSync(path.join(os.tmpdir(), "seedbank-electron-db-"));
const db = new SeedBankDatabase(path.join(dir, "test.sqlite"));

try {
  const first = db.saveImport(importResult("first.xlsx"));
  const second = db.saveImport(importResult("second.xlsx"));
  const unchanged = db.saveImport(importResult("first.xlsx"));
  const copiedResult = importResult("copied-first.xlsx");
  copiedResult.batch.workbookHash = "first.xlsx";
  const copied = db.saveImport(copiedResult);

  if (first.batch?.id !== 1) throw new Error(`Expected first batch id 1, got ${first.batch?.id}`);
  if (second.batch?.id !== 2) throw new Error(`Expected second batch id 2, got ${second.batch?.id}`);
  if (unchanged.batch?.id !== 1) throw new Error("Matching source content created a duplicate version");
  if (copied.batch?.id !== 1) throw new Error("Matching content at a different path created a duplicate version");
  const scopeHashBeforeRefresh = db.getDatasetState().scopes.find((scope) => scope.batchIds.includes(1)).scopeHash;
  const originalBatch = db.getImportResult(1).batch;
  const parserRefresh = importResult("first.xlsx");
  parserRefresh.batch.importFormatVersion = 2;
  parserRefresh.batch.sourceId = originalBatch.sourceId;
  parserRefresh.batch.sourcePath = path.join(dir, "relinked-first.xlsx");
  parserRefresh.batch.filename = "relinked-first.xlsx";
  parserRefresh.batch.worksheetName = "Replacement sheet";
  parserRefresh.trials[0].status = "ND";
  const refreshed = db.saveImport(parserRefresh);
  if (refreshed.batch?.id !== 1 || refreshed.batch?.importFormatVersion !== 2) {
    throw new Error("Parser refresh did not update the existing immutable batch in place");
  }
  if (db.getImportResult(1)?.trials[0].status !== "ND") {
    throw new Error("Parser refresh did not replace stale derived trial fields");
  }
  const refreshedBatch = db.getImportResult(1).batch;
  if (
    refreshedBatch.filename !== originalBatch.filename ||
    refreshedBatch.sourcePath !== originalBatch.sourcePath ||
    refreshedBatch.worksheetName !== originalBatch.worksheetName
  ) {
    throw new Error("Parser refresh rewrote immutable batch provenance");
  }
  const refreshedScope = db.getDatasetState().scopes.find((scope) => scope.batchIds.includes(1));
  if (refreshedScope.scopeHash === scopeHashBeforeRefresh || refreshedScope.importVersions[0].importFormatVersion !== 2) {
    throw new Error("Parser refresh did not change the scope identity and version provenance");
  }
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
  if (reconstructed.trials[1].pcRaw !== 90 || reconstructed.trials[1].pcScale !== "percent_0_100") {
    throw new Error("Raw propagation score provenance did not survive persistence");
  }
  if (reconstructed.issues[0].sourceRows?.[0] !== 3 || reconstructed.issues[0].metric !== "PC") {
    throw new Error("Actionable data-quality metadata did not survive persistence");
  }
  if (reconstructed.batch.warnings[0] !== "Synthetic warning") {
    throw new Error("Reconstructed batch warnings changed");
  }
  if (reconstructed.trials[1].rawCellValues?.pc !== 5) {
    throw new Error("Raw and normalized cell evidence did not survive persistence");
  }
  const delayedCodebookImport = importResult("codebook-refresh.xlsx", "P-codebook");
  delayedCodebookImport.trials.forEach((row) => {
    row.treatment = "ZZ";
    row.treatmentComponents = parseTreatment("ZZ");
    row.analysisEligibility = "descriptive_only";
  });
  db.saveTreatmentCodebookEntry({
    version: 0,
    propaguleType: "seed",
    token: "ZZ",
    label: "Synthetic treatment",
    meaning: "Synthetic smoke-test token",
    active: true
  });
  const codebookDashboard = db.saveImport(delayedCodebookImport);
  const codebookBatchId = codebookDashboard.batch?.id;
  if (!codebookBatchId || db.getImportResult(codebookBatchId).trials.some((row) => row.analysisEligibility !== "eligible")) {
    throw new Error("Import commit did not recalculate treatment eligibility using the current codebook");
  }
  let overlapBlocked = false;
  try {
    db.createScope("overlap", [1, 2]);
  } catch {
    overlapBlocked = true;
  }
  if (!overlapBlocked) throw new Error("Cross-source natural-key overlap did not block combined analysis");
  const third = db.saveImport(importResult("third.xlsx", "P2"));
  const combined = db.createScope("combined", [1, third.batch.id]);
  if (!combined.isCombined || db.setActiveScope(combined.id).metrics.trials !== 4) {
    throw new Error("Explicit combined scope did not preserve disjoint cohorts");
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
    UPDATE trials SET pc = 50 WHERE source_row = 3;
    ALTER TABLE trials DROP COLUMN pc_raw;
    ALTER TABLE trials DROP COLUMN pc_scale;
    ALTER TABLE trials DROP COLUMN lpc_raw;
    ALTER TABLE trials DROP COLUMN lpc_scale;
    ALTER TABLE trials DROP COLUMN four_pc_raw;
    ALTER TABLE trials DROP COLUMN four_pc_scale;
    ALTER TABLE data_quality_issues DROP COLUMN metadata_json;
    UPDATE import_batches SET import_format_version = 1;
    DELETE FROM analysis_scope_batches;
    DELETE FROM analysis_scopes;
    DELETE FROM app_state WHERE key = 'active_scope_id';
    PRAGMA user_version = 1;
  `);
  rawLegacy.close();

  const migratedLegacy = new SeedBankDatabase(legacyPath);
  const migratedImport = migratedLegacy.getImportResult(legacySaved.batch?.id);
  if (!migratedImport) throw new Error("Expected migrated legacy import result");
  if (migratedImport.observations.length !== 1) {
    throw new Error("Legacy observation import_batch_id migration did not preserve observations");
  }
  const migratedScore = migratedImport.trials.find((item) => item.sourceRow === 3);
  if (migratedScore?.pc !== 3 || migratedScore.pcRaw !== 50 || migratedScore.pcScale !== "percent_0_100") {
    throw new Error("Legacy percentage score migration did not preserve and normalize the raw value");
  }
  const migratedState = migratedLegacy.getDatasetState();
  if (migratedState.scopes.length !== 1 || migratedState.activeScopeId !== migratedState.scopes[0].id) {
    throw new Error("Legacy batches were not migrated into separate active analysis scopes");
  }
  if (!migratedState.scopes[0].requiresReprocessing) {
    throw new Error("Legacy parser versions must require an explicit parser-refresh import");
  }
  migratedLegacy.close();

  console.log("Electron SQLite smoke passed");
} finally {
  db.close();
}

process.exit(0);
