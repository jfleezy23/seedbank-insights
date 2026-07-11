import { describe, expect, it } from "vitest";
import { findTreatmentGlossaryEntry } from "../../src/core/treatmentGlossary";

describe("treatment glossary", () => {
  it("flags explicit stratification durations as seed-only parser patterns", () => {
    expect(findTreatmentGlossaryEntry("CS16", "seed")?.status).toBe("Parser pattern");
    expect(findTreatmentGlossaryEntry("CS16", "stem_cutting")).toBeNull();
  });

  it("does not apply the seed C->WS definition to non-seed propagules", () => {
    expect(findTreatmentGlossaryEntry("C->WS", "seed")?.label).toBe("Control period, then warm stratification");
    expect(findTreatmentGlossaryEntry("C->WS", "stem_cutting")).toBeNull();
  });
});
