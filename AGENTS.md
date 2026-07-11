# AGENTS.md

## Working Rules

- Be a careful coding agent, not an eager patch generator.
- Inspect the repo first: read this file, run `git status`, and identify dirty files before editing.
- Treat existing dirty changes as user or agent work. Do not revert, overwrite, stage, or clean unrelated work.
- Keep scope tight. Do the requested task, not adjacent refactors.
- Avoid reshaping public APIs, data models, build systems, or critical runtime paths unless the task requires it.
- For UI work, verify layout, spacing, overflow, disabled states, and visual stability. Screenshots are evidence.
- User-facing UI copy should use human terms such as "local database"; do not surface engine jargon such as "SQLite" in the app.
- For bug fixes, identify the actual cause before patching symptoms.
- Never use `git add .` or `git add -A` unless explicitly told to. Stage explicit paths only.
- Before staging or committing, inspect `git status` and the relevant diff.

## Repo Shape

- This is a standalone Electron + React + TypeScript repo. Do not scatter loose prototype files at the workspace root.
- Keep source in `src/`, Electron code in `electron/`, tests in `tests/`, scripts in `scripts/`, docs in `docs/`, and design/brand assets in `assets/branding/`.
- Local or potentially sensitive workbooks belong in ignored local paths such as `data/raw/` or the workspace root. Do not commit `P_accessions_new.xlsx` or other raw PSU project workbooks unless the user explicitly approves.
- Commit synthetic fixtures and deterministic tests instead of raw project data.

## Required End Gates

Every implementation checkpoint must end with:

1. Targeted tests for the code path changed.
2. Broader build/typecheck when shared behavior or runtime wiring changed.
3. Software composition analysis (SCA), currently `pnpm run sca`.
4. Review the relevant diff before claiming completion.
5. A concise report of what changed, what was verified, and what remains uncertain.

Do not claim SCA, tests, build, or review passed unless they actually ran and the output was checked.

For desktop apps, packaging is not launch verification. Before claiming a packaged app works, run the packaged executable/app bundle itself, observe that the main window loads, and capture or inspect evidence from the launched app. `electron-builder --dir` only proves packaging completed; it does not prove the app starts.

After implementation work is completed, an unpacked packaged build is required for human testing and verification. Do not hand off source-only work as complete when the user needs to test the desktop app. Build the current revision, launch-smoke the packaged app, and report the exact artifact path and hash.

For human-review checkpoints, build and hand off the unpacked packaged app only. Installer artifacts such as Windows NSIS setup files or macOS DMGs are release artifacts; do not build, upload, or present them as candidates until the user explicitly confirms human testing passed and asks for release packaging.

## Windows Release Signing Gate

Windows public releases must be signed the same way as the known-good Frame Player Windows artifacts: Microsoft Artifact Signing / Microsoft ID Verified Code Signing issued to `Jonathan Floyd`. Do not publish `NotSigned`, self-signed, or `UnknownError` Windows release assets.

Required tooling and identity:

- Use the Windows SDK `signtool.exe`, preferably `C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe`, for verification. PowerShell `Get-AuthenticodeSignature` is useful, but `signtool verify /pa /v <file>` is the release proof.
- Use the installed .NET `sign` tool for Microsoft Artifact Signing, not PowerShell `Set-AuthenticodeSignature` and not a local self-signed cert.
- Azure CLI must be authenticated as the signing account owner before signing: `az account show`.
- Artifact Signing account: `frameplayersigningjflow`.
- Resource group: `rg-frameplayer-signing`.
- Endpoint: `https://wus2.codesigning.azure.net/`.
- Certificate profile: `frameplayerpublic`.
- Expected signer chain: `Microsoft Identity Verification Root Certificate Authority 2020` -> `Microsoft ID Verified Code Signing PCA 2021` -> `Microsoft ID Verified CS AOC CA 04` -> `Jonathan Floyd`.

Reference check before signing SeedBank:

```powershell
$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
& $signtool verify /pa /v "C:\Users\jflow\Downloads\FP\FramePlayer.Avalonia.exe"
```

The Frame Player reference should verify successfully and show issuer `Microsoft ID Verified CS AOC CA 04` and subject `Jonathan Floyd`. If this does not verify, stop and diagnose the Windows signing environment before building SeedBank release assets.

