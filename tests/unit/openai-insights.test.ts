import { beforeEach, describe, expect, it, vi } from "vitest";

const { responsesCreateMock } = vi.hoisted(() => ({ responsesCreateMock: vi.fn() }));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    responses = { create: responsesCreateMock };
  }
}));

import {
  answerSpreadsheetQuestion,
  buildSpeciesInsightContexts,
  discoverSpeciesResearchSources,
  extractSpeciesResearchSources,
  generateSpeciesResearch,
  parseAskAnswerResponse,
  parseHeaderMappingResponse,
  parseSpeciesInsightResponse,
  suggestHeaderAliases
} from "../../electron/main/openai-insights";
import type { DashboardData, ImportResult, TrialRecord } from "../../src/core/types";
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
    pcRaw: partial.pcRaw ?? partial.pc,
    pcScale: partial.pcScale ?? null,
    ced: null,
    wsed: null,
    csed: null,
    linerStart: null,
    linerTtd: null,
    lpc: partial.lpc ?? null,
    lpcRaw: partial.lpcRaw ?? partial.lpc ?? null,
    lpcScale: partial.lpcScale ?? null,
    fourStart: null,
    fourTtd: null,
    fourPc: partial.fourPc ?? null,
    fourPcRaw: partial.fourPcRaw ?? partial.fourPc ?? null,
    fourPcScale: partial.fourPcScale ?? null,
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

function dashboard(): DashboardData {
  return {
    batch: null,
    metrics: { trials: 1, accessions: 1, species: 1, treatments: 1, doneRate: 0, observationsExtracted: 0 },
    treatmentSummaries: [],
    speciesSummaries: [],
    pairedComparisons: [],
    trialQueue: [],
    dataQualityIssues: [],
    askSuggestions: [],
    speciesInsights: [],
    aiInsightStatus: { configured: true, state: "not_generated", message: "", model: "gpt-5.4", generatedAt: null }
  };
}

function validSpeciesResearchResponse(sourceRow = 2): string {
  return JSON.stringify({
    plantFamily: "Hydrophyllaceae",
    familySource: "ai_inferred",
    summary: "The local CS row is a trial lead that still needs replication.",
    likelyStrategy: "Repeat CS against a paired control.",
    familyPattern: "Family context is hypothesis-generating only.",
    recommendedTechniques: [
      {
        technique: "Local CS code",
        evidenceLevel: "local_species",
        recommendation: "Repeat the local CS code exactly against a control.",
        evidenceSummary: `Workbook row ${sourceRow} is the cited local lead.`,
        deterministicConfidence: "Needs replication",
        sourceIds: [],
        localRows: [sourceRow],
        protocolFrame: "Repeat the local code because duration and temperature are undefined.",
        experimentalControls: "Use a paired untreated control with equal seed numbers.",
        successCriteria: "Replicated CS trays exceed controls and produce usable seedlings.",
        riskChecks: "Check fill, viability, contamination, and abnormal seedlings.",
        whatToTry: "Run paired CS and control trays.",
        whatWouldChangeMind: "Controls match CS after replication."
      }
    ],
    protocolGaps: ["CS duration and temperature are not defined."],
    nextTrialDesign: "Repeat paired trays across multiple accessions.",
    caveats: ["The evidence is local and underpowered."],
    evidenceNotes: [`Row ${sourceRow} anchors the recommendation.`]
  });
}

