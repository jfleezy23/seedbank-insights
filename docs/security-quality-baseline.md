# Security And Quality Baseline

This file records the expected public GitHub posture for SeedBank Insights. Update it when CI, branch protection, repository security settings, or release validation changes.

## Current Intent

The repository aims to:

1. keep raw workbook data and secrets out of public history
2. validate deterministic spreadsheet behavior before UI or AI text claims success
3. keep desktop packaging honest by launching unpacked packaged builds before review handoff
4. reserve installer artifacts for explicit release packaging after human testing passes
5. use AI as assistive review only, never as the owner of calculations or evidence labels

## Expected GitHub Settings

Enable these GitHub-native features when the public repository is created:

- secret scanning
- push protection
- dependency graph
- Dependabot alerts and security updates
- private vulnerability reporting
- branch protection for `main`
- pull requests before merge

Required checks should include the main CI workflow once it is green on GitHub.

## Active Local Gates

- `pnpm run secret:scan` checks tracked and untracked non-ignored files for key-shaped values without printing the values.
- `pnpm run lint` enforces the configured TypeScript/React lint rules.
- `pnpm run typecheck` runs TypeScript without emitting files.
- `pnpm run test` runs unit and integration coverage.
- `pnpm run test:ui` runs Playwright UI checks.
- `pnpm run db:smoke` verifies SQLite persistence, migrations, and import reconstruction.
- `pnpm run build` typechecks and builds renderer plus Electron main/preload.
- `pnpm run sca` runs package vulnerability audit.
- `pnpm run app:build` and `pnpm run app:smoke` validate unpacked packaged desktop wiring, but manual launched-app evidence is still required before release claims.

Local real-workbook acceptance is not a CI gate because the source workbooks are private. When available, run Vitest with `WORKBOOK_IMPORT_TEST_PATH` and `READY_WORKBOOK_IMPORT_TEST_PATH` pointing at local synced workbook copies. The v0.4 source acceptance result is 128 analyzable original trials and 2,204 populated / 2,166 analyzable / 38 quarantined larger-workbook rows.

Release-impacting work also requires a read-only AGY review with Gemini 3.5 Flash High. AGY is advisory; every comment must be adjudicated and validated fixes must be retested.

## Workflow Hygiene

- Prefer narrow `permissions` blocks.
- Keep action versions intentional and review third-party action upgrades.
- Keep check names stable once branch protection references them.
- Do not add CI jobs that require raw PSU project data.
- Do not put OpenAI keys, tokens, or workbook data in repository secrets unless a workflow explicitly needs them and the user approves.
- Do not build or attach installer artifacts for review checkpoints. Use the unpacked packaged app for human testing, then build release installers only after explicit approval.

## Data And AI Guardrails

- Raw `PC`, `LPC`, and `4PC` values and scale metadata are preserved; exact 0-100 percentage cells are normalized explicitly for ordinal analysis while ambiguous mixed low values remain flagged.
- Seed, stem-cutting, and division outcomes are not pooled.
- Experimental-unit paired comparisons are preferred over raw treatment averages.
- AI summaries must preserve deterministic confidence labels and cite row evidence.
- Header mapping may use AI only as a fallback after deterministic matching.
- OpenAI keys are stored through Electron safe storage and redacted from logs.

## Known Public-Repo Gaps

- License coverage is an evaluation grant for PSU Seed Bank testing, plus third-party dependency notices.
- Releases are not signed/notarized unless a future release note explicitly documents that process.
- Branch protection should be enabled after the current in-flight code settles and the first public CI run is green.
