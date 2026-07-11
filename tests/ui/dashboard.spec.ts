import { test, expect } from "@playwright/test";

test("dashboard renders primary insight surfaces in browser fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Insight Board" })).toBeVisible();
  await expect(page.getByText("Best analyzed paired comparison")).toBeVisible();
  await expect(page.getByText("Species assessment")).toBeVisible();
  await expect(page.getByText("Quality checks")).toBeVisible();
  await expect(page.getByText("Operational follow-up")).toBeVisible();
  await expect(page.getByText("Evidence guardrails")).toHaveCount(0);
  await expect(page.getByText("Ask with deterministic evidence")).toHaveCount(0);
  await expect(page.locator(".native-chart-bar")).toHaveCount(0);
});

test("glossary defines treatment acronyms and flags active-scope unknowns", async ({ page }) => {
  await page.addInitScript(() => {
    const dashboard = {
      batch: { id: 3, filename: "glossary.xlsx", importedAt: "2026-01-01", workbookHash: "hash", rowCount: 13, accessionCount: 5, speciesCount: 3, treatmentCount: 5, warnings: [] },
      metrics: { trials: 13, accessions: 5, species: 3, treatments: 5, doneRate: 0.75, observationsExtracted: 0 },
      treatmentSummaries: [
        { treatment: "CS", propaguleType: "seed", rows: 4, species: 3, accessions: 3, pcCount: 4, pcMean: 4, pcMedian: 4, pcScale: "ordinal_0_5", pcGe4Rate: 1, lpcMean: null, fourPcMean: null, confidence: "Promising", warning: "" },
        { treatment: "CS16", propaguleType: "seed", rows: 1, species: 1, accessions: 1, pcCount: 1, pcMean: 3, pcMedian: 3, pcScale: "ordinal_0_5", pcGe4Rate: 0, lpcMean: null, fourPcMean: null, confidence: "Needs replication", warning: "" },
        { treatment: "C+E", propaguleType: "seed", rows: 2, species: 1, accessions: 1, pcCount: 2, pcMean: 4.5, pcMedian: 4.5, pcScale: "ordinal_0_5", pcGe4Rate: 1, lpcMean: null, fourPcMean: null, confidence: "Needs replication", warning: "" },
        { treatment: "B+A", propaguleType: "stem_cutting", rows: 2, species: 1, accessions: 1, pcCount: 2, pcMean: 3, pcMedian: 3, pcScale: "ordinal_0_5", pcGe4Rate: 0, lpcMean: null, fourPcMean: null, confidence: "Needs replication", warning: "" },
        { treatment: "ARTSUK", propaguleType: "seed", rows: 1, species: 1, accessions: 1, pcCount: 0, pcMean: null, pcMedian: null, pcScale: null, pcGe4Rate: null, lpcMean: null, fourPcMean: null, confidence: "Needs replication", warning: "" }
      ],
      speciesSummaries: [],
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      advancedComparisons: [],
      aiInsightStatus: { configured: false, state: "not_configured", message: "OpenAI optional", model: null, generatedAt: null },
      speciesResearchCacheStatus: null
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => dashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 3,
        scopeHash: "hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 3,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      })
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Glossary", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Treatment Glossary" })).toBeVisible();
  await expect(page.locator(".glossary-note-grid").getByText(/CS means cold stratification/)).toBeVisible();
  await expect(page.getByText("GA seed soak")).toBeVisible();
  await expect(page.getByText("Ethephon seed treatment")).toBeVisible();
  await expect(page.getByText("B = Basal cutting")).toBeVisible();
  await expect(page.getByText("CS16: parser pattern")).toBeVisible();
  await expect(page.getByText("ARTSUK = needs codebook mapping")).toBeVisible();
  await expect(page.getByText("Needs codebook mapping: ARTSUK")).toBeVisible();
});

