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
    family: string | null;
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

type BatchRow = {
  id: number;
  filename: string;
  imported_at: string;
  workbook_hash: string;
  row_count: number;
  accession_count: number;
  species_count: number;
  treatment_count: number;
  warnings_json: string;
};

function textValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function batchSummaryFromRow(row: BatchRow): ImportResult["batch"] & { id: number } {
  return {
    id: row.id,
    filename: textValue(row.filename),
    importedAt: textValue(row.imported_at),
    workbookHash: textValue(row.workbook_hash),
    rowCount: row.row_count,
    accessionCount: row.accession_count,
    speciesCount: row.species_count,
    treatmentCount: row.treatment_count,
    warnings: parseJson<string[]>(row.warnings_json, [])
  };
}

function trialFromRow(row: Record<string, unknown>): TrialRecord {
  return {
    id: textValue(row.id),
    importBatchId: Number(row.import_batch_id),
    sourceRow: Number(row.source_row),
    pAccession: textValue(row.p_accession),
    sourceAccession: textValue(row.source_accession),
    species: textValue(row.species),
    family: nullableText(row.family),
    treatment: textValue(row.treatment),
    num: numberOrNull(row.num),
    startDate: nullableText(row.start_date),
    propaguleType: nullableText(row.propagule_type),
    ttd: nullableText(row.ttd),
    pc: numberOrNull(row.pc),
    pcRaw: numberOrNull(row.pc_raw),
    pcScale: nullableText(row.pc_scale) as TrialRecord["pcScale"],
    ced: nullableText(row.ced),
    wsed: nullableText(row.wsed),
    csed: nullableText(row.csed),
    linerStart: nullableText(row.liner_start),
    linerTtd: nullableText(row.liner_ttd),
    lpc: numberOrNull(row.lpc),
    lpcRaw: numberOrNull(row.lpc_raw),
    lpcScale: nullableText(row.lpc_scale) as TrialRecord["lpcScale"],
    fourStart: nullableText(row.four_start),
    fourTtd: nullableText(row.four_ttd),
    fourPc: numberOrNull(row.four_pc),
    fourPcRaw: numberOrNull(row.four_pc_raw),
    fourPcScale: nullableText(row.four_pc_scale) as TrialRecord["fourPcScale"],
    location: nullableText(row.location),
    status: nullableText(row.status) as "D" | "ND" | null,
    pcd: nullableText(row.pcd),
    notes: nullableText(row.notes),
    treatmentComponents: parseJson<TrialRecord["treatmentComponents"]>(row.treatment_components_json, {
      raw: "",
      normalized: "",
      isControl: false,
      hasCold: false,
      hasWarm: false,
      hasScarification: false,
      hasHotWater: false,
      hasGa: false,
      coldDays: [],
      warmDays: [],
      tokens: [],
      warnings: []
    })
  };
}

function observationFromRow(row: Record<string, unknown>): ParsedObservation {
  return {
    trialId: textValue(row.trial_id),
    sourceRow: Number(row.source_row),
    date: nullableText(row.observed_date),
    kind: row.kind as ParsedObservation["kind"],
    value: numberOrNull(row.value),
    rawSnippet: textValue(row.raw_snippet),
    confidence: row.confidence as ParsedObservation["confidence"]
  };
}

