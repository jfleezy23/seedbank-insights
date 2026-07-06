import { existsSync } from "node:fs";
import path from "node:path";
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
