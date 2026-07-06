# Architecture

SeedBank Insights is a standalone Electron, React, and TypeScript desktop app.

## High-Level Shape

```text
Workbook file
  -> src/core/workbook.ts
  -> deterministic ImportResult
  -> electron/main/database.ts
  -> SQLite import batch
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
- OpenAI key status/save/clear
- AI species generation
- Ask question

### Electron Main

Electron main owns privileged behavior:

- file dialog access
- workbook path validation
- SQLite persistence
- safe-storage key encryption
- OpenAI calls
- launch error fallback

## Core Modules

- `src/core/workbook.ts`: Excel import, header normalization, workbook validation.
- `src/core/treatments.ts`: treatment parsing and component tagging.
- `src/core/notes.ts`: extraction of observations from notes.
- `src/core/statistics.ts`: deterministic statistical helpers.
- `src/core/insights.ts`: dashboard summaries, paired comparisons, trial queue, data-quality synthesis.
- `electron/main/database.ts`: SQLite schema and import-batch persistence.
- `electron/main/openai-insights.ts`: structured OpenAI prompts, schema validation, confidence enforcement.

## Persistence Model

SQLite rows are batch-isolated. Trial rows use `(import_batch_id, id)` semantics so repeated imports do not replace historical batches. Derived AI species insights are saved by batch.

This makes it possible to:

- reconstruct a prior import result
- compare current dashboard state to batch data
- regenerate AI species insights for a known import
- avoid historical data loss on re-import

## Failure Posture

Startup should show the splash first, then initialize risky paths. If SQLite/native module initialization fails, the app should show an explicit launch-error surface instead of a blank window.

OpenAI failures should degrade to deterministic behavior where possible. Deterministic imports and dashboard calculations must not depend on live AI availability.

## Test Strategy

- Unit tests for treatment parsing, statistics, notes, and OpenAI response validation.
- Integration test for synthetic workbook import.
- UI tests for primary dashboard navigation, settings, and AI species insight flows.
- SQLite smoke test for persistence and import reconstruction.
- Packaged launch smoke for desktop bundle loading, icon/splash resources, and first-screen evidence.