function issueFromRow(row: Record<string, unknown>): DataQualityIssue {
  const metadata = parseJson<Partial<DataQualityIssue>>(row.metadata_json, {});
  return {
    ...metadata,
    severity: row.severity as DataQualityIssue["severity"],
    title: textValue(row.title),
    detail: textValue(row.detail),
    affectedRows: Number(row.affected_rows ?? 0)
  };
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
        family TEXT,
        treatment TEXT NOT NULL,
        num REAL,
        start_date TEXT,
        propagule_type TEXT,
        ttd TEXT,
        pc REAL,
        pc_raw REAL,
        pc_scale TEXT,
        ced TEXT,
        wsed TEXT,
        csed TEXT,
        liner_start TEXT,
        liner_ttd TEXT,
        lpc REAL,
        lpc_raw REAL,
        lpc_scale TEXT,
        four_start TEXT,
        four_ttd TEXT,
        four_pc REAL,
        four_pc_raw REAL,
        four_pc_scale TEXT,
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
        metadata_json TEXT NOT NULL DEFAULT '{}',
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
    this.ensureObservationImportBatchId();
    this.ensureTrialFamilyColumn();
    this.ensureTrialScoreColumns();
    this.ensureDataQualityMetadataColumn();
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_observations_import_batch_id
        ON observations(import_batch_id);
    `);
  }

  private ensureObservationImportBatchId(): void {
    const columns = this.db.prepare("PRAGMA table_info(observations)").all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === "import_batch_id")) return;

    this.db.exec(`
      ALTER TABLE observations ADD COLUMN import_batch_id INTEGER;
      UPDATE observations
      SET import_batch_id = (
        SELECT t.import_batch_id
        FROM trials t
        WHERE t.id = observations.trial_id
        ORDER BY t.import_batch_id DESC
        LIMIT 1
      )
      WHERE import_batch_id IS NULL;
    `);
  }

  private ensureTrialFamilyColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(trials)").all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === "family")) return;
    this.db.exec("ALTER TABLE trials ADD COLUMN family TEXT;");
  }

  private ensureTrialScoreColumns(): void {
    const columns = new Set(
      (this.db.prepare("PRAGMA table_info(trials)").all() as Array<{ name: string }>).map((column) => column.name)
    );
    const additions = [
      ["pc_raw", "REAL"],
      ["pc_scale", "TEXT"],
      ["lpc_raw", "REAL"],
      ["lpc_scale", "TEXT"],
      ["four_pc_raw", "REAL"],
      ["four_pc_scale", "TEXT"]
    ] as const;
    for (const [name, type] of additions) {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE trials ADD COLUMN ${name} ${type};`);
    }
    for (const [valueColumn, rawColumn, scaleColumn] of [
      ["pc", "pc_raw", "pc_scale"],
      ["lpc", "lpc_raw", "lpc_scale"],
      ["four_pc", "four_pc_raw", "four_pc_scale"]
    ] as const) {
      this.db.exec(`
        UPDATE trials
        SET ${rawColumn} = ${valueColumn}
        WHERE ${rawColumn} IS NULL AND ${valueColumn} IS NOT NULL;

        UPDATE trials
        SET ${scaleColumn} = 'invalid'
        WHERE ${scaleColumn} IS NULL
          AND ${rawColumn} IS NOT NULL
          AND (${rawColumn} < 0 OR ${rawColumn} > 100);

        UPDATE trials
        SET ${scaleColumn} = 'percent_0_100'
        WHERE ${scaleColumn} IS NULL
          AND ${rawColumn} BETWEEN 0 AND 100
          AND EXISTS (
            SELECT 1
            FROM trials percentage_row
            WHERE percentage_row.import_batch_id = trials.import_batch_id
              AND percentage_row.${rawColumn} > 5
              AND percentage_row.${rawColumn} <= 100
          );

        UPDATE trials
        SET ${scaleColumn} = 'ordinal_0_5'
        WHERE ${scaleColumn} IS NULL AND ${rawColumn} BETWEEN 0 AND 5;

        UPDATE trials
        SET ${valueColumn} = CASE
          WHEN ${scaleColumn} = 'invalid' THEN NULL
          WHEN ${scaleColumn} = 'percent_0_100' AND ${rawColumn} = 0 THEN 0
          WHEN ${scaleColumn} = 'percent_0_100' AND ${rawColumn} <= 10 THEN 1
          WHEN ${scaleColumn} = 'percent_0_100' AND ${rawColumn} <= 25 THEN 2
          WHEN ${scaleColumn} = 'percent_0_100' AND ${rawColumn} <= 50 THEN 3
          WHEN ${scaleColumn} = 'percent_0_100' AND ${rawColumn} <= 75 THEN 4
          WHEN ${scaleColumn} = 'percent_0_100' THEN 5
          ELSE ${valueColumn}
        END
        WHERE ${scaleColumn} IN ('invalid', 'percent_0_100');
      `);
    }
  }

  private ensureDataQualityMetadataColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(data_quality_issues)").all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === "metadata_json")) return;
    this.db.exec("ALTER TABLE data_quality_issues ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';");
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
          species, family, treatment, num, start_date, propagule_type, ttd, pc, pc_raw, pc_scale,
          ced, wsed, csed, liner_start, liner_ttd, lpc, lpc_raw, lpc_scale, four_start,
          four_ttd, four_pc, four_pc_raw, four_pc_scale, location, status, pcd, notes,
          treatment_components_json
        ) VALUES (
          @id, @importBatchId, @sourceRow, @pAccession, @sourceAccession,
          @species, @family, @treatment, @num, @startDate, @propaguleType, @ttd, @pc, @pcRaw, @pcScale,
          @ced, @wsed, @csed, @linerStart, @linerTtd, @lpc, @lpcRaw, @lpcScale, @fourStart,
          @fourTtd, @fourPc, @fourPcRaw, @fourPcScale, @location, @status, @pcd, @notes,
          @treatmentComponentsJson
        )
      `);

      for (const trial of result.trials) {
        trialStmt.run({
          ...trial,
          importBatchId: batchId,
          family: trial.family ?? null,
          pcRaw: trial.pcRaw ?? trial.pc,
          pcScale: trial.pcScale ?? (trial.pc === null ? null : "ordinal_0_5"),
          lpcRaw: trial.lpcRaw ?? trial.lpc,
          lpcScale: trial.lpcScale ?? (trial.lpc === null ? null : "ordinal_0_5"),
          fourPcRaw: trial.fourPcRaw ?? trial.fourPc,
          fourPcScale: trial.fourPcScale ?? (trial.fourPc === null ? null : "ordinal_0_5"),
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
          import_batch_id, severity, title, detail, affected_rows, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const issue of result.issues) {
        issueStmt.run(batchId, issue.severity, issue.title, issue.detail, issue.affectedRows, JSON.stringify(issue));
      }

      return batchId;
    });

    const batchId = tx();
    return this.getDashboard(batchId);
  }

  getImportResult(batchId?: number): ImportResult | null {
    const batch =
      batchId ??
      (this.db.prepare("SELECT id FROM import_batches ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined)
        ?.id;

    if (!batch) return null;

    const batchRow = this.db
      .prepare("SELECT * FROM import_batches WHERE id = ?")
      .get(batch) as BatchRow | undefined;

    if (!batchRow) return null;

    const trialRows = this.db
      .prepare("SELECT * FROM trials WHERE import_batch_id = ? ORDER BY source_row")
      .all(batch) as Array<Record<string, unknown>>;

    const observationRows = this.db
      .prepare("SELECT * FROM observations WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    const issueRows = this.db
      .prepare("SELECT * FROM data_quality_issues WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    return {
      batch: batchSummaryFromRow(batchRow),
      trials: trialRows.map(trialFromRow),
      observations: observationRows.map(observationFromRow),
      issues: issueRows.map(issueFromRow)
    };
  }

  getDashboard(batchId?: number): DashboardData {
    const batch =
      batchId ??
      (this.db.prepare("SELECT id FROM import_batches ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined)
        ?.id;

    if (!batch) return buildDashboardData([], [], null);

    const batchRow = this.db
      .prepare("SELECT * FROM import_batches WHERE id = ?")
      .get(batch) as BatchRow | undefined;

    const trialRows = this.db
      .prepare("SELECT * FROM trials WHERE import_batch_id = ? ORDER BY source_row")
      .all(batch) as Array<Record<string, unknown>>;

    const observationRows = this.db
      .prepare("SELECT * FROM observations WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    const issueRows = this.db
      .prepare("SELECT * FROM data_quality_issues WHERE import_batch_id = ? ORDER BY id")
      .all(batch) as Array<Record<string, unknown>>;

    const trials = trialRows.map(trialFromRow);
    const observations = observationRows.map(observationFromRow);
    const importIssues = issueRows.map(issueFromRow);

    return buildDashboardData(
      trials,
      observations,
      batchRow
        ? batchSummaryFromRow(batchRow)
        : null,
      importIssues,
      []
    );
  }

  getAskContext(batchId?: number): AskContext {
    const dashboard = this.getDashboard(batchId);
    const batch = dashboard.batch?.id;
    if (!batch) return { dashboard, trials: [], observations: [] };

    const trials = this.db
      .prepare(
        `SELECT source_row, p_accession, source_accession, species, family, treatment, num, pc, lpc,
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
        family: nullableText(row.family),
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
