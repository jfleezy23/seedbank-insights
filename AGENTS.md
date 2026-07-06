# AGENTS.md

## Working Rules

- Be a careful coding agent, not an eager patch generator.
- Inspect the repo first: read this file, run `git status`, and identify dirty files before editing.
- Treat existing dirty changes as user or agent work. Do not revert, overwrite, stage, or clean unrelated work.
- Keep scope tight. Do the requested task, not adjacent refactors.
- Avoid reshaping public APIs, data models, build systems, or critical runtime paths unless the task requires it.
- For UI work, verify layout, spacing, overflow, disabled states, and visual stability. Screenshots are evidence.
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
4. Independent code review by a separate agent or reviewer before claiming completion.
5. A concise report of what changed, what was verified, and what remains uncertain.

Do not claim SCA, tests, build, or review passed unless they actually ran and the output was checked.

For desktop apps, packaging is not launch verification. Before claiming a packaged app works, run the packaged executable/app bundle itself, observe that the main window loads, and capture or inspect evidence from the launched app. `electron-builder --dir` only proves packaging completed; it does not prove the app starts.

## Antigravity Advisory Reviewer

- Use Antigravity through the `agy` CLI as an advisory reviewer or research partner only. It may provide feedback, hypotheses, critique, optimization ideas, and test suggestions, but it must not write code, patch files, format files, stage changes, commit, or run broad cleanup.
- Antigravity feedback never replaces the primary agent's own inspection, research, testing, or review. Evaluate its output against the code, tests, project guardrails, and deterministic evidence before acting on it.
- Use Antigravity when stuck on science/statistical reasoning, germination-domain interpretation, tricky performance or optimization questions, bug-hunt brainstorming, and prototype UI/design critique.
- Use Antigravity as the required independent review agent before committing code changes when `agy` is available. Run it after the primary agent has inspected its own diff and before staging. Treat findings as advisory until independently verified.
- Use `Gemini 3.5 Flash (High)` only, unless the user explicitly approves a different model. Do not use Claude models for routine repo review because of cost, and do not silently fall back to other Gemini models. Verify availability with `agy models` when setup is uncertain.
- Prefer a bounded, non-interactive CLI invocation from the repo root. If the local CLI syntax differs, check `agy --help` and preserve the same model and advisory-only constraints.

Example shape; replace the explicit paths with the files under review.

```sh
agy --model "Gemini 3.5 Flash (High)" -p "You are an independent advisory reviewer for this repo. Do not write code, edit files, stage changes, commit, or request permissions to modify the workspace. Review the provided context and return prioritized findings with file/line references where possible, concrete risks, missing tests, performance or UI concerns, and explicit uncertainty. Focus on correctness, science/statistics guardrails, security, maintainability, and regressions. Context follows:

$(git diff -- src/core/statistics.ts tests/unit/statistics.test.ts)"
```

- Give Antigravity only the context it needs: explicit diffs, specific files, focused questions, screenshots, or summarized data profiles. Do not send API keys, tokens, passwords, raw PSU workbooks, sensitive local data, or unredacted proprietary data.
- If `agy` is unavailable, the requested model is unavailable, or the CLI asks for unsafe permissions, record that Antigravity review could not run and perform the best available fallback review. Do not claim Antigravity review passed unless it actually ran and the output was checked.

## Security And AI

- OpenAI is assistive only. Deterministic code owns calculations, confidence labels, and evidence selection.
- Do not commit API keys. Store user-provided keys only through Electron safe storage or an equivalent OS-backed secret mechanism.
- Treat API keys, tokens, passwords, and credentials as secrets even if the user pastes them into chat. Do not repeat, log, print, place in shell history, write to files, include in screenshots, or pass through renderer code.
- When checking whether secrets were accidentally written, prefer filename-only scans or redacted output. Never echo the secret value back to the user.
- AI summaries must not upgrade confidence labels or hide data-quality warnings.

## Statistical Guardrails

- Treat `PC`, `LPC`, and `4PC` as ordinal 0-5 scores unless exact extracted counts exist.
- Prefer paired accession/species comparisons over raw treatment averages.
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
- AI-generated species or Ask text must preserve deterministic confidence labels and cited row evidence. Treat any model output that attempts to add or upgrade confidence as malformed.
- The provided PSU signature reference included guide labels/measurement marks. The committed UI asset should be cropped to the real signature only so no `Logmark`/`Logotype` guide text appears in the app.
- Icon verification must inspect the rendered pixels, not just file existence or bundle metadata. A broken SVG-to-PNG rasterization can still produce valid-looking files that show as blank/default app icons.
