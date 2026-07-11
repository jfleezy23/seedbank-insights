import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { importWorkbook, inspectWorkbookCandidates } from "../../src/core/workbook";

const cleanup: string[] = [];
afterEach(async () => Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("multi-workbook ingestion", () => {
  it("maps punctuation aliases, extracts rich hyperlink text, quarantines blanks, and ignores formatted trailing rows", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-multi-"));
    cleanup.push(directory);
    const file = path.join(directory, "synthetic.xlsx");
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Notes").addRow(["not accession data"]);
    const sheet = workbook.addWorksheet("Imported data");
    sheet.addRow(["P Accession", "UorSBacc", "Scientific Name", "Treatment", "Num", "Start Date", "Propagule Type", "Done Date", "Propagation Class", "D/ND", "L(R:C;Z)"]);
    sheet.addRow(["P1", "SRC1", { text: { richText: [{ text: "Species " }, { text: "one" }] }, hyperlink: "https://example.test" } as never, "C", 50, "2024-01-01", "s", "2024-04-01", 4, "D", "R1:C2:Z3"]);
    sheet.addRow(["P2", "SRC2", "Species two", "", 50, "2024-01-01", "s", "2024-04-01", 2, "D", "R1:C2:Z3"]);
    sheet.getRow(5000).height = 20;
    await workbook.xlsx.writeFile(file);

    const result = await importWorkbook(file);
    expect(result.batch.populatedRowCount).toBe(2);
    expect(result.trials).toHaveLength(1);
    expect(result.quarantinedRows).toHaveLength(1);
    expect(result.trials[0]).toMatchObject({
      sourceAccession: "SRC1",
      species: "Species one",
      status: "D",
      location: "R1:C2:Z3"
    });
    const candidates = await inspectWorkbookCandidates(file);
    expect(candidates[0]).toMatchObject({ worksheetName: "Imported data", populatedRows: 2, selected: true });
  });

  it("retains invalid date evidence without creating historical dates", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-dates-"));
    cleanup.push(directory);
    const file = path.join(directory, "dates.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC"]);
    sheet.addRow(["P1", "S1", "Species one", "C", 50, 2000, "s", "0203-01-01", 3]);
    await workbook.xlsx.writeFile(file);
    const result = await importWorkbook(file);
    expect(result.trials[0].startDate).toBeNull();
    expect(result.trials[0].ttd).toBeNull();
    expect(result.trials[0].validationWarnings).toEqual(expect.arrayContaining([
      "Invalid or implausible Start date",
      "Invalid or implausible TTD date"
    ]));
  });

  it("classifies exact copies as ambiguous and excludes neither row from the audit trail", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-duplicates-"));
    cleanup.push(directory);
    const file = path.join(directory, "duplicates.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC"]);
    const duplicate = ["P1", "S1", "Species one", "CS", 50, "2024-01-01", "s", "2024-04-01", 4];
    sheet.addRow(duplicate);
    sheet.addRow(duplicate);
    await workbook.xlsx.writeFile(file);
    const result = await importWorkbook(file);
    expect(result.trials).toHaveLength(2);
    expect(result.trials.every((trial) => trial.replicateClassification === "ambiguous_duplicate")).toBe(true);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "ambiguous-duplicate-rows", sourceRows: [2, 3] })
    ]));
  });
});