test("Dataset Manager previews immutable imports and Advanced Analysis exposes formal results", async ({ page }) => {
  await page.addInitScript(() => {
    const scope = { id: 7, name: "Combined latest cohorts", batchIds: [1, 2], workbookHashes: ["a", "b"], scopeHash: "scope-hash", isCombined: true, createdAt: "2026-01-01" };
    const dashboard = {
      batch: { id: 2, filename: "ready.xlsx", importedAt: "2026-01-01", workbookHash: "b", rowCount: 2166, accessionCount: 1000, speciesCount: 500, treatmentCount: 20, warnings: [] },
      batches: [], scope,
      metrics: { trials: 2294, accessions: 1100, species: 510, treatments: 20, doneRate: 0.95, observationsExtracted: 0 },
      treatmentSummaries: [], speciesSummaries: [], pairedComparisons: [], trialQueue: [], dataQualityIssues: [], askSuggestions: [], speciesInsights: [],
      advancedComparisons: [{ id: "seed:C:CS", propaguleType: "seed", baseline: "C", treatment: "CS", pairCount: 537, speciesCount: 447, sourceCount: 400, completedOnly: true, wins: 450, ties: 30, losses: 57, speciesWins: 380, speciesTies: 20, speciesLosses: 47, nonTieWinRate: 0.887, medianDiff: 1, speciesMeanDiff: 1.02, ciLow: 0.91, ciHigh: 1.24, rawPValue: 0.0001, adjustedPValue: 0.0002, cohortDirections: [], confidence: "Strong signal", formalEligible: true, eligibilityReasons: [] }],
      aiInsightStatus: { configured: false, state: "not_configured", message: "OpenAI optional", model: null, generatedAt: null }, speciesResearchCacheStatus: null
    };
    const dataset = { sources: [{ id: 1, label: "ready.xlsx", canonicalPath: "G:/Drive/ready.xlsx", createdAt: "2026-01-01", lastSeenAt: "2026-01-01", latestBatchId: 2, latestWorkbookHash: "b", available: true }], scopes: [scope], activeScopeId: 7 };
    const preview = { token: "preview-1", filename: "ready.xlsx", sourcePath: "G:/Drive/ready.xlsx", workbookHash: "b2", worksheetName: "P_accesions_done", candidates: [{ worksheetName: "P_accesions_done", populatedRows: 2204, headerCoverage: 9, missingHeaders: [], selected: true }, { worksheetName: "Alternate accessions", populatedRows: 2000, headerCoverage: 9, missingHeaders: [], selected: false }], populatedRows: 2204, acceptedRows: 2166, quarantinedRows: [{ sourceRow: 35, worksheetName: "P_accesions_done", reasons: ["Missing treatment"], pAccession: "P35", sourceAccession: null, species: "Species test", treatment: null }], issues: [], unchangedSourceId: null, duplicateCandidates: [] };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }), getDashboard: async () => dashboard,
      getDataset: async () => dataset, getTreatmentCodebook: async () => [], previewWorkbooks: async () => [preview],
      getSpeciesResearchCacheStatus: async () => ({ batchId: 2, scopeHash: "scope-hash", cacheVersion: "v", totalSpecies: 0, researchedSpecies: 0, missingSpecies: [], generatedAtLatest: null }),
      commitImportPreviews: async () => ({ dataset, dashboard }), checkWorkbookUpdate: async () => preview,
      relinkWorkbookSource: async () => preview,
      selectPreviewWorksheet: async (_token: string, worksheetName: string) => ({ ...preview, token: "preview-2", worksheetName, populatedRows: 2000, acceptedRows: 1999 }),
      createAnalysisScope: async () => ({ dataset, dashboard }), setAnalysisScope: async () => ({ dataset, dashboard }),
      saveTreatmentCodebookEntry: async (entry: unknown) => [entry], exportAdvancedAnalysis: async () => null,
      selectWorkbook: async () => dashboard, importLocalDefaultWorkbook: async () => dashboard
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Import spreadsheet" }).click();
  await expect(page.getByRole("heading", { name: "Dataset Manager" })).toBeVisible();
  await expect(page.getByText("Choose workbooks")).toBeVisible();
  await expect(page.getByText(/Nothing becomes active until you import reviewed versions/)).toBeVisible();
  await expect(page.getByText("Relink moved files")).toBeVisible();
  await expect(page.getByText("Pick what to analyze")).toBeVisible();
  await expect(page.getByText("Document unknown codes")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose workbook files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create combined scope" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workbook sources" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active analysis scope" })).toBeVisible();
  await expect(page.getByText(/Advanced: this is where documented local treatment codes/)).toBeVisible();
  await expect(page.locator(".codebook-form input, .codebook-form select, .codebook-form button")).toHaveCount(5);
  await expect
    .poll(() =>
      page.locator(".codebook-form input, .codebook-form select, .codebook-form button").evaluateAll((elements) => {
        if (elements.length < 5) return true;
        const rects = elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            width: rect.width
          };
        });
        if (rects.some((rect) => rect.width === 0 || rect.height === 0)) return true;
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            const sameRow = a.top < b.bottom && b.top < a.bottom;
            const overlaps = a.left < b.right && b.left < a.right;
            if (sameRow && overlaps) return true;
          }
        }
        return false;
      })
    )
    .toBe(false);
  await expect(page.getByText("2166")).toBeVisible();
  await expect(page.getByText("Row 35: Missing treatment")).toBeVisible();
  await expect(page.getByText("Scope: Combined latest cohorts")).toBeVisible();
  await page.getByLabel("Worksheet for ready.xlsx").selectOption("Alternate accessions");
  await expect(page.getByText("Alternate accessions · 2000 populated rows")).toBeVisible();
  await page.getByRole("button", { name: "Advanced Analysis", exact: true }).click();
  await expect(page.getByText("CS vs C")).toBeVisible();
  await expect(page.getByText("0.91 to 1.24")).toBeVisible();
  await expect(page.getByText("Strong signal")).toBeVisible();
});

