import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { parseObservationsFromTrial } from "./notes";
import { parseTreatment } from "./treatments";
import type {
  DataQualityIssue,
  ImportResult,
  WorkbookCandidate,
  PropaguleType,
  PropagationScoreScale,
  QuarantinedRow,
  TreatmentCodebookEntry,
  TrialRecord
} from "./types";

export const REQUIRED_HEADERS = [
  "P_Accession",
  "Source_Accession",
  "Species",
  "Trt",
  "Num",
  "Start",
  "PT",
  "TTD",
  "PC"
];

const TrialStatusSchema = z.union([z.literal("D"), z.literal("ND")]).nullable();
const HEADER_ALIAS_GROUPS: Array<[string, string[]]> = [
    ["P_Accession", ["P Accession", "Propagation Accession", "PAccession", "P Acc"]],
    ["Source_Accession", ["Source Accession", "Source", "Seed Bank Accession", "S Accession", "UorSBacc"]],
    ["Species", ["Taxon", "Scientific Name", "Species Name"]],
    ["Family", ["Plant Family", "Taxon Family"]],
    ["Trt", ["Treatment", "Treatments", "Treatment String"]],
    ["Num", ["Number", "Count", "N"]],
    ["Start", ["Start Date", "Sown", "Sow Date"]],
    ["PT", ["Propagule Type", "Prop Type"]],
    ["TTD", ["Done Date", "Trial Done"]],
    ["PC", ["Propagation Class", "Propagation Score"]],
    ["CED", ["CeD", "Control End Date"]],
    ["WSED", ["WSeD", "Warm Stratification End Date"]],
    ["CSED", ["CSeD", "Cold Stratification End Date"]],
    ["LS", ["Liner Start"]],
    ["LTTD", ["Liner TTD"]],
    ["LPC", ["Liner Propagation Class", "Liner Score"]],
    ["4S", ["4 Start"]],
    ["4TTD", ["4 TTD"]],
    ["4PC", ["4 Propagation Class", "4 Score"]],
    ["Location", ["L(R:C|Z)", "L(R:C|G)", "L(R:C;Z)", "Location"]],
    ["Status", ["D|ND", "D/ND", "Status"]],
    ["PCD", ["Propagation Class Data"]],
    ["NOTES", ["Notes"]]
  ];

const HEADER_SYNONYMS = new Map<string, string>(
  HEADER_ALIAS_GROUPS.flatMap(([canonical, aliases]) =>
    [canonical, ...aliases].flatMap((alias) => [
      [alias, canonical],
      [normalizeHeader(alias), canonical]
    ])
  )
);

function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function canonicalHeader(header: unknown): string {
  const text = stringValue(header) ?? "";
  return HEADER_SYNONYMS.get(text) ?? HEADER_SYNONYMS.get(normalizeHeader(text)) ?? text;
}

function canonicalHeaderWithAliases(header: unknown, aliases: Record<string, string>): string {
  const text = stringValue(header) ?? "";
  const alias = aliases[text] ?? aliases[normalizeHeader(text)];
  if (alias && HEADER_ALIAS_GROUPS.some(([canonical]) => normalizeHeader(canonical) === normalizeHeader(alias))) {
    return alias;
  }
  return canonicalHeader(text);
}

function valueFromCell(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result?: unknown }).result ?? null;
  }
  return value;
}

function extractText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value) return extractText((value as { text?: unknown }).text);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { text?: unknown }) => extractText(part.text)).join("");
    }
    if ("result" in value) return extractText((value as { result?: unknown }).result);
  }
  return String(value);
}

