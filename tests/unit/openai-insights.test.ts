import { describe, expect, it } from "vitest";
import {
  buildSpeciesInsightContexts,
  parseAskAnswerResponse,
  parseHeaderMappingResponse,
  parseSpeciesInsightResponse
} from "../../electron/main/openai-insights";
import type { ImportResult, TrialRecord } from "../../src/core/types";
import { parseTreatment } from "../../src/core/treatments";

function trial(partial: Partial<TrialRecord> & Pick<TrialRecord, "pAccession" | "species" | "treatment" | "pc">): TrialRecord {
  return {
    id: `${partial.pAccession}:${partial.treatment}:${partial.species}`,
    sourceRow: partial.sourceRow ?? 2,
    pAccession: partial.pAccession,
    sourceAccession: partial.sourceAccession ?? "SRC",
    species: partial.species,
    family: partial.family ?? null,
    treatment: partial.treatment,
    num: partial.num ?? 25,
    startDate: partial.startDate ?? "2025-01-01",
    propaguleType: "s",
    ttd: null,
    pc: partial.pc,
    ced: null,
    wsed: null,
    csed: null,
    linerStart: null,
    linerTtd: null,
    lpc: null,
    fourStart: null,
    fourTtd: null,
    fourPc: null,
    location: null,
    status: "ND",
    pcd: null,
    notes: null,
    treatmentComponents: parseTreatment(partial.treatment)
  };
}

function importResult(trials: TrialRecord[]): ImportResult {
  return {
    batch: {
      filename: "fixture.xlsx",
      importedAt: "2026-01-01T00:00:00.000Z",
      workbookHash: "hash",
      rowCount: trials.length,
      accessionCount: new Set(trials.map((row) => row.pAccession)).size,
      speciesCount: new Set(trials.map((row) => row.species)).size,
      treatmentCount: new Set(trials.map((row) => row.treatment)).size,
      warnings: []
    },
    trials,
    observations: [],
    issues: []
  };
}

