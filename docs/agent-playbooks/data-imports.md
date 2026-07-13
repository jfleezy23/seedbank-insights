# Data imports playbook

Use this playbook for workbook ingestion, Dataset Manager behavior, provenance, local database persistence, data quality, and raw-data handling.

## Raw data boundary

- Do not commit raw project workbooks or derived raw data unless the user explicitly approves.
- Keep real workbooks in ignored local paths such as `data/raw/`, Downloads, or Drive Desktop folders.
- Commit synthetic fixtures that reproduce structure, edge cases, and parser behavior.
- Public release assets must contain no raw workbook, local database, API key, or AI response cache.

## Import invariants

- Preserve source file, workbook hash, import version, batch, worksheet, and source row on every trial, warning, comparison example, AI citation, and export.
- Keep imports as separate immutable cohorts. Importing a file must not silently change the active analysis scope.
- A matching content hash creates no new batch. A changed file creates a new immutable version only after preview/confirmation.
- Enforce one import version per source within an analysis scope.
- Cross-source natural-key overlaps must be surfaced and must block combined formal analysis until resolved. Do not silently deduplicate.
- Use Google Drive Desktop as a synced-file transport only. Do not add Google OAuth, Drive API tokens, background file watching, raw-data uploads, or repository copies unless explicitly requested.

## Parser and validation rules

- Select accession sheets by header coverage and populated-record score. If multiple sheets qualify, show them in import preview.
- Scan populated rows rather than Excel's formatted row count.
- Recursively extract display text from formulas, rich text, hyperlinks containing rich text, and ordinary cells.
- Preserve original displayed values alongside normalized values.
- Canonicalize supported headers and punctuation variants, including `UorSBacc`, `D/ND`, and `L(R:C;Z)`.
- Quarantine blank treatment, missing identifiers, malformed species, ambiguous duplicates, and invalid dates with explicit reasons; keep them visible in Data Quality.
- Canonical propagule type is `seed`, `stem_cutting`, `division`, or `unknown`, with the raw code retained.
- Plausible dates run from 1990 through two years beyond import time. Invalid raw date evidence is retained but excluded from calculations.
- Decide score scale per cell/end point. Do not convert an entire column because one value looks like a percentage.

## Local database language

- In code and internal docs, SQLite is the persistence engine.
- In UI copy, use human terms such as "local database" or "local data"; do not surface "SQLite" to app users.
- Runtime persistence failures should produce explicit launch/import errors, not a blank app shell.

## Current acceptance targets

- Original workbook import path: 128 analyzable trials.
- Larger workbook import path: 2,204 populated records, 2,166 analyzable rows, and 38 quarantined rows for missing required treatment evidence.
- Source accession and completed/active status must be preserved.
- Rich-text species names must remain valid text.
- Invalid dates must never become plausible legacy dates.
- Advanced Analysis being blank for an eligible real workbook is usually a parser/scope/eligibility bug to investigate, not an acceptable empty state.
