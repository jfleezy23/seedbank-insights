# Contributing

SeedBank Insights is early-stage research tooling. Contributions should preserve the core project posture: deterministic evidence first, AI as assistive text only, raw workbook data kept out of git, and desktop behavior verified by running the app path that changed.

## Development Rules

- Keep source in `src/`, Electron code in `electron/`, tests in `tests/`, scripts in `scripts/`, docs in `docs/`, and brand/design assets in `assets/branding/`.
- Do not commit raw workbooks, `.env` files, SQLite databases, logs, packaged output, screenshots from failed local runs, or generated release artifacts.
- Prefer synthetic fixtures and deterministic tests over raw source data.
- Keep OpenAI calls in Electron main behind narrow IPC. Renderer code must not persist API keys or use them for model calls.
- Do not let AI-generated prose upgrade deterministic confidence labels or hide data-quality warnings.

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
pnpm run app:build
pnpm run app:smoke
```

Then launch the packaged app itself and inspect evidence from the running app before claiming desktop release readiness.

## Pull Requests

Pull requests should include:

- a concise summary of the user-facing or maintainer-facing change
- the exact validation commands that ran
- a note on raw data and secrets
- screenshots or layout evidence for UI work
- independent review notes when code changed

Use Antigravity advisory review with `Gemini 3.5 Flash (High)` when available, but treat its output as feedback to evaluate, not authority.

## Review Priorities

Review should focus on:

- false confidence in statistical labels
- accidental raw data or key exposure
- renderer/main security boundaries
- import repeatability and batch isolation
- UI states that hide warnings, overflow, or disable expected actions
- tests that use synthetic fixtures rather than local-only data