describe("OpenAI species insight validation", () => {
  it("normalizes structured output while preserving deterministic confidence", () => {
    const contexts = buildSpeciesInsightContexts(
      importResult([
        trial({ pAccession: "P1", species: "Lomatium testii", treatment: "C", pc: 0, sourceRow: 2 }),
        trial({ pAccession: "P1", species: "Lomatium testii", treatment: "CS", pc: 5, sourceRow: 3 }),
        trial({ pAccession: "P2", species: "Lomatium testii", treatment: "CS", pc: 4, sourceRow: 4 })
      ])
    );
    const insights = parseSpeciesInsightResponse(
      JSON.stringify({
        speciesInsights: [
          {
            species: "Lomatium testii",
            plantFamily: "Apiaceae",
            familySource: "ai_inferred",
            summary: "Cold stratification is promising but still needs replication.",
            propagationInterpretation: "The submitted rows suggest cold stratification is the treatment worth repeating.",
            recommendedTechniques: [
              {
                technique: "CS",
                evidenceSummary: "CS has the best cited PC rows for this species.",
                deterministicConfidence: "Promising",
                citedRows: [3, 999],
                wouldProve: "More paired accessions repeat the PC lift and survive liner follow-up.",
                wouldDisprove: "Control trays match CS after replication."
              }
            ],
            familyPropagationPattern: "Apiaceae taxa often require dormancy-aware stratification trials.",
            keyFindings: ["CS has the highest PC scores in the submitted rows."],
            nextSteps: ["Repeat paired control and CS trays."],
            trialDesign: "Run at least three paired accessions with C and CS treatments and record PC plus liner survival.",
            cautionFlags: ["Only a small number of accessions are represented."],
            confidenceCaveat: "The deterministic label remains underpowered.",
            researchNotes: ["Verify taxon and family context against a botanical reference before protocolizing."],
            evidence: [
              { sourceRow: 3, accession: "MODEL-WRONG", treatment: "MODEL-WRONG", observation: "MODEL-WRONG" },
              { sourceRow: 999, accession: "P9", treatment: "CS", observation: "ignored" }
            ]
          }
        ]
      }),
      contexts,
      "gpt-5.5",
      "2026-01-01T00:00:00.000Z"
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].deterministicConfidence).toBe("Promising");
    expect(insights[0].evidence).toHaveLength(1);
    expect(insights[0].evidence[0]).toMatchObject({
      sourceRow: 3,
      accession: "P1",
      treatment: "CS",
      observation: "PC 5; status ND"
    });
    expect(insights[0].plantFamily).toBe("Apiaceae");
    expect(insights[0].familySource).toBe("ai_inferred");
    expect(insights[0].recommendedTechniques).toEqual([
      {
        technique: "CS",
        evidenceSummary: "CS has the best cited PC rows for this species.",
        deterministicConfidence: "Promising",
        citedRows: [3],
        wouldProve: "More paired accessions repeat the PC lift and survive liner follow-up.",
        wouldDisprove: "Control trays match CS after replication."
      }
    ]);
    expect(insights[0].propagationInterpretation).toContain("cold stratification");
    expect(insights[0].model).toBe("gpt-5.5");
  });

  it("preserves workbook family over AI-inferred family", () => {
    const contexts = buildSpeciesInsightContexts(
      importResult([
        trial({
          pAccession: "P1",
          species: "Lomatium testii",
          family: "Apiaceae",
          treatment: "CS",
          pc: 5,
          sourceRow: 3
        })
      ])
    );
    const insights = parseSpeciesInsightResponse(
      JSON.stringify({
        speciesInsights: [
          {
            species: "Lomatium testii",
            plantFamily: "Wrongaceae",
            familySource: "ai_inferred",
            summary: "Cold stratification still needs replication.",
            propagationInterpretation: "CS is a candidate treatment from the submitted row.",
            recommendedTechniques: [
              {
                technique: "CS",
                evidenceSummary: "Row 3 has the useful PC score.",
                deterministicConfidence: "Needs replication",
                citedRows: [3],
                wouldProve: "Additional paired rows repeat the result.",
                wouldDisprove: "Control rows match the treatment."
              }
            ],
            familyPropagationPattern: "Use the workbook family as authoritative.",
            keyFindings: ["Row 3 is the only cited lead."],
            nextSteps: ["Add paired controls."],
            trialDesign: "Repeat with controls.",
            cautionFlags: ["Single-row evidence."],
            confidenceCaveat: "Needs replication remains authoritative.",
            researchNotes: ["Workbook family should win over inferred family."],
            evidence: [{ sourceRow: 3, accession: "P1", treatment: "CS", observation: "PC 5" }]
          }
        ]
      }),
      contexts
    );

    expect(insights[0].plantFamily).toBe("Apiaceae");
    expect(insights[0].familySource).toBe("workbook");
  });

  it("strips technique recommendations that do not cite species source rows", () => {
    const contexts = buildSpeciesInsightContexts(
      importResult([
        trial({ pAccession: "P1", species: "Lomatium testii", treatment: "CS", pc: 5, sourceRow: 3 })
      ])
    );
    const insights = parseSpeciesInsightResponse(
      JSON.stringify({
        speciesInsights: [
          {
            species: "Lomatium testii",
            plantFamily: "Apiaceae",
            familySource: "ai_inferred",
            summary: "Cold stratification still needs replication.",
            propagationInterpretation: "CS is a candidate treatment from the submitted row.",
            recommendedTechniques: [
              {
                technique: "GA3",
                evidenceSummary: "This model claim should not survive without valid rows.",
                deterministicConfidence: "Needs replication",
                citedRows: [999],
                wouldProve: "More rows.",
                wouldDisprove: "No rows."
              }
            ],
            familyPropagationPattern: "Family context remains tentative.",
            keyFindings: ["Row 3 is the only real evidence."],
            nextSteps: ["Add paired controls."],
            trialDesign: "Repeat with controls.",
            cautionFlags: ["Single-row evidence."],
            confidenceCaveat: "Needs replication remains authoritative.",
            researchNotes: ["Do not show uncited model technique claims."],
            evidence: [{ sourceRow: 3, accession: "P1", treatment: "CS", observation: "PC 5" }]
          }
        ]
      }),
      contexts
    );

    expect(insights[0].recommendedTechniques).toHaveLength(1);
    expect(insights[0].recommendedTechniques?.[0]).toMatchObject({
      technique: "CS",
      citedRows: [3],
      deterministicConfidence: "Needs replication"
    });
  });

  it("rejects malformed output that tries to add a confidence label", () => {
    const contexts = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Lomatium testii", treatment: "CS", pc: 5 })])
    );
    expect(() =>
      parseSpeciesInsightResponse(
        JSON.stringify({
          speciesInsights: [
            {
              species: "Lomatium testii",
              plantFamily: "Apiaceae",
              familySource: "ai_inferred",
              summary: "Looks strong.",
              confidence: "Strong signal",
              propagationInterpretation: "High PC may reflect a useful pretreatment.",
              recommendedTechniques: [
                {
                  technique: "CS",
                  evidenceSummary: "High PC.",
                  deterministicConfidence: "Needs replication",
                  citedRows: [2],
                  wouldProve: "More rows.",
                  wouldDisprove: "Control rows match."
                }
              ],
              familyPropagationPattern: "Family context is tentative.",
              keyFindings: ["High PC."],
              nextSteps: ["Roll out broadly."],
              trialDesign: "Use a broad rollout.",
              cautionFlags: ["No caveats."],
              confidenceCaveat: "None.",
              researchNotes: ["None."],
              evidence: [{ sourceRow: 2, accession: "P1", treatment: "CS", observation: "PC 5" }]
            }
          ]
        }),
        contexts
      )
    ).toThrow();
  });

  it("rejects output text that upgrades deterministic confidence", () => {
    const contexts = buildSpeciesInsightContexts(
      importResult([
        trial({ pAccession: "P1", species: "Lomatium testii", treatment: "C", pc: 0, sourceRow: 2 }),
        trial({ pAccession: "P1", species: "Lomatium testii", treatment: "CS", pc: 5, sourceRow: 3 }),
        trial({ pAccession: "P2", species: "Lomatium testii", treatment: "CS", pc: 4, sourceRow: 4 })
      ])
    );

    expect(() =>
      parseSpeciesInsightResponse(
        JSON.stringify({
          speciesInsights: [
            {
              species: "Lomatium testii",
              plantFamily: "Apiaceae",
              familySource: "ai_inferred",
              summary: "This is a Strong signal.",
              propagationInterpretation: "Cold stratification may be useful.",
              recommendedTechniques: [
                {
                  technique: "CS",
                  evidenceSummary: "CS has high PC scores.",
                  deterministicConfidence: "Promising",
                  citedRows: [3],
                  wouldProve: "More paired trays repeat it.",
                  wouldDisprove: "Controls match it."
                }
              ],
              familyPropagationPattern: "Apiaceae context is useful.",
              keyFindings: ["CS has high PC scores."],
              nextSteps: ["Repeat paired trays."],
              trialDesign: "Repeat the paired comparison.",
              cautionFlags: ["Still underpowered."],
              confidenceCaveat: "The deterministic label remains promising.",
              researchNotes: ["Check taxonomy."],
              evidence: [{ sourceRow: 3, accession: "P1", treatment: "CS", observation: "PC 5" }]
            }
          ]
        }),
        contexts
      )
    ).toThrow(/upgrade deterministic confidence/);
  });
});

