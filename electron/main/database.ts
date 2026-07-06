import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildDashboardData } from "../../src/core/insights";
import type {
  DashboardData,
  DataQualityIssue,
  ImportResult,
  ParsedObservation,
  SpeciesInsight,
  TrialRecord
} from "../../src/core/types";

export interface AskContext {
  dashboard: DashboardData;
  trials: Array<{
    sourceRow: number;
    accession: string;
    sourceAccession: string;
    species: string;
    treatment: string;
    num: number | null;
    pc: number | null;
    lpc: number | null;
    fourPc: number | null;
    status: string | null;
    notes: string | null;
  }>;
  observations: Array<{
    sourceRow: number;
    kind: string;
    value: number | null;
    date: string | null;
    rawSnippet: string;
  }>;
}

export class SeedBankDatabase {
  private db: DatabaseType;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version < 1) {
      this.db.pragma("foreign_keys = OFF");
      this.db.exec(`
        DROP TABLE IF EXISTS insights;
        DROP TABLE IF EXISTS observations;
        DROP TABLE IF EXISTS data_quality_issues;
        DROP TABLE IF EXISTS trials;
        DROP TABLE IF EXISTS import_batches;
      `);
      this.createSchema();
      this.db.pragma("user_version = 1");
      this.db.pragma("foreign_keys = ON");
      return;
    }
    this.createSchema();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        workbook_hash TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        accession_count INTEGER NOT NULL,
        species_count INTEGER NOT NULL,
        treatment_count INTEGER NOT NULL,
        warnings_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trials (
        id TEXT NOT NULL,
        import_batch_id INTEGER NOT NULL,
        source_row INTEGER NOT NULL,
        p_accession TEXT NOT NULL,
        source_accession TEXT NOT NULL,
        species TEXT NOT NULL,
        treatment TEXT NOT NULL,
        num REAL,
        start_date TEXT,
        propagule_type TEXT,
        ttd TEXT,
        pc REAL,
        ced TEXT,
        wsed TEXT,
        csed TEXT,
        liner_start TEXT,
        liner_ttd TEXT,
        lpc REAL,
        four_start TEXT,
        four_ttd TEXT,
        four_pc REAL,
        location TEXT,
        status TEXT,
        pcd TEXT,
        notes TEXT,
        treatment_components_json TEXT NOT NULL,
        PRIMARY KEY(import_batch_id, id),
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        trial_id TEXT NOT NULL,
        source_row INTEGER NOT NULL,
        observed_date TEXT,
        kind TEXT NOT NULL,
        value REAL,
        raw_snippet TEXT NOT NULL,
        confidence TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
        FOREIGN KEY(import_batch_id, trial_id) REFERENCES trials(import_batch_id, id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS data_quality_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        affected_rows INTEGER NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );
    `);
  }

  saveSpeciesInsights(importBatchId: number, insights: SpeciesInsight[]): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM insights WHERE import_batch_id = ? AND kind = 'species_insight'")
        .run(importBatchId);
      const stmt = this.db.prepare(`
        INSERT INTO insights (
          import_batch_id, kind, label, payload_json, created_at
        ) VALUES (?, 'species_insight', ?, ?, ?)
      `);
      for (const insight of insights) {
        stmt.run(
          importBatchId,
          insight.species,
          JSON.stringify(insight),
          insight.generatedAt ?? new Date().toISOString()
        );
      }
    });
    tx();
  }

  saveImport(result: ImportResult): DashboardData {
    const tx = this.db.transaction(() => {
      const batchStmt = this.db.prepare(`
        INSERT INTO import_batches (
          filename, imported_at, workbook_hash, row_count, accession_count,
          species_count, treatment_count, warnings_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const batchInfo = batchStmt.run(
        result.batch.filename,
        result.batch.importedAt,
        result.batch.workbookHash,
        result.batch.rowCount,
        result.batch.accessionCount,
        result.batch.speciesCount,
        result.batch.treatmentCount,
        JSON.stringify(result.batch.warnings)
      );
      const batchId = Number(batchInfo.lastInsertRowid);

      const trialStmt = this.db.prepare(`
        INSERT INTO trials (
          id, import_batch_id, source_row, p_accession, source_accession,
          species, treatment, num, start_date, propagule_type, ttd, pc,
          ced, wsed, csed, liner_start, liner_ttd, lpc, four_start,
          four_ttd, four_pc, location, status, pcd, notes,
          treatment_components_json
        ) VALUES (
          @id, @importBatchId, @sourceRow, @pAccession, @sourceAccession,
          @species, @treatment, @num, @startDate, @propaguleType, @ttd, @pc,
          @ced, @wsed, @csed, @linerStart, @linerTtd, @lpc, @fourStart,
          @fourTtd, @fourPc, @location, @status, @pcd, @notes,
          @treatmentComponentsJson
        )
      `);

      for (const trial of result.trials) {
        trialStmt.run({
          ...trial,
          importBatchId: batchId,
          treatmentComponentsJson: JSON.stringify(trial.treatmentComponents)
        });
      }

      const observationStmt = this.db.prepare(`
        INSERT INTO observations (
          import_batch_id, trial_id, source_row, observed_date, kind,
          value, raw_snippet, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const observation of result.observations) {
        observationStmt.run(
          batchId,
          observation.trialId,
          observation.sourceRow,
          observation.date,
          observation.kind,
          observation.value,
          observation.rawSnippet,
          observation.confidence
        );
      }

      const issueStmt = this.db.prepare(`
        INSERT INTO data_quality_issues (
          import_batch_id, severity, title, detail, affected_rows
        ) VALUES (?, ?, ?, ?, ?)
      `);
      for (const issue of result.issues) {
        issueStmt.run(batchId, issue.severity, issue.title, issue.detail, issue.affectedRows);
      }

      return batchId;
    });

    const batchId = tx();
    return this.getDashboard(batchId);
  }

  getDashboard(batchId?: number): DashboardData {
    const batch =
      batchId ??
      (this.db.prepare("SELECT id FROM import_batches ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined)
        ?.id;

    if (!batch) return buildDashboardData([], [], null);

    const batchRow = this.db
      .prepare("SELECT * FROM import_batches WHERE id = ?")
      .get(batch) as
      | {
          id: number;
          filename: string;
          imported_at: string;
          workbook_hash: string;
          row_count: number;
          accession_count: number;
          species_count: number;
          treatment_count: number;
          warnings_json: string;
        }
      | undefined;

    const trialRows = this.db
      .prepare("SELECT * FROM trials WHERE import_batch_id = ? ORDER BY source_row")
      .all(batch) as Array<Record<string, unknown>>;

    const observationRows = this.db
      .prepare("SELECT * FROM observations WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    const issueRows = this.db
      .prepare("SELECT * FROM data_quality_issues WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    const insightRows = this.db
      .prepare(
        "SELECT payload_json FROM insights WHERE import_batch_id = ? AND kind = 'species_insight' ORDER BY label"
      )
      .all(batch) as Array<{ payload_json: string }>;

    const trials: TrialRecord[] = trialRows.map((row) => ({
      id: String(row.id),
      importBatchId: Number(row.import_batch_id),
      sourceRow: Number(row.source_row),
      pAccession: String(row.p_accession),
      sourceAccession: String(row.source_accession),
      species: String(row.species),
      treatment: String(row.treatment),
      num: row.num === null ? null : Number(row.num),
      startDate: row.start_date as string | null,
      propaguleType: row.propagule_type as string | null,
      ttd: row.ttd as string | null,
      pc: row.pc === null ? null : Number(row.pc),
      ced: row.ced as string | null,
      wsed: row.wsed as string | null,
      csed: row.csed as string | null,
      linerStart: row.liner_start as string | null,
      linerTtd: row.liner_ttd as string | null,
      lpc: row.lpc === null ? null : Number(row.lpc),
      fourStart: row.four_start as string | null,
      fourTtd: row.four_ttd as string | null,
      fourPc: row.four_pc === null ? null : Number(row.four_pc),
      location: row.location as string | null,
      status: row.status as "D" | "ND" | null,
      pcd: row.pcd as string | null,
      notes: row.notes as string | null,
      treatmentComponents: JSON.parse(String(row.treatment_components_json))
    }));

    const observations: ParsedObservation[] = observationRows.map((row) => ({
      trialId: String(row.trial_id),
      sourceRow: Number(row.source_row),
      date: row.observed_date as string | null,
      kind: row.kind as ParsedObservation["kind"],
      value: row.value === null ? null : Number(row.value),
      rawSnippet: String(row.raw_snippet),
      confidence: row.confidence as ParsedObservation["confidence"]
    }));

    const importIssues: DataQualityIssue[] = issueRows.map((row) => ({
      severity: row.severity as DataQualityIssue["severity"],
      title: String(row.title),
      detail: String(row.detail),
      affectedRows: Number(row.affected_rows)
    }));

    const speciesInsights: SpeciesInsight[] = insightRows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload_json) as SpeciesInsight];
      } catch {
        return [];
      }
    });

    return buildDashboardData(
      trials,
      observations,
      batchRow
        ? {
            id: batchRow.id,
            filename: batchRow.filename,
            importedAt: batchRow.imported_at,
            workbookHash: batchRow.workbook_hash,
            rowCount: batchRow.row_count,
            accessionCount: batchRow.accession_count,
            speciesCount: batchRow.species_count,
            treatmentCount: batchRow.treatment_count,
            warnings: JSON.parse(batchRow.warnings_json)
        }
        : null,
      importIssues,
      speciesInsights
    );
  }

  getAskContext(batchId?: number): AskContext {
    const dashboard = this.getDashboard(batchId);
    const batch = dashboard.batch?.id;
    if (!batch) return { dashboard, trials: [], observations: [] };

    const trials = this.db
      .prepare(
        `SELECT source_row, p_accession, source_accession, species, treatment, num, pc, lpc,
          four_pc, status, notes
         FROM trials
         WHERE import_batch_id = ?
         ORDER BY species, source_row
         LIMIT 220`
      )
      .all(batch) as Array<Record<string, unknown>>;

    const observations = this.db
      .prepare(
        `SELECT source_row, kind, value, observed_date, raw_snippet
         FROM observations
         WHERE import_batch_id = ?
         ORDER BY source_row, id
         LIMIT 260`
      )
      .all(batch) as Array<Record<string, unknown>>;

    return {
      dashboard,
      trials: trials.map((row) => ({
        sourceRow: Number(row.source_row),
        accession: String(row.p_accession),
        sourceAccession: String(row.source_accession),
        species: String(row.species),
        treatment: String(row.treatment),
        num: row.num === null ? null : Number(row.num),
        pc: row.pc === null ? null : Number(row.pc),
        lpc: row.lpc === null ? null : Number(row.lpc),
        fourPc: row.four_pc === null ? null : Number(row.four_pc),
        status: row.status as string | null,
        notes: row.notes as string | null
      })),
      observations: observations.map((row) => ({
        sourceRow: Number(row.source_row),
        kind: String(row.kind),
        value: row.value === null ? null : Number(row.value),
        date: row.observed_date as string | null,
        rawSnippet: String(row.raw_snippet)
      }))
    };
  }

  close(): void {
    this.db.close();
  }
}
