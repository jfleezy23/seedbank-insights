import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SeedBankDatabase } from "./database";
import {
  answerSpreadsheetQuestion,
  OPENAI_INSIGHT_MODEL,
  suggestHeaderAliases
} from "./openai-insights";
import { researchSpeciesWithExternalSources, summarizeSpeciesResearchCacheStatus } from "./species-research";
import {
  importPreparedWorkbook,
  inspectPreparedWorkbookCandidates,
  inspectPreparedWorkbookHeaders,
  prepareWorkbook,
  type PreparedWorkbook
} from "../../src/core/workbook";
import { buildAdvancedAnalysisRows, buildAdvancedComparisons } from "../../src/core/statistics";
import { csvFromRows } from "../../src/core/csv";
import type {
  AiInsightStatus,
  DashboardData,
  DatasetState,
  ImportPreview,
  ImportBatchSummary,
  ImportResult,
  SpeciesResearchCacheStatus,
  SpeciesResearchResult,
  TreatmentCodebookEntry
} from "../../src/core/types";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let database: SeedBankDatabase | null = null;
const speciesResearchCache = new Map<string, unknown>();
const speciesResearchInFlight = new Map<string, Promise<SpeciesResearchResult>>();
const pendingImports = new Map<string, { result: ImportResult; createdAt: number }>();
const MAX_PENDING_IMPORTS = 20;
const PENDING_IMPORT_TTL_MS = 30 * 60 * 1000;
const SPECIES_RESEARCH_CACHE_VERSION = "species-research-v7";
const configuredSplashMs = Number.parseInt(process.env.SEEDBANK_SPLASH_MIN_MS ?? "1100", 10);
const MIN_SPLASH_MS = Number.isFinite(configuredSplashMs) ? Math.max(0, configuredSplashMs) : 1100;
let splashShownAt = 0;
let revealTimer: NodeJS.Timeout | null = null;
let launchErrorShown = false;

function configureUserDataPath(): void {
  const override = process.env.SEEDBANK_USER_DATA_DIR?.trim();
  if (!override) return;
  fs.mkdirSync(override, { recursive: true });
  app.setPath("userData", override);
}

function appRootPath(): string {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, "../../..");
}

function appAssetPath(...segments: string[]): string {
  return path.join(appRootPath(), ...segments);
}

function appIconPath(): string {
  const iconFile = process.platform === "win32" ? "app-icon.ico" : "app-icon.png";
  return appAssetPath("assets", "branding", iconFile);
}

function dockIconPath(): string {
  return appAssetPath("assets", "branding", "app-icon.png");
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
}

function openAiFailureMessage(action: string): string {
  return `OpenAI ${action} failed. Check Settings, network access, and the API key, then try again.`;
}

function requireOpenAiDataTransferConfirmation(confirmed: unknown): void {
  if (confirmed !== true) throw new Error("Request cancelled by user.");
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => path.resolve(candidate)))];
}

function aiResponseCacheDir(): string {
  return path.join(app.getPath("userData"), "ai-response-cache", SPECIES_RESEARCH_CACHE_VERSION);
}

