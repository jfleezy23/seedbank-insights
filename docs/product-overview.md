# Product Overview

SeedBank Insights is a desktop analysis workbench for seed-bank propagation spreadsheets. It is designed for reviewers who need to move from workbook rows to defensible propagation insight without losing sight of weak evidence, uneven sampling, or raw notes.

## Core Promise

The app helps answer:

- Which treatments are performing best, and where is the evidence thin?
- Which species have enough signal to review more deeply?
- Which accessions need attention in the trial queue?
- Which workbook rows contain warnings or ambiguous data?
- Which imported cohort or explicit combined scope is currently being analyzed?
- What optional OpenAI summaries can cover without overstating deterministic evidence?

## Intended Users

- seed-bank and propagation staff reviewing active trial workbooks
- researchers comparing treatment strategies across accessions
- maintainers building local data workflows from Excel-based records
- reviewers who need auditability before changing protocols

## Product Principles

### Evidence Before Recommendation

Treatment summaries are not treated as recommendations by default. Scores are paired where possible, sample sizes are visible, and labels preserve uncertainty.

### Deterministic Labels Own Confidence

The app owns confidence labels in deterministic TypeScript code. AI output may summarize and explain, but it cannot promote a result from `Promising` to `Strong signal` or hide a warning.

### Raw Data Stays Local

Raw source workbooks are ignored by git. Public tests use synthetic fixtures so the repository can be shared without exposing project data. Synced local files are used as transport; the app does not upload raw workbooks or require Google Drive API tokens.

### Desktop UX Over Dashboard Theater

The UI is meant for repeated review: dense but readable, clear navigation, visible warnings, and stable controls rather than a marketing landing page.

## Current Capabilities

- Excel import from PSU-style accession workbooks
- Dataset Manager for local synced workbook sources, compatibility previews, immutable import versions, relinking, explicit individual scopes, and explicit combined scopes
- deterministic header normalization with AI fallback for ambiguous headers
- local SQLite storage with workbook sources, import versions, quarantined rows, analysis scopes, and treatment codebook entries
- propagule-scoped treatment parsing for documented seed and cutting codes, with unknown tokens kept descriptive-only until explicitly mapped
- note parsing for germinated and in-production observations
- treatment summaries, species summaries, operational paired comparisons, Advanced Analysis, trial queues, and data-quality panels
- Advanced Analysis exports with pair-level CSV, species-level CSV, and reproducibility manifest
- optional cached OpenAI species insight cards
- optional Ask workflow over bounded spreadsheet context
- Electron safe-storage API key handling

## Non-Goals

- replacing statistical review or experimental design
- publishing raw workbook data
- treating AI text as authoritative evidence
- silently combining cohorts or deduplicating cross-source overlaps
- inferring undocumented treatment-code meaning
- adding Google OAuth, Drive API tokens, background file watching, or raw-data uploads in v0.3
- faking or redrawing official institutional marks
- merging this project with Frame Player or reusing Frame Player assets/code

## Maturity

This is a prototype with real analysis paths. Public releases should remain conservative until the full validation gate, independent AGY review, launched-app validation, human testing, signing/notarization where applicable, and release notes are complete.