describe("OpenAI header mapping validation", () => {
  it("keeps only mappings for observed headers", () => {
    const aliases = parseHeaderMappingResponse(
      JSON.stringify({
        aliases: [
          { header: "Taxon", canonical: "Species" },
          { header: "Made Up", canonical: "PC" }
        ]
      }),
      {
        worksheetName: "P_accessions",
        headers: ["Taxon", "Treatment"],
        missingHeaders: ["Species"]
      }
    );
    expect(aliases).toEqual({ Taxon: "Species" });
  });
});

describe("OpenAI Ask answer validation", () => {
  it("filters cited rows to rows present in the spreadsheet context", () => {
    const answer = parseAskAnswerResponse(
      JSON.stringify({
        answer: "CS has the clearest evidence in the provided rows.",
        caveats: ["This is still underpowered for broad protocol changes."],
        citedRows: [2, 999]
      }),
      new Set([2]),
      "gpt-5.5",
      "2026-01-01T00:00:00.000Z"
    );
    expect(answer.citedRows).toEqual([2]);
    expect(answer.model).toBe("gpt-5.5");
  });

  it("rejects ask output that attempts to add undeclared fields", () => {
    expect(() =>
      parseAskAnswerResponse(
        JSON.stringify({
          answer: "Roll it out.",
          caveats: [],
          citedRows: [2],
          confidence: "Strong signal"
        }),
        new Set([2])
      )
    ).toThrow();
  });

  it("rejects ask output that upgrades the deterministic confidence ceiling", () => {
    expect(() =>
      parseAskAnswerResponse(
        JSON.stringify({
          answer: "This is a Strong signal for rollout.",
          caveats: ["The response tries to overstate the evidence."],
          citedRows: [2]
        }),
        new Set([2]),
        "gpt-5.5",
        "2026-01-01T00:00:00.000Z",
        "Promising"
      )
    ).toThrow(/upgrade deterministic confidence/);
  });
});
