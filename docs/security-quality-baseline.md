# Security And Quality Baseline

This file records the expected public GitHub posture for SeedBank Insights. Update it when CI, branch protection, repository security settings, or release validation changes.

## Current Intent

The repository aims to:

1. keep raw workbook data and secrets out of public history
2. validate deterministic spreadsheet behavior before UI or AI text claims success
3. keep desktop packaging honest by launching packaged builds before release claims
4. use AI as assistive review only, never as the owner of calculations or evidence labels

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
- `pnpm run test` runs unit and integration coverage.
- `pnpm run build` typechecks and builds renderer plus Electron main/preload.
- `pnpm run sca` runs package vulnerability audit.
- `pnpm run test:ui` runs Playwright UI checks.
- `pnpm run app:build` and `pnpm run app:smoke` validate packaged desktop wiring, but manual launched-app evidence is still required before release claims.

## Workflow Hygiene

- Prefer narrow `permissions` blocks.
- Keep action versions intentional and review third-party action upgrades.
- Keep check names stable once branch protection references them.
- Do not add CI jobs that require raw PSU project data.
- Do not put OpenAI keys, tokens, or workbook data in repository secrets unless a workflow explicitly needs them and the user approves.

## Data And AI Guardrails

- `PC`, `LPC`, and `4PC` are ordinal 0-5 scores unless exact extracted counts exist.
- Paired accession/species comparisons are preferred over raw treatment averages.
- AI summaries must preserve deterministic confidence labels and cite row evidence.
- Header mapping may use AI only as a fallback after deterministic matching.
- OpenAI keys are stored through Electron safe storage and redacted from logs.

## Known Public-Repo Gaps

- No license grant is included yet.
- Releases are not signed/notarized unless a future release note explicitly documents that process.
- Branch protection should be enabled after the current in-flight code settles and the first public CI run is green.
