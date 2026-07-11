# Architecture

SeedBank Insights is a standalone Electron, React, and TypeScript desktop app.

## High-Level Shape

```text
Synced workbook file
  -> Dataset Manager preview
  -> src/core/workbook.ts
  -> deterministic ImportResult with accepted and quarantined rows
  -> electron/main/database.ts
  -> SQLite workbook source + immutable import version
  -> explicit analysis scope
  -> src/core/insights.ts
  -> DashboardData
  -> React views in src/App.tsx and src/components/*
```

Optional OpenAI flows run only in Electron main:

```text
Renderer action
  -> preload IPC wrapper
  -> electron/main/main.ts
  -> electron/main/openai-insights.ts
  -> OpenAI web-search source discovery
  -> validated structured response
  -> deterministic confidence/evidence enforcement
  -> DashboardData back to renderer
```

## Process Boundaries

### Renderer

The renderer owns UI state, navigation, and display. It reads dashboard data and invokes narrow methods from the preload API.

Renderer constraints:

- no Node integration
- sandbox enabled
- context isolation enabled
- no API keys
- no arbitrary renderer-supplied import paths

### Preload

The preload script exposes a minimal `window.seedbank` API:

- dashboard read
- workbook selection/import
- Dataset Manager source, preview, import, relink, and scope actions
- treatment codebook read/save
- Advanced Analysis export
- OpenAI key status/save/clear
- AI species generation
- Ask question

### Electron Main

Electron main owns privileged behavior:

- file dialog access
- workbook path validation
- SQLite persistence
- immutable import-version and analysis-scope management
- treatment codebook versioning
- Advanced Analysis export file writes
- safe-storage key encryption
- OpenAI calls
- launch error fallback

## Core Modules

- `src/core/workbook.ts`: Excel import, header normalization, rich cell text extraction, workbook validation, quarantine classification, and import previews.
- `src/core/treatments.ts`: propagule-scoped treatment parsing, built-in codebook entries, and component tagging.
- `src/core/notes.ts`: extraction of observations from notes.
- `src/core/statistics.ts`: operational comparisons, Advanced Analysis contrasts, species-clustered bootstrap, exact sign tests, Holm correction, and evidence tiers.
- `src/core/insights.ts`: dashboard summaries, paired comparisons, trial queue, data-quality synthesis.
- `src/core/csv.ts`: CSV export formatting with spreadsheet-formula neutralization for workbook-derived text.
- `electron/main/database.ts`: SQLite schema, migrations, workbook sources, import versions, quarantined rows, analysis scopes, treatment codebook entries, and import reconstruction.
- `electron/main/openai-insights.ts`: web-source discovery, structured OpenAI prompts, model routing, schema validation, and confidence enforcement.

## Persistence Model

SQLite rows are source/version isolated. Registered workbook sources record the local path, source identity, and availability. Each confirmed changed file creates a new immutable import version with its workbook hash, worksheet, populated row count, quarantined row count, and import-format version. Matching content creates no duplicate version.

Trial rows use `(import_batch_id, id)` semantics so repeated imports do not replace historical rows. Quarantined rows are persisted separately with original source evidence and explicit reasons. Analysis scopes select one version per source; combined scopes are explicit and block formal analysis when cross-source natural-key overlaps are unresolved.

Treatment codebook entries are versioned and scoped by propagule type. Built-in documented seed/cutting codes are preloaded, while unknown tokens remain importable but descriptive-only until an explicit entry is saved and eligibility is rerun.

Derived AI species insight caches are keyed by the active scope identity rather than a single filename so individual and combined scopes do not reuse incompatible evidence.

This makes it possible to:

- reconstruct a prior import result and its quarantined rows
- compare current dashboard state to source/version data
- analyze individual cohorts or explicitly selected combined scopes
- regenerate AI species insights for a known scope
- avoid historical data loss on re-import or relink

## Failure Posture

Startup should show the splash first, then initialize risky paths. If SQLite/native module initialization fails, the app should show an explicit launch-error surface instead of a blank window.

OpenAI failures should degrade to deterministic behavior where possible. Deterministic imports and dashboard calculations must not depend on live AI availability. Species research uses a lower-cost discovery model before synthesis and retains only validated, clickable source URLs.

## Test Strategy

- Unit tests for treatment parsing, statistics, CSV exports, notes, and OpenAI response validation.
- Integration tests for synthetic workbook import plus optional local real-workbook acceptance through environment variables.
- UI tests for primary dashboard navigation, Dataset Manager, Advanced Analysis, settings, and AI species insight flows.
- SQLite smoke test for persistence, migrations, scope reconstruction, and import reconstruction.
- SCA, secret scan, lint, typecheck, build, and independent AGY review for release-impacting changes.
- Packaged launch smoke for unpacked desktop bundle loading, icon/splash resources, and first-screen evidence. Installer builds are release-only after human test approval.
