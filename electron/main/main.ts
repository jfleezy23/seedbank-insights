import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { SeedBankDatabase } from "./database";
import {
  answerSpreadsheetQuestion,
  OPENAI_INSIGHT_MODEL,
  suggestHeaderAliases
} from "./openai-insights";
import { researchSpeciesWithExternalSources } from "./species-research";
import { importWorkbook, inspectWorkbookHeaders } from "../../src/core/workbook";
import type { AiInsightStatus, DashboardData, ImportBatchSummary, ImportResult, SpeciesResearchResult } from "../../src/core/types";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let database: SeedBankDatabase | null = null;
const speciesResearchCache = new Map<string, unknown>();
const speciesResearchInFlight = new Map<string, Promise<SpeciesResearchResult>>();
const SPECIES_RESEARCH_CACHE_VERSION = "species-research-v4";
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((candidate) => path.resolve(candidate)))];
}

function defaultWorkbookCandidates(): string[] {
  const roots = [process.cwd(), appRootPath()];
  if (app.isPackaged) {
    roots.push(path.resolve(process.resourcesPath, "../../../../.."));
    roots.push(path.resolve(path.dirname(process.execPath), "../../../../.."));
  }
  return uniquePaths(roots).flatMap((root) => [
    path.join(root, "P_accessions_new.xlsx"),
    path.join(root, "data/raw/P_accessions_new.xlsx")
  ]);
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

function speciesResearchCacheKey(batch: ImportBatchSummary, species: string): string {
  return `${batch.workbookHash.slice(0, 16)}-${speciesCacheSlug(species)}`;
}

function speciesResearchCachePath(batch: ImportBatchSummary, species: string): string {
  return path.join(aiResponseCacheDir(), `${speciesResearchCacheKey(batch, species)}.json`);
}

function bundledAiResponseCacheDir(): string {
  return appAssetPath("assets", "ai-response-cache", SPECIES_RESEARCH_CACHE_VERSION);
}

function speciesResearchCacheCandidatePaths(batch: ImportBatchSummary, species: string): string[] {
  const filename = `${speciesResearchCacheKey(batch, species)}.json`;
  return uniquePaths([
    speciesResearchCachePath(batch, species),
    path.join(bundledAiResponseCacheDir(), filename)
  ]);
}

async function readSpeciesResearchCache(
  batch: ImportBatchSummary,
  species: string
): Promise<SpeciesResearchResult | null> {
  for (const candidatePath of speciesResearchCacheCandidatePaths(batch, species)) {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(candidatePath, "utf8")) as {
        version?: string;
        result?: SpeciesResearchResult;
      };
      if (parsed.version !== SPECIES_RESEARCH_CACHE_VERSION || parsed.result?.species !== species) continue;
      return parsed.result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Unable to read species research cache: ${sanitizeErrorMessage(error)}`);
      }
    }
  }
  return null;
}

async function writeSpeciesResearchCache(
  batch: ImportBatchSummary,
  species: string,
  result: SpeciesResearchResult
): Promise<void> {
  await fs.promises.mkdir(aiResponseCacheDir(), { recursive: true });
  await fs.promises.writeFile(
    speciesResearchCachePath(batch, species),
    JSON.stringify(
      {
        version: SPECIES_RESEARCH_CACHE_VERSION,
        cachedAt: new Date().toISOString(),
        workbookHash: batch.workbookHash,
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
          ? "OpenAI is configured. Species Explorer research runs live and is not stored in SQLite."
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

async function saveImportWithAiStatus(result: ImportResult): Promise<DashboardData> {
  speciesResearchCache.clear();
  const saved = getDatabase().saveImport(result);
  return withOpenAiStatus(saved);
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
    message: "Species Explorer research runs live per species and is not stored in SQLite.",
    model: OPENAI_INSIGHT_MODEL,
    generatedAt: null
  });
}

async function importWorkbookWithOptionalAiPrep(filePath: string): Promise<ImportResult> {
  const apiKey = loadOpenAiKey();
  if (!apiKey) return importWorkbook(filePath);
  const profile = await inspectWorkbookHeaders(filePath);
  if (!profile.missingHeaders.length) return importWorkbook(filePath);
  try {
    const headerAliases = await suggestHeaderAliases({ apiKey, profile });
    return importWorkbook(filePath, { headerAliases });
  } catch (error) {
    console.warn(`OpenAI header mapping failed; falling back to deterministic import: ${sanitizeErrorMessage(error)}`);
    return importWorkbook(filePath);
  }
}

function assertWorkbookPath(filePath: string): void {
  const extension = path.extname(filePath).toLowerCase();
  if (![".xlsx", ".xls"].includes(extension)) {
    throw new Error("Only .xlsx and .xls workbook imports are supported.");
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error("Selected workbook path is not a file.");
  if (stat.size > MAX_WORKBOOK_BYTES) {
    throw new Error("Workbook is larger than the 25 MB prototype import limit.");
  }
}

ipcMain.handle("dashboard:get", () => withOpenAiStatus(getDatabase().getDashboard()));

ipcMain.handle("workbook:select", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Spreadsheets", extensions: ["xlsx", "xls"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  assertWorkbookPath(result.filePaths[0]);
  const imported = await importWorkbookWithOptionalAiPrep(result.filePaths[0]);
  return saveImportWithAiStatus(imported);
});

ipcMain.handle("workbook:importLocalDefault", async () => {
  const candidates = defaultWorkbookCandidates();
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return null;
  assertWorkbookPath(found);
  const imported = await importWorkbookWithOptionalAiPrep(found);
  return saveImportWithAiStatus(imported);
});

ipcMain.handle("openai:status", () => ({
  configured: openAiConfigured(),
  safeStorageAvailable: safeStorage.isEncryptionAvailable()
}));

ipcMain.handle("openai:saveKey", async (_event, key: string, batchId?: number) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS safe storage is unavailable on this machine.");
  }
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey.startsWith("sk-") || normalizedKey.length < 24) {
    throw new Error("Enter a valid OpenAI API key.");
  }
  const encrypted = safeStorage.encryptString(normalizedKey);
  await fs.promises.writeFile(keyPath(), encrypted);
  const dashboard = getDatabase().getDashboard(optionalBatchId(batchId));
  return {
    configured: true,
    safeStorageAvailable: true,
    dashboard: withOpenAiStatus(dashboard)
  };
});

ipcMain.handle("openai:clearKey", async (_event, batchId?: number) => {
  try {
    await fs.promises.unlink(keyPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    configured: false,
    safeStorageAvailable: safeStorage.isEncryptionAvailable(),
    dashboard: withOpenAiStatus(getDatabase().getDashboard(optionalBatchId(batchId)))
  };
});

ipcMain.handle("openai:generateSpeciesInsights", async (_event, force?: boolean, batchId?: number) =>
  generateSpeciesInsightsForBatch({ batchId: optionalBatchId(batchId), force: Boolean(force) })
);

ipcMain.handle("openai:researchSpecies", async (_event, batchId: unknown, species: unknown, force?: boolean) => {
  const activeBatchId = optionalBatchId(batchId);
  const requestedSpecies = String(species ?? "").trim().replace(/\s+/g, " ");
  if (!activeBatchId) throw new Error("Import a workbook before researching a species.");
  if (requestedSpecies.length < 3) throw new Error("Select a species before running research.");
  if (requestedSpecies.length > 160) throw new Error("Selected species name is too long for this research demo.");

  const importResult = getDatabase().getImportResult(activeBatchId);
  if (!importResult) throw new Error("Could not reconstruct the requested import batch from local SQLite.");
  const localSpecies = speciesInImport(importResult, requestedSpecies);
  if (!localSpecies) throw new Error("Select a species from the imported workbook before running research.");
  const batch = importResult.batch;

  const cacheKey = speciesResearchCacheKey(batch, localSpecies);
  if (!force && speciesResearchCache.has(cacheKey)) return speciesResearchCache.get(cacheKey);
  if (!force) {
    const cached = await readSpeciesResearchCache(batch, localSpecies);
    if (cached) {
      speciesResearchCache.set(cacheKey, cached);
      return cached;
    }
  }

  const apiKey = loadOpenAiKey();
  if (!apiKey) {
    throw new Error("No cached AI research was found for this species. Add an OpenAI key to generate it.");
  }

  const dashboard = withOpenAiStatus(getDatabase().getDashboard(activeBatchId));
  const existing = speciesResearchInFlight.get(cacheKey);
  if (existing) return existing;

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
      await writeSpeciesResearchCache(batch, localSpecies, result).catch((error: unknown) => {
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

ipcMain.handle("openai:ask", async (_event, question: string) => {
  const trimmed = String(question ?? "").trim();
  if (trimmed.length < 3) throw new Error("Ask a more specific question.");
  if (trimmed.length > 700) throw new Error("Questions are limited to 700 characters for the demo.");
  const apiKey = loadOpenAiKey();
  if (!apiKey) throw new Error("OpenAI is not configured. Add an API key in Settings.");
  try {
    return await answerSpreadsheetQuestion({
      apiKey,
      question: trimmed,
      context: getDatabase().getAskContext()
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
