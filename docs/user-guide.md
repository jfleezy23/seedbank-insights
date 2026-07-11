# User Guide

This guide describes the current SeedBank Insights prototype workflow.

## Start The App

For development:

```sh
pnpm run dev
```

For packaged validation:

```sh
pnpm run app:build
pnpm run app:smoke
```

Then launch the unpacked packaged app bundle/executable itself. Installer builds are release artifacts and are not part of normal human-review checkpoints.

## Manage Workbook Sources

Use Google Drive Desktop to sync the source workbooks locally, then open **Imports → Dataset Manager**. Register one or more `.xlsx` or `.xls` files and review the compatibility preview before importing. Matching content creates no duplicate; changed content creates a new immutable version only after confirmation.

Dataset Manager vocabulary:

- **Choose workbook files** opens one or more locally synced workbook files, remembers their source identity, hashes the content, and builds a compatibility preview. This is the user-facing registration step; it does not change the active analysis scope.
- **Registered sources** are remembered workbook identities. Use **Check for updates** to compare the synced file against the last imported content hash.
- **Relink** is for moved, renamed, unavailable, or cloud-only files. It reconnects the remembered source to a local file without changing historical import versions.
- **Analysis scope** is the active dataset used by the dashboard, Advanced Analysis, Ask, and species research cache. Choose a single imported cohort or explicitly create a combined scope.
- **Import compatibility preview** shows accepted rows, quarantined rows, warnings, worksheet candidates, duplicate candidates, and parser-refresh needs before anything is committed.
- **Treatment codebook** is not the glossary. The Glossary explains acronyms for people; the codebook documents unknown tokens for a specific propagule type and reruns formal eligibility.

The app checks:

- file extension
- file size limit
- required headers
- accession-sheet candidates by header coverage and populated-row score
- deterministic header aliases
- optional AI header alias fallback when configured
- accepted and quarantined populated rows
- unknown treatment codes, duplicate candidates, and invalid dates
- raw and normalized cell evidence for supported fields

Import never changes the active analysis scope. Choose an individual scope or explicitly create a combined scope in Dataset Manager. A combined scope can contain only one version per source and is blocked when cross-source natural keys overlap.

Unknown treatment tokens remain descriptive-only. Add a documented propagule-specific mapping in the Treatment Codebook only when the meaning is known; saving the entry creates a new codebook version and reruns eligibility without changing raw workbook values.

Raw workbook files stay local and should not be committed.

## Review The Insight Board

The Insight Board gives the first review pass:

- imported row count
- accession/species/treatment counts
- done rate
- parsed observations
- treatment success chart
- evidence guardrails
- top paired comparisons

Use this view to find promising signals and obvious data-quality blockers before opening narrower views.

## Review Species

**Species Explorer leads with Local propagation results.** These are matched, local workbook comparisons for the selected species and propagule type—not a ranking made from unrelated treatment averages. A result compares treatments only when the same accession, source lot when recorded, species, propagule type, cohort, and workbook version support the pair.

For each comparison, review the named treatment pair, propagation type, matched-accession count, win/tie/loss count, PC effect, interval when available, verdict, conditions, and cited workbook rows. A documented `C` is shown as the control; a pair without `C` is a comparison between two treatments, not a hidden control. Undocumented treatment codes remain **Descriptive only** until they are documented in the Treatment Codebook.

- **Completed (`D`)** comparisons are the primary local result.
- **Active (`ND`)** comparisons are preliminary; they can guide follow-up but do not replace completed evidence.
- `PC` is the germination/propagation endpoint. `LPC` (liner) and `4PC` (4-inch rootball) are reported as separate after-propagation outcomes; blanks are not zeros and the app never combines them into one score.
- If no valid matched pair exists, the correct conclusion is “No matched treatment comparison recorded for this species,” not a best treatment from raw averages.

Optional AI research appears after the local results. It can provide source-backed context and help frame the next trial, but it cannot replace, upgrade, or contradict the deterministic local verdict.

### Field Terms

- **Control:** the comparison condition, commonly the documented `C` code. A control is named only when it is actually recorded.
- **Pretreatment:** a step applied before sowing or propagation, such as scarification, soaking, or stratification.
- **Propagation class (`PC`):** the workbook’s recorded germination endpoint, either an ordinal 0–5 class or an exact percentage with its scale retained.
- **Trial termination date (`TTD`):** the date the recorded trial outcome was closed or assessed; it is distinct from a start date.
- **Source lot / source accession:** the recorded origin or lot identity of the propagules. It helps prevent unlike material from being treated as one replicate.
- **Matched accession:** the same propagation accession, with matching source lot when available, species, propagule type, cohort, and workbook version evaluated under two treatments.
- **Cold-moist stratification:** a moist chilling pretreatment intended to address dormancy. Duration and temperature must come from the local protocol, not the abbreviation alone.
- **Warm-moist stratification:** a moist warm-phase pretreatment, sometimes used before or with chilling. It is not interchangeable with cold stratification.

These terms follow the native-plant nursery practice of documenting seed handling, treatment, sowing, and later seedling outcomes separately. [US Forest Service native-plant nursery manual](https://research.fs.usda.gov/treesearch/33075)

## Compare Treatments

Treatment comparisons prioritize paired accession/species matches. This prevents raw averages from overstating effects when treatment mixes differ by species or accession.

Comparison warnings call out:

- one-off high scores
- rare treatments
- multiple comparisons
- uneven species mix
- intervals crossing no effect
- underpowered comparisons

The **Advanced Analysis** workspace defaults to completed (`D`) trials, keeps propagule types separate, aggregates genuine treatment replicates by median ordinal score, and reports species-clustered intervals plus Holm-adjusted exact sign tests. Export creates pair-level CSV, species-level CSV, and a JSON reproducibility manifest.

If Advanced Analysis reports no eligible completed contrasts, check Dataset Manager first. Older imports may need to be refreshed so `D/ND`, source accession, propagule type, codebook eligibility, and workbook provenance are present. Rows with undocumented treatments or unresolved duplicate classification remain descriptive-only.

## Use The Trial Queue

The Trial Queue highlights accession/species/treatment rows that need operational attention. It is designed as a review queue, not a scheduler.

## Check Data Quality

The Data Quality view surfaces import and interpretation issues. Treat high-severity items as blockers before relying on any analysis summary.

## Optional OpenAI Setup

Open Settings and enter an OpenAI API key. The key is stored through Electron safe storage and is not written to `.env` files or renderer state.

When configured, OpenAI can help with:

- source-backed species and family germination research
- bounded Ask responses
- fallback header aliases for ambiguous imports

OpenAI cannot own calculations, promote confidence labels, or remove warnings.

## Troubleshooting

If the app fails to launch, it should show a launch-error window instead of a blank shell. Share the displayed message with a developer, but do not paste API keys or raw workbook contents into public issues.

If OpenAI features fail, check:

- Settings key status
- network access
- safe-storage availability
- whether deterministic workbook import still succeeds without AI
