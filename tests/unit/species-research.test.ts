import { describe, expect, it } from "vitest";
import {
  fetchGbifTaxonomyMatch,
  researchSpeciesWithExternalSources,
  summarizeSpeciesResearchCacheStatus
} from "../../electron/main/species-research";
import {
  buildSpeciesInsightContexts,
  parseSpeciesResearchResponse
} from "../../electron/main/openai-insights";
import type { ImportResult, SpeciesResearchResult, SpeciesResearchSource, TrialRecord } from "../../src/core/types";
import { parseTreatment } from "../../src/core/treatments";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

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

describe("species research taxonomy and synthesis", () => {
  it("counts ready cache entries for the active batch species list", async () => {
    const batch = {
      id: 7,
      filename: "fixture.xlsx",
      importedAt: "2026-01-01T00:00:00.000Z",
      workbookHash: "hash",
      rowCount: 3,
      accessionCount: 3,
      speciesCount: 3,
      treatmentCount: 1,
      warnings: []
    };
    const status = await summarizeSpeciesResearchCacheStatus({
      batch,
      cacheVersion: "species-research-v4",
      species: ["Phacelia heterophylla", "Ceanothus velutinus", "Phacelia heterophylla"],
      readCache: async (_batch, speciesName) =>
        speciesName === "Phacelia heterophylla"
          ? {
              species: speciesName,
              status: "ready",
              plantFamily: "Hydrophyllaceae",
              familySource: "ai_inferred",
              deterministicConfidence: "Promising",
              summary: "Ready.",
              likelyStrategy: "Repeat CS.",
              familyPattern: "Context only.",
              recommendedTechniques: [],
              protocolGaps: [],
              nextTrialDesign: "Repeat paired trays.",
              caveats: [],
              evidenceNotes: [],
              localEvidence: [],
              sources: [],
              generatedAt: "2026-01-02T00:00:00.000Z",
              model: "gpt-5.5"
            }
          : null
    });

    expect(status).toMatchObject({
      batchId: 7,
      cacheVersion: "species-research-v4",
      totalSpecies: 2,
      researchedSpecies: 1,
      missingSpecies: ["Ceanothus velutinus"],
      generatedAtLatest: "2026-01-02T00:00:00.000Z"
    });
  });

  it("does not count stale species names or no-source cache entries as researched", async () => {
    const batch = {
      id: 8,
      filename: "fixture.xlsx",
      importedAt: "2026-01-01T00:00:00.000Z",
      workbookHash: "hash",
      rowCount: 2,
      accessionCount: 2,
      speciesCount: 2,
      treatmentCount: 1,
      warnings: []
    };
    const status = await summarizeSpeciesResearchCacheStatus({
      batch,
      cacheVersion: "species-research-v4",
      species: ["Acmispon americanus", "Grindelia stricta"],
      readCache: async (_batch, speciesName) => ({
        species: speciesName === "Acmispon americanus" ? "Different species" : speciesName,
        status: speciesName === "Grindelia stricta" ? "no_sources" : "ready",
        plantFamily: null,
        familySource: "unknown",
        deterministicConfidence: "Needs replication",
        summary: "Not usable.",
        likelyStrategy: "No source.",
        familyPattern: "Unknown.",
        recommendedTechniques: [],
        protocolGaps: [],
        nextTrialDesign: "Repeat local trials.",
        caveats: [],
        evidenceNotes: [],
        localEvidence: [],
        sources: [],
        generatedAt: "2026-01-02T00:00:00.000Z",
        model: null
      })
    });

    expect(status.researchedSpecies).toBe(0);
    expect(status.missingSpecies).toEqual(["Acmispon americanus", "Grindelia stricta"]);
    expect(status.generatedAtLatest).toBeNull();
  });

  it("counts cache hits across casing differences for the same species", async () => {
    const batch = {
      id: 9,
      filename: "fixture.xlsx",
      importedAt: "2026-01-01T00:00:00.000Z",
      workbookHash: "hash",
      rowCount: 2,
      accessionCount: 2,
      speciesCount: 1,
      treatmentCount: 1,
      warnings: []
    };
    const status = await summarizeSpeciesResearchCacheStatus({
      batch,
      cacheVersion: "species-research-v4",
      species: ["Phacelia heterophylla", "PHACELIA HETEROPHYLLA"],
      readCache: async () => ({
        species: "Phacelia heterophylla",
        status: "ready",
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        deterministicConfidence: "Promising",
        summary: "Ready.",
        likelyStrategy: "Repeat CS.",
        familyPattern: "Context only.",
        recommendedTechniques: [],
        protocolGaps: [],
        nextTrialDesign: "Repeat paired trays.",
        caveats: [],
        evidenceNotes: [],
        localEvidence: [],
        sources: [],
        generatedAt: "2026-01-02T00:00:00.000Z",
        model: "gpt-5.5"
      })
    });

    expect(status.totalSpecies).toBe(1);
    expect(status.researchedSpecies).toBe(1);
    expect(status.missingSpecies).toEqual([]);
  });

  it("parses GBIF taxonomy matches for plant families", async () => {
    const taxonomy = await fetchGbifTaxonomyMatch("Phacelia heterophylla", async () =>
      jsonResponse({
        usageKey: 2928077,
        scientificName: "Phacelia heterophylla Pursh",
        canonicalName: "Phacelia heterophylla",
        rank: "SPECIES",
        status: "ACCEPTED",
        confidence: 99,
        matchType: "EXACT",
        kingdom: "Plantae",
        genus: "Phacelia",
        family: "Hydrophyllaceae"
      })
    );

    expect(taxonomy).toMatchObject({
      canonicalName: "Phacelia heterophylla",
      family: "Hydrophyllaceae",
      confidence: 99
    });
  });

  it("rejects weak GBIF matches before using family context", async () => {
    const taxonomy = await fetchGbifTaxonomyMatch("Phacelia heterophylla", async () =>
      jsonResponse({
        usageKey: 1,
        scientificName: "Phacelia hastata",
        canonicalName: "Phacelia hastata",
        rank: "SPECIES",
        status: "ACCEPTED",
        confidence: 82,
        matchType: "FUZZY",
        kingdom: "Plantae",
        genus: "Phacelia",
        family: "Hydrophyllaceae"
      })
    );

    expect(taxonomy).toBeNull();
  });

  it("accepts exact high-confidence GBIF synonym matches", async () => {
    const taxonomy = await fetchGbifTaxonomyMatch("Olda plantii", async () =>
      jsonResponse({
        usageKey: 2,
        scientificName: "Olda plantii",
        canonicalName: "Newa plantii",
        rank: "SPECIES",
        status: "SYNONYM",
        confidence: 99,
        matchType: "EXACT",
        kingdom: "Plantae",
        genus: "Newa",
        family: "Exampleaceae"
      })
    );

    expect(taxonomy).toMatchObject({
      canonicalName: "Newa plantii",
      family: "Exampleaceae",
      status: "SYNONYM"
    });
  });

  it("uses a genus-level taxonomy fallback for genus-only local taxa", async () => {
    let capturedFamily: string | null | undefined;
    let fetchCalls = 0;
    const research = await researchSpeciesWithExternalSources({
      apiKey: "sk-placeholder",
      species: "Polygonum",
      importResult: importResult([
        trial({ pAccession: "P1", species: "Polygonum", treatment: "CS", pc: 4, sourceRow: 3 })
      ]),
      dashboard: {
        batch: null,
        metrics: { trials: 1, accessions: 1, species: 1, treatments: 1, doneRate: 0, observationsExtracted: 0 },
        treatmentSummaries: [],
        speciesSummaries: [],
        pairedComparisons: [],
        trialQueue: [],
        dataQualityIssues: [],
        askSuggestions: [],
        speciesInsights: [],
        aiInsightStatus: { configured: true, state: "not_generated", message: "", model: "gpt-5.5", generatedAt: null }
      },
      fetcher: async (input) => {
        fetchCalls += 1;
        const rank = new URL(input).searchParams.get("rank");
        if (rank === "GENUS") {
          return jsonResponse({
            usageKey: 2888890,
            scientificName: "Polygonum",
            canonicalName: "Polygonum",
            rank: "GENUS",
            status: "ACCEPTED",
            confidence: 99,
            matchType: "EXACT",
            kingdom: "Plantae",
            genus: "Polygonum",
            family: "Polygonaceae"
          });
        }
        return jsonResponse({
          usageKey: 2888890,
          scientificName: "Polygonum",
          canonicalName: "Polygonum",
          rank: "GENUS",
          status: "ACCEPTED",
          confidence: 99,
          matchType: "EXACT",
          kingdom: "Plantae",
          genus: "Polygonum",
          family: "Polygonaceae"
        });
      },
      synthesizer: async ({ taxonomy }) => {
        capturedFamily = taxonomy?.family;
        return {
          species: "Polygonum",
          status: "ready",
          plantFamily: taxonomy?.family ?? null,
          familySource: taxonomy?.family ? "ai_inferred" : "unknown",
          deterministicConfidence: "Needs replication",
          summary: "Use the local CS row as a conservative trial lead.",
          likelyStrategy: "Repeat local CS against C.",
          familyPattern: "Polygonaceae context frames the hypothesis only.",
          recommendedTechniques: [
            {
              technique: "Local CS code",
              evidenceLevel: "local_species",
              recommendation: "Repeat the local CS code against controls.",
              evidenceSummary: "The local row is enough to design a trial, not a protocol.",
              deterministicConfidence: "Needs replication",
              sourceIds: [],
              localRows: [3],
              protocolFrame: "Repeat local CS exactly.",
              experimentalControls: "Run paired controls.",
              successCriteria: "CS beats C in replicated trays.",
              riskChecks: "Check seed fill and contamination.",
              whatToTry: "Pair CS and C.",
              whatWouldChangeMind: "C matches CS."
            }
          ],
          protocolGaps: ["CS temperature is missing."],
          nextTrialDesign: "Run paired trays.",
          caveats: ["Local-only evidence."],
          evidenceNotes: ["Local workbook evidence remains usable."],
          localEvidence: [],
          sources: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
          model: "gpt-5.5"
        };
      }
    });

    expect(fetchCalls).toBe(2);
    expect(capturedFamily).toBe("Polygonaceae");
    expect(research.plantFamily).toBe("Polygonaceae");
  });

  it("rejects species outside the import before taxonomy lookup", async () => {
    let fetchCalled = false;
    await expect(
      researchSpeciesWithExternalSources({
        apiKey: "sk-placeholder",
        species: "Madeup plantii",
        importResult: importResult([
          trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })
        ]),
        dashboard: {
          batch: null,
          metrics: { trials: 1, accessions: 1, species: 1, treatments: 1, doneRate: 0, observationsExtracted: 0 },
          treatmentSummaries: [],
          speciesSummaries: [],
          pairedComparisons: [],
          trialQueue: [],
          dataQualityIssues: [],
          askSuggestions: [],
          speciesInsights: [],
          aiInsightStatus: { configured: true, state: "not_generated", message: "", model: "gpt-5.5", generatedAt: null }
        },
        fetcher: async () => {
          fetchCalled = true;
          return jsonResponse({});
        }
      })
    ).rejects.toThrow(/No local trial rows/);
    expect(fetchCalled).toBe(false);
  });

  it("synthesizes local-species guidance without a second research service", async () => {
    const synthesized: SpeciesResearchResult = {
      species: "Phacelia heterophylla",
      status: "ready",
      plantFamily: null,
      familySource: "unknown",
      deterministicConfidence: "Needs replication",
      summary: "Use the local CS row as a conservative trial lead.",
      likelyStrategy: "Repeat local CS against C.",
      familyPattern: "No family pattern was available.",
      recommendedTechniques: [
        {
          technique: "Local CS code",
          evidenceLevel: "local_species",
          recommendation: "Repeat the local CS code against controls.",
          evidenceSummary: "The local row is enough to design a trial, not a protocol.",
          deterministicConfidence: "Needs replication",
          sourceIds: [],
          localRows: [3],
          protocolFrame: "Repeat local CS exactly.",
          experimentalControls: "Run paired controls.",
          successCriteria: "CS beats C in replicated trays.",
          riskChecks: "Check seed fill and contamination.",
          whatToTry: "Pair CS and C.",
          whatWouldChangeMind: "C matches CS."
        }
      ],
      protocolGaps: ["No external literature service is used in this app path."],
      nextTrialDesign: "Run paired trays.",
      caveats: ["Local-only evidence."],
      evidenceNotes: ["Local workbook evidence remains usable."],
      localEvidence: [],
      sources: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      model: "gpt-5.5"
    };
    let synthesizerSources: SpeciesResearchSource[] | undefined;
    let fetchCalls = 0;
    const research = await researchSpeciesWithExternalSources({
      apiKey: "sk-placeholder",
      species: "Phacelia heterophylla",
      importResult: importResult([
        trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })
      ]),
      dashboard: {
        batch: null,
        metrics: { trials: 1, accessions: 1, species: 1, treatments: 1, doneRate: 0, observationsExtracted: 0 },
        treatmentSummaries: [],
        speciesSummaries: [],
        pairedComparisons: [],
        trialQueue: [],
        dataQualityIssues: [],
        askSuggestions: [],
        speciesInsights: [],
        aiInsightStatus: { configured: true, state: "not_generated", message: "", model: "gpt-5.5", generatedAt: null }
      },
      fetcher: async () => {
        fetchCalls += 1;
        return jsonResponse({
          usageKey: 2928077,
          scientificName: "Phacelia heterophylla Pursh",
          canonicalName: "Phacelia heterophylla",
          rank: "SPECIES",
          status: "ACCEPTED",
          confidence: 99,
          matchType: "EXACT",
          kingdom: "Plantae",
          genus: "Phacelia",
          family: "Hydrophyllaceae"
        });
      },
      synthesizer: async ({ sources }) => {
        synthesizerSources = sources;
        return synthesized;
      }
    });

    expect(fetchCalls).toBe(1);
    expect(synthesizerSources).toEqual([]);
    expect(research.status).toBe("ready");
    expect(research.recommendedTechniques[0]).toMatchObject({
      evidenceLevel: "local_species",
      localRows: [3],
      sourceIds: []
    });
  });
});