function speciesCacheSlug(species: string): string {
  return species
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function speciesResearchCacheKey(identity: string, species: string): string {
  return `${identity.slice(0, 16)}-${speciesCacheSlug(species)}`;
}

function speciesResearchCachePath(identity: string, species: string): string {
  return path.join(aiResponseCacheDir(), `${speciesResearchCacheKey(identity, species)}.json`);
}

function speciesResearchCacheCandidatePaths(identity: string, species: string): string[] {
  return uniquePaths([speciesResearchCachePath(identity, species)]);
}

async function readSpeciesResearchCache(
  identity: string,
  species: string
): Promise<SpeciesResearchResult | null> {
  for (const candidatePath of speciesResearchCacheCandidatePaths(identity, species)) {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(candidatePath, "utf8")) as {
        version?: string;
        result?: SpeciesResearchResult;
      };
      if (!parsed.result) continue;
      const requestedSpecies = species.trim().replace(/\s+/g, " ").toLowerCase();
      const cachedSpecies = parsed.result.species.trim().replace(/\s+/g, " ").toLowerCase();
      if (parsed.version !== SPECIES_RESEARCH_CACHE_VERSION || cachedSpecies !== requestedSpecies) continue;
      return parsed.result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Unable to read species research cache: ${sanitizeErrorMessage(error)}`);
      }
    }
  }
  return null;
}

async function getSpeciesResearchCacheStatus(batchId?: number): Promise<SpeciesResearchCacheStatus> {
  const database = getDatabase();
  const active = database.getDatasetState().activeScopeId;
  const dashboard = active ? database.getDashboardForScope(active) : database.getDashboard(batchId);
  const batch = dashboard.batch;
  if (!batch?.id) {
    return {
      batchId: null,
      scopeHash: null,
      cacheVersion: SPECIES_RESEARCH_CACHE_VERSION,
      totalSpecies: 0,
      researchedSpecies: 0,
      missingSpecies: [],
      generatedAtLatest: null
    };
  }

  const scope = dashboard.scope;
  const identity = scope?.scopeHash ?? batch.workbookHash;
  const scopedTrials = active ? database.getTrialsForScope(active) : database.getImportResult(batch.id)?.trials ?? [];
  return summarizeSpeciesResearchCacheStatus({
    batch,
    species: scopedTrials.map((trial) => trial.species),
    cacheVersion: SPECIES_RESEARCH_CACHE_VERSION,
    readCache: (_batch, species) => readSpeciesResearchCache(identity, species)
  }).then((status) => ({ ...status, scopeHash: identity }));
}

async function writeSpeciesResearchCache(
  batch: ImportBatchSummary,
  species: string,
  result: SpeciesResearchResult,
  identity: string
): Promise<void> {
  await fs.promises.mkdir(aiResponseCacheDir(), { recursive: true });
  await fs.promises.writeFile(
    speciesResearchCachePath(identity, species),
    JSON.stringify(
      {
        version: SPECIES_RESEARCH_CACHE_VERSION,
        cachedAt: new Date().toISOString(),
        workbookHash: batch.workbookHash,
        analysisScopeHash: identity,
        batchFilename: batch.filename,
        species,
        result
      },
      null,
      2
    )
  );
}

function getDatabase(): SeedBankDatabase {
  if (!database) {
    const dbPath = path.join(app.getPath("userData"), "seedbank-insights.sqlite");
    database = new SeedBankDatabase(dbPath);
  }
  return database;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 1000,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    title: "SeedBank Insights",
    backgroundColor: "#ffffff",
    icon: appIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", revealMainWindow);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.once("did-fail-load", (_event, code, description, failingUrl) => {
    showLaunchError(new Error(`Failed to load ${failingUrl}: ${code} ${description}`));
  });

  const load = app.isPackaged
    ? mainWindow.loadFile(appAssetPath("dist", "index.html"))
    : mainWindow.loadURL("http://127.0.0.1:5173");

  void load.catch((error: unknown) => {
    showLaunchError(error);
  });
}

function createSplashWindow(): Promise<void> {
  splashShownAt = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const fallbackTimer = setTimeout(resolveOnce, 1500);

    function resolveOnce(): void {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      resolve();
    }

    splashWindow = new BrowserWindow({
      width: 500,
      height: 310,
      center: true,
      frame: false,
      resizable: false,
      show: false,
      title: "SeedBank Insights",
      backgroundColor: "#213921",
      icon: appIconPath(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    splashWindow.once("ready-to-show", () => {
      splashWindow?.show();
      resolveOnce();
    });
    splashWindow.webContents.once("did-fail-load", (_event, code, description, failingUrl) => {
      console.error(`SeedBank Insights splash failed to load ${failingUrl}: ${code} ${description}`);
      resolveOnce();
    });
    splashWindow.on("closed", () => {
      splashWindow = null;
      resolveOnce();
    });

    void splashWindow.loadFile(appAssetPath("assets", "branding", "splash.html")).catch((error: unknown) => {
      console.error("SeedBank Insights splash failed to load", error);
      resolveOnce();
    });
  });
}

function revealMainWindow(): void {
  if (revealTimer) return;
  const remainingSplashMs = splashShownAt ? Math.max(0, MIN_SPLASH_MS - (Date.now() - splashShownAt)) : 0;
  revealTimer = setTimeout(() => {
    revealTimer = null;
    splashWindow?.close();
    splashWindow = null;
    mainWindow?.show();
  }, remainingSplashMs);
}

function showLaunchError(error: unknown): void {
  if (launchErrorShown) return;
  launchErrorShown = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error("SeedBank Insights launch failed", error);
  if (revealTimer) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
  splashWindow?.close();
  splashWindow = null;

  const errorHtml = renderLaunchErrorHtml(message);
  if (mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`)
      .then(() => {
        mainWindow?.show();
      })
      .catch((errorPageError: unknown) => {
        console.error("SeedBank Insights launch error page failed to load", errorPageError);
        dialog.showErrorBox("SeedBank Insights launch failed", message);
      });
    return;
  }

  dialog.showErrorBox("SeedBank Insights launch failed", message);
}

function renderLaunchErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SeedBank Insights launch failed</title>
    <style>
      body {
        align-items: center;
        background: #f7f8f2;
        color: #213921;
        display: flex;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        height: 100vh;
        justify-content: center;
        margin: 0;
      }

      main {
        max-width: 620px;
        padding: 36px;
      }

      h1 {
        font-size: 28px;
        line-height: 1.2;
        margin: 0 0 12px;
      }

      p {
        color: #4f5f4d;
        font-size: 16px;
        line-height: 1.5;
        margin: 0 0 18px;
      }

      pre {
        background: #ffffff;
        border: 1px solid #dce4d3;
        border-radius: 8px;
        color: #213921;
        font-size: 13px;
        line-height: 1.45;
        overflow: auto;
        padding: 14px;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>SeedBank Insights could not finish launching.</h1>
      <p>The app stopped before the main workspace was ready. This detail is safe to share with a developer.</p>
      <pre>${escapeHtml(message)}</pre>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

async function launchApp(): Promise<void> {
  launchErrorShown = false;
  await createSplashWindow();
  try {
    getDatabase();
    createWindow();
  } catch (error: unknown) {
    showLaunchError(error);
  }
}

function keyPath(): string {
  return path.join(app.getPath("userData"), "openai-key.bin");
}

function loadOpenAiKey(): string | null {
  if (!fs.existsSync(keyPath()) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(keyPath()));
  } catch (error) {
    console.error("Failed to decrypt OpenAI key", error);
    return null;
  }
}

function optionalBatchId(value: unknown): number | undefined {
  const batchId = Number(value);
  return Number.isSafeInteger(batchId) && batchId > 0 ? batchId : undefined;
}

function openAiConfigured(): boolean {
  return Boolean(loadOpenAiKey());
}

function speciesInImport(importResult: ImportResult, species: string): string | null {
  const normalized = species.trim().replace(/\s+/g, " ").toLowerCase();
  return importResult.trials.find((trial) => trial.species.toLowerCase() === normalized)?.species ?? null;
}

function withOpenAiStatus(dashboard: DashboardData, override?: Partial<AiInsightStatus>): DashboardData {
  const configured = openAiConfigured();
  const base: AiInsightStatus = configured
    ? {
        configured,
        state: "not_generated",
        message: dashboard.batch
          ? "OpenAI is configured. Species Explorer research runs live and is not saved to the local database."
          : "OpenAI is configured. Import a workbook to research species.",
        model: OPENAI_INSIGHT_MODEL,
        generatedAt: null
      }
    : {
        configured,
        state: "not_configured",
        message: "OpenAI is optional. Add an API key to research species and use Ask.",
        model: OPENAI_INSIGHT_MODEL,
        generatedAt: null
      };
  return { ...dashboard, speciesInsights: [], aiInsightStatus: { ...base, ...override, configured } };
}

