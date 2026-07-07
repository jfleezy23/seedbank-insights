import { test, expect } from "@playwright/test";

test("dashboard renders primary insight surfaces in browser fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Insight Board" })).toBeVisible();
  await expect(page.getByText("Best paired signal")).toBeVisible();
  await expect(page.getByText("Species assessment")).toBeVisible();
  await expect(page.getByText("Quality checks")).toBeVisible();
  await expect(page.getByText("Operational follow-up")).toBeVisible();
  await expect(page.getByText("Evidence guardrails")).toHaveCount(0);
  await expect(page.getByText("Ask with deterministic evidence")).toHaveCount(0);
  await expect(page.locator(".native-chart-bar")).toHaveCount(0);
});

test("dashboard shows cache-backed research coverage and actionable workbook queues", async ({ page }) => {
  await page.addInitScript(() => {
    const dashboard = {
      batch: {
        id: 22,
        filename: "fixture.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "hash",
        rowCount: 4,
        accessionCount: 4,
        speciesCount: 3,
        treatmentCount: 3,
        warnings: []
      },
      metrics: {
        trials: 4,
        accessions: 4,
        species: 3,
        treatments: 3,
        doneRate: 0.25,
        observationsExtracted: 1
      },
      treatmentSummaries: [],
      speciesSummaries: [
        {
          species: "Phacelia heterophylla",
          rows: 2,
          accessions: 2,
          treatments: 2,
          pcCount: 2,
          bestTreatment: "CS",
          bestPcMean: 4,
          confidence: "Promising"
        },
        {
          species: "Grindelia stricta",
          rows: 1,
          accessions: 1,
          treatments: 1,
          pcCount: 0,
          bestTreatment: null,
          bestPcMean: null,
          confidence: "Needs replication"
        },
        {
          species: "Ceanothus velutinus",
          rows: 1,
          accessions: 1,
          treatments: 1,
          pcCount: 1,
          bestTreatment: "SCAR+CS",
          bestPcMean: 5,
          confidence: "Needs replication"
        }
      ],
      pairedComparisons: [
        {
          baseline: "C",
          treatment: "CS",
          n: 2,
          improved: 1,
          tied: 1,
          worse: 0,
          meanDiff: 1,
          medianDiff: 1,
          ciLow: -1,
          ciHigh: 2,
          confidence: "Needs replication",
          falsePositiveRisk: "Elevated.",
          falseNegativeRisk: "Elevated. The treatment may work, but this dataset is underpowered.",
          additionalTrialsNeeded: 3,
          examples: []
        }
      ],
      trialQueue: [
        {
          accession: "P1",
          species: "Grindelia stricta",
          treatment: "CS",
          status: "D",
          priority: "high",
          nextDate: "2026-01-01",
          nextStep: "Record PC score for row 12.",
          reason: "The trial is marked done, but missing PC blocks treatment comparison.",
          sourceRows: [12],
          blockedMetric: "PC",
          pc: null,
          confidence: "Needs replication"
        },
        {
          accession: "P2",
          species: "Ceanothus velutinus",
          treatment: "SCAR+CS",
          status: "ND",
          priority: "medium",
          nextDate: "2026-01-02",
          nextStep: "Resolve ND follow-up for promising row 19.",
          reason: "High germination on an active row can shift recommendations once completion and survival are known.",
          sourceRows: [19],
          blockedMetric: "D|ND",
          pc: 5,
          confidence: "Promising"
        }
      ],
      dataQualityIssues: [
        {
          id: "missing-pc",
          severity: "medium",
          category: "fix_first",
          title: "Missing propagation scores",
          detail: "Rows without PC cannot support treatment success calls.",
          impact: "Treatment comparisons undercount active or completed rows.",
          action: "Enter PC when known, or keep the trial active.",
          affectedRows: 1,
          sourceRows: [12],
          species: ["Grindelia stricta"],
          treatments: ["CS"],
          metric: "PC"
        },
        {
          id: "unmapped-treatment-tokens",
          severity: "medium",
          category: "codebook",
          title: "Unmapped treatment tokens",
          detail: "Some treatment strings contain tokens outside the current parser vocabulary.",
          impact: "Unknown codes can split equivalent protocols.",
          action: "Review the treatment codebook.",
          affectedRows: 1,
          sourceRows: [19],
          species: ["Ceanothus velutinus"],
          treatments: ["SCAR+CS"],
          metric: "Trt"
        }
      ],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: false,
        state: "not_configured",
        message: "OpenAI is optional.",
        model: "gpt-5.5",
        generatedAt: null
      },
      speciesResearchCacheStatus: null
    };
    const cacheStatus = {
      batchId: 22,
      cacheVersion: "species-research-v4",
      totalSpecies: 3,
      researchedSpecies: 3,
      missingSpecies: [],
      generatedAtLatest: "2026-01-02T00:00:00.000Z"
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => dashboard,
      getSpeciesResearchCacheStatus: async () => cacheStatus,
      selectWorkbook: async () => dashboard,
      importLocalDefaultWorkbook: async () => dashboard,
      saveOpenAiKey: async () => ({ configured: true, safeStorageAvailable: true, dashboard }),
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true, dashboard }),
      generateSpeciesInsights: async () => dashboard,
      researchSpecies: async () => ({
        species: "Phacelia heterophylla",
        status: "no_sources",
        plantFamily: null,
        familySource: "unknown",
        deterministicConfidence: "Needs replication",
        summary: "No cached research.",
        likelyStrategy: "Use local evidence.",
        familyPattern: "Unknown.",
        recommendedTechniques: [],
        protocolGaps: [],
        nextTrialDesign: "Repeat local trials.",
        caveats: [],
        evidenceNotes: [],
        localEvidence: [],
        sources: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
        model: null
      }),
      askQuestion: async () => ({
        answer: "Use CS cautiously.",
        caveats: [],
        citedRows: [],
        model: "gpt-5.5",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    };
  });

  await page.goto("/");
  await expect(page.getByText("3 / 3 researched species")).toBeVisible();
  await expect(page.getByText("All imported species have cached AI research for the demo.")).toBeVisible();

  await page.getByRole("button", { name: "Open Data Quality" }).click();
  await expect(page.getByText("Rows 12")).toBeVisible();
  await expect(page.getByText("Grindelia stricta")).toBeVisible();
  await page.getByRole("button", { name: "Codebook" }).click();
  await expect(page.getByText("Rows 19")).toBeVisible();
  await expect(page.getByText("Review the treatment codebook.")).toBeVisible();

  await page.getByRole("button", { name: "Trial Queue", exact: true }).click();
  await expect(page.getByText("Record PC score for row 12.")).toBeVisible();
  await expect(page.getByText("Resolve ND follow-up for promising row 19.")).toBeVisible();
});

