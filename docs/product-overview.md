# Product Overview

SeedBank Insights is a desktop analysis workbench for seed-bank propagation spreadsheets. It is designed for reviewers who need to move from workbook rows to defensible propagation insight without losing sight of weak evidence, uneven sampling, or raw notes.

## Core Promise

The app helps answer:

- Which treatments are performing best, and where is the evidence thin?
- Which species have enough signal to review more deeply?
- Which accessions need attention in the trial queue?
- Which workbook rows contain warnings or ambiguous data?
- What can an AI assistant summarize without overstating the deterministic evidence?

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

Raw source workbooks are ignored by git. Public tests use synthetic fixtures so the repository can be shared without exposing project data.

### Desktop UX Over Dashboard Theater

The UI is meant for repeated review: dense but readable, clear navigation, visible warnings, and stable controls rather than a marketing landing page.

## Current Capabilities

- Excel import from PSU-style accession workbooks
- deterministic header normalization with AI fallback for ambiguous headers
- local SQLite storage with import batch isolation
- treatment parsing for control, cold stratification, warm stratification, scarification, hot water, and GA signals
- note parsing for germinated and in-production observations
- treatment summaries, species summaries, paired comparisons, trial queues, and data-quality panels
- optional cached OpenAI species insight cards
- optional Ask workflow over bounded spreadsheet context
- Electron safe-storage API key handling

## Non-Goals

- replacing statistical review or experimental design
- publishing raw workbook data
- treating AI text as authoritative evidence
- faking or redrawing official institutional marks
- merging this project with Frame Player or reusing Frame Player assets/code

## Maturity

This is a prototype with real analysis paths. Public releases should remain conservative until packaging, launched-app validation, signing/notarization, and release notes are complete.
