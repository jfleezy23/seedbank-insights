# SeedBank Insights

[![CI](https://github.com/jfleezy23/seedbank-insights/actions/workflows/ci.yml/badge.svg)](https://github.com/jfleezy23/seedbank-insights/actions/workflows/ci.yml)

SeedBank Insights is a desktop workbench for turning propagation spreadsheets into reviewable seed-bank evidence. It imports accession-level workbook rows, normalizes treatment strings, extracts observation signals from notes, and presents deterministic treatment/species summaries before any AI text is allowed to speak.

The project is built for a careful research workflow: paired comparisons over raw averages, explicit data-quality warnings, confidence labels that do not overstate the evidence, and row-level citations wherever interpretation is generated.

This is an independent project. It is not affiliated with Frame Player, and it does not reuse Frame Player code, assets, release artifacts, or branding.

![SeedBank Insights prototype dashboard](docs/design/seedbank-insights-render.png)

## What It Does

- Imports PSU-style seed-bank propagation workbooks without committing raw workbook data.
- Persists each workbook import as an isolated SQLite batch so re-imports do not overwrite historical rows.
- Computes treatment, species, trial queue, paired-comparison, and data-quality views locally.
- Treats `PC`, `LPC`, and `4PC` as ordinal 0-5 scores unless exact extracted counts exist.
- Favors paired accession/species comparisons so rare treatments and uneven species mixes are visible.
- Labels evidence as `Strong signal`, `Promising`, `Inconclusive`, or `Needs replication`.
- Supports optional OpenAI species summaries and Ask responses from Electron main only.
- Stores OpenAI keys through Electron safe storage; renderer code must not persist keys or use them for OpenAI calls.

## Why It Exists

Propagation workbooks are rich but easy to misread. One high score can look decisive, a cached average can hide uneven sampling, and notes often contain the most useful operational detail. SeedBank Insights is designed to slow that down in the right places:

- evidence before recommendation
- deterministic labels before prose
- row citations before summary claims
- warnings before false confidence

## Project Status

SeedBank Insights is an early desktop prototype. It has real import, analysis, storage, and UI paths, but public releases should be treated as experimental until a signed release notes otherwise.

Current emphasis:

- workbook import reliability
- deterministic statistical guardrails
- safe OpenAI integration
- desktop launch and packaging smoke coverage
- public repository hygiene before first release

## Repository Map

```text
src/                 React UI, deterministic analysis, workbook parsing, sample data
electron/            Electron main/preload, SQLite persistence, OpenAI IPC boundary
tests/               Unit, integration, UI, and synthetic workbook fixtures
scripts/             Local smoke, packaging, icon, SCA, and secret-scan helpers
assets/branding/     Replaceable prototype branding and generated image assets
docs/                Product, architecture, release, security, and design notes
.github/             CI, dependency review, and pull request templates
```

## Documentation

- [Product overview](docs/product-overview.md)
- [Help](docs/help.md)
- [User guide](docs/user-guide.md)
- [Architecture](docs/architecture.md)
- [Data and AI guardrails](docs/data-and-ai-guardrails.md)
- [Testing strategy](docs/testing-strategy.md)
- [Security and quality baseline](docs/security-quality-baseline.md)
- [Release checklist](docs/release-checklist.md)
- [Roadmap](docs/roadmap.md)
- [Brand notes](docs/brand-notes.md)
- [Security policy](SECURITY.md)
- [License](LICENSE.md)
- [Third-party notices](docs/THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md)

## Data And Privacy

Raw project workbooks are intentionally ignored by git. Do not commit `P_accessions_new.xlsx`, local PSU-style workbooks, `.env` files, runtime SQLite databases, logs, or generated release output.

The committed fixture at `tests/fixtures/psu-style-accessions-fixture.xlsx` is synthetic and exists so CI can exercise the Excel import path without publishing sensitive source data.

OpenAI is optional. A user-provided API key is validated and stored through Electron main with OS-backed safe storage. Renderer code receives narrow IPC results and must not persist, log, or echo keys.

## Build From Source

Requirements:

- Node.js 22
- pnpm 11
- macOS or Windows for desktop packaging checks

Install and run the main local gate:

```sh
pnpm install
pnpm run secret:scan
pnpm run test
pnpm run build
pnpm run sca
```

Run the app in development:

```sh
pnpm run dev
```

Run UI checks:

```sh
pnpm run test:ui
```

Build and launch-smoke a packaged directory:

```sh
pnpm run app:build
pnpm run app:smoke
```

Packaging is not launch verification. Before calling desktop work complete, run the packaged app bundle/executable and inspect evidence that the main window, splash, icon resources, and first screen render correctly.

## Maintainer Checklist

Before pushing public code or opening a release PR:

```sh
git status --short
pnpm run secret:scan
pnpm run test
pnpm run build
pnpm run sca
```

Inspect the diff before committing and keep validation notes with the change.

## License

No license grant is currently included. Unless a license is added later, all rights are reserved by the project owner.
