# Release Checklist

Use this before pushing public code, merging to `main`, tagging, or attaching desktop artifacts.

For review checkpoints, hand off an unpacked packaged app only. Installer artifacts are release-only and require explicit approval after human testing passes.

## Pre-Push Hygiene

- Confirm `git status --short` contains only intended files.
- Confirm no raw workbook is staged, especially `P_accessions_new.xlsx`, `P_accessions_ready.xlsx`, or files under `data/raw/`.
- Confirm `.env`, `.env.*`, SQLite files, logs, `dist/`, `dist-electron/`, `release/`, `playwright-report/`, and `test-results/` are not staged.
- Run a filename-only or redacted secret scan before pushing.
- If OpenAI behavior changed, verify the renderer still receives only narrow IPC results and never stores API keys.
- Confirm documentation does not imply affiliation with unrelated products, institutions, or projects.
- Confirm documentation and release notes describe new validation gates, migration behavior, or user-visible import/statistical changes.

## Validation Gate

Run the focused checks for the changed path first, then use the scripted gates so agents do not improvise from memory:

```sh
pnpm run verify:quick
pnpm run verify:full
pnpm run verify:workflow
```

For release candidates, run:

```sh
pnpm run release:preflight -- --version <version> --tag <release-tag>
pnpm run verify:release -- --version <version> --tag <release-tag>
```

For Windows signing environment checks without building a release:

```sh
pnpm run verify:windows-signing-env
```

For local real-workbook acceptance, keep the raw files out of git and run:

```powershell
$env:WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_new.xlsx"
$env:READY_WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_ready.xlsx"
pnpm exec vitest run --reporter=verbose
```

Expected v0.4 source workbook checks:

- original workbook imports 128 analyzable trials
- larger workbook recognizes 2,204 populated records
- larger workbook imports 2,166 analyzable rows and exposes 38 quarantined rows
- source accession and `D` status are preserved
- rich-text species text remains valid
- invalid dates do not become plausible legacy dates
- Advanced Analysis is non-empty when the selected scope contains eligible completed, documented paired contrasts

For desktop review candidates, packaging alone is not enough:

```sh
pnpm run app:build
pnpm run app:smoke
```

Then launch the packaged app bundle/executable itself and inspect evidence that the main window loads, splash renders, icon resources appear, and the first screen is stable.

On Windows review builds, hand off the unpacked app under `release/win-unpacked/`. Do not build or attach the NSIS setup executable until the user confirms human testing passed and explicitly asks for release packaging.

## Independent Review Gate

Release-impacting changes require a read-only AGY review using Gemini 3.5 Flash High. AGY is advisory, not authoritative, but every comment must be adjudicated. Use Claude Sonnet through AGY only for targeted React/UI interaction or layout questions when the extra cost is justified.

Use a code-only prompt. Do not ask AGY to analyze screenshots, edit files, commit, push, merge, publish, or change GitHub state.

Template:

```sh
agy --new-project --model "Gemini 3.5 Flash (High)" --sandbox --mode plan --print-timeout 20m0s --print "<review the current git diff for correctness, regressions, data preservation, migrations, statistical validity, Electron security boundaries, tests, and release risk; do not edit files>"
```

Record whether each AGY comment is valid, invalid, duplicate, or needs more evidence. Fix every validated blocking bug and rerun the affected targeted tests plus the full gate before handing off a new candidate.

## Review Gate

- Inspect the diff before staging.
- Confirm the validation output matches the files being published.
- Confirm any user-facing claims are backed by implemented behavior.
- Confirm the candidate hash and packaged smoke evidence correspond to the exact revision being handed off.

## Commit And Merge Gate

- Stage explicit paths only; do not use `git add .` or `git add -A`.
- The commit or PR description must include the change summary, validation commands, real-workbook acceptance result when applicable, AGY adjudication summary, and raw-data/secrets statement.
- Do not merge release-impacting work until the user explicitly confirms the human test pass.
- Do not tag, upload, or publish release assets from an untested or locally modified revision.

## Publish Gate

- Create or update the GitHub repository only after the secret/data scan is clean.
- Keep branch protection, dependency review, secret scanning, push protection, and Dependabot enabled where available.
- Do not attach raw data, local databases, unsigned ad hoc artifacts, or unverified packaged builds to a public release.

## GitHub Repository Gate

- Confirm the repository description is accurate and concise.
- Confirm the README screenshot renders on GitHub.
- Confirm topic tags describe the project without implying institutional endorsement.
- Confirm Issues are enabled and Projects/Wiki are disabled unless there is a maintainer reason to turn them on.
- Confirm secret scanning, push protection, dependency alerts, automated security fixes, and Dependabot version updates are enabled.
- Confirm the default branch is `main`.
