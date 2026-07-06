import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { z } from "zod";
import { parseObservationsFromTrial } from "./notes";
import { parseTreatment } from "./treatments";
import type { DataQualityIssue, ImportResult, TrialRecord } from "./types";

const REQUIRED_HEADERS = [
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

function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function valueFromCell(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result?: unknown }).result ?? null;
  }
  return value;
}

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim() || null;
    if ("richText" in value && Array.isArray(value.richText)) {
      const text = value.richText
        .map((part: { text?: unknown }) => String(part.text ?? ""))
        .join("")
        .trim();
      return text || null;
    }
    if ("result" in value) return stringValue((value as { result?: unknown }).result);
  }
  const text = String(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
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

function buildTrial(row: Map<string, unknown>, sourceRow: number): TrialRecord | null {
  const pAccession = stringValue(get(row, "P_Accession"));
  const sourceAccession = stringValue(get(row, "Source_Accession"));
  const species = stringValue(get(row, "Species"));
  const treatment = stringValue(get(row, "Trt"));

  if (!pAccession && !sourceAccession && !species && !treatment) return null;
  if (!pAccession || !sourceAccession || !species || !treatment) return null;

  const trial: TrialRecord = {
    id: `${pAccession}:${treatment}:${sourceRow}`,
    sourceRow,
    pAccession,
    sourceAccession,
    species,
    treatment,
    num: numberValue(get(row, "Num")),
    startDate: dateValue(get(row, "Start")),
    propaguleType: stringValue(get(row, "PT")),
    ttd: dateValue(get(row, "TTD")),
    pc: numberValue(get(row, "PC")),
    ced: dateValue(get(row, "CED", "CeD")),
    wsed: dateValue(get(row, "WSED")),
    csed: dateValue(get(row, "CSED", "CSeD")),
    linerStart: dateValue(get(row, "LS")),
    linerTtd: dateValue(get(row, "LTTD")),
    lpc: numberValue(get(row, "LPC")),
    fourStart: dateValue(get(row, "4S")),
    fourTtd: dateValue(get(row, "4TTD")),
    fourPc: numberValue(get(row, "4PC")),
    location: stringValue(get(row, "L(R:C|Z)", "L(R:C|G)")),
    status: statusValue(get(row, "D|ND")),
    pcd: stringValue(get(row, "PCD")),
    notes: stringValue(get(row, "NOTES", "Notes")),
    treatmentComponents: parseTreatment(treatment)
  };
  return trial;
}

function dataQualityFromTrials(trials: TrialRecord[]): DataQualityIssue[] {
  const missingPt = trials.filter((trial) => !trial.propaguleType).length;
  const unmappedTokens = trials.filter((trial) => trial.treatmentComponents.warnings.length).length;
  const issues: DataQualityIssue[] = [];
  if (missingPt) {
    issues.push({
      severity: "low",
      title: "Missing propagule type",
      detail: "A missing PT value limits future support for cutting/division workflows.",
      affectedRows: missingPt
    });
  }
  if (unmappedTokens) {
    issues.push({
      severity: "medium",
      title: "Unmapped treatment tokens",
      detail: "Some treatment strings contain tokens outside the current parser vocabulary.",
      affectedRows: unmappedTokens
    });
  }
  return issues;
}

export async function importWorkbook(filePath: string): Promise<ImportResult> {
  const buffer = await readFile(filePath);
  const workbookHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet =
    workbook.getWorksheet("P_accesions") ??
    workbook.getWorksheet("P_accessions") ??
    workbook.worksheets.find((sheet) => sheet.name.toLowerCase().includes("acces"));
  if (!worksheet) {
    throw new Error("No propagation accession worksheet found.");
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(valueFromCell(cell) ?? "");
  });

  const missingHeaders = REQUIRED_HEADERS.filter(
    (required) => !headers.some((header) => normalizeHeader(header) === normalizeHeader(required))
  );

  const trials: TrialRecord[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const mapped = new Map<string, unknown>();
    headers.forEach((header, index) => {
      if (!header) return;
      mapped.set(normalizeHeader(header), valueFromCell(row.getCell(index)));
    });
    const trial = buildTrial(mapped, rowNumber);
    if (trial) trials.push(trial);
  }

  const observations = trials.flatMap(parseObservationsFromTrial);
  const issues = dataQualityFromTrials(trials);
  if (missingHeaders.length) {
    issues.push({
      severity: "high",
      title: "Missing required headers",
      detail: `Workbook is missing: ${missingHeaders.join(", ")}`,
      affectedRows: worksheet.rowCount
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
    },
    trials,
    observations,
    issues
  };
}
