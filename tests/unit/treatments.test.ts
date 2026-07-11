import { describe, expect, it } from "vitest";
import { parseTreatment } from "../../src/core/treatments";

describe("parseTreatment", () => {
  it("parses cold and warm stratification defaults", () => {
    const parsed = parseTreatment("WS+CS");
    expect(parsed.hasWarm).toBe(true);
    expect(parsed.hasCold).toBe(true);
    expect(parsed.warmDays).toEqual([84]);
    expect(parsed.coldDays).toEqual([120]);
  });

  it("parses explicit durations and scarification", () => {
    const parsed = parseTreatment("SCAR+CS17+SCARWH+WS4+CS17");
    expect(parsed.hasScarification).toBe(true);
    expect(parsed.hasHotWater).toBe(true);
    expect(parsed.warmDays).toEqual([4]);
    expect(parsed.coldDays).toEqual([17, 17]);
  });

  it("keeps rare unknown tokens visible for data quality", () => {
    const parsed = parseTreatment("CS+MYSTERY");
    expect(parsed.warnings).toContain("Unmapped treatment token: MYSTERY");
  });

  it("parses whitespace-delimited treatment tokens", () => {
    const parsed = parseTreatment("WS CS");
    expect(parsed.tokens).toEqual(["WS", "CS"]);
    expect(parsed.hasWarm).toBe(true);
    expect(parsed.hasCold).toBe(true);
    expect(parsed.warnings).toHaveLength(0);
  });

  it("treats numbered GA tokens as gibberellic acid treatments", () => {
    const parsed = parseTreatment("GA3 + CS");
    expect(parsed.hasGa).toBe(true);
    expect(parsed.hasCold).toBe(true);
    expect(parsed.warnings).toHaveLength(0);
  });

  it("recognizes hot-water H2O tokens and the legacy H20 spelling", () => {
    const h2o = parseTreatment("H2O + CS");
    const h20 = parseTreatment("H20 + CS");

    expect(h2o.hasHotWater).toBe(true);
    expect(h2o.tokens).toEqual(["H2O", "CS"]);
    expect(h2o.warnings).toHaveLength(0);
    expect(h20.hasHotWater).toBe(true);
    expect(h20.tokens).toEqual(["H2O", "CS"]);
    expect(h20.warnings).toHaveLength(0);
  });
});