describe("OpenAI research source discovery", () => {
  beforeEach(() => {
    responsesCreateMock.mockReset();
  });

  it("keeps only cited, taxon-relevant HTTPS sources with supporting snippets", () => {
    const citedText =
      "Phacelia heterophylla germination increased after a controlled cold treatment [USFS]. " +
      "A general crop storage review discusses warehouse humidity [UNRELATED]. " +
      "Hydrophyllaceae dormancy literature supports testing stratification as a family-level hypothesis [FAMILY].";
    const citation = (marker: string, title: string, url: string) => ({
      type: "url_citation",
      title,
      url,
      start_index: citedText.indexOf(marker),
      end_index: citedText.indexOf(marker) + marker.length
    });
    const sources = extractSpeciesResearchSources(
      {
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              queries: ["Phacelia heterophylla seed germination"],
              sources: [
                {
                  type: "url",
                  url: "https://www.fs.usda.gov/research/treesearch/1234?utm_source=openai"
                },
                { type: "url", url: "https://extension.oregonstate.edu/catalog/pub/em-1234" },
                { type: "url", url: "https://example.org/" },
                { type: "url", url: "https://google.com/search?q=phacelia" },
                { type: "url", url: "http://example.edu/insecure" }
              ]
            }
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: citedText,
                annotations: [
                  citation(
                    "[USFS]",
                    "Phacelia heterophylla germination research",
                    "https://fs.usda.gov/research/treesearch/1234"
                  ),
                  citation("[UNRELATED]", "Seed science article (2021)", "https://doi.org/10.1000/unrelated"),
                  citation("[FAMILY]", "Seed science article (2022)", "https://doi.org/10.1000/family-study")
                ]
              }
            ]
          }
        ]
      },
      {
        species: "Phacelia heterophylla",
        taxonomy: {
          requestedName: "Phacelia heterophylla",
          canonicalName: "Phacelia heterophylla",
          scientificName: "Phacelia heterophylla Pursh",
          rank: "SPECIES",
          status: "ACCEPTED",
          matchType: "EXACT",
          confidence: 99,
          usageKey: 1,
          genus: "Phacelia",
          family: "Hydrophyllaceae"
        }
      }
    );

    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.url)).toEqual([
      "https://fs.usda.gov/research/treesearch/1234",
      "https://doi.org/10.1000/family-study"
    ]);
    expect(sources[0]).toMatchObject({
      source: "openai_web",
      title: "Phacelia heterophylla germination research",
      relevance: "species",
      matchedQuery: "Phacelia heterophylla seed germination",
      abstractSnippet:
        "Phacelia heterophylla germination increased after a controlled cold treatment [USFS]."
    });
    expect(sources[1]).toMatchObject({
      year: 2022,
      doi: "https://doi.org/10.1000/family-study",
      relevance: "family",
      abstractSnippet:
        "Hydrophyllaceae dormancy literature supports testing stratification as a family-level hypothesis [FAMILY]."
    });
    expect(sources.some((source) => source.url.includes("unrelated"))).toBe(false);
    expect(sources.some((source) => source.url.includes("oregonstate"))).toBe(false);
    expect(new Set(sources.map((source) => source.id)).size).toBe(2);
  });

  it("uses gpt-5.4-mini low-reasoning web search with enough budget for cited output", async () => {
    responsesCreateMock.mockResolvedValueOnce({ output: [] });

    await discoverSpeciesResearchSources({
      apiKey: "sk-placeholder",
      species: "Phacelia heterophylla",
      taxonomy: null
    });

    expect(responsesCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        reasoning: { effort: "low" },
        max_output_tokens: 3000,
        tools: [{ type: "web_search", search_context_size: "medium" }],
        tool_choice: "auto",
        include: ["web_search_call.action.sources"],
        store: false
      })
    );
  });
});