Correct SeedBank Windows release sequence. Substitute the current release tag and version where the example uses `v.4` and `0.4.0`:

```powershell
# Build from the exact release tag or commit, not a dirty working tree.
git checkout --detach v.4

$env:PATH = "C:\Users\jflow\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;" + $env:PATH
& "C:\Users\jflow\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" run build
& "C:\Users\jflow\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" exec electron-builder --win --x64 --publish never

# Sign the unpacked app binaries with Microsoft Artifact Signing.
sign code artifact-signing `
  "release\win-unpacked\SeedBank Insights.exe" `
  "release\win-unpacked\resources\elevate.exe" `
  --artifact-signing-endpoint "https://wus2.codesigning.azure.net/" `
  --artifact-signing-account "frameplayersigningjflow" `
  --artifact-signing-certificate-profile "frameplayerpublic" `
  --azure-credential-type azure-cli `
  --description "SeedBank Insights" `
  --description-url "https://github.com/jfleezy23/seedbank-insights" `
  --file-digest SHA256 `
  --timestamp-url "http://timestamp.acs.microsoft.com/" `
  --timestamp-digest SHA256 `
  --verbosity Information

# Rebuild the NSIS installer from the signed unpacked app.
& "C:\Users\jflow\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd" exec electron-builder --win nsis --x64 --prepackaged release\win-unpacked --publish never

# Sign the final setup executable with the same Microsoft Artifact Signing profile.
sign code artifact-signing `
  "release\SeedBank Insights Setup 0.4.0.exe" `
  --artifact-signing-endpoint "https://wus2.codesigning.azure.net/" `
  --artifact-signing-account "frameplayersigningjflow" `
  --artifact-signing-certificate-profile "frameplayerpublic" `
  --azure-credential-type azure-cli `
  --description "SeedBank Insights" `
  --description-url "https://github.com/jfleezy23/seedbank-insights" `
  --file-digest SHA256 `
  --timestamp-url "http://timestamp.acs.microsoft.com/" `
  --timestamp-digest SHA256 `
  --verbosity Information
