import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { Database as DatabaseType } from "better-sqlite3";
import { buildDashboardData } from "../../src/core/insights";
import type {
  DashboardData,
  DataQualityIssue,
  DatasetState,
  ImportResult,
  AnalysisScope,
  ParsedObservation,
  QuarantinedRow,
  SpeciesInsight,
  TreatmentCodebookEntry,
  TrialRecord
} from "../../src/core/types";
import { BUILT_IN_TREATMENT_CODEBOOK, parseTreatment } from "../../src/core/treatments";
import { WORKBOOK_IMPORT_FORMAT_VERSION } from "../../src/core/workbook";

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
  source_id?: number | null;
  source_path?: string | null;
  worksheet_name?: string | null;
  populated_row_count?: number | null;
  quarantined_row_count?: number | null;
  import_format_version?: number | null;
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
    ,
    sourceId: numberOrNull(row.source_id) ?? undefined,
    sourcePath: nullableText(row.source_path) ?? undefined,
    worksheetName: nullableText(row.worksheet_name) ?? undefined,
    populatedRowCount: numberOrNull(row.populated_row_count) ?? undefined,
    quarantinedRowCount: numberOrNull(row.quarantined_row_count) ?? undefined,
    importFormatVersion: numberOrNull(row.import_format_version) ?? 1
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
    propaguleTypeRaw: nullableText(row.propagule_type_raw),
    propaguleTypeCanonical: (nullableText(row.propagule_type_canonical) ?? "unknown") as TrialRecord["propaguleTypeCanonical"],
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
    }),
    analysisEligibility: (nullableText(row.analysis_eligibility) ?? "eligible") as TrialRecord["analysisEligibility"],
    validationWarnings: parseJson<string[]>(row.validation_warnings_json, []),
    cohort: nullableText(row.cohort),
    rawCellValues: parseJson<TrialRecord["rawCellValues"]>(row.raw_cell_values_json, {}),
    normalizedCellValues: parseJson<TrialRecord["normalizedCellValues"]>(row.normalized_cell_values_json, {}),
    replicateClassification: (nullableText(row.replicate_classification) ?? "unique") as TrialRecord["replicateClassification"]
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
      this.db.pragma("user_version = 4");
      this.db.pragma("foreign_keys = ON");
      return;
    }
    this.createSchema();
    if (version < 4) this.db.pragma("user_version = 4");
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
        warnings_json TEXT NOT NULL,
        source_id INTEGER,
        source_path TEXT,
        worksheet_name TEXT,
        populated_row_count INTEGER,
        quarantined_row_count INTEGER
        ,import_format_version INTEGER NOT NULL DEFAULT 1
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
        propagule_type_raw TEXT,
        propagule_type_canonical TEXT,
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
        analysis_eligibility TEXT NOT NULL DEFAULT 'eligible',
        validation_warnings_json TEXT NOT NULL DEFAULT '[]',
        cohort TEXT,
        raw_cell_values_json TEXT NOT NULL DEFAULT '{}',
        normalized_cell_values_json TEXT NOT NULL DEFAULT '{}',
        replicate_classification TEXT NOT NULL DEFAULT 'unique',
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

      CREATE TABLE IF NOT EXISTS workbook_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        canonical_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_seen_at TEXT
      );

      CREATE TABLE IF NOT EXISTS import_quarantine (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        source_row INTEGER NOT NULL,
        worksheet_name TEXT NOT NULL,
        reasons_json TEXT NOT NULL,
        row_json TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS analysis_scopes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_scope_batches (
        scope_id INTEGER NOT NULL,
        import_batch_id INTEGER NOT NULL,
        PRIMARY KEY(scope_id, import_batch_id),
        FOREIGN KEY(scope_id) REFERENCES analysis_scopes(id) ON DELETE CASCADE,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS treatment_codebook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL,
        propagule_type TEXT NOT NULL,
        token TEXT NOT NULL,
        label TEXT NOT NULL,
        meaning TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        built_in INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

    `);
    this.ensureObservationImportBatchId();
    this.ensureTrialFamilyColumn();
    this.ensureTrialScoreColumns();
    this.ensureDataQualityMetadataColumn();
    this.ensureDatasetColumns();
    this.migrateLegacySources();
    this.migrateLegacyScopes();
    // Reclassification is a full-table write.  It is necessary exactly once
    // when a database first receives the built-in codebook; later imports and
    // codebook edits perform it inside their own transactions.
    if (this.seedTreatmentCodebook()) this.refreshTreatmentEligibility();
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

  private ensureDatasetColumns(): void {
    const ensureColumns = (table: string, additions: Array<[string, string]>): void => {
      const columns = new Set(
        (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name)
      );
      for (const [name, definition] of additions) {
        if (!columns.has(name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
      }
    };
    ensureColumns("import_batches", [
      ["source_id", "INTEGER"],
      ["source_path", "TEXT"],
      ["worksheet_name", "TEXT"],
      ["populated_row_count", "INTEGER"],
      ["quarantined_row_count", "INTEGER"]
      ,["import_format_version", "INTEGER NOT NULL DEFAULT 1"]
    ]);
    ensureColumns("trials", [
      ["propagule_type_raw", "TEXT"],
      ["propagule_type_canonical", "TEXT"],
      ["analysis_eligibility", "TEXT NOT NULL DEFAULT 'eligible'"],
      ["validation_warnings_json", "TEXT NOT NULL DEFAULT '[]'"],
      ["cohort", "TEXT"],
      ["raw_cell_values_json", "TEXT NOT NULL DEFAULT '{}'"],
      ["normalized_cell_values_json", "TEXT NOT NULL DEFAULT '{}'"],
      ["replicate_classification", "TEXT NOT NULL DEFAULT 'unique'"]
    ]);
    this.db.exec(`
      UPDATE trials SET propagule_type_raw = propagule_type
      WHERE propagule_type_raw IS NULL;
      UPDATE trials SET propagule_type_canonical = CASE LOWER(TRIM(COALESCE(propagule_type_raw, propagule_type, '')))
        WHEN 's' THEN 'seed'
        WHEN 'seed' THEN 'seed'
        WHEN 'sc' THEN 'stem_cutting'
        WHEN 'cs' THEN 'stem_cutting'
        WHEN 'stem cutting' THEN 'stem_cutting'
        WHEN 'cutting' THEN 'stem_cutting'
        WHEN 'd' THEN 'division'
        WHEN 'division' THEN 'division'
        ELSE 'unknown'
      END
      WHERE propagule_type_canonical IS NULL OR propagule_type_canonical = '';
    `);
  }

  private seedTreatmentCodebook(): boolean {
    let insertedAny = false;
    const insert = this.db.prepare(
      `INSERT INTO treatment_codebook (
        version, propagule_type, token, label, meaning, active, built_in
      ) VALUES (?, ?, ?, ?, ?, ?, 1)`
    );
    const tx = this.db.transaction(() => {
      for (const entry of BUILT_IN_TREATMENT_CODEBOOK) {
        const existing = this.db
          .prepare("SELECT id FROM treatment_codebook WHERE built_in = 1 AND propagule_type = ? AND token = ?")
          .get(entry.propaguleType, entry.token);
        if (existing) continue;
        insert.run(entry.version, entry.propaguleType, entry.token, entry.label, entry.meaning, entry.active ? 1 : 0);
        insertedAny = true;
      }
    });
    tx();
    return insertedAny;
  }

  private refreshTreatmentEligibilityUnsafe(): void {
    const codebook = this.getTreatmentCodebook();
    const rows = this.db
      .prepare(
        `SELECT id, import_batch_id, treatment, propagule_type_canonical, validation_warnings_json
         FROM trials`
      )
      .all() as Array<Record<string, unknown>>;
    const update = this.db.prepare(
      `UPDATE trials SET treatment_components_json = ?, analysis_eligibility = ?, validation_warnings_json = ?
       WHERE id = ? AND import_batch_id = ?`
    );
    for (const row of rows) {
      const parsed = parseTreatment(
        row.treatment,
        (nullableText(row.propagule_type_canonical) ?? "unknown") as TrialRecord["propaguleTypeCanonical"],
        codebook
      );
      const preservedWarnings = parseJson<string[]>(row.validation_warnings_json, []).filter(
        (warning) => !warning.startsWith("Unmapped treatment token:") && warning !== "Missing treatment value"
      );
      update.run(
        JSON.stringify(parsed),
        parsed.warnings.length ? "descriptive_only" : "eligible",
        JSON.stringify([...preservedWarnings, ...parsed.warnings]),
        row.id,
        row.import_batch_id
      );
    }
  }

  private refreshTreatmentEligibility(): void {
    this.db.transaction(() => this.refreshTreatmentEligibilityUnsafe())();
  }

  private migrateLegacySources(): void {
    const rows = this.db
      .prepare("SELECT DISTINCT filename FROM import_batches WHERE source_id IS NULL")
      .all() as Array<{ filename: string }>;
    for (const row of rows) {
      const canonicalPath = `legacy://${row.filename}`;
      const sourceId = this.ensureSource(canonicalPath, row.filename);
      this.db
        .prepare(
          "UPDATE import_batches SET source_id = ?, source_path = COALESCE(source_path, ?) WHERE source_id IS NULL AND filename = ?"
        )
        .run(sourceId, canonicalPath, row.filename);
    }
  }

  private migrateLegacyScopes(): void {
    const batchesWithoutScope = this.db
      .prepare(
        `SELECT b.id, b.filename, b.imported_at
         FROM import_batches b
         LEFT JOIN analysis_scope_batches sb ON sb.import_batch_id = b.id
         WHERE sb.import_batch_id IS NULL
         ORDER BY b.id`
      )
      .all() as Array<{ id: number; filename: string; imported_at: string }>;
    const create = this.db.prepare("INSERT INTO analysis_scopes (name, created_at) VALUES (?, ?)");
    const attach = this.db.prepare("INSERT INTO analysis_scope_batches (scope_id, import_batch_id) VALUES (?, ?)");
    for (const batch of batchesWithoutScope) {
      const scopeId = Number(create.run(batch.filename, batch.imported_at).lastInsertRowid);
      attach.run(scopeId, batch.id);
    }
    const active = this.db.prepare("SELECT value FROM app_state WHERE key = 'active_scope_id'").get();
    if (!active) {
      const latest = this.db.prepare("SELECT id FROM analysis_scopes ORDER BY id DESC LIMIT 1").get() as
        | { id: number }
        | undefined;
      if (latest) {
        this.db.prepare("INSERT INTO app_state (key, value) VALUES ('active_scope_id', ?)").run(String(latest.id));
      }
    }
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

  private ensureSource(canonicalPath: string, label: string): number {
    const existing = this.db
      .prepare("SELECT id FROM workbook_sources WHERE canonical_path = ?")
      .get(canonicalPath) as { id: number } | undefined;
    const now = new Date().toISOString();
    if (existing) {
      this.db.prepare("UPDATE workbook_sources SET label = ?, last_seen_at = ? WHERE id = ?").run(label, now, existing.id);
      return existing.id;
    }
    return Number(
      this.db
        .prepare(
          "INSERT INTO workbook_sources (label, canonical_path, created_at, last_seen_at) VALUES (?, ?, ?, ?)"
        )
        .run(label, canonicalPath, now, now).lastInsertRowid
    );
  }

  private resolveImportSource(result: ImportResult, sourcePath: string): number {
    if (!result.batch.sourceId) return this.ensureSource(sourcePath, result.batch.filename);
    const sourceId = result.batch.sourceId;
    const source = this.db.prepare("SELECT id FROM workbook_sources WHERE id = ?").get(sourceId);
    if (!source) throw new Error("Workbook source was not found.");
    const collision = this.db
      .prepare("SELECT id FROM workbook_sources WHERE canonical_path = ? AND id <> ?")
      .get(sourcePath, sourceId);
    if (collision) throw new Error("That file is already registered as another workbook source.");
    // Update only the source registry when a relinked file is committed. Batch
    // source_path values are immutable provenance for their historical import.
    this.db
      .prepare("UPDATE workbook_sources SET canonical_path = ?, label = ?, last_seen_at = ? WHERE id = ?")
      .run(sourcePath, result.batch.filename, new Date().toISOString(), sourceId);
    return sourceId;
  }

  private saveImportUnsafe(result: ImportResult): number {
    const sourcePath = result.batch.sourcePath ?? result.batch.filename;
    const sourceId = this.resolveImportSource(result, sourcePath);
    const worksheetName = result.batch.worksheetName ?? null;
    let existing = this.db
      .prepare(
        `SELECT id, source_id, import_format_version
         FROM import_batches
         WHERE workbook_hash = ?
           AND COALESCE(worksheet_name, '') = COALESCE(?, '')
         ORDER BY CASE WHEN source_id = ? THEN 0 ELSE 1 END, id DESC
         LIMIT 1`
      )
      .get(result.batch.workbookHash, worksheetName, sourceId) as
        | { id: number; source_id: number | null; import_format_version: number | null }
        | undefined;
    if (!existing && worksheetName) {
      const legacyMatches = this.db
        .prepare(
          `SELECT id, source_id, import_format_version
           FROM import_batches
           WHERE workbook_hash = ?
             AND worksheet_name IS NULL
           ORDER BY CASE WHEN source_id = ? THEN 0 ELSE 1 END, id DESC`
        )
        .all(result.batch.workbookHash, sourceId) as Array<{
          id: number;
          source_id: number | null;
          import_format_version: number | null;
        }>;
      if (legacyMatches.length === 1) existing = legacyMatches[0];
    }
    const importFormatVersion = result.batch.importFormatVersion ?? 1;
    if (!existing && worksheetName && result.batch.sourceId && importFormatVersion > 1) {
      const parserRefreshMatches = this.db
        .prepare(
          `SELECT id, source_id, import_format_version
           FROM import_batches
           WHERE workbook_hash = ?
             AND source_id = ?
             AND COALESCE(import_format_version, 1) < ?
           ORDER BY id DESC`
        )
        .all(result.batch.workbookHash, sourceId, importFormatVersion) as Array<{
          id: number;
          source_id: number | null;
          import_format_version: number | null;
        }>;
      if (parserRefreshMatches.length === 1) existing = parserRefreshMatches[0];
    }
    const replacing = Boolean(
      existing && existing.source_id === sourceId && (existing.import_format_version ?? 1) < importFormatVersion
    );
    if (existing && !replacing) {
      return existing.id;
    }
    if (replacing && existing) {
      this.db.prepare("DELETE FROM observations WHERE import_batch_id = ?").run(existing.id);
      this.db.prepare("DELETE FROM data_quality_issues WHERE import_batch_id = ?").run(existing.id);
      this.db.prepare("DELETE FROM import_quarantine WHERE import_batch_id = ?").run(existing.id);
      this.db.prepare("DELETE FROM trials WHERE import_batch_id = ?").run(existing.id);
      this.db
        .prepare(
          `UPDATE import_batches SET row_count = ?, accession_count = ?, species_count = ?, treatment_count = ?,
            warnings_json = ?, populated_row_count = ?, quarantined_row_count = ?, import_format_version = ?
            WHERE id = ?`
        )
        .run(
          result.batch.rowCount, result.batch.accessionCount, result.batch.speciesCount, result.batch.treatmentCount,
          JSON.stringify(result.batch.warnings), result.batch.populatedRowCount ?? result.batch.rowCount,
          result.batch.quarantinedRowCount ?? 0, importFormatVersion, existing.id
        );
    }
      const batchStmt = this.db.prepare(`
        INSERT INTO import_batches (
          filename, imported_at, workbook_hash, row_count, accession_count,
          species_count, treatment_count, warnings_json, source_id, source_path,
          worksheet_name, populated_row_count, quarantined_row_count, import_format_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const batchInfo = replacing ? null : batchStmt.run(
        result.batch.filename,
        result.batch.importedAt,
        result.batch.workbookHash,
        result.batch.rowCount,
        result.batch.accessionCount,
        result.batch.speciesCount,
        result.batch.treatmentCount,
        JSON.stringify(result.batch.warnings),
        sourceId,
        sourcePath,
        result.batch.worksheetName ?? null,
        result.batch.populatedRowCount ?? result.batch.rowCount,
        result.batch.quarantinedRowCount ?? 0,
        importFormatVersion
      );
      const batchId = existing?.id ?? Number(batchInfo?.lastInsertRowid);

      const trialStmt = this.db.prepare(`
        INSERT INTO trials (
          id, import_batch_id, source_row, p_accession, source_accession,
          species, family, treatment, num, start_date, propagule_type, propagule_type_raw,
          propagule_type_canonical, ttd, pc, pc_raw, pc_scale,
          ced, wsed, csed, liner_start, liner_ttd, lpc, lpc_raw, lpc_scale, four_start,
          four_ttd, four_pc, four_pc_raw, four_pc_scale, location, status, pcd, notes,
          treatment_components_json, analysis_eligibility, validation_warnings_json, cohort,
          raw_cell_values_json, normalized_cell_values_json, replicate_classification
        ) VALUES (
          @id, @importBatchId, @sourceRow, @pAccession, @sourceAccession,
          @species, @family, @treatment, @num, @startDate, @propaguleType, @propaguleTypeRaw,
          @propaguleTypeCanonical, @ttd, @pc, @pcRaw, @pcScale,
          @ced, @wsed, @csed, @linerStart, @linerTtd, @lpc, @lpcRaw, @lpcScale, @fourStart,
          @fourTtd, @fourPc, @fourPcRaw, @fourPcScale, @location, @status, @pcd, @notes,
          @treatmentComponentsJson, @analysisEligibility, @validationWarningsJson, @cohort,
          @rawCellValuesJson, @normalizedCellValuesJson, @replicateClassification
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
          propaguleTypeRaw: trial.propaguleTypeRaw ?? trial.propaguleType,
          propaguleTypeCanonical: trial.propaguleTypeCanonical ?? "unknown",
          treatmentComponentsJson: JSON.stringify(trial.treatmentComponents),
          analysisEligibility: trial.analysisEligibility ?? "eligible",
          validationWarningsJson: JSON.stringify(trial.validationWarnings ?? []),
          cohort: trial.cohort ?? null
          ,rawCellValuesJson: JSON.stringify(trial.rawCellValues ?? {})
          ,normalizedCellValuesJson: JSON.stringify(trial.normalizedCellValues ?? {})
          ,replicateClassification: trial.replicateClassification ?? "unique"
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

      const quarantineStmt = this.db.prepare(
        `INSERT INTO import_quarantine (
          import_batch_id, source_row, worksheet_name, reasons_json, row_json
        ) VALUES (?, ?, ?, ?, ?)`
      );
      for (const row of result.quarantinedRows ?? []) {
        quarantineStmt.run(
          batchId,
          row.sourceRow,
          row.worksheetName,
          JSON.stringify(row.reasons),
          JSON.stringify(row)
        );
      }

      if (!replacing) {
        const scopeId = Number(
          this.db
            .prepare("INSERT INTO analysis_scopes (name, created_at) VALUES (?, ?)")
            .run(result.batch.filename, result.batch.importedAt).lastInsertRowid
        );
        this.db
          .prepare("INSERT INTO analysis_scope_batches (scope_id, import_batch_id) VALUES (?, ?)")
          .run(scopeId, batchId);
        const active = this.db.prepare("SELECT value FROM app_state WHERE key = 'active_scope_id'").get();
        if (!active) {
          this.db
            .prepare("INSERT INTO app_state (key, value) VALUES ('active_scope_id', ?)")
            .run(String(scopeId));
        }
      }

    return batchId;
  }

  saveImport(result: ImportResult): DashboardData {
    const batchId = this.db.transaction(() => {
      const id = this.saveImportUnsafe(result);
      this.refreshTreatmentEligibilityUnsafe();
      return id;
    })();
    return this.getDashboard(batchId);
  }

  saveImports(results: ImportResult[]): DashboardData {
    if (!results.length) throw new Error("No workbook previews were selected.");
    this.db.transaction(() => {
      results.forEach((result) => this.saveImportUnsafe(result));
      this.refreshTreatmentEligibilityUnsafe();
    })();
    return this.getActiveDashboard();
  }

  getTreatmentCodebook(): TreatmentCodebookEntry[] {
    return (
      this.db
        .prepare(
          `SELECT id, version, propagule_type, token, label, meaning, active, built_in
           FROM treatment_codebook ORDER BY version, propagule_type, token`
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: Number(row.id),
      version: Number(row.version),
      propaguleType: row.propagule_type as TreatmentCodebookEntry["propaguleType"],
      token: textValue(row.token),
      label: textValue(row.label),
      meaning: textValue(row.meaning),
      active: Boolean(row.active),
      builtIn: Boolean(row.built_in)
    }));
  }

  saveTreatmentCodebookEntry(entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">): TreatmentCodebookEntry[] {
    this.db.transaction(() => {
      const version = Number(
        (this.db.prepare("SELECT COALESCE(MAX(version), 1) AS version FROM treatment_codebook").get() as { version: number })
          .version
      ) + 1;
      this.db
        .prepare(
          `INSERT INTO treatment_codebook (
            version, propagule_type, token, label, meaning, active, built_in
          ) VALUES (?, ?, ?, ?, ?, ?, 0)`
        )
        .run(
          version,
          entry.propaguleType,
          entry.token.trim().toUpperCase(),
          entry.label.trim(),
          entry.meaning.trim(),
          entry.active ? 1 : 0
        );
      this.refreshTreatmentEligibilityUnsafe();
    })();
    return this.getTreatmentCodebook();
  }

  getTreatmentCodebookHash(): string {
    const entries = this.getTreatmentCodebook().map((entry) => ({
      version: entry.version,
      propaguleType: entry.propaguleType,
      token: entry.token,
      label: entry.label,
      meaning: entry.meaning,
      active: entry.active,
      builtIn: entry.builtIn
    }));
    return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  }

  private scopeFromRow(row: { id: number; name: string; created_at: string }): AnalysisScope {
    const batches = this.db
      .prepare(
        `SELECT b.id, b.workbook_hash, b.import_format_version
         FROM analysis_scope_batches sb
         JOIN import_batches b ON b.id = sb.import_batch_id
         WHERE sb.scope_id = ?
         ORDER BY b.id`
      )
      .all(row.id) as Array<{ id: number; workbook_hash: string; import_format_version: number | null }>;
    const hashes = batches.map((batch) => batch.workbook_hash);
    const importVersions = batches.map((batch) => ({
      batchId: batch.id,
      workbookHash: batch.workbook_hash,
      importFormatVersion: batch.import_format_version ?? 1
    }));
    const codebookHash = this.getTreatmentCodebookHash();
    return {
      id: row.id,
      name: row.name,
      batchIds: batches.map((batch) => batch.id),
      workbookHashes: hashes,
      importVersions,
      requiresReprocessing: importVersions.some(
        (batch) => batch.importFormatVersion < WORKBOOK_IMPORT_FORMAT_VERSION
      ),
      scopeHash: createHash("sha256")
        .update(importVersions
          .map((batch) => `${batch.workbookHash}@${batch.importFormatVersion}`)
          .sort()
          .join("|"))
        .update("|")
        .update(codebookHash)
        .digest("hex"),
      codebookHash,
      codebookVersion: this.getTreatmentCodebookVersion(),
      isCombined: batches.length > 1,
      createdAt: row.created_at
    };
  }

  getDatasetState(): DatasetState {
    const sourceRows = this.db
      .prepare(
        `SELECT s.*,
          (SELECT id FROM import_batches b WHERE b.source_id = s.id ORDER BY b.id DESC LIMIT 1) AS latest_batch_id,
          (SELECT workbook_hash FROM import_batches b WHERE b.source_id = s.id ORDER BY b.id DESC LIMIT 1) AS latest_hash
         FROM workbook_sources s ORDER BY s.label`
      )
      .all() as Array<Record<string, unknown>>;
    const sources = sourceRows.map((row) => ({
      id: Number(row.id),
      label: textValue(row.label),
      canonicalPath: textValue(row.canonical_path),
      createdAt: textValue(row.created_at),
      lastSeenAt: nullableText(row.last_seen_at),
      latestBatchId: numberOrNull(row.latest_batch_id),
      latestWorkbookHash: nullableText(row.latest_hash),
        // File availability is checked asynchronously in Electron main so a
        // disconnected Drive or network path cannot block SQLite state reads.
        available: !textValue(row.canonical_path).startsWith("legacy://")
    }));
    const scopes = (
      this.db.prepare("SELECT id, name, created_at FROM analysis_scopes ORDER BY id DESC").all() as Array<{
        id: number;
        name: string;
        created_at: string;
      }>
    ).map((row) => this.scopeFromRow(row));
    const active = this.db.prepare("SELECT value FROM app_state WHERE key = 'active_scope_id'").get() as
      | { value: string }
      | undefined;
    return {
      sources,
      scopes,
      activeScopeId: active ? Number(active.value) : null
    };
  }

  relinkSource(sourceId: number, canonicalPath: string, label: string): DatasetState {
    const source = this.db.prepare("SELECT id FROM workbook_sources WHERE id = ?").get(sourceId);
    if (!source) throw new Error("Workbook source was not found.");
    const collision = this.db
      .prepare("SELECT id FROM workbook_sources WHERE canonical_path = ? AND id <> ?")
      .get(canonicalPath, sourceId);
    if (collision) throw new Error("That file is already registered as another workbook source.");
    this.db
      .prepare("UPDATE workbook_sources SET canonical_path = ?, label = ?, last_seen_at = ? WHERE id = ?")
      .run(canonicalPath, label, new Date().toISOString(), sourceId);
    return this.getDatasetState();
  }

  createScope(name: string, batchIds: number[]): AnalysisScope {
    const uniqueBatchIds = [...new Set(batchIds)];
    if (!uniqueBatchIds.length) throw new Error("Select at least one workbook version.");
    const sourceRows = this.db
      .prepare(
        `SELECT id, source_id FROM import_batches WHERE id IN (${uniqueBatchIds.map(() => "?").join(",")})`
      )
      .all(...uniqueBatchIds) as Array<{ id: number; source_id: number | null }>;
    if (sourceRows.length !== uniqueBatchIds.length) throw new Error("One or more workbook versions no longer exist.");
    const sourceIds = sourceRows.map((row) => row.source_id).filter((id): id is number => id !== null);
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error("An analysis scope can contain only one version of each workbook source.");
    }
    if (uniqueBatchIds.length > 1) {
      const overlap = this.db
        .prepare(
          `SELECT p_accession, source_accession, species, propagule_type_canonical, COUNT(DISTINCT import_batch_id) AS batches
           FROM trials
           WHERE import_batch_id IN (${uniqueBatchIds.map(() => "?").join(",")})
           GROUP BY p_accession, source_accession, species, propagule_type_canonical
           HAVING batches > 1
           LIMIT 1`
        )
        .get(...uniqueBatchIds);
      if (overlap) throw new Error("Selected workbook versions contain overlapping trial keys; resolve the overlap first.");
    }
    const insert = this.db.prepare(
      "INSERT INTO analysis_scope_batches (scope_id, import_batch_id) VALUES (?, ?)"
    );
    const scopeId = this.db.transaction(() => {
      const id = Number(
        this.db
          .prepare("INSERT INTO analysis_scopes (name, created_at) VALUES (?, ?)")
          .run(name.trim() || "Combined analysis", new Date().toISOString()).lastInsertRowid
      );
      uniqueBatchIds.forEach((batchId) => insert.run(id, batchId));
      return id;
    })();
    return this.scopeFromRow(
      this.db.prepare("SELECT id, name, created_at FROM analysis_scopes WHERE id = ?").get(scopeId) as {
        id: number;
        name: string;
        created_at: string;
      }
    );
  }

  setActiveScope(scopeId: number): DashboardData {
    const scope = this.db.prepare("SELECT id FROM analysis_scopes WHERE id = ?").get(scopeId);
    if (!scope) throw new Error("Analysis scope was not found.");
    this.db
      .prepare(
        `INSERT INTO app_state (key, value) VALUES ('active_scope_id', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(String(scopeId));
    return this.getDashboardForScope(scopeId);
  }

  getActiveDashboard(): DashboardData {
    const active = this.getDatasetState().activeScopeId;
    return active ? this.getDashboardForScope(active) : this.getDashboard();
  }

  getTrialsForScope(scopeId?: number): TrialRecord[] {
    const resolvedScopeId = scopeId ?? this.getDatasetState().activeScopeId;
    if (!resolvedScopeId) return [];
    const scopeRow = this.db
      .prepare("SELECT id, name, created_at FROM analysis_scopes WHERE id = ?")
      .get(resolvedScopeId) as { id: number; name: string; created_at: string } | undefined;
    if (!scopeRow) return [];
    const batchIds = this.scopeFromRow(scopeRow).batchIds;
    if (!batchIds.length) return [];
    const placeholders = batchIds.map(() => "?").join(",");
    return (
      this.db
        .prepare(
          `SELECT t.*, b.filename AS source_filename, b.workbook_hash, b.source_id, b.worksheet_name
           FROM trials t JOIN import_batches b ON b.id = t.import_batch_id
           WHERE t.import_batch_id IN (${placeholders}) ORDER BY t.import_batch_id, t.source_row`
        )
        .all(...batchIds) as Array<Record<string, unknown>>
    ).map((row) => ({
      ...trialFromRow(row),
      sourceId: numberOrNull(row.source_id) ?? undefined,
      sourceFilename: nullableText(row.source_filename) ?? undefined,
      sourceWorksheet: nullableText(row.worksheet_name) ?? undefined,
      workbookHash: nullableText(row.workbook_hash) ?? undefined
    }));
  }

  getTreatmentCodebookVersion(): number {
    return Number(
      (this.db.prepare("SELECT COALESCE(MAX(version), 1) AS version FROM treatment_codebook").get() as { version: number })
        .version
    );
  }

  getImportFormatVersionByHash(workbookHash: string): number | null {
    const row = this.db
      .prepare("SELECT import_format_version FROM import_batches WHERE workbook_hash = ? ORDER BY id DESC LIMIT 1")
      .get(workbookHash) as { import_format_version: number | null } | undefined;
    return row?.import_format_version ?? null;
  }

  getDashboardForScope(scopeId: number): DashboardData {
    const scopeRow = this.db
      .prepare("SELECT id, name, created_at FROM analysis_scopes WHERE id = ?")
      .get(scopeId) as { id: number; name: string; created_at: string } | undefined;
    if (!scopeRow) return buildDashboardData([], [], null);
    const scope = this.scopeFromRow(scopeRow);
    const placeholders = scope.batchIds.map(() => "?").join(",");
    const batchRows = this.db
      .prepare(`SELECT * FROM import_batches WHERE id IN (${placeholders}) ORDER BY id`)
      .all(...scope.batchIds) as BatchRow[];
    const trialRows = this.db
      .prepare(
        `SELECT t.*, b.filename AS source_filename, b.workbook_hash, b.source_id, b.worksheet_name
         FROM trials t JOIN import_batches b ON b.id = t.import_batch_id
         WHERE t.import_batch_id IN (${placeholders}) ORDER BY t.import_batch_id, t.source_row`
      )
      .all(...scope.batchIds) as Array<Record<string, unknown>>;
    const observationRows = this.db
      .prepare(
        `SELECT * FROM observations WHERE import_batch_id IN (${placeholders})
         ORDER BY import_batch_id, id`
      )
      .all(...scope.batchIds) as Array<Record<string, unknown>>;
    const issueRows = this.db
      .prepare(
        `SELECT * FROM data_quality_issues WHERE import_batch_id IN (${placeholders})
         ORDER BY import_batch_id, id`
      )
      .all(...scope.batchIds) as Array<Record<string, unknown>>;
    const trials = trialRows.map((row) => ({
      ...trialFromRow(row),
      sourceId: numberOrNull(row.source_id) ?? undefined,
      sourceFilename: nullableText(row.source_filename) ?? undefined,
      sourceWorksheet: nullableText(row.worksheet_name) ?? undefined,
      workbookHash: nullableText(row.workbook_hash) ?? undefined
    }));
    const dashboard = buildDashboardData(
      trials,
      observationRows.map(observationFromRow),
      batchRows.length === 1 ? batchSummaryFromRow(batchRows[0]) : batchSummaryFromRow(batchRows[batchRows.length - 1]),
      issueRows.map(issueFromRow),
      []
    );
    return { ...dashboard, batches: batchRows.map(batchSummaryFromRow), scope };
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
    const quarantineRows = this.db
      .prepare("SELECT * FROM import_quarantine WHERE import_batch_id = ? ORDER BY source_row")
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
      issues: issueRows.map(issueFromRow),
      quarantinedRows: quarantineRows.map<QuarantinedRow>((row) => {
        const payload = parseJson<Partial<QuarantinedRow>>(row.row_json, {});
        return {
          sourceRow: Number(row.source_row),
          worksheetName: textValue(row.worksheet_name),
          reasons: parseJson<string[]>(row.reasons_json, []),
          pAccession: payload.pAccession ?? null,
          sourceAccession: payload.sourceAccession ?? null,
          species: payload.species ?? null,
          treatment: payload.treatment ?? null,
          rawCellValues: payload.rawCellValues ?? {}
        };
      })
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

  getAskContextForScope(scopeId?: number): AskContext {
    const resolvedScopeId = scopeId ?? this.getDatasetState().activeScopeId;
    if (!resolvedScopeId) return this.getAskContext();
    const dashboard = this.getDashboardForScope(resolvedScopeId);
    const batchIds = dashboard.scope?.batchIds ?? [];
    if (!batchIds.length) return { dashboard, trials: [], observations: [] };
    const placeholders = batchIds.map(() => "?").join(",");
    const trials = this.db
      .prepare(
        `SELECT source_row, p_accession, source_accession, species, family, treatment, num, pc, lpc,
          four_pc, status, notes
         FROM trials
         WHERE import_batch_id IN (${placeholders})
         ORDER BY species, import_batch_id, source_row
         LIMIT 220`
      )
      .all(...batchIds) as Array<Record<string, unknown>>;
    const observations = this.db
      .prepare(
        `SELECT source_row, kind, value, observed_date, raw_snippet
         FROM observations
         WHERE import_batch_id IN (${placeholders})
         ORDER BY import_batch_id, source_row, id
         LIMIT 260`
      )
      .all(...batchIds) as Array<Record<string, unknown>>;
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