async function generateSpeciesInsightsForBatch({
  batchId,
  force = false
}: {
  batchId?: number;
  force?: boolean;
} = {}): Promise<DashboardData> {
  const current = getDatabase().getDashboard(batchId);
  const activeBatchId = current.batch?.id;
  const apiKey = loadOpenAiKey();

  if (!activeBatchId) {
    return withOpenAiStatus(current, {
      state: apiKey ? "not_generated" : "not_configured",
      message: apiKey
        ? "Import a workbook before generating species insights."
        : "OpenAI is not configured. Add an API key in Settings.",
      model: apiKey ? OPENAI_INSIGHT_MODEL : null,
      generatedAt: null
    });
  }

  if (!apiKey) {
    return withOpenAiStatus(current, {
      state: "not_configured",
      message: "OpenAI is not configured. Add an API key in Settings.",
      model: null,
      generatedAt: null
    });
  }

  void force;
  return withOpenAiStatus(current, {
    state: "not_generated",
    message: "Species Explorer research runs live per species and is not saved to the local database.",
    model: OPENAI_INSIGHT_MODEL,
    generatedAt: null
  });
}

async function importWorkbookWithOptionalAiPrep(prepared: PreparedWorkbook, sourceId?: number): Promise<ImportResult> {
  const codebook = getDatabase().getTreatmentCodebook();
  const baseOptions = { codebook, sourcePath: path.resolve(prepared.filePath), sourceId };
  const apiKey = loadOpenAiKey();
  if (!apiKey) return importPreparedWorkbook(prepared, baseOptions);
  const profile = inspectPreparedWorkbookHeaders(prepared);
  if (!profile.missingHeaders.length) return importPreparedWorkbook(prepared, baseOptions);
  try {
    const headerAliases = await suggestHeaderAliases({ apiKey, profile });
    return importPreparedWorkbook(prepared, { ...baseOptions, headerAliases });
  } catch (error) {
    console.warn(`OpenAI header mapping failed; falling back to deterministic import: ${sanitizeErrorMessage(error)}`);
    return importPreparedWorkbook(prepared, baseOptions);
  }
}

function clearExpiredPreviews(): void {
  const cutoff = Date.now() - PENDING_IMPORT_TTL_MS;
  for (const [token, pending] of pendingImports) {
    if (pending.createdAt < cutoff) pendingImports.delete(token);
  }
}

function ensurePreviewCapacity(additionalPreviews = 1): void {
  clearExpiredPreviews();
  if (pendingImports.size + additionalPreviews > MAX_PENDING_IMPORTS) {
    throw new Error(`Review or cancel existing previews before adding more than ${MAX_PENDING_IMPORTS} workbooks.`);
  }
}

async function sourceIsReadable(canonicalPath: string): Promise<boolean> {
  if (canonicalPath.startsWith("legacy://")) return false;
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      fs.promises.stat(canonicalPath).then((entry) => entry.isFile(), () => false),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 1_500);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function getDatasetStateWithAvailability(): Promise<DatasetState> {
  const state = getDatabase().getDatasetState();
  const available = await Promise.all(state.sources.map((source) => sourceIsReadable(source.canonicalPath)));
  return {
    ...state,
    sources: state.sources.map((source, index) => ({ ...source, available: available[index] }))
  };
}

async function assertSourceReadable(canonicalPath: string): Promise<void> {
  if (!(await sourceIsReadable(canonicalPath))) {
    throw new Error("The synced workbook is unavailable or cloud-only. Relink it after making the file available offline.");
  }
}

async function previewWorkbook(
  filePath: string,
  sourceId?: number,
  worksheetName?: string,
  capacityReserved = false
): Promise<ImportPreview> {
  if (!capacityReserved) ensurePreviewCapacity();
  const prepared = await prepareWorkbook(filePath, worksheetName);
  const result = await importWorkbookWithOptionalAiPrep(prepared, sourceId);
  const candidates = inspectPreparedWorkbookCandidates(prepared);
  const token = randomUUID();
  pendingImports.set(token, { result, createdAt: Date.now() });
  const existingFormatVersion = getDatabase().getImportFormatVersionByHash(result.batch.workbookHash);
  return {
    token,
    sourcePath: path.resolve(filePath),
    filename: result.batch.filename,
    workbookHash: result.batch.workbookHash,
    candidates,
    worksheetName: result.batch.worksheetName ?? candidates[0]?.worksheetName ?? "",
    populatedRows: result.batch.populatedRowCount ?? result.batch.rowCount,
    acceptedRows: result.batch.rowCount,
    quarantinedRows: (result.quarantinedRows ?? []).map(({ rawCellValues: _rawCellValues, ...row }) => row),
    issues: result.issues,
    duplicateCandidates: result.trials
      .filter((trial) => trial.replicateClassification === "ambiguous_duplicate")
      .map((trial) => trial.sourceRow),
    requiresReprocessing:
      existingFormatVersion !== null && existingFormatVersion < (result.batch.importFormatVersion ?? 1),
    unchangedSourceId:
      getDatabase().getDatasetState().sources.find((source) => source.latestWorkbookHash === result.batch.workbookHash)?.id ?? null
  };
}

