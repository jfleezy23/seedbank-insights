# Release Checklist

Use this before pushing public code, tagging, or attaching desktop artifacts.

## Pre-Push Hygiene

- Confirm `git status --short` contains only intended files.
- Confirm no raw workbook is staged, especially `P_accessions_new.xlsx` or files under `data/raw/`.
- Confirm `.env`, `.env.*`, SQLite files, logs, `dist/`, `dist-electron/`, `release/`, `playwright-report/`, and `test-results/` are not staged.
- Run a filename-only or redacted secret scan before pushing.
- If OpenAI behavior changed, verify the renderer still receives only narrow IPC results and never stores API keys.
- Confirm documentation says this is independent from Frame Player and does not imply affiliation.

## Validation Gate

Run the focused checks for the changed path first, then run the broader gate when shared behavior or publication files changed:

```sh
pnpm run secret:scan
pnpm run test
pnpm run build
pnpm run sca
```

For UI changes, also run:

```sh
pnpm run test:ui
```

For desktop packaging work, packaging alone is not enough:

```sh
pnpm run app:build
pnpm run app:smoke
```

Then launch the packaged app bundle/executable itself and inspect evidence that the main window loads, splash renders, icon resources appear, and the first screen is stable.

## Review Gate

- Inspect the diff before staging.
- Confirm the validation output matches the files being published.
- Confirm any user-facing claims are backed by implemented behavior.

## Publish Gate

- Create or update the GitHub repository only after the secret/data scan is clean.
- Keep branch protection, dependency review, secret scanning, push protection, and Dependabot enabled where available.
- Do not attach raw data, local databases, unsigned ad hoc artifacts, or unverified packaged builds to a public release.

## GitHub Repository Gate

- Confirm the repository description is accurate and concise.
- Confirm the README screenshot renders on GitHub.
- Confirm topic tags describe the project without implying institutional endorsement.
- Confirm Issues are enabled and Projects/Wiki are disabled unless there is a maintainer reason to turn them on.
- Confirm secret scanning, push protection, dependency alerts, and automated security fixes are enabled.
- Confirm the default branch is `main`.
