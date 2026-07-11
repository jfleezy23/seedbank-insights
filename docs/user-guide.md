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

Then launch the packaged app bundle/executable itself.

## Manage Workbook Sources

Use Google Drive Desktop to sync the source workbooks locally, then open **Imports → Dataset Manager**. Register one or more `.xlsx` or `.xls` files and review the compatibility preview before importing. Matching content creates no duplicate; changed content creates a new immutable version only after confirmation.

The app checks:

- file extension
- file size limit
- required headers
- deterministic header aliases
- optional AI header alias fallback when configured
- accepted and quarantined populated rows
- unknown treatment codes, duplicate candidates, and invalid dates

Import never changes the active analysis scope. Choose an individual scope or explicitly create a combined scope in Dataset Manager. A combined scope can contain only one version per source and is blocked when cross-source natural keys overlap.

Unknown treatment tokens remain descriptive-only. Add a documented propagule-specific mapping in the Treatment Codebook, then preview the source again to rerun eligibility.

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

The Species Explorer separates deterministic species summaries from optional AI species insight cards.

Deterministic summaries include:

- row count
- accession count
- treatment count
- best observed treatment
- mean `PC`
- confidence label

AI species cards, when generated, must keep the deterministic confidence label and cite row evidence.

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