ipcMain.handle("dashboard:get", () => withOpenAiStatus(getDatabase().getActiveDashboard()));

ipcMain.handle("dataset:get", () => getDatasetStateWithAvailability());

ipcMain.handle("dataset:previewSelect", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Excel workbooks", extensions: ["xlsx"] }]
  });
  if (result.canceled) return [];
  ensurePreviewCapacity(result.filePaths.length);
  return Promise.all(result.filePaths.map((filePath) => previewWorkbook(filePath, undefined, undefined, true)));
});

ipcMain.handle("dataset:checkUpdate", async (_event, sourceId: unknown) => {
  const id = Number(sourceId);
  const source = getDatabase().getDatasetState().sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error("Workbook source was not found.");
  await assertSourceReadable(source.canonicalPath);
  return previewWorkbook(source.canonicalPath, source.id);
});

ipcMain.handle("dataset:relink", async (_event, sourceId: unknown) => {
  const id = Number(sourceId);
  const source = getDatabase().getDatasetState().sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error("Workbook source was not found.");
  const selected = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Excel workbooks", extensions: ["xlsx"] }]
  });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const resolved = path.resolve(selected.filePaths[0]);
  const collision = getDatabase()
    .getDatasetState()
    .sources.find((candidate) => candidate.id !== id && candidate.canonicalPath === resolved);
  if (collision) throw new Error("That file is already registered as another workbook source.");
  // Relinking is only committed with the reviewed immutable import. Cancelling
  // or rejecting this preview leaves the registered source untouched.
  return previewWorkbook(resolved, id);
});

ipcMain.handle("dataset:selectWorksheet", async (_event, token: unknown, worksheetName: unknown) => {
  clearExpiredPreviews();
  const key = String(token ?? "");
  const pending = pendingImports.get(key);
  if (!pending) throw new Error("The import preview expired. Preview the workbook again.");
  const selectedWorksheet = String(worksheetName ?? "").trim();
  if (!selectedWorksheet) throw new Error("Select a compatible worksheet before importing.");
  pendingImports.delete(key);
  try {
    return await previewWorkbook(
      pending.result.batch.sourcePath ?? pending.result.batch.filename,
      pending.result.batch.sourceId,
      selectedWorksheet
    );
  } catch (error) {
    pendingImports.set(key, pending);
    throw error;
  }
});

ipcMain.handle("dataset:commitPreviews", async (_event, tokens: unknown) => {
  if (!Array.isArray(tokens) || !tokens.length) throw new Error("No import previews were selected.");
  clearExpiredPreviews();
  const selectedTokens = [...new Set(tokens.map(String))];
  const results = selectedTokens.map((token) => {
    const pending = pendingImports.get(token);
    if (!pending) throw new Error("An import preview expired. Preview the workbook again.");
    return pending.result;
  });
  getDatabase().saveImports(results);
  selectedTokens.forEach((token) => pendingImports.delete(token));
  speciesResearchCache.clear();
  return {
    dataset: await getDatasetStateWithAvailability(),
    dashboard: withOpenAiStatus(getDatabase().getActiveDashboard())
  };
});

ipcMain.handle("dataset:createScope", async (_event, name: unknown, batchIds: unknown) => {
  if (!Array.isArray(batchIds)) throw new Error("Select workbook versions for the scope.");
  const database = getDatabase();
  const scope = database.createScope(String(name ?? "Combined analysis"), batchIds.map(Number));
  const dashboard = database.setActiveScope(scope.id);
  return {
    dataset: await getDatasetStateWithAvailability(),
    dashboard: withOpenAiStatus(dashboard)
  };
});

