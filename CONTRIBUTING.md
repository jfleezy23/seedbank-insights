# Contributing

SeedBank Insights is early-stage research tooling. Contributions should preserve the core project posture: deterministic evidence first, AI as assistive text only, raw workbook data kept out of git, and desktop behavior verified by running the app path that changed.

## Development Rules

- Keep source in `src/`, Electron code in `electron/`, tests in `tests/`, scripts in `scripts/`, docs in `docs/`, and brand/design assets in `assets/branding/`.
- Do not commit raw workbooks, `.env` files, SQLite databases, logs, packaged output, screenshots from failed local runs, or generated release artifacts.
- Prefer synthetic fixtures and deterministic tests over raw source data.
- Keep OpenAI calls in Electron main behind narrow IPC. Renderer code must not persist API keys or use them for model calls.
- Do not let OpenAI prose upgrade deterministic confidence labels or hide data-quality warnings.
- Preserve workbook provenance through imports, warnings, comparisons, AI citations, and exports.
- Keep review builds to unpacked packaged apps. Installer artifacts are release-only after human testing passes and release packaging is explicitly approved.

## Local Setup

```sh
pnpm install
pnpm run dev
```

The committed synthetic workbook fixture covers the import path in CI. Local raw workbooks can remain in the workspace root or `data/raw/`, both of which are ignored by design.

## Expected Checks

For most changes:

```sh
pnpm run secret:scan
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run sca
```

For UI changes:

```sh
pnpm run test:ui
```

For desktop packaging or launch-path changes:

```sh
pnpm run db:smoke
pnpm run app:build
pnpm run app:smoke
```

Then launch the packaged app itself and inspect evidence from the running app before claiming desktop release readiness.

For import/statistical changes, run the real-workbook acceptance tests locally when the private workbooks are available:

```powershell
$env:WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_new.xlsx"
$env:READY_WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_ready.xlsx"
pnpm exec vitest run --reporter=verbose
```

Release-impacting changes also require read-only AGY review with Gemini 3.5 Flash High. Treat AGY as loose independent feedback: adjudicate every comment, fix validated issues, and rerun affected checks.

## Pull Requests

Pull requests should include:

- a concise summary of the user-facing or maintainer-facing change
- the exact validation commands that ran
- a note on raw data and secrets
- a note on real-workbook acceptance when import/statistical behavior changed
- an AGY adjudication summary for release-impacting work
- screenshots or layout evidence for UI work
- review notes for any risky or user-facing behavior change

## Review Priorities

Review should focus on:

- false confidence in statistical labels
- accidental raw data or key exposure
- renderer/main security boundaries
- import repeatability, immutable source versions, quarantine visibility, and analysis-scope isolation
- score-scale handling, propagule separation, codebook gating, and Advanced Analysis eligibility
- UI states that hide warnings, overflow, or disable expected actions
- tests that use synthetic fixtures rather than local-only data
