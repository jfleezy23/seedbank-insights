import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = process.cwd();
const svgPath = path.join(root, "assets/branding/app-icon.svg");
const outDir = path.join(root, "assets/branding");
const iconsetDir = path.join(outDir, "app-icon.iconset");

async function renderPng(size, outPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1
  });
  const svgUrl = pathToFileURL(svgPath).href;
  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden">
        <img src="${svgUrl}" width="${size}" height="${size}" alt="" />
      </body>
    </html>
  `);
  await page.screenshot({ path: outPath, omitBackground: true });
  await browser.close();
}

function buildIco(entries) {
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * entries.length;
  const buffers = [];
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  buffers.push(header);

  const imageBuffers = [];
  for (const entry of entries) {
    const image = entry.buffer;
    const directory = Buffer.alloc(entrySize);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    directory.writeUInt8(0, 2);
    directory.writeUInt8(0, 3);
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(image.length, 8);
    directory.writeUInt32LE(offset, 12);
    buffers.push(directory);
    imageBuffers.push(image);
    offset += image.length;
  }

  return Buffer.concat([...buffers, ...imageBuffers]);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  const iconset = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024]
  ];

  for (const [filename, size] of iconset) {
    await renderPng(size, path.join(iconsetDir, filename));
  }
  await renderPng(1024, path.join(outDir, "app-icon.png"));

  const iconutil = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(outDir, "app-icon.icns")], {
    stdio: "inherit"
  });
  if (process.platform === "darwin" && iconutil.status !== 0) {
    process.exit(iconutil.status ?? 1);
  }

  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoEntries = [];
  for (const size of icoSizes) {
    const pngPath = path.join(outDir, `app-icon-${size}.png`);
    await renderPng(size, pngPath);
    icoEntries.push({ size, buffer: await readFile(pngPath) });
  }
  await writeFile(path.join(outDir, "app-icon.ico"), buildIco(icoEntries));
  await rm(iconsetDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