function stringValue(value: unknown): string | null {
  const text = extractText(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

interface ParsedPropagationScore {
  value: number | null;
  raw: number | null;
  scale: PropagationScoreScale | null;
}

export function parsePropagationScore(value: unknown): ParsedPropagationScore {
  const raw = numberValue(value);
  if (raw === null) return { value: null, raw: null, scale: null };
  if (raw < 0 || raw > 100) return { value: null, raw, scale: "invalid" };
  if (raw <= 5) return { value: raw, raw, scale: "ordinal_0_5" };

  const normalized = normalizePercentageScore(raw);
  return { value: normalized, raw, scale: "percent_0_100" };
}

function normalizePercentageScore(raw: number): number {
  if (raw === 0) return 0;
  return raw <= 10 ? 1 : raw <= 25 ? 2 : raw <= 50 ? 3 : raw <= 75 ? 4 : 5;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const maxYear = new Date().getFullYear() + 2;
  if (year < 1990 || year > maxYear || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function dateFromString(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\b|T|\s)/);
  if (iso) return formatDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\b|\s)/);
  if (slash) {
    const rawYear = Number(slash[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return formatDateParts(year, Number(slash[1]), Number(slash[2]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateParts(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function dateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return dateFromString(epoch.toISOString());
  }
  return dateFromString(String(value));
}

function statusValue(value: unknown): "D" | "ND" | null {
  const parsed = TrialStatusSchema.safeParse(stringValue(value));
  return parsed.success ? parsed.data : null;
}

function get(row: Map<string, unknown>, ...headers: string[]): unknown {
  for (const header of headers) {
    const value = row.get(normalizeHeader(header));
    if (value !== undefined) return value;
  }
  return null;
}

export interface WorkbookHeaderProfile {
  worksheetName: string;
  headers: string[];
  missingHeaders: string[];
}

export interface ImportWorkbookOptions {
  headerAliases?: Record<string, string>;
  worksheetName?: string;
  codebook?: TreatmentCodebookEntry[];
  sourceId?: number;
  sourcePath?: string;
}

function canonicalPropaguleType(value: unknown): { raw: string | null; canonical: PropaguleType } {
  const raw = stringValue(value);
  const token = raw?.trim().toLowerCase() ?? "";
  if (token === "s" || token === "seed") return { raw, canonical: "seed" };
  if (token === "sc" || token === "cs" || token === "stem cutting" || token === "cutting") {
    return { raw, canonical: "stem_cutting" };
  }
  if (token === "d" || token === "division") return { raw, canonical: "division" };
  return { raw, canonical: "unknown" };
}

function cohortFromAccession(accession: string, startDate: string | null): string | null {
  const match = accession.match(/(?:19|20)\d{2}/);
  return match?.[0] ?? startDate?.slice(0, 4) ?? null;
}

function buildTrial(
  row: Map<string, unknown>,
  sourceRow: number,
  worksheetName: string,
  workbookHash: string,
  options: ImportWorkbookOptions
): TrialRecord | null {
  const pAccession = stringValue(get(row, "P_Accession"));
  const sourceAccession = stringValue(get(row, "Source_Accession"));
  const species = stringValue(get(row, "Species"));
  const family = stringValue(get(row, "Family", "Plant Family", "Taxon Family"));
  const treatment = stringValue(get(row, "Trt"));

  if (!pAccession && !sourceAccession && !species && !treatment) return null;
  if (!pAccession || !species || !treatment) return null;

  const pc = parsePropagationScore(get(row, "PC"));
  const lpc = parsePropagationScore(get(row, "LPC"));
  const fourPc = parsePropagationScore(get(row, "4PC"));
  const startDate = dateValue(get(row, "Start"));
  const propagule = canonicalPropaguleType(get(row, "PT"));
  const treatmentComponents = parseTreatment(treatment, propagule.canonical, options.codebook ?? []);
  const validationWarnings = [...treatmentComponents.warnings];

  const trial: TrialRecord = {
    id: `${pAccession}:${treatment}:${sourceRow}`,
    sourceRow,
    sourceId: options.sourceId,
    sourceFilename: path.basename(options.sourcePath ?? ""),
    sourceWorksheet: worksheetName,
    workbookHash,
    pAccession,
    sourceAccession: sourceAccession ?? "",
    species,
    family,
    treatment,
    num: numberValue(get(row, "Num")),
    startDate,
    propaguleType: propagule.raw,
    propaguleTypeRaw: propagule.raw,
    propaguleTypeCanonical: propagule.canonical,
    ttd: dateValue(get(row, "TTD")),
    pc: pc.value,
    pcRaw: pc.raw,
    pcScale: pc.scale,
    ced: dateValue(get(row, "CED", "CeD")),
    wsed: dateValue(get(row, "WSED")),
    csed: dateValue(get(row, "CSED", "CSeD")),
    linerStart: dateValue(get(row, "LS")),
    linerTtd: dateValue(get(row, "LTTD")),
    lpc: lpc.value,
    lpcRaw: lpc.raw,
    lpcScale: lpc.scale,
    fourStart: dateValue(get(row, "4S")),
    fourTtd: dateValue(get(row, "4TTD")),
    fourPc: fourPc.value,
    fourPcRaw: fourPc.raw,
    fourPcScale: fourPc.scale,
    location: stringValue(get(row, "Location")),
    status: statusValue(get(row, "Status")),
    pcd: stringValue(get(row, "PCD")),
    notes: stringValue(get(row, "NOTES", "Notes")),
    treatmentComponents,
    analysisEligibility: treatmentComponents.warnings.length ? "descriptive_only" : "eligible",
    validationWarnings,
    cohort: cohortFromAccession(pAccession, startDate),
    rawCellValues: Object.fromEntries(
      [...row.entries()].map(([header, value]) => [
        header,
        typeof value === "number" || typeof value === "boolean" ? value : stringValue(value)
      ])
    ),
    normalizedCellValues: {
      pAccession,
      sourceAccession: sourceAccession ?? null,
      species,
      family,
      treatment,
      startDate,
      propaguleType: propagule.canonical,
      status: statusValue(get(row, "Status")),
      pc: pc.value,
      lpc: lpc.value,
      fourPc: fourPc.value
    },
    replicateClassification: "unique"
  };
  for (const [label, raw, parsed] of [
    ["Start", get(row, "Start"), trial.startDate],
    ["TTD", get(row, "TTD"), trial.ttd],
    ["CED", get(row, "CED"), trial.ced],
    ["WSED", get(row, "WSED"), trial.wsed],
    ["CSED", get(row, "CSED"), trial.csed],
    ["LS", get(row, "LS"), trial.linerStart],
    ["LTTD", get(row, "LTTD"), trial.linerTtd],
    ["4S", get(row, "4S"), trial.fourStart],
    ["4TTD", get(row, "4TTD"), trial.fourTtd]
  ] as const) {
    if (raw !== null && raw !== undefined && raw !== "" && parsed === null) {
      trial.validationWarnings?.push(`Invalid or implausible ${label} date`);
    }
  }
  for (const [startLabel, start, outcomeLabel, outcome] of [
    ["Start", trial.startDate, "TTD", trial.ttd],
    ["LS", trial.linerStart, "LTTD", trial.linerTtd],
    ["4S", trial.fourStart, "4TTD", trial.fourTtd]
  ] as const) {
    if (start && outcome && outcome < start) {
      trial.validationWarnings?.push(`${outcomeLabel} is earlier than ${startLabel}`);
    }
  }
  return trial;
}

function dataQualityFromTrials(trials: TrialRecord[]): DataQualityIssue[] {
  const missingPtRows = trials.filter((trial) => trial.propaguleTypeCanonical === "unknown");
  const missingSourceRows = trials.filter((trial) => !trial.sourceAccession);
  const unmappedTokenRows = trials.filter((trial) => trial.treatmentComponents.warnings.length);
  const invalidDateRows = trials.filter((trial) =>
    trial.validationWarnings?.some((warning) => warning.includes("date"))
  );
  const ambiguousDuplicateRows = trials.filter((trial) => trial.replicateClassification === "ambiguous_duplicate");
  const sourceRows = (rows: TrialRecord[]) => [...new Set(rows.map((trial) => trial.sourceRow))].sort((a, b) => a - b);
  const species = (rows: TrialRecord[]) => [...new Set(rows.map((trial) => trial.species))].sort();
  const treatments = (rows: TrialRecord[]) => [...new Set(rows.map((trial) => trial.treatment))].sort();
  const issues: DataQualityIssue[] = [];
  const scoreFields = [
    { metric: "PC", scale: "pcScale" },
    { metric: "LPC", scale: "lpcScale" },
    { metric: "4PC", scale: "fourPcScale" }
  ] as const;

  for (const field of scoreFields) {
    const invalidRows = trials.filter((trial) => trial[field.scale] === "invalid");
    if (invalidRows.length) {
      issues.push({
        id: `invalid-${field.metric.toLowerCase()}-score`,
        severity: "high",
        category: "fix_first",
        title: `Invalid ${field.metric} score`,
        detail: `${field.metric} must be an ordinal class from 0-5 or an exact percentage from 0-100. Invalid values were retained as raw data but excluded from analysis.`,
        impact: "Out-of-range scores can distort treatment rankings and paired effects.",
        action: `Correct the ${field.metric} value or document it as missing before interpreting the affected rows.`,
        affectedRows: invalidRows.length,
        sourceRows: sourceRows(invalidRows),
        species: species(invalidRows),
        treatments: treatments(invalidRows),
        metric: field.metric
      });
    }

    const percentageRows = trials.filter((trial) => trial[field.scale] === "percent_0_100");
    const ambiguousRows = trials.filter((trial) => trial[field.scale] === "ambiguous");
    if (ambiguousRows.length) {
      issues.push({
        id: `ambiguous-${field.metric.toLowerCase()}-scale`,
        severity: "high",
        category: "codebook",
        title: `Ambiguous ${field.metric} score scale`,
        detail: `This endpoint mixes percentages with values from 1-5. Those low values cannot be classified safely without an explicit scale and were excluded from calculations.`,
        impact: "Treating a low percentage as an ordinal class can materially reverse treatment effects.",
        action: `Supply an explicit ${field.metric} scale in the source data or normalize the values, then import a new version.`,
        affectedRows: ambiguousRows.length,
        sourceRows: sourceRows(ambiguousRows),
        species: species(ambiguousRows),
        treatments: treatments(ambiguousRows),
        metric: field.metric
      });
    }
    if (percentageRows.length) {
      issues.push({
        id: `normalized-${field.metric.toLowerCase()}-percentages`,
        severity: "low",
        category: "codebook",
        title: `${field.metric} percentages normalized for comparison`,
        detail: `Values above 5 were treated as exact percentages for that row. Raw values were preserved and mapped to the documented 0-5 propagation classes for analysis.`,
        impact: "Normalized values are comparable in the dashboard, while raw percentages remain available for audit.",
        action: `Confirm whether future ${field.metric} columns use ordinal classes, exact percentages, or an explicit scale column.`,
        affectedRows: percentageRows.length,
        sourceRows: sourceRows(percentageRows),
        species: species(percentageRows),
        treatments: treatments(percentageRows),
        metric: field.metric
      });
    }
  }
  if (missingSourceRows.length) {
    issues.push({
      id: "missing-source-accession",
      severity: "medium",
      category: "fix_first",
      title: "Missing source accession",
      detail: "Rows without Source_Accession are retained, but provenance should be reviewed before broad conclusions.",
      impact: "Provenance gaps make accession-level pairing and repeatability checks weaker.",
      action: "Backfill source accession or mark the row as provenance-limited in review notes.",
      affectedRows: missingSourceRows.length,
      sourceRows: sourceRows(missingSourceRows),
      species: species(missingSourceRows),
      treatments: treatments(missingSourceRows),
      metric: "Source_Accession"
    });
  }
  if (missingPtRows.length) {
    issues.push({
      id: "missing-propagule-type",
      severity: "low",
      category: "fix_first",
      title: "Missing propagule type",
      detail: "A missing PT value limits future support for cutting/division workflows.",
      impact: "Propagation type gaps make mixed seed, cutting, and division workflows harder to separate later.",
      action: "Fill PT where available, especially before comparing unlike propagation methods.",
      affectedRows: missingPtRows.length,
      sourceRows: sourceRows(missingPtRows),
      species: species(missingPtRows),
      treatments: treatments(missingPtRows),
      metric: "PT"
    });
  }
  if (unmappedTokenRows.length) {
    issues.push({
      id: "unmapped-treatment-tokens",
      severity: "medium",
      category: "codebook",
      title: "Unmapped treatment tokens",
      detail: "Some treatment strings contain tokens outside the current parser vocabulary.",
      impact: "Unknown treatment codes can split equivalent protocols or hide meaningful treatment components.",
      action: "Review the treatment codebook and add aliases only when the lab meaning is confirmed.",
      affectedRows: unmappedTokenRows.length,
      sourceRows: sourceRows(unmappedTokenRows),
      species: species(unmappedTokenRows),
      treatments: treatments(unmappedTokenRows),
      metric: "Trt"
    });
  }
  if (invalidDateRows.length) {
    issues.push({
      id: "invalid-or-out-of-order-dates",
      severity: "high",
      category: "fix_first",
      title: "Invalid or inconsistent dates",
      detail: "Raw date values were retained, but implausible or out-of-order dates were excluded from date analysis.",
      impact: "Bad dates can create false cohorts, misleading trial durations, and incorrect follow-up ordering.",
      action: "Correct the source workbook date and re-import a new immutable version.",
      affectedRows: invalidDateRows.length,
      sourceRows: sourceRows(invalidDateRows),
      species: species(invalidDateRows),
      treatments: treatments(invalidDateRows),
      metric: "Dates"
    });
  }
  if (ambiguousDuplicateRows.length) {
    issues.push({
      id: "ambiguous-duplicate-rows",
      severity: "high",
      category: "fix_first",
      title: "Ambiguous duplicate rows",
      detail: "Exact repeated treatment records were retained but excluded from formal inference until classified.",
      impact: "Counting accidental copies as replicates would understate uncertainty.",
      action: "Confirm whether each repeated row is a genuine replicate, correct the source, and import a new version.",
      affectedRows: ambiguousDuplicateRows.length,
      sourceRows: sourceRows(ambiguousDuplicateRows),
      species: species(ambiguousDuplicateRows),
      treatments: treatments(ambiguousDuplicateRows),
      metric: "Duplicates"
    });
  }
  return issues;
}

function populatedRows(worksheet: ExcelJS.Worksheet): number {
  let count = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
    if (values.some((value: unknown) => stringValue(value) !== null)) count += 1;
  }
  return count;
}

function workbookCandidates(workbook: ExcelJS.Workbook): Array<{
  worksheet: ExcelJS.Worksheet;
  headers: string[];
  missingHeaders: string[];
  populatedRows: number;
  headerCoverage: number;
}> {
  return workbook.worksheets
    .map((worksheet) => {
      const headers = readHeaders(worksheet);
      const missingHeaders = missingRequiredHeaders(headers);
      return {
        worksheet,
        headers,
        missingHeaders,
        populatedRows: populatedRows(worksheet),
        headerCoverage: REQUIRED_HEADERS.length - missingHeaders.length
      };
    })
    .filter((candidate) => candidate.headerCoverage >= 3)
    .sort(
      (left, right) =>
        right.headerCoverage - left.headerCoverage ||
        right.populatedRows - left.populatedRows ||
        left.worksheet.name.localeCompare(right.worksheet.name)
    );
}

async function openWorkbook(
  filePath: string,
  requestedWorksheet?: string
): Promise<{
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  candidates: ReturnType<typeof workbookCandidates>;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const candidates = workbookCandidates(workbook);
  const worksheet = requestedWorksheet
    ? candidates.find((candidate) => candidate.worksheet.name === requestedWorksheet)?.worksheet
    : candidates[0]?.worksheet;
  if (!worksheet) {
    throw new Error("No propagation accession worksheet found.");
  }
  return { workbook, worksheet, candidates };
}

function readHeaders(worksheet: ExcelJS.Worksheet, aliases: Record<string, string> = {}): string[] {
  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = canonicalHeaderWithAliases(valueFromCell(cell), aliases);
  });
  return headers;
}

function missingRequiredHeaders(headers: string[]): string[] {
  return REQUIRED_HEADERS.filter(
    (required) => !headers.some((header) => normalizeHeader(header) === normalizeHeader(required))
  );
}

export async function inspectWorkbookHeaders(filePath: string): Promise<WorkbookHeaderProfile> {
  const { worksheet } = await openWorkbook(filePath);
  const headers = readHeaders(worksheet);
  return {
    worksheetName: worksheet.name,
    headers: headers.filter(Boolean),
    missingHeaders: missingRequiredHeaders(headers)
  };
}

export async function importWorkbook(filePath: string, options: ImportWorkbookOptions = {}): Promise<ImportResult> {
  const buffer = await readFile(filePath);
  const workbookHash = createHash("sha256").update(buffer).digest("hex");
  const { worksheet } = await openWorkbook(filePath, options.worksheetName);

  const headers = readHeaders(worksheet, options.headerAliases ?? {});

  const missingHeaders = missingRequiredHeaders(headers);

  const trials: TrialRecord[] = [];
  const quarantinedRows: QuarantinedRow[] = [];
  let populatedRowCount = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const mapped = new Map<string, unknown>();
    headers.forEach((header, index) => {
      if (!header) return;
      mapped.set(normalizeHeader(header), valueFromCell(row.getCell(index)));
    });
    const pAccession = stringValue(get(mapped, "P_Accession"));
    const sourceAccession = stringValue(get(mapped, "Source_Accession"));
    const species = stringValue(get(mapped, "Species"));
    const treatment = stringValue(get(mapped, "Trt"));
    if (![pAccession, sourceAccession, species, treatment].some(Boolean)) continue;
    populatedRowCount += 1;
    const malformedSpecies = Boolean(species) && (species!.length < 3 || !/[A-Za-z]/.test(species!) || species === "[object Object]");
    const reasons = [
      !pAccession ? "Missing propagation accession" : null,
      !species ? "Missing species" : null,
      malformedSpecies ? "Malformed species" : null,
      !treatment ? "Missing treatment" : null
    ].filter((reason): reason is string => Boolean(reason));
    if (reasons.length) {
      quarantinedRows.push({
        sourceRow: rowNumber,
        worksheetName: worksheet.name,
        reasons,
        pAccession,
        sourceAccession,
        species,
        treatment
      });
      continue;
    }
    const trial = buildTrial(mapped, rowNumber, worksheet.name, workbookHash, {
      ...options,
      sourcePath: options.sourcePath ?? filePath
    });
    if (trial) trials.push(trial);
  }

  const duplicateGroups = new Map<string, TrialRecord[]>();
  for (const trial of trials) {
    const key = [
      trial.pAccession,
      trial.sourceAccession,
      trial.species.trim().toLowerCase(),
      trial.propaguleTypeCanonical,
      trial.treatment
    ].join("\u0000");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), trial]);
  }
  for (const rows of duplicateGroups.values()) {
    if (rows.length < 2) continue;
    const fingerprints = rows.map((trial) => JSON.stringify(trial.normalizedCellValues));
    const ambiguous = new Set(fingerprints).size < fingerprints.length;
    for (const trial of rows) {
      trial.replicateClassification = ambiguous ? "ambiguous_duplicate" : "genuine_replicate";
      if (ambiguous) trial.validationWarnings?.push("Ambiguous duplicate row");
    }
  }

  for (const field of [
    { value: "pc", raw: "pcRaw", scale: "pcScale" },
    { value: "lpc", raw: "lpcRaw", scale: "lpcScale" },
    { value: "fourPc", raw: "fourPcRaw", scale: "fourPcScale" }
  ] as const) {
    if (!trials.some((trial) => trial[field.scale] === "percent_0_100")) continue;
    for (const trial of trials) {
      const raw = trial[field.raw];
      if (trial[field.scale] === "ordinal_0_5" && typeof raw === "number" && raw > 0) {
        trial[field.value] = null;
        trial[field.scale] = "ambiguous";
        trial.validationWarnings?.push(`Ambiguous ${field.value.toUpperCase()} score scale`);
      }
    }
  }

  const observations = trials.flatMap(parseObservationsFromTrial);
  const issues = dataQualityFromTrials(trials);
  if (quarantinedRows.length) {
    issues.push({
      id: "quarantined-import-rows",
      severity: "high",
      category: "fix_first",
      title: "Rows excluded from analysis",
      detail: "Populated workbook rows with missing required values were retained in quarantine and were not silently coerced.",
      impact: "These rows remain visible for correction but cannot support treatment analysis.",
      action: "Correct the source workbook and import a new immutable version.",
      affectedRows: quarantinedRows.length,
      sourceRows: quarantinedRows.map((row) => row.sourceRow),
      metric: "Import"
    });
  }
  if (missingHeaders.length) {
    issues.push({
      severity: "high",
      title: "Missing required headers",
      detail: `Workbook is missing: ${missingHeaders.join(", ")}`,
      affectedRows: populatedRowCount
    });
  }

  return {
    batch: {
      filename: path.basename(filePath),
      importedAt: new Date().toISOString(),
      workbookHash,
      rowCount: trials.length,
      accessionCount: new Set(trials.map((trial) => trial.pAccession)).size,
      speciesCount: new Set(trials.map((trial) => trial.species)).size,
      treatmentCount: new Set(trials.map((trial) => trial.treatment)).size,
      warnings: issues.map((issue) => issue.title)
      ,
      sourceId: options.sourceId,
      sourcePath: options.sourcePath ?? filePath,
      worksheetName: worksheet.name,
      populatedRowCount,
      quarantinedRowCount: quarantinedRows.length
    },
    trials,
    observations,
    issues,
    quarantinedRows
  };
}

export async function inspectWorkbookCandidates(filePath: string): Promise<WorkbookCandidate[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets
    .map((worksheet) => {
      const headers = readHeaders(worksheet);
      const coverage = REQUIRED_HEADERS.filter((required) =>
        headers.some((header) => normalizeHeader(header) === normalizeHeader(required))
      ).length;
      let populatedRows = 0;
      for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        let populated = false;
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (stringValue(valueFromCell(cell))) populated = true;
        });
        if (populated) populatedRows += 1;
      }
      return {
        worksheetName: worksheet.name,
        headerCoverage: coverage,
        populatedRows,
        missingHeaders: missingRequiredHeaders(headers),
        selected: false
      };
    })
    .filter((candidate) => candidate.headerCoverage > 0 || candidate.populatedRows > 0)
    .sort((a, b) => b.headerCoverage - a.headerCoverage || b.populatedRows - a.populatedRows)
    .map((candidate, index) => ({ ...candidate, selected: index === 0 }));
}
