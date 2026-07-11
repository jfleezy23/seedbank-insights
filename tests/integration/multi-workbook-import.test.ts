import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

  it("does not use differing outcome values to classify duplicates as independent replicates", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-outcome-duplicates-"));
    cleanup.push(directory);
    const file = path.join(directory, "duplicates-with-outcomes.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC"]);
    sheet.addRow(["P1", "S1", "Species one", "CS", 50, "2024-01-01", "s", "2024-04-01", 1]);
    sheet.addRow(["P1", "S1", "Species one", "CS", 50, "2024-01-01", "s", "2024-05-01", 5]);
    await workbook.xlsx.writeFile(file);

    const result = await importWorkbook(file);
    expect(result.trials.every((trial) => trial.replicateClassification === "ambiguous_duplicate")).toBe(true);
  });

  it("only marks the repeated design fingerprint ambiguous within a larger replicate group", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-partial-duplicates-"));
    cleanup.push(directory);
    const file = path.join(directory, "partial-duplicates.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC"]);
    sheet.addRow(["P1", "S1", "Species one", "CS", 50, "2024-01-01", "s", "2024-04-01", 1]);
    sheet.addRow(["P1", "S1", "Species one", "CS", 50, "2024-01-01", "s", "2024-05-01", 5]);
    sheet.addRow(["P1", "S1", "Species one", "CS", 50, "2024-02-01", "s", "2024-06-01", 4]);
    await workbook.xlsx.writeFile(file);

    const result = await importWorkbook(file);
    expect(result.trials.map((trial) => trial.replicateClassification)).toEqual([
      "ambiguous_duplicate",
      "ambiguous_duplicate",
      "genuine_replicate"
    ]);
  });

  it("retains a zero score when another row establishes a percentage scale", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-zero-score-"));
    cleanup.push(directory);
    const file = path.join(directory, "mixed-score-scale.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC"]);
    sheet.addRow(["P1", "S1", "Species one", "C", 50, "2024-01-01", "s", "2024-04-01", 0]);
    sheet.addRow(["P2", "S2", "Species two", "C", 50, "2024-01-01", "s", "2024-04-01", 50]);
    await workbook.xlsx.writeFile(file);

    const result = await importWorkbook(file);
    expect(result.trials[0]).toMatchObject({ pc: 0, pcRaw: 0, pcScale: "ordinal_0_5" });
    expect(result.trials[0].validationWarnings).not.toContain("Ambiguous PC score scale");
  });

  it("rejects an archive whose declared expanded content exceeds the import bound before ExcelJS loads it", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-archive-limit-"));
    cleanup.push(directory);
    const file = path.join(directory, "oversized.xlsx");
    const filename = Buffer.from("xl/worksheets/sheet1.xml");
    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(1, 20);
    central.writeUInt32LE(100 * 1024 * 1024 + 1, 24);
    central.writeUInt16LE(filename.length, 28);
    filename.copy(central, 46);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length, 12);
    await writeFile(file, Buffer.concat([central, end]));

    await expect(importWorkbook(file)).rejects.toThrow("Workbook archive contains an entry that exceeds the 50 MB expanded import limit.");
  });

  it("quarantines rows with only non-identity evidence and preserves uncached formulas", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "seedbank-formula-evidence-"));
    cleanup.push(directory);
    const file = path.join(directory, "formula-evidence.xlsx");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Accessions");
    sheet.addRow(["P_Accession", "Source_Accession", "Species", "Trt", "Num", "Start", "PT", "TTD", "PC", "NOTES"]);
    sheet.addRow(["P1", "S1", "Species one", "C", 50, "2024-01-01", "s", "2024-04-01", null, "formula follows"]);
    sheet.getCell("I2").value = { formula: "1+2" } as never;
    sheet.addRow([null, null, null, null, null, null, null, null, null, "Source note requiring correction"]);
    await workbook.xlsx.writeFile(file);

    const result = await importWorkbook(file);
    expect(result.batch.populatedRowCount).toBe(2);
    expect(result.trials[0].rawCellValues?.pc).toBe("=1+2");
    expect(result.trials[0].pc).toBeNull();
    expect(result.quarantinedRows?.[0]).toMatchObject({
      reasons: expect.arrayContaining(["Missing propagation accession", "Missing species", "Missing treatment"]),
      rawCellValues: expect.objectContaining({ notes: "Source note requiring correction" })
    });
  });
});