test("overview cards navigate to dedicated workspaces", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open comparator" }).click();
  await expect(page.getByRole("heading", { name: "Treatment Comparator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();

  await page.getByRole("button", { name: "Insight Board", exact: true }).click();
  await page.getByRole("button", { name: "Open Species Explorer" }).click();
  await expect(page.getByRole("heading", { name: "AI Species Assessment" })).toBeVisible();

  await page.getByRole("button", { name: "Insight Board", exact: true }).click();
  await page.getByRole("button", { name: "Open Data Quality" }).click();
  await expect(page.getByRole("heading", { name: "Data quality action queue" })).toBeVisible();

  await page.getByRole("button", { name: "Insight Board", exact: true }).click();
  await page.getByRole("button", { name: "Open Trial Queue" }).click();
  await expect(page.getByRole("heading", { name: "Trial Queue", exact: true })).toBeVisible();
});

test("sidebar navigation renders distinct workspaces and settings state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Portland State University" })).toBeVisible();

  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI Species Assessment" })).toBeVisible();
  await expect(page.getByText("Import a workbook before researching species.")).toBeVisible();

  await page.getByRole("button", { name: "Treatment Comparator", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Treatment success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();
  await expect(page.getByText("Data quality warnings")).toHaveCount(0);

  await page.getByRole("button", { name: "Trial Queue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trial Queue", exact: true })).toBeVisible();
  await expect(page.getByText("Row-specific follow-up work")).toBeVisible();

  await page.getByRole("button", { name: "Data Quality", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Data quality action queue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review priorities" })).toBeVisible();

  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask", exact: true })).toBeVisible();
  await expect(page.getByLabel("Question")).not.toHaveAttribute("readonly");
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeDisabled();

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Help and project information" })).toBeVisible();
  await expect(page.getByText("github.com/jfleezy23/seedbank-insights")).toBeVisible();
  await expect(page.getByText("jflow23@icloud.com")).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("OpenAI API key")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("species explorer researches a species with workbook-backed AI assessment", async ({ page }) => {
  await page.addInitScript(() => {
    const baseDashboard = {
      batch: {
        id: 7,
        filename: "fixture.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "hash",
        rowCount: 3,
        accessionCount: 2,
        speciesCount: 1,
        treatmentCount: 2,
        warnings: []
      },
      metrics: {
        trials: 3,
        accessions: 2,
        species: 1,
        treatments: 2,
        doneRate: 0.33,
        observationsExtracted: 2
      },
      treatmentSummaries: [],
      speciesSummaries: [
        {
          species: "Lomatium testii",
          rows: 3,
          accessions: 2,
          treatments: 2,
          pcCount: 3,
          bestTreatment: "CS",
          bestPcMean: 4.5,
          confidence: "Promising"
        }
      ],
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: true,
        state: "not_generated",
        message: "OpenAI is configured. Species Explorer research runs live and is not stored in SQLite.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    const researchResult = {
      species: "Lomatium testii",
      status: "ready",
      plantFamily: "Apiaceae",
      familySource: "ai_inferred",
      deterministicConfidence: "Promising",
      summary: "Cold stratification is the best research-backed trial candidate, but still needs replication.",
      likelyStrategy: "Use cold stratification as a small paired trial, not as a production protocol.",
      familyPattern: "Apiaceae context can frame dormancy-aware stratification trials.",
      recommendedTechniques: [
          {
            technique: "Cold stratification",
            evidenceLevel: "mixed",
            recommendation: "Run paired CS and control trays.",
            evidenceSummary: "Local row 3 supports CS as the next test.",
            deterministicConfidence: "Promising",
            sourceIds: [],
            localRows: [3],
            protocolFrame: "Repeat the local CS treatment code exactly; the fixture does not define temperature or duration.",
            experimentalControls: "Use matched control trays with equal seed numbers and accessions.",
            successCriteria: "CS must beat control germination and keep liner survival acceptable.",
            riskChecks: "Check seed fill, contamination, and ND status before interpreting failures.",
            whatToTry: "Pair CS and control across accessions.",
            whatWouldChangeMind: "Controls match CS or liner survival drops."
          }
        ],
      protocolGaps: ["CS temperature, substrate, moisture, and light regime are not defined in this fixture."],
      nextTrialDesign: "Run three paired C and CS trays across accessions, then track liner survival.",
      caveats: ["Family-level evidence is not species-level proof."],
      evidenceNotes: ["Technique claims cite local rows."],
      localEvidence: [{ sourceRow: 3, accession: "P1", treatment: "CS", observation: "PC 5; status ND" }],
      sources: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
      model: "gpt-5.5"
    };
    let resolveSpeciesResearch: (() => void) | undefined;
    const speciesResearch = new Promise<typeof researchResult>((resolve) => {
      resolveSpeciesResearch = () => resolve(researchResult);
    });
    (window as any).resolveSpeciesResearch = () => resolveSpeciesResearch?.();
    let keyCleared = false;
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: true, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      selectWorkbook: async () => baseDashboard,
      importLocalDefaultWorkbook: async () => baseDashboard,
      saveOpenAiKey: async (_key: string, batchId?: number) => {
        (window as any).savedKeyBatchId = batchId;
        return { configured: true, safeStorageAvailable: true, dashboard: baseDashboard };
      },
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async () => baseDashboard,
      researchSpecies: async (batchId: number, species: string, force?: boolean) => {
        (window as any).speciesResearchArgs = { batchId, species, force };
        return speciesResearch;
      },
      askQuestion: async () => ({
        answer: "Use CS cautiously.",
        caveats: ["Promising but underpowered."],
        citedRows: [3],
        model: "gpt-5.5",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect(page.getByText("Family unknown until research runs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Researching..." })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).speciesResearchArgs)).toEqual({
    batchId: 7,
    species: "Lomatium testii",
    force: false
  });
  await page.evaluate(() => (window as any).resolveSpeciesResearch());
  await expect(page.getByText("Cold stratification is the best research-backed trial candidate, but still needs replication.")).toBeVisible();
  await expect(page.getByText("Use cold stratification as a small paired trial, not as a production protocol.")).toBeVisible();
  await expect(page.getByText("Apiaceae · Family inferred from taxonomy")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workbook-backed technique candidates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protocol gaps to resolve" })).toBeVisible();
  await expect(page.getByText("Mixed evidence")).toBeVisible();
  await expect(page.getByText("Protocol frame")).toBeVisible();
  await expect(page.getByText("Controls", { exact: true })).toBeVisible();
  await expect(page.getByText("Success criteria")).toBeVisible();
  await expect(page.getByText("Risk checks")).toBeVisible();
  await expect(page.getByText("CS temperature, substrate, moisture, and light regime are not defined in this fixture.")).toBeVisible();
  await expect(page.getByText("Sources: local workbook rows only")).toBeVisible();
  await expect(page.getByText("Local rows: 3")).toBeVisible();
  await expect(page.getByRole("link", { name: /GBIF species search/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh research" })).toBeVisible();
  await expect(page.getByText("Local workbook evidence and deterministic guardrails")).toBeVisible();
});

test("species explorer exposes every imported species option", async ({ page }) => {
  await page.addInitScript(() => {
    const speciesSummaries = Array.from({ length: 250 }, (_value, index) => ({
      species: `Species ${String(index + 1).padStart(2, "0")} testii`,
      rows: 1,
      accessions: 1,
      treatments: 1,
      pcCount: 1,
      bestTreatment: "CS",
      bestPcMean: 1,
      confidence: "Needs replication"
    }));
    const baseDashboard = {
      batch: {
        id: 12,
        filename: "fixture.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "hash",
        rowCount: 250,
        accessionCount: 250,
        speciesCount: 250,
        treatmentCount: 1,
        warnings: []
      },
      metrics: {
        trials: 250,
        accessions: 250,
        species: 250,
        treatments: 1,
        doneRate: 0,
        observationsExtracted: 0
      },
      treatmentSummaries: [],
      speciesSummaries,
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: false,
        state: "not_configured",
        message: "Load cached AI research or add an OpenAI key to generate it.",
        model: null,
        generatedAt: null
      },
      openAi: {
        configured: false,
        state: "not_configured",
        message: "Load cached AI research or add an OpenAI key to generate it.",
        model: null,
        generatedAt: null
      }
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      selectWorkbook: async () => baseDashboard,
      importLocalDefaultWorkbook: async () => baseDashboard,
      saveOpenAiKey: async () => ({ configured: true, safeStorageAvailable: true, dashboard: baseDashboard }),
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async () => baseDashboard,
      researchSpecies: async (_batchId: number, species: string) => ({
        species,
        status: "no_sources",
        plantFamily: null,
        familySource: "unknown",
        deterministicConfidence: "Needs replication",
        summary: "No cached research in this test.",
        likelyStrategy: "Import evidence remains visible.",
        familyPattern: "Family context is unresolved.",
        recommendedTechniques: [],
        protocolGaps: ["No cached response."],
        nextTrialDesign: "Repeat local trials.",
        caveats: ["No AI output."],
        evidenceNotes: ["No cache."],
        localEvidence: [],
        sources: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
        model: null
      }),
      askQuestion: async () => ({
        answer: "No answer.",
        caveats: [],
        citedRows: [],
        model: "gpt-5.5",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  const lastSpecies = page.getByRole("button").filter({ hasText: "Species 250 testii" });
  await expect(lastSpecies).toHaveCount(1);
  await lastSpecies.scrollIntoViewIfNeeded();
  await lastSpecies.click();
  await expect(page.getByRole("heading", { name: "Species 250 testii" })).toBeVisible();
});

test("saving a key immediately enables AI controls without auto-generating", async ({ page }) => {
  await page.addInitScript(() => {
    const baseDashboard = {
      batch: {
        id: 8,
        filename: "fixture.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "hash",
        rowCount: 1,
        accessionCount: 1,
        speciesCount: 1,
        treatmentCount: 1,
        warnings: []
      },
      metrics: {
        trials: 1,
        accessions: 1,
        species: 1,
        treatments: 1,
        doneRate: 0,
        observationsExtracted: 0
      },
      treatmentSummaries: [],
      speciesSummaries: [
        {
          species: "Lomatium testii",
          rows: 1,
          accessions: 1,
          treatments: 1,
          pcCount: 1,
          bestTreatment: "CS",
          bestPcMean: 5,
          confidence: "Needs replication"
        }
      ],
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: false,
        state: "not_configured",
        message: "OpenAI is optional.",
        model: null,
        generatedAt: null
      }
    };
    const savedDashboard = {
      ...baseDashboard,
      aiInsightStatus: {
        configured: true,
        state: "not_generated",
        message: "OpenAI is configured. Species Explorer research runs live and is not stored in SQLite.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      selectWorkbook: async () => baseDashboard,
      importLocalDefaultWorkbook: async () => baseDashboard,
      saveOpenAiKey: async (_key: string, batchId?: number) => {
        (window as any).savedKeyBatchId = batchId;
        return { configured: true, safeStorageAvailable: true, dashboard: savedDashboard };
      },
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async (force?: boolean, batchId?: number) => {
        (window as any).keySaveGenerationArgs = { force, batchId };
        return savedDashboard;
      },
      researchSpecies: async (batchId: number, species: string, force?: boolean) => {
        (window as any).keySaveResearchArgs = { batchId, species, force };
        return {
          species,
          status: "no_sources",
          plantFamily: null,
          familySource: "unknown",
          deterministicConfidence: "Needs replication",
          summary: "OpenAI could not produce a valid local-evidence germination assessment.",
          likelyStrategy: "Use local evidence only as trial-planning context.",
          familyPattern: "Family context is unresolved.",
          recommendedTechniques: [],
          protocolGaps: ["No external literature service is used in this app path."],
          nextTrialDesign: "Repeat the local candidate against a control.",
          caveats: ["Technique claims must be grounded in local workbook rows."],
          evidenceNotes: ["Local evidence remains available."],
          localEvidence: [],
          sources: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
          model: null
        };
      },
      askQuestion: async () => ({
        answer: "Use CS cautiously.",
        caveats: ["Needs replication."],
        citedRows: [2],
        model: "gpt-5.5",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("OpenAI API key").fill("ui-key-placeholder");
  await page.getByRole("button", { name: "Save key" }).click();

  await expect(page.getByText("OpenAI key saved. Ask and Species Explorer research are ready for this import.")).toBeVisible();
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).savedKeyBatchId)).toBe(8);
  await expect.poll(() => page.evaluate(() => (window as any).keySaveGenerationArgs ?? null)).toBeNull();
  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).keySaveResearchArgs)).toEqual({
    batchId: 8,
    species: "Lomatium testii",
    force: false
  });
  await expect(page.getByRole("button", { name: "Refresh research" })).toBeEnabled();
});

test("clearing a key refreshes species explorer AI controls", async ({ page }) => {
  await page.addInitScript(() => {
    let keyCleared = false;
    const configuredDashboard = {
      batch: {
        id: 9,
        filename: "fixture.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "hash",
        rowCount: 1,
        accessionCount: 1,
        speciesCount: 1,
        treatmentCount: 1,
        warnings: []
      },
      metrics: {
        trials: 1,
        accessions: 1,
        species: 1,
        treatments: 1,
        doneRate: 0,
        observationsExtracted: 0
      },
      treatmentSummaries: [],
      speciesSummaries: [
        {
          species: "Lomatium testii",
          rows: 1,
          accessions: 1,
          treatments: 1,
          pcCount: 1,
          bestTreatment: "CS",
          bestPcMean: 5,
          confidence: "Needs replication"
        }
      ],
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: true,
        state: "not_generated",
        message: "OpenAI is configured. Species Explorer research runs live and is not stored in SQLite.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    const clearedDashboard = {
      ...configuredDashboard,
      aiInsightStatus: {
        configured: false,
        state: "not_configured",
        message: "OpenAI is optional. Add an API key to research species and use Ask.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: true, safeStorageAvailable: true }),
      getDashboard: async () => configuredDashboard,
      selectWorkbook: async () => configuredDashboard,
      importLocalDefaultWorkbook: async () => configuredDashboard,
      saveOpenAiKey: async () => ({ configured: true, safeStorageAvailable: true, dashboard: configuredDashboard }),
      clearOpenAiKey: async () => {
        keyCleared = true;
        return { configured: false, safeStorageAvailable: true, dashboard: clearedDashboard };
      },
      generateSpeciesInsights: async () => configuredDashboard,
      researchSpecies: async () => {
        if (keyCleared) throw new Error("No cached AI research was found for this species. Add an OpenAI key to generate it.");
        return new Promise(() => {
          // Keep the first loading state active until the key is cleared.
        });
      },
      askQuestion: async () => ({
        answer: "Use CS cautiously.",
        caveats: ["Needs replication."],
        citedRows: [2],
        model: "gpt-5.5",
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Researching..." })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear key" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();

  await expect(page.getByRole("button", { name: "Run research" })).toHaveCount(0);
  await expect(page.getByText("No cached AI research was found for this species. Add an OpenAI key to generate it.")).toBeVisible();
});
