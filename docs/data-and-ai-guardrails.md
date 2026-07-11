# Data And AI Guardrails

SeedBank Insights is built around a simple rule: deterministic code owns evidence and confidence; AI may assist with language and narrow interpretation only.

## Workbook Data

Raw workbooks are local working data and should not be committed. Public tests use synthetic fixtures.

Ignored local data includes:

- `P_accessions_new.xlsx`
- `P_accessions_ready.xlsx`
- `data/raw/`
- `.env` and `.env.*`
- SQLite databases
- logs
- generated build and release output

Use Google Drive Desktop or another local sync client as transport. The app reads user-selected synced files, hashes the content, previews compatibility, and commits changed content as immutable import versions only after confirmation. It does not use Google OAuth, Drive API tokens, background watchers, raw-data uploads, or repository copies.

## Score Interpretation

The workbook data dictionary permits `PC`, `LPC`, and `4PC` as either ordinal 0-5 classes or exact 0-100 percentages. The importer preserves each raw value and its detected scale.

Scale is handled at row/endpoint level:

- values from 0-5 are accepted as ordinal classes when the endpoint does not also show percentage evidence
- values above 5 and up to 100 are treated as exact percentages for that row and normalized to the documented 0-5 classes for analysis
- when an endpoint mixes percentage rows with nonzero 1-5 values, the low nonzero values are flagged ambiguous and excluded until an explicit scale is supplied
- zero remains usable because it has the same meaning on both scales
- values below 0 or above 100 are retained as raw evidence, excluded from calculations, and surfaced as row-level issues

This means the app should avoid implying precision that the workbook did not provide. Means and differences are useful review signals, but they are not protocol decisions by themselves.

`LPC` and `4PC` remain separate downstream endpoints. Missing `LPC` or `4PC` values are not treated as zero and are not pooled with `PC`.

## Confidence Labels

The supported labels are:

- `Strong signal`
- `Promising`
- `Inconclusive`
- `Needs replication`

Labels should consider:

- sample size
- paired accession/species evidence
- treatment rarity
- one-off high scores
- multiple comparisons
- uneven species mix
- intervals that cross no effect
- underpowered comparisons
- distinct species represented by paired comparisons

Counts shown as "additional pairs" are minimum evidence-tier review thresholds, not formal power estimates.

## Paired Comparisons

Paired comparisons should match by experimental unit, not by treatment average. The formal unit includes workbook/import version, propagation accession, source accession when available, species, propagule type, and cohort. Accession-only matching can admit ambiguous comparisons and inflate treatment effects.

Prefer:

```text
workbook version + P accession + source accession + species + propagule type + cohort + baseline treatment + candidate treatment
```

Avoid:

```text
raw treatment average alone
```

Seed, stem-cutting, and division `PC` outcomes must not be pooled because their meanings differ. Operational comparisons may include active rows when clearly labeled. Formal Advanced Analysis defaults to completed (`D`) trials, suppresses p-values when species/non-tie minimums are not met, and applies Holm correction within propagule type.

Unknown treatment tokens remain descriptive-only until a propagule-specific codebook entry documents their meaning. No treatment meaning should be inferred from an undocumented local token.

## AI Species Insights

AI species insight output must:

- preserve deterministic confidence labels
- cite row evidence
- keep caveats visible
- avoid broad protocol recommendations from thin data
- fail closed if output is malformed
- use only source URLs returned by the OpenAI web-search discovery call

AI species insight output must not:

- add undeclared fields
- upgrade deterministic confidence
- hide data-quality warnings
- invent source rows
- cite rows outside the bounded context
- invent or substitute research URLs

Species research uses `gpt-5.4-mini` with low reasoning for bounded web discovery and `gpt-5.4` for structured synthesis. A `gpt-5.5` retry is reserved for malformed synthesis output, not the normal path. Ask and ambiguous-header mapping use `gpt-5.4-mini`.

## Ask Responses

Ask answers use bounded spreadsheet context. Responses should include caveats and cited rows, and the parser filters citations to rows present in the context.

The Ask feature is assistive. It should not be used as a substitute for reviewing the deterministic panels.

## Header Mapping

Header import should try deterministic exact/synonym matching first. AI header mapping is only a fallback for ambiguous or missing headers and must not block deterministic imports if it fails.

## Secret Handling

OpenAI keys are entered in Settings and stored with Electron safe storage. They must not be committed, logged, printed, echoed in errors, persisted in renderer state, used for model calls from renderer code, or written to `.env` files.

Use:

```sh
pnpm run secret:scan
```

before pushing public work.