ipcMain.handle("dataset:setScope", async (_event, scopeId: unknown) => {
  const database = getDatabase();
  const dashboard = database.setActiveScope(Number(scopeId));
  return { dataset: await getDatasetStateWithAvailability(), dashboard: withOpenAiStatus(dashboard) };
});

ipcMain.handle("codebook:get", (): TreatmentCodebookEntry[] => getDatabase().getTreatmentCodebook());
ipcMain.handle("codebook:save", async (_event, entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">) => {
  const database = getDatabase();
  const entries = database.saveTreatmentCodebookEntry(entry);
  speciesResearchCache.clear();
  return { entries, dataset: await getDatasetStateWithAvailability(), dashboard: withOpenAiStatus(database.getActiveDashboard()) };
});

ipcMain.handle("analysis:export", async () => {
  const database = getDatabase();
  const dataset = database.getDatasetState();
  const scope = dataset.scopes.find((candidate) => candidate.id === dataset.activeScopeId);
  if (!scope) throw new Error("Select an analysis scope before exporting.");
  const target = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  if (target.canceled || !target.filePaths[0]) return null;
  const directory = target.filePaths[0];
  const trials = database.getTrialsForScope(scope.id);
  const { pairRows, speciesRows } = buildAdvancedAnalysisRows(trials, true);
  const comparisons = buildAdvancedComparisons(trials, true);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `seedbank-analysis-${stamp}`;
  const pairPath = path.join(directory, `${base}-pairs.csv`);
  const speciesPath = path.join(directory, `${base}-species.csv`);
  const manifestPath = path.join(directory, `${base}-manifest.json`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    scope,
    selectedWorkbookHashes: scope.workbookHashes.slice().sort(),
    selectedImportVersions: scope.importVersions.slice().sort((left, right) => left.batchId - right.batchId),
    filters: { status: "D", endpoint: "PC", undocumentedTreatments: "descriptive_only" },
    codebookVersion: scope.codebookVersion,
    codebookHash: scope.codebookHash,
    treatmentCodebook: database.getTreatmentCodebook(),
    estimands: ["median ordinal pair shift", "species-balanced mean shift", "non-tie win rate"],
    randomSeeds: { speciesClusterBootstrap: 1729, iterations: 2000 },
    tests: { speciesLevel: "two-sided exact sign test", ties: "excluded" },
    correctionMethod: "Holm within propagule type",
    comparisons
  };
  await Promise.all([
    fs.promises.writeFile(pairPath, csvFromRows(pairRows as unknown as Array<Record<string, unknown>>), "utf8"),
    fs.promises.writeFile(speciesPath, csvFromRows(speciesRows as unknown as Array<Record<string, unknown>>), "utf8"),
    fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8")
  ]);
  return { directory, files: [pairPath, speciesPath, manifestPath] };
});

ipcMain.handle("openai:speciesResearchCacheStatus", async (_event, batchId?: number) =>
  getSpeciesResearchCacheStatus(optionalBatchId(batchId))
);

ipcMain.handle("openai:status", () => ({
  configured: openAiConfigured(),
  safeStorageAvailable: safeStorage.isEncryptionAvailable()
}));

ipcMain.handle("openai:saveKey", async (_event, key: string, _batchId?: number) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS safe storage is unavailable on this machine.");
  }
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey.startsWith("sk-") || normalizedKey.length < 24) {
    throw new Error("Enter a valid OpenAI API key.");
  }
  const encrypted = safeStorage.encryptString(normalizedKey);
  await fs.promises.writeFile(keyPath(), encrypted);
  const dashboard = getDatabase().getActiveDashboard();
  return {
    configured: true,
    safeStorageAvailable: true,
    dashboard: withOpenAiStatus(dashboard)
  };
});

