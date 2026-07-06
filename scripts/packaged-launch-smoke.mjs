import { existsSync, mkdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";

const appBinary =
  process.platform === "darwin"
    ? path.join(
        process.cwd(),
        "release/mac-arm64/SeedBank Insights.app/Contents/MacOS/SeedBank Insights"
      )
    : process.platform === "win32"
      ? path.join(process.cwd(), "release/win-unpacked/SeedBank Insights.exe")
      : path.join(process.cwd(), "release/linux-unpacked/seedbank-insights");

const iconResource =
  process.platform === "darwin"
    ? path.join(process.cwd(), "release/mac-arm64/SeedBank Insights.app/Contents/Resources/icon.icns")
    : process.platform === "win32"
      ? path.join(process.cwd(), "assets/branding/app-icon.ico")
      : path.join(process.cwd(), "assets/branding/app-icon.png");

const iconResourceLabel =
  process.platform === "darwin" ? "macOS bundle icon" : "configured platform icon source";

const artifactDir = path.join(os.tmpdir(), "seedbank-insights-smoke");
const splashScreenshot = path.join(artifactDir, "splash.png");
const mainScreenshot = path.join(artifactDir, "main-window.png");

if (!existsSync(appBinary)) {
  throw new Error(`Packaged app binary was not found: ${appBinary}`);
}

if (!existsSync(iconResource)) {
  throw new Error(`${iconResourceLabel} was not found: ${iconResource}`);
}

if (statSync(iconResource).size < 1024) {
  throw new Error(`${iconResourceLabel} is unexpectedly small: ${iconResource}`);
}

mkdirSync(artifactDir, { recursive: true });

async function isVisibleWindow(electronApp, page) {
  const browserWindow = await electronApp.browserWindow(page);
  return browserWindow.evaluate((window) => window.isVisible());
}

async function waitForWindowMatching(electronApp, description, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const candidate of electronApp.windows()) {
      if (candidate.isClosed()) continue;
      if (await predicate(candidate)) return candidate;
    }

    await Promise.race([
      electronApp.waitForEvent("window", { timeout: 300 }).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 300))
    ]);
  }

  throw new Error(`Timed out waiting for ${description}.`);
}

async function waitForSplashWindow(electronApp) {
  return waitForWindowMatching(
    electronApp,
    "the visible splash window",
    async (candidate) => {
      const isVisible = await isVisibleWindow(electronApp, candidate).catch(() => false);
      if (!isVisible) return false;
      await candidate.waitForLoadState("domcontentloaded", { timeout: 300 }).catch(() => null);
      const bodyText = await candidate.locator("body").innerText({ timeout: 300 }).catch(() => "");
      return (
        candidate.url().includes("/assets/branding/splash.html") &&
        bodyText.includes("SeedBank Insights") &&
        bodyText.includes("Preparing propagation evidence")
      );
    },
    15_000
  );
}

async function waitForMainWindow(electronApp) {
  return waitForWindowMatching(
    electronApp,
    "the visible packaged app main window",
    async (candidate) => {
      const isVisible = await isVisibleWindow(electronApp, candidate).catch(() => false);
      if (!isVisible) return false;
      const hasInsightBoard = await candidate
        .getByRole("heading", { name: "Insight Board" })
        .waitFor({ timeout: 300 })
        .then(() => true)
        .catch(() => false);
      return hasInsightBoard;
    },
    20_000
  );
}

const electronApp = await electron.launch({
  executablePath: appBinary,
  env: {
    ...process.env,
    SEEDBANK_SPLASH_MIN_MS: "3000"
  }
});
try {
  const splash = await waitForSplashWindow(electronApp);
  await splash.getByRole("heading", { name: "SeedBank Insights" }).waitFor({ timeout: 5_000 });
  await splash.getByText("Preparing propagation evidence").waitFor({ timeout: 5_000 });
  await splash.screenshot({ path: splashScreenshot });

  const window = await waitForMainWindow(electronApp);
  await window.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  await window.getByRole("heading", { name: "Insight Board" }).waitFor({ timeout: 15_000 });
  await window.getByText("Evidence guardrails").waitFor({ timeout: 15_000 });
  await window.getByText("Treatment success").waitFor({ timeout: 15_000 });
  await window.screenshot({ path: mainScreenshot });
  console.log("Packaged app launch smoke passed");
  console.log(`${iconResourceLabel}: ${iconResource}`);
  console.log(`Splash screenshot: ${splashScreenshot}`);
  console.log(`Main window screenshot: ${mainScreenshot}`);
} finally {
  await electronApp.close();
}