describe("species research OpenAI validation", () => {
  const result = importResult([
    trial({ pAccession: "P1", species: "Phacelia heterophylla", family: null, treatment: "C", pc: 0, sourceRow: 2 }),
    trial({ pAccession: "P1", species: "Phacelia heterophylla", family: null, treatment: "CS", pc: 4, sourceRow: 3 }),
    trial({ pAccession: "P2", species: "Phacelia heterophylla", family: null, treatment: "CS", pc: 5, sourceRow: 4 })
  ]);
  const context = buildSpeciesInsightContexts(result)[0];
  const source: SpeciesResearchSource = {
    id: "manual:W1",
    source: "manual",
    title: "Seed germination response in Phacelia secunda",
    year: 2000,
    venue: "Plant Ecology",
    url: "https://doi.org/10.1023/a:1009802806674",
    doi: "https://doi.org/10.1023/a:1009802806674",
    matchedQuery: "Hydrophyllaceae seed germination dormancy stratification",
    relevance: "family",
    abstractSnippet: "Phacelia seed germination responded to cold stratification."
  };

  it("keeps only cited manual-source technique claims and taxonomy-inferred family", () => {
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Wrongaceae",
        familySource: "ai_inferred",
        summary: "Cold stratification is a reasonable trial candidate, but still needs replication.",
        likelyStrategy: "Test cold stratification against controls before production rollout.",
        familyPattern: "Hydrophyllaceae evidence points toward dormancy-aware cold stratification trials.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "mixed",
            recommendation: "Run paired CS and control trays.",
            evidenceSummary: "The family-level source and local rows both point to CS as the next trial.",
            deterministicConfidence: "Promising",
            sourceIds: ["manual:W1", "manual:missing"],
            localRows: [3, 999],
            protocolFrame: "Repeat the local CS code exactly; temperature, moisture, substrate, and light are not defined here.",
            experimentalControls: "Use matched control trays with equal seed numbers.",
            successCriteria: "CS should exceed control germination and produce usable seedlings.",
            riskChecks: "Check seed fill, contamination, and incomplete ND outcomes.",
            whatToTry: "Pair CS and control across accessions.",
            whatWouldChangeMind: "Controls match CS or survival falls after germination."
          }
        ],
        protocolGaps: ["CS temperature and duration are not defined in the payload."],
        nextTrialDesign: "Repeat CS versus C across at least three accessions.",
        caveats: ["Family-level literature is not species-level proof."],
        evidenceNotes: ["Use source IDs and local row IDs together."]
      }),
      species: "Phacelia heterophylla",
      context,
      taxonomy: {
        requestedName: "Phacelia heterophylla",
        canonicalName: "Phacelia heterophylla",
        scientificName: "Phacelia heterophylla Pursh",
        rank: "SPECIES",
        status: "ACCEPTED",
        matchType: "EXACT",
        confidence: 99,
        usageKey: 2928077,
        genus: "Phacelia",
        family: "Hydrophyllaceae"
      },
      sources: [source],
      model: "gpt-5.5",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(research.plantFamily).toBe("Hydrophyllaceae");
    expect(research.recommendedTechniques[0]).toMatchObject({
      sourceIds: ["manual:W1"],
      localRows: [3],
      deterministicConfidence: "Promising"
    });
  });

  it("normalizes verbose AI-inferred family strings to the family name", () => {
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Asparagaceae, Brodiaeoideae (AI-inferred; workbook family blank)",
        familySource: "ai_inferred",
        summary: "Local rows make CS the next trial candidate, but not a finished protocol.",
        likelyStrategy: "Repeat the local CS code against controls.",
        familyPattern: "Asparagaceae context frames the hypothesis only.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Run paired CS and control trays.",
            evidenceSummary: "The local CS row is a trial lead.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat the local CS code exactly.",
            experimentalControls: "Use matched control trays with equal seed numbers.",
            successCriteria: "CS should exceed control germination and produce usable seedlings.",
            riskChecks: "Check seed fill, contamination, and incomplete ND outcomes.",
            whatToTry: "Pair CS and control.",
            whatWouldChangeMind: "Controls match CS or survival falls after germination."
          }
        ],
        protocolGaps: ["CS temperature and duration are not defined in the payload."],
        nextTrialDesign: "Repeat CS versus C across accessions.",
        caveats: ["This is local row evidence, not a protocol."],
        evidenceNotes: ["Use local row IDs."]
      }),
      species: "Phacelia heterophylla",
      context,
      taxonomy: null,
      sources: [],
      model: "gpt-5.5",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(research.plantFamily).toBe("Asparagaceae");
    expect(research.familySource).toBe("ai_inferred");
  });

  it("caps upgraded technique confidence at the deterministic ceiling", () => {
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "This is a Strong signal.",
        likelyStrategy: "Roll out CS broadly.",
        familyPattern: "Cold stratification is useful.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Use it.",
            evidenceSummary: "High scores.",
            deterministicConfidence: "Strong signal",
            sourceIds: ["manual:W1"],
            localRows: [3],
            protocolFrame: "Broad rollout.",
            experimentalControls: "None.",
            successCriteria: "Production success.",
            riskChecks: "None.",
            whatToTry: "Broad rollout.",
            whatWouldChangeMind: "Nothing."
          }
        ],
        protocolGaps: ["No gaps."],
        nextTrialDesign: "Skip replication.",
        caveats: ["No caveats."],
        evidenceNotes: ["None."]
      }),
      species: "Phacelia heterophylla",
      context,
      taxonomy: null,
      sources: [source]
    });

    expect(research.status).toBe("ready");
    expect(research.summary).toContain("not yet a Strong signal");
    expect(research.recommendedTechniques[0].deterministicConfidence).toBe(context.deterministicConfidence);
  });

  it("keeps local-species recommendations that cite workbook rows without manual source IDs", () => {
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "Local rows make CS the best next trial candidate, but not a production protocol.",
        likelyStrategy: "Repeat the local CS code exactly against controls before changing practice.",
        familyPattern: "Family or genus literature can remain background, but the recommendation is local-species evidence.",
        recommendedTechniques: [
          {
            technique: "Cold stratification using local CS code",
            evidenceLevel: "local_species",
            recommendation: "Repeat CS against C with equal seed numbers.",
            evidenceSummary: "Rows 3 and 4 show higher PC scores than the control row.",
            deterministicConfidence: "Promising",
            sourceIds: [],
            localRows: [3, 4],
            protocolFrame: "Repeat the workbook CS code exactly; temperature, moisture, substrate, and light are missing.",
            experimentalControls: "Use same-accession C trays with equal seed numbers.",
            successCriteria: "CS must beat C across replicated trays and produce usable seedlings.",
            riskChecks: "Confirm seed fill, contamination, and incomplete ND outcomes.",
            whatToTry: "Run paired C and CS trays.",
            whatWouldChangeMind: "Controls match CS or production conversion falls."
          }
        ],
        protocolGaps: ["CS operational details are missing from the payload."],
        nextTrialDesign: "Run paired C and CS trays across accessions.",
        caveats: ["This is local row evidence, not a finished protocol."],
        evidenceNotes: ["No manual source ID is needed for local_species evidence."]
      }),
      species: "Phacelia heterophylla",
      context,
      taxonomy: null,
      sources: [source]
    });

    expect(research.status).toBe("ready");
    expect(research.recommendedTechniques[0]).toMatchObject({
      evidenceLevel: "local_species",
      sourceIds: [],
      localRows: [3, 4]
    });
  });

  it("withholds model narrative when no valid local or manual-source technique survives validation", () => {
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "Unsupported model narrative should not be shown.",
        likelyStrategy: "Unsupported strategy should not be shown.",
        familyPattern: "Unsupported family pattern should not be shown.",
        recommendedTechniques: [
          {
            technique: "Smoke treatment",
            evidenceLevel: "genus_background",
            recommendation: "Unsupported recommendation.",
            evidenceSummary: "Cites a missing source.",
            deterministicConfidence: "Promising",
            sourceIds: ["manual:missing"],
            localRows: [999],
            protocolFrame: "Unsupported protocol.",
            experimentalControls: "Unsupported controls.",
            successCriteria: "Unsupported success.",
            riskChecks: "Unsupported checks.",
            whatToTry: "Unsupported trial.",
            whatWouldChangeMind: "Unsupported disproof."
          }
        ],
        protocolGaps: ["Unsupported gap."],
        nextTrialDesign: "Unsupported design.",
        caveats: ["Unsupported caveat."],
        evidenceNotes: ["Unsupported note."]
      }),
      species: "Phacelia heterophylla",
      context,
      taxonomy: null,
      sources: [source],
      model: "gpt-5.5",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    expect(research.status).toBe("no_sources");
    expect(research.summary).toContain("No valid local-row germination technique survived validation");
    expect(research.summary).not.toContain("Unsupported model narrative");
    expect(research.recommendedTechniques).toEqual([]);
    expect(research.sources).toEqual([source]);
  });

  it("allows negated stronger-confidence language without treating it as an upgrade", () => {
    const lowContext = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "We did not find a Strong signal for production rollout.",
        likelyStrategy: "Treat this as a replicated trial question, not a protocol.",
        familyPattern: "Family-level evidence can shape the next trial.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "mixed",
            recommendation: "Run paired CS and controls.",
            evidenceSummary: "The source supports testing stratification.",
            deterministicConfidence: "Needs replication",
            sourceIds: ["manual:W1"],
            localRows: [3],
            protocolFrame: "Repeat the local CS code exactly.",
            experimentalControls: "Matched controls with equal seed numbers.",
            successCriteria: "CS exceeds controls across replicated trays.",
            riskChecks: "Check seed fill and contamination.",
            whatToTry: "Pair CS and controls.",
            whatWouldChangeMind: "Controls match CS."
          }
        ],
        protocolGaps: ["CS operational details are missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["This is not a Strong signal."],
        evidenceNotes: ["The source supports trial design, not rollout."]
      }),
      species: "Phacelia heterophylla",
      context: lowContext,
      taxonomy: null,
      sources: [source]
    });

    expect(research.status).toBe("ready");
    expect(research.deterministicConfidence).toBe("Needs replication");
  });

  it("sanitizes confidence upgrades even when a prior sentence contains a negation", () => {
    const lowContext = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "No GA3 evidence was found. CS is a Strong signal for production rollout.",
        likelyStrategy: "Treat CS as proven.",
        familyPattern: "Family evidence is background.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Use CS.",
            evidenceSummary: "Rows look good.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat local CS.",
            experimentalControls: "Run controls.",
            successCriteria: "CS beats C.",
            riskChecks: "Check seed fill.",
            whatToTry: "Pair CS and C.",
            whatWouldChangeMind: "C matches CS."
          }
        ],
        protocolGaps: ["CS details are missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["No caveats."],
        evidenceNotes: ["Local only."]
      }),
      species: "Phacelia heterophylla",
      context: lowContext,
      taxonomy: null,
      sources: [source]
    });

    expect(research.summary).toContain("CS is not yet a Strong signal for production rollout.");
  });

  it("does not let negation leak across newlines when sanitizing confidence language", () => {
    const lowContext = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "No GA3 evidence was found\nCS is a Promising local trial lead.",
        likelyStrategy: "Treat CS as a trial question.",
        familyPattern: "Family context is background.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Repeat local CS against C.",
            evidenceSummary: "The local row supports a trial.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat local CS exactly.",
            experimentalControls: "Run C controls.",
            successCriteria: "CS beats C.",
            riskChecks: "Check seed fill.",
            whatToTry: "Pair C and CS.",
            whatWouldChangeMind: "C matches CS."
          }
        ],
        protocolGaps: ["CS temperature is missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["Local only."],
        evidenceNotes: ["Local rows only."]
      }),
      species: "Phacelia heterophylla",
      context: lowContext,
      taxonomy: null,
      sources: []
    });

    expect(research.summary).toContain("CS is not yet a Promising local trial lead.");
  });

  it("sanitizes upgraded narrative confidence wording instead of discarding the assessment", () => {
    const inconclusiveContext = buildSpeciesInsightContexts(
      importResult([
        trial({ pAccession: "P1", species: "Angelica hendersonii", treatment: "C", pc: 1, sourceRow: 3 }),
        trial({ pAccession: "P2", species: "Angelica hendersonii", treatment: "CS", pc: 4, sourceRow: 4 })
      ])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Apiaceae",
        familySource: "ai_inferred",
        summary: "CS is a Promising local trial lead, not a protocol.",
        likelyStrategy: "Treat this as Promising but underpowered.",
        familyPattern: "Family context is background only.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Repeat local CS against C.",
            evidenceSummary: "The local CS row is better than C, but the comparison is underpowered.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [4],
            protocolFrame: "Repeat local CS exactly.",
            experimentalControls: "Run paired C controls.",
            successCriteria: "CS beats C across replicated trays.",
            riskChecks: "Check seed fill.",
            whatToTry: "Pair C and CS.",
            whatWouldChangeMind: "C matches CS."
          }
        ],
        protocolGaps: ["CS temperature is missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["Do not promote this to Promising until replicated."],
        evidenceNotes: ["Local rows only."]
      }),
      species: "Angelica hendersonii",
      context: inconclusiveContext,
      taxonomy: null,
      sources: []
    });

    expect(research.status).toBe("ready");
    expect(research.summary).toContain("not yet a Promising local trial lead");
    expect(research.likelyStrategy).toContain("not yet Promising but underpowered");
    expect(research.caveats[0]).toContain("Do not promote this to Promising until replicated");
    expect(research.recommendedTechniques[0].deterministicConfidence).toBe("Needs replication");
  });

  it("does not add double negation when upgraded confidence language is already negated", () => {
    const lowContext = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "This is not a Promising treatment yet.",
        likelyStrategy: "Keep testing.",
        familyPattern: "Family context is background.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "local_species",
            recommendation: "Repeat local CS against C.",
            evidenceSummary: "The local row supports a trial.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat local CS exactly.",
            experimentalControls: "Run C controls.",
            successCriteria: "CS beats C.",
            riskChecks: "Check seed fill.",
            whatToTry: "Pair C and CS.",
            whatWouldChangeMind: "C matches CS."
          }
        ],
        protocolGaps: ["CS temperature is missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["No Strong signal was found."],
        evidenceNotes: ["Local rows only."]
      }),
      species: "Phacelia heterophylla",
      context: lowContext,
      taxonomy: null,
      sources: []
    });

    expect(research.summary).toContain("not a Promising treatment");
    expect(research.summary).not.toContain("not a not yet");
    expect(research.caveats[0]).toContain("No Strong signal was found");
  });

  it("coerces misclassified local-row recommendations to local species evidence when no sources exist", () => {
    const lowContext = buildSpeciesInsightContexts(
      importResult([trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 3 })])
    )[0];

    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "CS is a trial lead.",
        likelyStrategy: "Keep testing.",
        familyPattern: "Taxonomy context is background.",
        recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "mixed",
            recommendation: "Repeat local CS against C.",
            evidenceSummary: "The local row supports a trial.",
            deterministicConfidence: "Needs replication",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat local CS exactly.",
            experimentalControls: "Run C controls.",
            successCriteria: "CS beats C.",
            riskChecks: "Check seed fill.",
            whatToTry: "Pair C and CS.",
            whatWouldChangeMind: "C matches CS."
          }
        ],
        protocolGaps: ["CS temperature is missing."],
        nextTrialDesign: "Run paired trays.",
        caveats: ["Local-only evidence."],
        evidenceNotes: ["Local rows only."]
      }),
      species: "Phacelia heterophylla",
      context: lowContext,
      taxonomy: null,
      sources: []
    });

    expect(research.status).toBe("ready");
    expect(research.recommendedTechniques[0]).toMatchObject({
      evidenceLevel: "local_species",
      localRows: [3],
      sourceIds: []
    });
  });

  it("keeps technique confidence lower than the species ceiling when the cited technique is weaker", () => {
    const strongContext = buildSpeciesInsightContexts(
      importResult([
        trial({ pAccession: "P1", species: "Phacelia heterophylla", treatment: "C", pc: 4, sourceRow: 2 }),
        trial({ pAccession: "P2", species: "Phacelia heterophylla", treatment: "CS", pc: 5, sourceRow: 3 }),
        trial({ pAccession: "P3", species: "Phacelia heterophylla", treatment: "GA3", pc: 5, sourceRow: 4 }),
        trial({ pAccession: "P4", species: "Phacelia heterophylla", treatment: "CS", pc: 4, sourceRow: 5 }),
        trial({ pAccession: "P5", species: "Phacelia heterophylla", treatment: "GA3", pc: 5, sourceRow: 6 }),
        trial({ pAccession: "P6", species: "Phacelia heterophylla", treatment: "C", pc: 4, sourceRow: 7 }),
        trial({ pAccession: "P7", species: "Phacelia heterophylla", treatment: "CS", pc: 5, sourceRow: 8 }),
        trial({ pAccession: "P8", species: "Phacelia heterophylla", treatment: "GA3", pc: 0, sourceRow: 9 })
      ])
    )[0];

    expect(strongContext.deterministicConfidence).toBe("Strong signal");
    const research = parseSpeciesResearchResponse({
      responseText: JSON.stringify({
        plantFamily: "Hydrophyllaceae",
        familySource: "ai_inferred",
        summary: "The species has strong local coverage overall, but this literature technique remains tentative.",
        likelyStrategy: "Test the cited technique separately.",
        familyPattern: "Family context supports trial design.",
        recommendedTechniques: [
          {
            technique: "Smoke water",
            evidenceLevel: "genus_background",
            recommendation: "Treat as a tentative side trial.",
            evidenceSummary: "The cited source justifies testing, not adoption.",
            deterministicConfidence: "Needs replication",
            sourceIds: ["manual:W1"],
            localRows: [3],
            protocolFrame: "Small side-by-side trial only.",
            experimentalControls: "Run alongside C and the current best local treatment.",
            successCriteria: "Smoke water must improve germination and seedling quality.",
            riskChecks: "Do not compare rescue treatments as clean treatments.",
            whatToTry: "Run a small side-by-side trial.",
            whatWouldChangeMind: "No lift over controls."
          }
        ],
        protocolGaps: ["Smoke water concentration and exposure are missing."],
        nextTrialDesign: "Run a small side trial.",
        caveats: ["Technique-level evidence is weaker than species-level local coverage."],
        evidenceNotes: ["Keep the technique label lower."]
      }),
      species: "Phacelia heterophylla",
      context: strongContext,
      taxonomy: null,
      sources: [source]
    });

    expect(research.recommendedTechniques[0].deterministicConfidence).toBe("Needs replication");
  });
});
