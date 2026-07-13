# Testing Strategy

SeedBank Insights uses layered checks so import correctness, desktop launch behavior, and public-repo hygiene fail early. Prefer the scripted gates so validation does not depend on agent memory:

```sh
pnpm run verify:quick
pnpm run verify:full
pnpm run verify:workflow
pnpm run verify:agent-docs
```

## Unit And Integration Tests

```sh
pnpm run test
```

Coverage includes:

- treatment parsing
- note observation extraction
- statistical confidence helpers
- species-clustered bootstrap determinism, exact sign tests, Holm correction, and evidence tiers
- OpenAI response validation
- synthetic Excel import
- multi-workbook import previews, quarantine handling, score-scale validation, and codebook-gated treatment eligibility

Local real-workbook acceptance can be run without committing raw data:

```powershell
$env:WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_new.xlsx"
$env:READY_WORKBOOK_IMPORT_TEST_PATH = "<local path>\P_accessions_ready.xlsx"
pnpm exec vitest run --reporter=verbose
```

The current expected acceptance result is 128 analyzable trials for the original workbook and, for the larger workbook, 2,204 populated records, 2,166 analyzable rows, and 38 quarantined rows.

## UI Tests

```sh
pnpm run test:ui
```

Coverage includes:

- dashboard first render
- sidebar navigation
- settings modal state
- Dataset Manager preview, explicit scope selection, codebook editor, and Advanced Analysis data states
- AI species insight generation controls
- key-save readiness behavior

UI tests should use synthetic app data and must not require a real OpenAI key.

## Database Smoke

```sh
pnpm run db:smoke
```

The SQLite smoke path verifies import persistence, data-quality issue persistence, and reconstruction of an import result for later AI regeneration.

It should also cover migrations for workbook sources, immutable import versions, quarantined rows, analysis scopes, scope membership, and treatment codebook entries when those schema paths change.

## Desktop Packaging Smoke

```sh
pnpm run app:build
pnpm run app:smoke
```

This validates packaged wiring, but it is not the final release claim. A maintainer must also launch the packaged app and inspect evidence from the actual app bundle or executable.

For human-review checkpoints, stop at the unpacked packaged app produced by `pnpm run app:build`. Installer assets are release-only and should not be built or handed off until human testing passes and release packaging is explicitly requested.

## Security And Dependency Checks

```sh
pnpm run lint
pnpm run typecheck
pnpm run secret:scan
pnpm run sca
```

The secret scan reports filenames and rule names only. It intentionally does not print matched values.

Release-impacting changes also require a read-only AGY review with Gemini 3.5 Flash High. AGY feedback is loose guidance: record and adjudicate every comment, fix validated defects, and rerun the affected gates.

## Manual Review Checklist

For UI or desktop changes, inspect:

- first viewport layout
- mobile or narrow-window behavior when applicable
- disabled states
- overflow and clipping
- visible warnings
- splash and icon resources in packaged builds
- launch-error behavior for risky startup paths