describe("OpenAI request model routing", () => {
  beforeEach(() => {
    responsesCreateMock.mockReset();
  });

  it("uses gpt-5.4 medium for successful species synthesis without calling 5.5", async () => {
    responsesCreateMock.mockResolvedValueOnce({ output_text: validSpeciesResearchResponse() });
    const result = await generateSpeciesResearch({
      apiKey: "sk-placeholder",
      species: "Phacelia heterophylla",
      importResult: importResult([
        trial({
          pAccession: "P1",
          species: "Phacelia heterophylla",
          family: "Hydrophyllaceae",
          treatment: "CS",
          pc: 4,
          pcRaw: 82,
          pcScale: "percent_0_100",
          lpc: 3,
          lpcRaw: 61,
          lpcScale: "percent_0_100",
          fourPc: 2,
          fourPcRaw: 42,
          fourPcScale: "percent_0_100",
          sourceRow: 2
        }),
        trial({
          pAccession: "P2",
          species: "Phacelia secunda",
          family: "Hydrophyllaceae",
          treatment: "C",
          pc: 3,
          pcRaw: 55,
          pcScale: "percent_0_100",
          sourceRow: 3
        })
      ]),
      dashboard: dashboard(),
      taxonomy: null,
      sources: []
    });

    expect(result.status).toBe("ready");
    expect(result.model).toBe("gpt-5.4");
    expect(result.caveats).toContain(
      "Web discovery returned no vetted source, so these technique candidates rely only on cited local workbook rows."
    );
    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
    expect(responsesCreateMock.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4",
      reasoning: { effort: "medium" }
    });
    const requestPayload = JSON.parse(responsesCreateMock.mock.calls[0][0].input);
    expect(requestPayload.localEvidence.selectedTrials[0]).toMatchObject({
      pc: 4,
      pcRaw: 82,
      pcScale: "percent_0_100",
      lpc: 3,
      lpcRaw: 61,
      lpcScale: "percent_0_100",
      fourPc: 2,
      fourPcRaw: 42,
      fourPcScale: "percent_0_100"
    });
    expect(requestPayload.localEvidence.relatedFamilyOrGenusTrials[0]).toMatchObject({
      species: "Phacelia secunda",
      pc: 3,
      pcRaw: 55,
      pcScale: "percent_0_100"
    });
    expect(responsesCreateMock.mock.calls[0][0].instructions).toContain("pcRaw/pcScale");
  });

  it("retries malformed species synthesis once with gpt-5.5", async () => {
    responsesCreateMock
      .mockResolvedValueOnce({ output_text: "{malformed" })
      .mockResolvedValueOnce({ output_text: validSpeciesResearchResponse() });

    const result = await generateSpeciesResearch({
      apiKey: "sk-placeholder",
      species: "Phacelia heterophylla",
      importResult: importResult([
        trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 2 })
      ]),
      dashboard: dashboard(),
      taxonomy: null,
      sources: []
    });

    expect(result.status).toBe("ready");
    expect(result.model).toBe("gpt-5.5");
    expect(responsesCreateMock.mock.calls.map(([request]) => request.model)).toEqual(["gpt-5.4", "gpt-5.5"]);
  });

  it("does not escalate an ordinary synthesis request failure to gpt-5.5", async () => {
    responsesCreateMock.mockRejectedValueOnce(new Error("request unavailable"));

    const result = await generateSpeciesResearch({
      apiKey: "sk-placeholder",
      species: "Phacelia heterophylla",
      importResult: importResult([
        trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 2 })
      ]),
      dashboard: dashboard(),
      taxonomy: null,
      sources: []
    });

    expect(result.status).toBe("no_sources");
    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
    expect(responsesCreateMock.mock.calls[0][0].model).toBe("gpt-5.4");
  });

  it("routes Ask and header mapping to gpt-5.4-mini medium and low", async () => {
    responsesCreateMock
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          answer: "The cited row is a local trial lead.",
          caveats: ["The evidence is underpowered."],
          citedRows: [2]
        })
      })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({ aliases: [{ header: "Taxon", canonical: "Species" }] })
      });

    await answerSpreadsheetQuestion({
      apiKey: "sk-placeholder",
      question: "What should we test next?",
      context: { trials: [{ sourceRow: 2 }] }
    });
    await suggestHeaderAliases({
      apiKey: "sk-placeholder",
      profile: { worksheetName: "Trials", headers: ["Taxon"], missingHeaders: ["Species"] }
    });

    expect(responsesCreateMock.mock.calls.map(([request]) => [request.model, request.reasoning])).toEqual([
      ["gpt-5.4-mini", { effort: "medium" }],
      ["gpt-5.4-mini", { effort: "low" }]
    ]);
  });
});

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
