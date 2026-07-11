import { describe, expect, it } from "vitest";
import { csvFromRows, csvValue } from "../../src/core/csv";

describe("CSV export safety", () => {
  it("renders workbook-derived formula prefixes as literal spreadsheet text", () => {
    for (const value of ["=HYPERLINK(\"https://example.test\")", "+1+1", "-1+1", "@SUM(A1:A2)", " \t=1+1"]) {
      expect(csvValue(value)).toMatch(/^"?'/);
    }
  });

  it("preserves numeric analysis values while escaping CSV syntax", () => {
    expect(csvValue(-1)).toBe("-1");
    expect(csvFromRows([{ species: "=DANGEROUS()", diff: -1, note: "a,b" }])).toBe(
      "species,diff,note\r\n'=DANGEROUS(),-1,\"a,b\""
    );
  });
});
