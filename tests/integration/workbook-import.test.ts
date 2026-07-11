import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { importWorkbook } from "../../src/core/workbook";
import { pairedComparison } from "../../src/core/statistics";

const workbookPath = path.join(process.cwd(), "P_accessions_new.xlsx");
const fixturePath = path.join(process.cwd(), "tests/fixtures/psu-style-accessions-fixture.xlsx");

describe("committed PSU-style workbook fixture import", () => {
  it("imports a committed fixture so CI covers the main workbook path", async () => {
    const result = await importWorkbook(fixturePath);
    expect(result.trials).toHaveLength(6);
    expect(result.batch.accessionCount).toBe(3);
    expect(result.batch.speciesCount).toBe(3);
    expect(result.observations.length).toBeGreaterThanOrEqual(7);

    const comparison = pairedComparison(result.trials, "C", "CS");
    expect(comparison.n).toBe(2);
    expect(comparison.confidence).toBe("Needs replication");
  });

  it("imports rich headers, stable date strings, and rows without source accessions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "seedbank-rich-headers-"));
    const generatedPath = path.join(dir, "rich-headers.xlsx");
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("P_accessions");
      [
        "P Accession",
        "Source_Accession",
        { richText: [{ text: "Species" }] },
        { text: "Trt", hyperlink: "https://example.test/header" },
        "Num",
        "Start",
        "PT",
        "TTD",
        "PC"
      ].forEach((value, index) => {
        sheet.getCell(1, index + 1).value = value;
      });
      sheet.addRow(["P9000", "", "Lomatium testii", "WS CS", 25, "2025-01-02", "s", "2025-03-04", 4]);
      await workbook.xlsx.writeFile(generatedPath);

      const result = await importWorkbook(generatedPath);
      expect(result.trials).toHaveLength(1);
      expect(result.trials[0]).toMatchObject({
        pAccession: "P9000",
        sourceAccession: "",
        species: "Lomatium testii",
        startDate: "2025-01-02",
        ttd: "2025-03-04"
      });
      expect(result.trials[0].treatmentComponents.tokens).toEqual(["WS", "CS"]);
      expect(result.issues.some((issue) => issue.title === "Missing source accession")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves raw score scales, normalizes percentages, and excludes invalid scores", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "seedbank-score-scales-"));
    const generatedPath = path.join(dir, "score-scales.xlsx");
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("P_accessions");
      sheet.addRow([
        "P_Accession",
        "Source_Accession",
        "Species",
        "Trt",
        "Num",
        "Start",
        "PT",
        "TTD",
        "PC",
        "LPC",
        "4PC"
      ]);
      sheet.addRow(["P1", "S1", "Species one", "C", 50, "2025-01-02", "s", "2025-03-04", 50, 100, 6]);
      sheet.addRow(["P2", "S2", "Species two", "CS", 50, "2025-01-02", "s", "2025-03-04", -2, 5, 4]);
      await workbook.xlsx.writeFile(generatedPath);

      const result = await importWorkbook(generatedPath);
      expect(result.trials[0]).toMatchObject({
        pc: 3,
        pcRaw: 50,
        pcScale: "percent_0_100",
        lpc: 5,
        lpcRaw: 100,
        lpcScale: "percent_0_100",
        fourPc: 1,
        fourPcRaw: 6,
        fourPcScale: "percent_0_100"
      });
      expect(result.trials[1]).toMatchObject({
        pc: null,
        pcRaw: -2,
        pcScale: "invalid",
        lpc: null,
        lpcRaw: 5,
        lpcScale: "ambiguous"
      });
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "invalid-pc-score", sourceRows: [3] }),
          expect.objectContaining({ id: "normalized-pc-percentages", sourceRows: [2] })
          ,expect.objectContaining({ id: "ambiguous-lpc-scale", sourceRows: [3] })
        ])
      );

    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.runIf(existsSync(workbookPath))("P_accessions_new.xlsx import", () => {
  it("imports the local PSU-style workbook with expected grain", async () => {
    const result = await importWorkbook(workbookPath);
    expect(result.trials).toHaveLength(128);
    expect(result.batch.accessionCount).toBe(53);
    expect(result.batch.speciesCount).toBe(52);
    expect(result.observations.length).toBeGreaterThan(100);
  });

  it("keeps cold stratification as paired evidence", async () => {
    const result = await importWorkbook(workbookPath);
    const comparison = pairedComparison(result.trials, "C", "CS");
    expect(comparison.n).toBe(38);
    expect(comparison.improved).toBe(24);
    expect(comparison.tied).toBe(11);
    expect(comparison.worse).toBe(3);
    expect(comparison.meanDiff).toBeCloseTo(1.68, 1);
  });
});
