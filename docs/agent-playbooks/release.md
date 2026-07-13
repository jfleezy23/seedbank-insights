# Release and merge playbook

Use this playbook for CI changes, merges to `main`, release candidates, packaging, public artifacts, Sonar feedback, and independent review.

## Principles

- Human testing gates public releases. Do not tag, upload, publish, or attach release assets until the user explicitly confirms the human test pass.
- For human-review checkpoints, build and hand off the unpacked packaged app only. Installer artifacts such as Windows setup files or macOS DMGs are release artifacts and require explicit approval after human testing passes.
- Packaging is not launch verification. Before claiming a packaged desktop app works, run the packaged executable/app bundle itself and inspect evidence that the main window loads.
- If implementation work changes desktop behavior, hand off a fresh unpacked build for human testing.
- Do not add paid release, scanning, signing, or quality-gate services unless the user explicitly approves.

## Release-impacting verification

Prefer the exact commands:

```sh
pnpm run verify:quick
pnpm run verify:full
pnpm run release:preflight
pnpm run verify:release
```

Use focused checks for the changed path first, then the broader gate when shared behavior, persistence, packaging, or publication files changed.

## SonarQube free-tier internal gate

- This repo uses SonarQube Cloud on the free tier for advisory merge and release feedback.
- Do not upgrade, add paid seats, or require paid/private-enterprise Sonar behavior unless the user explicitly approves.
- The internal Sonar gate is the GitHub `SonarQube` workflow completing successfully and producing a dashboard link in the job summary.
- Review the dashboard feedback for merges and releases; do not claim Sonar was checked from a green GitHub check alone without opening or recording run/dashboard evidence.
- Do not enable `sonar.qualitygate.wait=true` by default. Quality-gate readback can require extra project permissions and must not become a hidden release blocker on the free tier.

For release-source feedback, scan the exact tag or commit from `main` without changing source:

```sh
gh workflow run .github/workflows/sonarqube.yml --ref main -f checkout_ref=<tag-or-sha> -f sonar_branch=<sonar-branch-label> -f enforce_quality_gate=false
```

Record the GitHub Actions run URL, scanned source commit, and Sonar dashboard URL when Sonar feedback is part of release validation.

## AGY independent review

- `AGY` means the Google Antigravity CLI (`agy`).
- For release-impacting changes, run a read-only AGY review with the exact base commit and scoped file list or compact diff.
- Broad default: `Gemini 3.5 Flash (High)`.
- Targeted React/UI interaction or responsive-layout adjudication: `Claude Sonnet 4.6 (Thinking)` only when useful.
- Reserve `Claude Opus 4.6 (Thinking)` for narrow statistical-method, numerical, or inference-boundary checks.
- Reviews are code-only. Do not ask AGY to inspect screenshots or images; AGY should review implementation and tests.
- Instruct AGY not to edit files, commit, push, merge, publish, or change GitHub state.
- Collect AGY's feedback and adjudicate every comment as valid, invalid, duplicate, or needing more evidence.
- Fix every validated blocking bug, add targeted regression coverage when appropriate, and rerun affected gates.
- AGY feedback is loose guidance, not authority. It never replaces human testing.

Suggested prompt shape:

```sh
agy --new-project --model "Gemini 3.5 Flash (High)" --sandbox --mode plan --print-timeout 20m0s --print "<review this exact diff for correctness, regressions, data preservation, migrations, statistical validity, Electron security boundaries, tests, docs clarity, and release risk; do not edit files>"
```

## Commit and publish hygiene

- Stage explicit paths only.
- Commit messages must describe what changed truthfully.
- Commit or PR notes should include validation commands, AGY adjudication summary when applicable, and raw-data/secrets status.
- Do not attach raw data, local databases, unsigned ad hoc artifacts, or unverified packaged builds to a public release.
- Confirm repository security basics remain enabled where available: secret scanning, push protection, dependency alerts, automated security fixes, Dependabot, CodeQL, CI, and Sonar.
