import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron, chromium } from "playwright";

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
const appIconPng = path.join(process.cwd(), "assets/branding/app-icon.png");

const artifactDir = path.join(os.tmpdir(), "seedbank-insights-smoke");
const splashScreenshot = path.join(artifactDir, "splash.png");
const mainScreenshot = path.join(artifactDir, "main-window.png");
const bundleIconPreview = path.join(artifactDir, "bundle-icon.png");
const smokeUserDataDir = mkdtempSync(path.join(os.tmpdir(), "seedbank-insights-user-data-"));
const localWorkbookPath = path.join(process.cwd(), "P_accessions_new.xlsx");

if (!existsSync(appBinary)) {
  throw new Error(`Packaged app binary was not found: ${appBinary}`);
}

if (!existsSync(iconResource)) {
  throw new Error(`${iconResourceLabel} was not found: ${iconResource}`);
}

if (statSync(iconResource).size < 1024) {
  throw new Error(`${iconResourceLabel} is unexpectedly small: ${iconResource}`);
}

if (!existsSync(appIconPng)) {
  throw new Error(`App icon PNG source was not found: ${appIconPng}`);
}

mkdirSync(artifactDir, { recursive: true });

function iconPreviewPath() {
  if (process.platform !== "darwin") return iconResource.endsWith(".png") ? iconResource : null;
  const result = spawnSync("sips", ["-s", "format", "png", iconResource, "--out", bundleIconPreview], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Unable to render macOS bundle icon for smoke verification: ${result.stderr || result.stdout}`);
  }
  return bundleIconPreview;
}

async function assertVisiblePng(imagePath, label) {
  const imageUrl = `data:image/png;base64,${readFileSync(imagePath).toString("base64")}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
    await page.setContent(`
      <!doctype html>
      <html>
        <body style="margin:0;background:transparent">
          <img src="${imageUrl}" alt="" />
        </body>
      </html>
    `);
    const result = await page.locator("img").evaluate(async (image) => {
      if (!(image instanceof HTMLImageElement)) return { loaded: false, visiblePixels: 0 };
      try {
        await image.decode();
      } catch {
        return { loaded: false, visiblePixels: 0 };
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
        return { loaded: false, visiblePixels: 0 };
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visiblePixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const alpha = pixels[index + 3];
        if (alpha > 10 && (Math.max(red, green, blue) > 30 || Math.max(red, green, blue) - Math.min(red, green, blue) > 8)) {
          visiblePixels += 1;
        }
      }
      return { loaded: true, visiblePixels };
    });

    if (!result.loaded || result.visiblePixels < 1000) {
      throw new Error(`${label} appears blank or failed to load (${result.visiblePixels} visible pixels).`);
    }
  } finally {
    await browser.close();
  }
}

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

await assertVisiblePng(appIconPng, "App icon PNG source");
const renderedIconPreview = iconPreviewPath();
if (renderedIconPreview) await assertVisiblePng(renderedIconPreview, iconResourceLabel);

const electronApp = await electron.launch({
  executablePath: appBinary,
  env: {
    ...process.env,
    SEEDBANK_SPLASH_MIN_MS: "3000",
    SEEDBANK_USER_DATA_DIR: smokeUserDataDir
  }
});
try {
  const splash = await waitForSplashWindow(electronApp);
  await splash.getByRole("heading", { name: "SeedBank Insights" }).waitFor({ timeout: 5_000 });
  await splash.getByRole("img", { name: "Portland State University" }).waitFor({ timeout: 5_000 });
  await splash.getByText("Preparing propagation evidence").waitFor({ timeout: 5_000 });
  await splash.screenshot({ path: splashScreenshot });

  const window = await waitForMainWindow(electronApp);
  await window.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  await window.getByRole("heading", { name: "Insight Board" }).waitFor({ timeout: 15_000 });
  await window.getByRole("img", { name: "Portland State University" }).waitFor({ timeout: 15_000 });
  await window.getByText("Best analyzed paired comparison").waitFor({ timeout: 15_000 });
  await window.getByText("Species assessment").waitFor({ timeout: 15_000 });
  await window.getByRole("button", { name: "Open Species Explorer" }).waitFor({ timeout: 15_000 });
  if (existsSync(localWorkbookPath)) {
    await window.getByRole("button", { name: "Load local workbook" }).click();
    await window.getByText(/Imported P_accessions_new\.xlsx/).waitFor({ timeout: 25_000 });
    await window.getByText("128").first().waitFor({ timeout: 10_000 });
  }
  await window.screenshot({ path: mainScreenshot });
  console.log("Packaged app launch smoke passed");
  console.log(`${iconResourceLabel}: ${iconResource}`);
  if (process.platform === "darwin") console.log(`Bundle icon preview: ${bundleIconPreview}`);
  console.log(`Splash screenshot: ${splashScreenshot}`);
  console.log(`Main window screenshot: ${mainScreenshot}`);
  console.log(`Smoke user data: ${smokeUserDataDir}`);
  if (existsSync(localWorkbookPath)) console.log("Local default workbook import smoke passed");
} finally {
  await electronApp.close();
}
