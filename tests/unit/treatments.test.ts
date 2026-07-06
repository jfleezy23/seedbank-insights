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
});