```

Required verification before upload:

```powershell
$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
& $signtool verify /pa /v "release\SeedBank Insights Setup 0.4.0.exe"
& $signtool verify /pa /v "release\win-unpacked\SeedBank Insights.exe"
& $signtool verify /pa /v "release\win-unpacked\resources\elevate.exe"
```

All three must report `Successfully verified`, zero errors, and signer subject `Jonathan Floyd` issued by `Microsoft ID Verified CS AOC CA 04`. Electron-builder log lines such as `signing with signtool.exe` are not proof; they can appear even when the final file is unsigned. `Get-AuthenticodeSignature` must show `Status: Valid`, not merely `NotSigned` absent or `UnknownError`.

After verification, copy the final setup executable to the public asset name, regenerate the checksum from that signed file, upload with `gh release upload --clobber`, and update the release notes with the new SHA-256. Re-query `gh release view --json assets` and confirm GitHub's asset digest matches the local hash.

## Release Review Cycle

Before handing a release candidate to the user, follow this order:

1. Review the complete final diff after all fixes; adjudicate independent-review comments and fix every validated defect.
2. Run the independent-review and security-review gates. If a required reviewer is unavailable, record the exact blocker and do not claim it passed.
3. Run every configured quality gate: lint, typecheck, unit/integration tests, UI tests, database/migration smoke, SCA, and secret scan. Configure a practical missing gate instead of silently substituting another one.
4. Resolve lint errors and every blocking finding. Explicitly triage warnings; never hide them without a written reason.
5. Only after the gates pass, package the current revision as an unpacked app, run packaged-launch smoke against that exact artifact, record its hash, and hand it to the user for human testing.
6. Never publish, tag, merge, upload, or release until the user explicitly confirms human testing passed.

If a fix changes source, dependencies, configuration, or packaging, rerun the affected reviews and gates before making another candidate.

## Independent AGY Review Gate

- `AGY` means the Google Antigravity CLI (`agy`). It is a required independent reviewer for release-impacting changes.
- Give AGY the exact base commit and scoped file list (or a compact scoped diff) to review. Do not rely on an ambiguous working-tree request.
- Use `Gemini 3.5 Flash (High)` for broad, inexpensive loose feedback. Use `Claude Sonnet 4.6 (Thinking)` only for targeted React/UI interaction and responsive-layout adjudication. Reserve limited `Claude Opus 4.6 (Thinking)` credits for targeted statistical-method, numerical, or inference-boundary checks.
- Reviews are code-only: AGY must not request, inspect, or analyze images. It should review the renderer/CSS implementation and tests directly.
- Prefer non-interactive, sandboxed, read-only review mode. If the CLI returns only a plan, no output, or an authentication/workspace prompt instead of review findings, it did not complete the gate; resolve the CLI problem or report the exact blocker.
- If `agy` is unavailable, install it only from Google's official Antigravity CLI distribution and verify the requested model appears in `agy models`. Do not substitute another model or silently skip the gate.
- If AGY cannot run because of authentication, credits, or workspace access, capture the exact blocker and report the gate as blocked; never imply that AGY reviewed the change.
- Instruct AGY not to edit files, commit, push, merge, publish, or change GitHub state. Its job is adversarial review: correctness, regressions, data preservation, migrations, statistical validity, Electron security boundaries, tests, and release risks.
- Collect AGY's complete feedback and adjudicate every comment against exact code and requirements. Classify each item as valid, invalid, duplicate, or needing more evidence; record the reason.
- Fix every validated blocking bug, add targeted regression coverage, and rerun the targeted and full required gates. Do not dismiss findings merely because existing tests pass.
- AGY review and automated gates do not replace human testing. Do not merge, tag, upload assets, or publish a release until the user explicitly confirms the human test pass.

## Security And AI

- OpenAI is assistive only. Deterministic code owns calculations, confidence labels, and evidence selection.
- Do not commit API keys. Store user-provided keys only through Electron safe storage or an equivalent OS-backed secret mechanism.
- Treat API keys, tokens, passwords, and credentials as secrets even if the user pastes them into chat. Do not repeat, log, print, place in shell history, write to files, include in screenshots, or pass through renderer code.
- When checking whether secrets were accidentally written, prefer filename-only scans or redacted output. Never echo the secret value back to the user.
- AI summaries must not upgrade confidence labels or hide data-quality warnings.

## Statistical Guardrails

- Preserve raw `PC`, `LPC`, and `4PC` values. Detect score scale per endpoint and row: values above 5 are exact percentages normalized to documented 0-5 classes, invalid values are retained as raw evidence but excluded, and mixed nonzero low values are ambiguous when the same endpoint also contains percentages.
- Never pool seed, stem-cutting, and division `PC` outcomes. Their endpoint meanings differ.
- Prefer paired experimental-unit comparisons over raw treatment averages. The formal unit includes workbook/import version, propagation accession, source accession when available, species, propagule type, and cohort.
- Label evidence as `Strong signal`, `Promising`, `Inconclusive`, or `Needs replication`.
- Guard against false positives: warn on one-off high scores, rare treatments, multiple comparisons, uneven species mix, and intervals that cross no effect.
- Guard against false negatives: call out underpowered comparisons and preserve promising-but-unproven treatments.

## PSU Brand And Likeness

- Use PSU-inspired colors from the user's plan: PSU Green `#6d8d24`, Electric Green `#cfd82d`, Forest Green `#213921`, white, and black.
- Do not redraw, modify, or fake official PSU logos. Use official marks only if permissioned files are provided.
- Prototype imagery can evoke seed-bank labs, germination plates, seed packets, cool storage, and propagation workflows without official marks.

## Project Insights Log

Append new implementation or data insights here as they are discovered.