ipcMain.handle("openai:clearKey", async (_event, _batchId?: number) => {
  try {
    await fs.promises.unlink(keyPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    configured: false,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    dashboard: withOpenAiStatus(getDatabase().getActiveDashboard())
  };
});

ipcMain.handle("openai:generateSpeciesInsights", async (_event, force?: boolean, batchId?: number) =>
  generateSpeciesInsightsForBatch({ batchId: optionalBatchId(batchId), force: Boolean(force) })
);

ipcMain.handle("openai:researchSpecies", async (_event, batchId: unknown, species: unknown, force?: boolean, confirmed?: boolean) => {
  const activeBatchId = optionalBatchId(batchId);
  const requestedSpecies = String(species ?? "").trim().replace(/\s+/g, " ");
  if (!activeBatchId) throw new Error("Import a workbook before researching a species.");
  if (requestedSpecies.length < 3) throw new Error("Select a species before running research.");
  if (requestedSpecies.length > 160) throw new Error("Selected species name is too long for this research demo.");

  const importResult = getDatabase().getImportResult(activeBatchId);
  if (!importResult) throw new Error("The selected import could not be loaded. Refresh the workbook and try again.");
  const dataset = getDatabase().getDatasetState();
  const activeScope = dataset.scopes.find(
    (scope) => scope.id === dataset.activeScopeId && scope.batchIds.includes(activeBatchId)
  );
  if (activeScope) importResult.trials = getDatabase().getTrialsForScope(activeScope.id);
  const localSpecies = speciesInImport(importResult, requestedSpecies);
  if (!localSpecies) throw new Error("Select a species from the imported workbook before running research.");
  const batch = importResult.batch;
  const cacheIdentity = activeScope?.scopeHash ?? batch.workbookHash;

  const cacheKey = speciesResearchCacheKey(cacheIdentity, localSpecies);
  if (!force && speciesResearchCache.has(cacheKey)) return speciesResearchCache.get(cacheKey);
  if (!force) {
    const cached = await readSpeciesResearchCache(cacheIdentity, localSpecies);
    if (cached) {
      speciesResearchCache.set(cacheKey, cached);
      return cached;
    }
  }

  const apiKey = loadOpenAiKey();
  if (!apiKey) {
    throw new Error("No cached AI research was found for this species. Add an OpenAI key to generate it.");
  }

  const dashboard = withOpenAiStatus(activeScope ? getDatabase().getDashboardForScope(activeScope.id) : getDatabase().getDashboard(activeBatchId));
  const existing = speciesResearchInFlight.get(cacheKey);
  if (existing) return existing;
  requireOpenAiDataTransferConfirmation(confirmed);

  try {
    const pending = researchSpeciesWithExternalSources({
      apiKey,
      species: localSpecies,
      importResult,
      dashboard
    });
    speciesResearchInFlight.set(cacheKey, pending);
    const result = await pending;
    if (result.status === "ready") {
      speciesResearchCache.set(cacheKey, result);
      await writeSpeciesResearchCache(batch, localSpecies, result, cacheIdentity).catch((error: unknown) => {
        console.warn(`Unable to write species research cache: ${sanitizeErrorMessage(error)}`);
      });
    }
    return result;
  } catch (error) {
    console.warn(`OpenAI species research failed: ${sanitizeErrorMessage(error)}`);
    throw new Error(openAiFailureMessage("species research"));
  } finally {
    speciesResearchInFlight.delete(cacheKey);
  }
});

ipcMain.handle("openai:ask", async (_event, question: string, confirmed?: boolean) => {
  const trimmed = String(question ?? "").trim();
  if (trimmed.length < 3) throw new Error("Ask a more specific question.");
  if (trimmed.length > 700) throw new Error("Questions are limited to 700 characters for the demo.");
  const apiKey = loadOpenAiKey();
  if (!apiKey) throw new Error("OpenAI is not configured. Add an API key in Settings.");
  requireOpenAiDataTransferConfirmation(confirmed);
  try {
    return await answerSpreadsheetQuestion({
      apiKey,
      question: trimmed,
      context: getDatabase().getAskContextForScope()
    });
  } catch (error) {
    console.warn(`OpenAI Ask failed: ${sanitizeErrorMessage(error)}`);
    throw new Error(openAiFailureMessage("Ask"));
  }
});

configureUserDataPath();

app.whenReady().then(() => {
  if (process.platform === "darwin" && !app.isPackaged) {
    try {
      app.dock?.setIcon(dockIconPath());
    } catch (error) {
      console.warn(`Development Dock icon failed to load: ${sanitizeErrorMessage(error)}`);
    }
  }
  void launchApp().catch((error: unknown) => {
    showLaunchError(error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void launchApp().catch((error: unknown) => {
        showLaunchError(error);
      });
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  database?.close();
});
