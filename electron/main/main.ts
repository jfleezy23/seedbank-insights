import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { SeedBankDatabase } from "./database";
import { importWorkbook } from "../../src/core/workbook";

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let database: SeedBankDatabase | null = null;
const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
const configuredSplashMs = Number.parseInt(process.env.SEEDBANK_SPLASH_MIN_MS ?? "1100", 10);
const MIN_SPLASH_MS = Number.isFinite(configuredSplashMs) ? Math.max(0, configuredSplashMs) : 1100;
let splashShownAt = 0;
let revealTimer: NodeJS.Timeout | null = null;
let launchErrorShown = false;

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

ipcMain.handle("dashboard:get", () => getDatabase().getDashboard());

ipcMain.handle("workbook:select", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Spreadsheets", extensions: ["xlsx", "xls"] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  assertWorkbookPath(result.filePaths[0]);
  const imported = await importWorkbook(result.filePaths[0]);
  return getDatabase().saveImport(imported);
});

ipcMain.handle("workbook:importLocalDefault", async () => {
  const candidates = [
    path.join(process.cwd(), "P_accessions_new.xlsx"),
    path.join(process.cwd(), "data/raw/P_accessions_new.xlsx")
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return null;
  assertWorkbookPath(found);
  const imported = await importWorkbook(found);
  return getDatabase().saveImport(imported);
});

ipcMain.handle("openai:status", () => ({
  configured: fs.existsSync(keyPath()),
  safeStorageAvailable: safeStorage.isEncryptionAvailable()
}));

ipcMain.handle("openai:saveKey", (_event, key: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS safe storage is unavailable on this machine.");
  }
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(keyPath(), encrypted);
  return { configured: true, safeStorageAvailable: true };
});

ipcMain.handle("openai:clearKey", () => {
  if (fs.existsSync(keyPath())) fs.unlinkSync(keyPath());
  return { configured: false, safeStorageAvailable: safeStorage.isEncryptionAvailable() };
});

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.setIcon(dockIconPath());
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