- Initial workbook profile: `P_accessions_new.xlsx` has one main data sheet, `P_accesions`, plus self-documenting `Column headers` and `Data types` sheets.
- Current local workbook grain is one propagation accession plus one treatment per row.
- Current local workbook profile found 128 core trial rows, 53 propagation accessions, 52 species, and 17 treatment strings.
- v0.4 source workbook acceptance includes the larger `P_accessions_ready.xlsx` profile: 2,204 populated records, 2,166 analyzable rows, and 38 quarantined rows with missing required treatment evidence.
- Header aliases must preserve source accession, status, and location variants such as `UorSBacc`, `D/ND`, and `L(R:C;Z)`.
- Advanced Analysis being blank for a real workbook is usually a parser/scope/eligibility problem to investigate, not an acceptable empty state. Refresh legacy imports so `D/ND`, source accession, propagule type, codebook eligibility, and provenance are present.
- Early paired analysis showed cold stratification vs control as a strong candidate signal: 38 paired comparisons, 24 improved, 11 tied, 3 worse, mean `PC` lift about `+1.68`.
- `WS+CS` vs `CS` is mixed in the current sample: 11 paired comparisons, 3 improved, 3 tied, 5 worse. The UI must not over-recommend it.
- Notes are analytically valuable: current parsing can extract germinated counts and in-production counts from many rows, but raw snippets must remain visible for audit.
- ExcelJS reads species hyperlinks as objects with `text` and `hyperlink`; importer normalization must use the display `text`.
- Paired treatment comparisons should key by propagation accession plus species. Accession-only matching admitted an ambiguous `P2025-0092` Monardella comparison and inflated `C` vs `CS` from 38 to 39 pairs.
- SQLite trial rows must be batch-isolated with `(import_batch_id, id)` primary keys; re-importing the same workbook cannot replace historical batch rows.
- pnpm 11 build approvals live in `pnpm-workspace.yaml` as `allowBuilds`/`onlyBuiltDependencies`; native dependencies include `better-sqlite3`, `electron`, `electron-winstaller`, and `esbuild`.
- The committed workbook fixture at `tests/fixtures/psu-style-accessions-fixture.xlsx` exists so CI covers the Excel import path without committing raw PSU project data.
- Electron hardening defaults for this app: renderer sandbox on, context isolation on, no node integration, no arbitrary renderer-supplied path import IPC, and CSP in `index.html`.
- 2026-07-05 failure: `app:build` passed but the packaged macOS app launched to `ERR_FILE_NOT_FOUND` because `main.ts` resolved `../../dist/index.html` from `dist-electron/electron/main/main.js`, producing `app.asar/dist-electron/dist/index.html`. Always launch the packaged app before calling desktop work complete.
- Packaged desktop polish must be launch-smoked for more than the main DOM: verify splash rendering, packaged icon resource presence, and screenshot evidence from the actual app bundle.
- Vite apps loaded from an Electron `file://` bundle need relative built asset URLs (`base: "./"`); default absolute `/assets/...` paths can package successfully but render a blank main window.
- Electron Playwright smoke tests must not assume `firstWindow()` is visible or user-facing. Hidden renderer windows can race splash windows; select windows by visibility plus URL/text or DOM evidence.
- Startup work that can throw, such as SQLite/native module initialization, should happen after the splash is visible and should fail into an explicit launch-error window or dialog, not a blank main shell.
- Official PSU signature assets should stay as replaceable files under `assets/branding` and be rendered unchanged in white lockup/badge areas; do not crop, recolor, redraw, or embed them into generated artwork.
- Sidebar navigation must render real, distinct workspaces. A selected nav label without a content change is a regression for this prototype.
- Header import should try deterministic exact/synonym matching first. AI header mapping is only a fallback for ambiguous or missing headers and must not block deterministic imports if it fails.
- The demo Ask feature may make live OpenAI calls, but only from Electron main with bounded spreadsheet context. Renderer code should read cached dashboard data or invoke narrow IPC; it must not hold API keys.
- AI species or Ask text must preserve deterministic confidence labels and cited row evidence. Treat any model output that attempts to add or upgrade confidence as malformed.
- The provided PSU signature reference included guide labels/measurement marks. The committed UI asset should be cropped to the real signature only so no `Logmark`/`Logotype` guide text appears in the app.
- Icon verification must inspect the rendered pixels, not just file existence or bundle metadata. A broken SVG-to-PNG rasterization can still produce valid-looking files that show as blank/default app icons.
- Navigation tabs should have single ownership: Insight Board is overview/routing, Species Explorer is local-first species treatment evidence with AI context below deterministic results, Treatment Comparator is deterministic treatment analysis, Data Quality owns warnings, Trial Queue owns follow-up work, and Ask owns demo Q&A.
- OpenAI Structured Output JSON schemas must mirror local Zod constraints such as `minLength`, `minimum`, `minItems`, and `maxItems`; otherwise an API-valid response can fail local parsing.
- Species technique recommendations generated by AI must cite source rows for that species. Drop uncited technique claims and fall back to deterministic local evidence rather than showing unsupported model advice.
- Packaged default workbook loading cannot depend only on `process.cwd()`. Finder-launched macOS apps may start outside the repo, so local prototype workbook discovery must also search relative to the packaged bundle/release layout.
- Species Explorer AI research cache lives outside SQLite under the app user data folder at `ai-response-cache/species-research-v*/`; share cached JSON for demos instead of sharing an API key.
- AI species research generation should cache only `ready` results with at least one local-species, row-cited technique. Do not cache transient `no_sources` results from API/network/model-output failures.
- Genus-only and `spp` workbook taxa need a genus-level taxonomy fallback for family context after species-level matching fails; `Polygonum` should resolve family context without plant-specific code.
- OpenAI structured species research can still return malformed or truncated JSON when the response budget is too small. Use a larger output budget plus retry before withholding generated technique advice.
- AI-inferred family strings must be normalized to a clean family name before display or cache write; model explanations such as subfamily notes or "AI-inferred" prose belong in narrative fields, not the family label.
- Confidence-label negation checks must treat newlines as statement boundaries. A negation in one bullet or line must not authorize an upgraded confidence label on the next line.
- Species research retry loops must retry parseable `no_sources` outputs too, not only thrown JSON/API errors, because a valid JSON response can still fail the local-row citation contract.
- Packaged demo builds can read pre-generated species research cache from bundled assets, but app-generated cache still belongs in user data and should not be mixed into SQLite.
- Species Explorer must not silently cap the visible species list. Future workbooks may contain hundreds of taxa, so selector tests should cover hundreds of options and the UI should rely on scrolling/search/filtering rather than truncation.
- UI badges and pills should use the established centered badge template (`inline-flex`, `align-items: center`, `justify-content: center`, explicit min-height, and line-height control). Do not make up one-off pill spacing with arbitrary padding that leaves text visually off-center.
- The workbook data dictionary permits `PC`, `LPC`, and `4PC` as either 0-5 classes or exact 0-100 percentages. Preserve raw values and scale metadata; normalized classes are analytical derivatives, not replacements for source data.
- A minimum-additional-pairs count based on evidence-tier thresholds is not a statistical power calculation. Label it as a review threshold and do not call it a power estimate.
- Paired-comparison strength must include taxonomic breadth. Repeated accessions from one species cannot independently support a cross-species `Strong signal` label.
- Species Explorer research needs a real source-discovery step. Model knowledge alone is not external evidence; only display clickable sources returned by the web-search call and validated against the synthesis citations.
- Trial Queue rows are operational observations, not independent confidence assessments. Do not assign evidence labels from a single row score.
- Public macOS releases are a notarization workflow, not merely `electron-builder` packaging: preflight a valid notary keychain profile, build a signed arm64 DMG, verify `codesign` and `hdiutil`, submit the DMG with `xcrun notarytool submit --wait --keychain-profile <profile>`, staple and validate it, mount it, and verify the contained app with Gatekeeper before attaching it to GitHub. Do not publish a signed-but-unnotarized DMG as a public release.
- The notary preflight must happen before building release artifacts: `xcrun notarytool history --keychain-profile <profile>`. If the profile is missing, recreate it interactively with `xcrun notarytool store-credentials`; never put the app-specific password in shell history, source files, logs, GitHub secrets, or release notes.
- A public release asset must contain no raw workbook, SQLite database, API key, or AI response cache. Confirm `assets/ai-response-cache/`, `P_accessions_new.xlsx`, `.env*`, `*.sqlite*`, and release build output remain ignored/untracked before staging and before GitHub upload.
- Windows review candidates are unpacked app directories, not NSIS installers. Build `release/win-unpacked/SeedBank Insights.exe` for human testing; build setup executables only when the user explicitly approves release packaging after human testing passes.
