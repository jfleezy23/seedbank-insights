import { test, expect } from "@playwright/test";

test("dashboard renders primary insight surfaces in browser fallback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Insight Board" })).toBeVisible();
  await expect(page.getByText("Paired trials first")).toBeVisible();
  await expect(page.getByText("Evidence guardrails")).toBeVisible();
  await expect(page.getByText("Ask with deterministic evidence")).toBeVisible();
  await expect(page.locator(".native-chart-bar").first()).toBeVisible();
});

test("sidebar navigation renders distinct workspaces and settings state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "Portland State University" })).toBeVisible();

  await page.getByRole("button", { name: "Species Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Species insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deterministic species summary" })).toBeVisible();

  await page.getByRole("button", { name: "Treatment Comparator" }).click();
  await expect(page.getByRole("heading", { name: "Treatment success" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paired trials first" })).toBeVisible();

  await page.getByRole("button", { name: "Trial Queue" }).click();
  await expect(page.getByRole("heading", { name: "Trial Queue", exact: true })).toBeVisible();
  await expect(page.getByText("ND rows and follow-ups")).toBeVisible();

  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByRole("heading", { name: "Ask", exact: true })).toBeVisible();
  await expect(page.getByLabel("Question")).not.toHaveAttribute("readonly");
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeDisabled();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("OpenAI API key")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("species explorer can generate and regenerate cached AI insights", async ({ page }) => {
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
        message: "OpenAI is configured. Generate species insights for this import.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    const generatedDashboard = {
      ...baseDashboard,
      speciesInsights: [
        {
          species: "Lomatium testii",
          deterministicConfidence: "Promising",
          summary: "Cold stratification is promising but still needs replication.",
          keyFindings: ["CS has the highest PC scores in the submitted rows."],
          nextSteps: ["Repeat paired control and CS trays."],
          confidenceCaveat: "Deterministic labels stay authoritative.",
          evidence: [{ sourceRow: 3, accession: "P1", treatment: "CS", observation: "PC 5; status ND" }],
          generatedBy: "openai",
          model: "gpt-5.5",
          generatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      aiInsightStatus: {
        configured: true,
        state: "ready",
        message: "Cached species insights available for 1 species.",
        model: "gpt-5.5",
        generatedAt: "2026-01-01T00:00:00.000Z"
      }
    };
    let resolveSpeciesGeneration: (() => void) | undefined;
    const speciesGeneration = new Promise<typeof generatedDashboard>((resolve) => {
      resolveSpeciesGeneration = () => resolve(generatedDashboard);
    });
    (window as any).resolveSpeciesGeneration = () => resolveSpeciesGeneration?.();
    (window as any).seedbank = {
      getOpenAiStatus: async () => ({ configured: true, safeStorageAvailable: true }),
      getDashboard: async () => baseDashboard,
      selectWorkbook: async () => baseDashboard,
      importLocalDefaultWorkbook: async () => baseDashboard,
      saveOpenAiKey: async (_key: string, batchId?: number) => {
        (window as any).savedKeyBatchId = batchId;
        return { configured: true, safeStorageAvailable: true, dashboard: generatedDashboard };
      },
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true }),
      generateSpeciesInsights: async (force?: boolean, batchId?: number) => {
        (window as any).speciesGenerationArgs = { force, batchId };
        return speciesGeneration;
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
  await page.getByRole("button", { name: "Species Explorer" }).click();
  await expect(page.getByRole("button", { name: "Generate species insights" })).toBeVisible();

  await page.getByRole("button", { name: "Generate species insights" }).click();
  await expect(page.getByRole("button", { name: "Generating..." })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as any).speciesGenerationArgs)).toEqual({
    force: false,
    batchId: 7
  });
  await page.evaluate(() => (window as any).resolveSpeciesGeneration());
  await expect(page.getByText("Cold stratification is promising but still needs replication.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Regenerate insights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Deterministic species summary" })).toBeVisible();
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
        message: "OpenAI is configured. Generate species insights for this import.",
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

  await expect(page.getByText("OpenAI key saved. Ask is ready, and species insights can be generated for this import.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask OpenAI" })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).savedKeyBatchId)).toBe(8);
  await expect.poll(() => page.evaluate(() => (window as any).keySaveGenerationArgs ?? null)).toBeNull();
  await page.getByRole("button", { name: "Species Explorer" }).click();
  await expect(page.getByRole("button", { name: "Generate species insights" })).toBeEnabled();
});

test("clearing a key refreshes species explorer AI controls", async ({ page }) => {
  await page.addInitScript(() => {
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
      speciesSummaries: [],
      pairedComparisons: [],
      trialQueue: [],
      dataQualityIssues: [],
      askSuggestions: [],
      speciesInsights: [],
      aiInsightStatus: {
        configured: true,
        state: "not_generated",
        message: "OpenAI is configured. Generate species insights for this import.",
        model: "gpt-5.5",
        generatedAt: null
      }
    };
    const clearedDashboard = {
      ...configuredDashboard,
      aiInsightStatus: {
        configured: false,
        state: "not_configured",
        message: "OpenAI is optional. Add an API key to generate cached species insights on import.",
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
      clearOpenAiKey: async () => ({ configured: false, safeStorageAvailable: true, dashboard: clearedDashboard }),
      generateSpeciesInsights: async () => configuredDashboard,
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
  await page.getByRole("button", { name: "Species Explorer" }).click();
  await expect(page.getByRole("button", { name: "Generate species insights" })).toBeVisible();

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Clear key" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();

  await expect(page.getByRole("button", { name: "Generate species insights" })).toHaveCount(0);
  await expect(page.getByText("Add an OpenAI key in Settings to generate species insights.")).toBeVisible();
});