test("Advanced Analysis explains when a legacy parser omitted completed outcomes", async ({ page }) => {
  await page.addInitScript(() => {
    const scope = {
      id: 17,
      name: "P_accessions_ready.xlsx",
      batchIds: [4],
      workbookHashes: ["ready-hash"],
      importVersions: [{ batchId: 4, workbookHash: "ready-hash", importFormatVersion: 1 }],
      requiresReprocessing: true,
      scopeHash: "legacy-scope",
      codebookHash: "codebook",
      codebookVersion: 1,
      isCombined: false,
      createdAt: "2026-01-01"
    };
    const dashboard = {
      batch: { id: 4, filename: "P_accessions_ready.xlsx", importedAt: "2026-01-01", workbookHash: "ready-hash", rowCount: 2166, accessionCount: 1000, speciesCount: 500, treatmentCount: 20, warnings: [] },
      batches: [], scope,
      metrics: { trials: 2166, accessions: 1000, species: 500, treatments: 20, doneRate: 0, observationsExtracted: 0 },
      treatmentSummaries: [], speciesSummaries: [], pairedComparisons: [], trialQueue: [], dataQualityIssues: [], askSuggestions: [], speciesInsights: [], advancedComparisons: [],
      aiInsightStatus: { configured: false, state: "not_configured", message: "OpenAI optional", model: null, generatedAt: null }, speciesResearchCacheStatus: null
    };
    const dataset = { sources: [], scopes: [scope], activeScopeId: 17 };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }), getDashboard: async () => dashboard,
      getDataset: async () => dataset, getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({ batchId: 4, scopeHash: "legacy-scope", cacheVersion: "v", totalSpecies: 0, researchedSpecies: 0, missingSpecies: [], generatedAtLatest: null })
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Advanced Analysis", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Analysis refresh required");
  await expect(page.getByText("No eligible completed treatment contrasts in this scope.")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Dataset Manager" }).click();
  await expect(page.getByRole("heading", { name: "Dataset Manager" })).toBeVisible();
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
      treatmentSummaries: [
        {
          treatment: "Cold stratification for 120 days with alternating temperatures",
          rows: 2,
          species: 2,
          accessions: 2,
          pcCount: 2,
          pcMean: 80,
          pcMedian: 80,
          pcScale: "percent_0_100",
          pcGe4Rate: 1,
          lpcMean: null,
          fourPcMean: null,
          confidence: "Promising",
          warning: "Needs replication."
        }
      ],
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
          speciesCount: 2,
          confidence: "Needs replication",
          falsePositiveRisk: "Elevated.",
          falseNegativeRisk: "Elevated. The treatment may work, but this dataset is underpowered.",
          additionalTrialsNeeded: 3,
          replicationTargetBasis:
            "Minimum paired rows and species needed for the next evidence-tier review; this is not a statistical power estimate.",
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
          pc: null
        },
        {
          accession: "P2",
          species: "Ceanothus velutinus",
          treatment: "SCAR+CS",
          status: "ND",
          priority: "medium",
          nextDate: "2026-01-02",
          nextStep: "Resolve the ND follow-up and record the settled outcome.",
          reason: "High germination on an active row can shift recommendations once completion and survival are known.",
          sourceRows: [19],
          blockedMetric: "D|ND",
          pc: 5
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
        },
        {
          id: "sparse-notes",
          severity: "low",
          category: "notes",
          title: "Sparse observation notes",
          detail: "A completed row has no supporting note.",
          impact: "The recorded outcome has less audit context.",
          action: "Add an observation note when details are available.",
          affectedRows: 1,
          sourceRows: [21],
          species: ["Phacelia heterophylla"],
          treatments: ["CS"],
          metric: "Notes"
        },
        {
          id: "germination-without-liner-followup",
          severity: "medium",
          category: "follow_up",
          title: "High germination without liner follow-up",
          detail: "Rows with PC 4-5 still need production survival checks before being treated as a complete success.",
          impact: "A germination method can look successful even if seedlings fail after transfer.",
          action: "Record LPC and later 4PC for high-PC rows before turning them into protocol recommendations.",
          affectedRows: 1,
          sourceRows: [22],
          species: ["Phacelia heterophylla"],
          treatments: ["CS"],
          metric: "LPC"
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
      scopeHash: "hash",
      cacheVersion: "species-research-v4",
      totalSpecies: 3,
      researchedSpecies: 3,
      missingSpecies: [],
      generatedAtLatest: "2026-01-02T00:00:00.000Z"
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => dashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      previewWorkbooks: async () => [],
      checkWorkbookUpdate: async () => null,
      commitImportPreviews: async () => ({ dataset: { sources: [], scopes: [], activeScopeId: null }, dashboard }),
      createAnalysisScope: async () => ({ dataset: { sources: [], scopes: [], activeScopeId: null }, dashboard }),
      setAnalysisScope: async () => ({ dataset: { sources: [], scopes: [], activeScopeId: null }, dashboard }),
      saveTreatmentCodebookEntry: async () => [],
      exportAdvancedAnalysis: async () => null,
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
  await expect(page.getByText(/SQLite/i)).toHaveCount(0);
  await expect(page.getByText("3 / 3 researched species")).toBeVisible();
  await expect(page.getByText("All imported species have cached AI research for the demo.")).toBeVisible();

  await page.getByRole("button", { name: "Open Data Quality" }).click();
  await expect(page.getByText("Rows 12")).toBeVisible();
  await expect(page.getByText("Grindelia stricta")).toBeVisible();
  await page.getByRole("button", { name: "Replication" }).click();
  await expect(page.getByText(/n=2 paired rows across 2 species/)).toBeVisible();
  await expect(page.getByText(/3 minimum additional paired rows to reach the next evidence-tier review/)).toBeVisible();
  await expect(page.getByText("Replication target basis")).toBeVisible();
  await expect(page.getByText(/not a statistical power estimate/)).toBeVisible();
  await page.getByRole("button", { name: "Codebook" }).click();
  await expect(page.getByText("Rows 19")).toBeVisible();
  await expect(page.getByText("Review the treatment codebook.")).toBeVisible();
  await page.getByRole("button", { name: "Notes" }).click();
  const lowIssue = page.locator(".quality-action.low", { hasText: "Sparse observation notes" });
  await expect(lowIssue.locator("svg")).toHaveClass(/lucide-triangle-alert/);
  await page.getByRole("button", { name: "Follow-up" }).click();
  await expect(page.getByText("High germination without liner follow-up")).toBeVisible();
  await expect(page.getByText("Rows 22")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review priorities" })).toHaveCount(0);

  await page.getByRole("button", { name: "Trial Queue", exact: true }).click();
  await expect(page.getByText("Record PC score for row 12.")).toBeVisible();
  await expect(page.getByText("Resolve the ND follow-up and record the settled outcome.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Reference date" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "PC observation" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Signal" })).toHaveCount(0);
  await expect(page.getByText("5 / 5")).toBeVisible();
  await expect(page.getByText("Promising", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Treatment Comparator", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Treatment score overview" })).toBeVisible();
  await expect(page.getByText("Evidence tier", { exact: true })).toBeVisible();
  const fullTreatmentLabel = page.getByText("Cold stratification for 120 days with alternating temperatures", {
    exact: true
  });
  await expect(fullTreatmentLabel).toBeVisible();
  await expect(fullTreatmentLabel).toHaveCSS("white-space", "normal");
  await expect(page.getByText("80.0%")).toBeVisible();
  await expect(page.getByText("100", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".native-chart-bar").first().evaluate((bar) => Number.parseFloat((bar as HTMLElement).style.width))
    )
    .toBeLessThanOrEqual(100);
});

test("paired comparison direction bars remain valid when no pairs are available", async ({ page }) => {
  await page.addInitScript(() => {
    const dashboard = {
      batch: {
        id: 31,
        filename: "zero-pairs.xlsx",
        importedAt: "2026-01-01T00:00:00.000Z",
        workbookHash: "zero-pairs-hash",
        rowCount: 0,
        accessionCount: 0,
        speciesCount: 0,
        treatmentCount: 0,
        warnings: []
      },
      metrics: { trials: 0, accessions: 0, species: 0, treatments: 0, doneRate: 0, observationsExtracted: 0 },
      treatmentSummaries: [],
      speciesSummaries: [],
      pairedComparisons: [
        {
          baseline: "C",
          treatment: "CS",
          n: 0,
          improved: 0,
          tied: 0,
          worse: 0,
          meanDiff: 0,
          medianDiff: 0,
          ciLow: 0,
          ciHigh: 0,
          speciesCount: 0,
          confidence: "Inconclusive",
          falsePositiveRisk: "No pairs are available.",
          falseNegativeRisk: "No pairs are available.",
          additionalTrialsNeeded: 1,
          replicationTargetBasis: "Add paired rows before assessing this comparison.",
          examples: []
        }
      ],
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
      },
      speciesResearchCacheStatus: null
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => dashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 31,
        scopeHash: "zero-pairs-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 0,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      })
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Treatment Comparator", exact: true }).click();
  const directionBars = page.locator(".direction-bars > span");
  await expect(directionBars).toHaveCount(3);
  await expect
    .poll(() => directionBars.evaluateAll((bars) => bars.map((bar) => bar.style.getPropertyValue("--bar"))))
    .toEqual(["0%", "0%", "0%"]);
});

test("overview cards navigate to dedicated workspaces", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Open comparator" }).click();
  await expect(page.getByRole("heading", { name: "Treatment Comparator" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();

  await page.getByRole("button", { name: "Insight Board", exact: true }).click();
  await page.getByRole("button", { name: "Open Species Explorer" }).click();
  await expect(page.getByRole("heading", { name: "AI Research Assessment" })).toBeVisible();

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
  await expect(page.getByRole("button", { name: "Insight Board", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );

  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Species Explorer", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByRole("button", { name: "Insight Board", exact: true })).not.toHaveAttribute("aria-current");
  await expect(page.getByRole("heading", { name: "AI Research Assessment" })).toBeVisible();
  await expect(page.getByText("Import a workbook before researching species.")).toBeVisible();

  await page.getByRole("button", { name: "Treatment Comparator", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Treatment score overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();
  await expect(page.getByText("Data quality warnings")).toHaveCount(0);

  await page.getByRole("button", { name: "Trial Queue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trial Queue", exact: true })).toBeVisible();
  await expect(page.getByText("Row-specific follow-up work")).toBeVisible();

  await page.getByRole("button", { name: "Data Quality", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Data quality action queue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review priorities" })).toHaveCount(0);

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
  const closeSettings = page.getByRole("button", { name: "Close settings" });
  const apiKeyInput = page.getByLabel("OpenAI API key");
  await expect(closeSettings).toBeFocused();
  await closeSettings.press("Shift+Tab");
  await expect(apiKeyInput).toBeFocused();
  await apiKeyInput.press("Tab");
  await expect(closeSettings).toBeFocused();
  await closeSettings.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();
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
        message: "OpenAI is configured. Species Explorer research runs live and is not saved to the local database.",
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
            sourceIds: ["source-1"],
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
      sources: [
        {
          id: "source-1",
          title: "Native seed dormancy review",
          url: "https://example.com/native-seed-review",
          source: "openai_web",
          venue: "Propagation Research Journal",
          year: 2025,
          doi: null,
          matchedQuery: "Lomatium seed dormancy cold stratification",
          relevance: "species",
          abstractSnippet: "Supports dormancy-aware stratification trial framing."
        }
      ],
      generatedAt: "2026-01-01T00:00:00.000Z",
      model: "gpt-5.5"
    };
    let resolveSpeciesResearch: (() => void) | undefined;
    const speciesResearch = new Promise<typeof researchResult>((resolve) => {
      resolveSpeciesResearch = () => resolve(researchResult);
    });
    (window as any).resolveSpeciesResearch = () => resolveSpeciesResearch?.();
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: true, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 7,
        scopeHash: "fixture-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 1,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      }),
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
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByRole("heading", { name: "Send workbook evidence to OpenAI?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Researching..." })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Running source-backed germination research" })).toBeVisible();
  await expect(page.getByText("Searching web sources, checking taxonomy context, and connecting findings to workbook rows.")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).speciesResearchArgs)).toEqual({
    batchId: 7,
    species: "Lomatium testii",
    force: false
  });
  await page.evaluate(() => (window as any).resolveSpeciesResearch());
  await expect(page.getByText("Cold stratification is the best research-backed trial candidate, but still needs replication.")).toBeVisible();
  await expect(page.getByText("Use cold stratification as a small paired trial, not as a production protocol.")).toBeVisible();
  await expect(page.getByText("Apiaceae · Family inferred from taxonomy")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research-backed technique candidates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protocol gaps to resolve" })).toBeVisible();
  await expect(page.getByText("Mixed evidence")).toBeVisible();
  await expect(page.getByText("Protocol frame")).toBeVisible();
  await expect(page.getByText("Controls", { exact: true })).toBeVisible();
  await expect(page.getByText("Success criteria")).toBeVisible();
  await expect(page.getByText("Risk checks")).toBeVisible();
  await expect(page.getByText("CS temperature, substrate, moisture, and light regime are not defined in this fixture.")).toBeVisible();
  await expect(page.getByText("Sources: Native seed dormancy review (2025)")).toBeVisible();
  await expect(page.getByText("Local rows: 3")).toBeVisible();
  await expect(page.getByText("Sources cited in this assessment; workbook rows own deterministic evidence tiers.")).toBeVisible();
  await expect(page.getByRole("link", { name: /GBIF species search/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refresh research" })).toBeVisible();
  await expect(page.getByText("Local workbook evidence and deterministic guardrails")).toBeVisible();
  const assessmentCard = page.locator(".ai-assessment-card");
  const supportGrid = page.locator(".species-support-grid");
  await expect(assessmentCard).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".species-detail").evaluate((detail) => {
        const card = detail.querySelector(".ai-assessment-card");
        const support = detail.querySelector(".species-support-grid");
        return Boolean(card && support && card.compareDocumentPosition(support) & Node.DOCUMENT_POSITION_FOLLOWING);
      })
    )
    .toBe(true);
  const familyCardSpacing = await supportGrid.locator(".species-detail-section").first().evaluate((card) => {
    const heading = card.querySelector("h4");
    const copy = card.querySelector("p");
    if (!heading || !copy) return Number.POSITIVE_INFINITY;
    return copy.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
  });
  expect(familyCardSpacing).toBeLessThan(20);
});

test("species explorer treats user-cancelled OpenAI research as cancellation feedback", async ({ page }) => {
  await page.addInitScript(() => {
    const dashboard = {
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
        message: "OpenAI is configured. Species Explorer research runs live and is not saved to the local database.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    (window as any).researchCalls = 0;
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: true, safeStorageAvailable: true }),
      getDashboard: async () => dashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 7,
        scopeHash: "fixture-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 1,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      }),
      selectWorkbook: async () => dashboard,
      importLocalDefaultWorkbook: async () => dashboard,
      saveOpenAiKey: async () => ({ configured: true, safeStorageAvailable: true, dashboard }),
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async () => dashboard,
      researchSpecies: async () => {
        (window as any).researchCalls += 1;
        throw new Error("Error invoking remote method 'openai:researchSpecies': Error: Request cancelled by user.");
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
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByRole("heading", { name: "Send workbook evidence to OpenAI?" })).toBeVisible();
  await expect(page.getByText("Cancel keeps workbook data local and does not start the OpenAI request.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Request cancelled by user" })).toBeVisible();
  await expect(page.getByText("No OpenAI request was sent.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research did not complete" })).toHaveCount(0);
  await expect(page.getByText(/Error invoking remote method/)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).researchCalls)).toBe(0);

  await page.getByRole("button", { name: "Insight Board", exact: true }).click();
  const heroCopy = page.locator(".hero-copy");
  await expect(heroCopy).toContainText("3 trial rows");
  await expect(heroCopy).not.toContainText("Request cancelled by user");
});

test("species explorer exposes every imported species option", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__researchCalls = 0;
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
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 11,
        scopeHash: "species-list-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 250,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      }),
      selectWorkbook: async () => baseDashboard,
      importLocalDefaultWorkbook: async () => baseDashboard,
      saveOpenAiKey: async () => ({ configured: true, safeStorageAvailable: true, dashboard: baseDashboard }),
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async () => baseDashboard,
      researchSpecies: async (_batchId: number, species: string) => {
        (window as any).__researchCalls += 1;
        return {
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
        };
      },
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
  await expect(page.getByText("OpenAI key is not configured")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load cached research" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).__researchCalls)).toBe(0);
  const speciesList = page.getByRole("navigation", { name: "Species" });
  await expect(speciesList.getByRole("button")).toHaveCount(250);
  await page.getByLabel("Filter species").fill("Species 250");
  await expect(speciesList.getByRole("button")).toHaveCount(1);
  const lastSpecies = speciesList.getByRole("button", { name: /Species 250 testii/ });
  await expect(lastSpecies).toHaveAttribute("aria-pressed", "false");
  await lastSpecies.click();
  await expect(lastSpecies).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Species 250 testii" })).toBeVisible();
  await page.getByLabel("Filter species").fill("not a species");
  await expect(page.getByText("No species match this filter.")).toBeVisible();
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
        message: "OpenAI is configured. Species Explorer research runs live and is not saved to the local database.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: false, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 8,
        scopeHash: "fixture-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 1,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      }),
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

  await expect(page.locator(".hero-copy")).toContainText("1 trial row");
  await expect(page.locator(".hero-copy")).not.toContainText("OpenAI key saved");
  await expect(page.locator(".workspace-status")).toContainText(
    "OpenAI key saved. Ask and Species Explorer research are ready for this import."
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("OpenAI key saved. Ask and Species Explorer research are ready for this import.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).savedKeyBatchId)).toBe(8);
  await expect.poll(() => page.evaluate(() => (window as any).keySaveGenerationArgs ?? null)).toBeNull();
  await page.getByRole("button", { name: "Species Explorer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run research" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).keySaveResearchArgs ?? null)).toBeNull();
  await page.getByRole("button", { name: "Run research" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
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
        message: "OpenAI is configured. Species Explorer research runs live and is not saved to the local database.",
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
      getDataset: async () => ({ sources: [], scopes: [], activeScopeId: null }),
      getTreatmentCodebook: async () => [],
      getSpeciesResearchCacheStatus: async () => ({
        batchId: 8,
        scopeHash: "fixture-hash",
        cacheVersion: "species-research-v4",
        totalSpecies: 1,
        researchedSpecies: 0,
        missingSpecies: [],
        generatedAtLatest: null
      }),
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
  await page.getByRole("button", { name: "Run research" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Researching..." })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear key" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();

  await expect(page.getByRole("button", { name: "Load cached research" })).toBeDisabled();
});
