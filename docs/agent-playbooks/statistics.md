# Statistics and evidence playbook

Use this playbook for treatment comparisons, Species Explorer evidence, Advanced Analysis, confidence labels, statistical tests, and AI research boundaries.

## Ownership

- Implement statistical logic deterministically in TypeScript. Do not add a Python/R sidecar or hidden runtime workaround.
- AI can summarize or contextualize evidence, but it must not upgrade deterministic confidence labels, hide warnings, or create uncited species-specific technique claims.
- Deterministic local workbook evidence leads Species Explorer. AI research belongs below it as context.

## Endpoints and units

- Preserve raw `PC`, `LPC`, and `4PC` values. Normalized classes are analytical derivatives, not replacements.
- Keep `PC`, `LPC`, and `4PC` as separate endpoints. Do not treat missing downstream endpoints as zero and do not combine them into a composite score.
- Never pool seed, stem-cutting, and division `PC` outcomes. Their meanings differ.
- Prefer matched experimental-unit comparisons over raw treatment averages.
- The formal unit includes workbook/import version, propagation accession, source accession when available, species, propagule type, and cohort.
- Genuine treatment replicates within a unit aggregate by median ordinal score. Ambiguous duplicate classifications are excluded from formal inference.

## Species-first local evidence

- Build every valid within-accession treatment contrast separately by species and propagule type.
- Completed (`D`) results are primary evidence. Active (`ND`) contrasts are preliminary and must remain visually separate.
- When one arm is `C`, show the non-control treatment first and describe it against control.
- If neither arm is a control, present the treatments symmetrically.
- Undocumented treatment codes stay visible but are descriptive only; they cannot receive positive or negative recommendations.
- Use "PC class" for ordinal data. Only show percentage-point differences when every matched arm has explicit percentages.
- Keep liner and 4-inch rootball outcomes under "After propagation"; do not let them alter germination verdicts.

## Operational comparison outputs

Report paired units, species, source accessions, cohorts, win/tie/loss counts, non-tie win rate, median ordinal shift, species-balanced mean shift, deterministic species-cluster bootstrap interval, and completed versus active outcomes separately.

## Formal analysis defaults

- Formal analysis defaults to completed (`D`) trials.
- Use species-level paired effects for a two-sided exact sign test, excluding species-level ties.
- Apply Holm correction within each propagule type across eligible contrasts.
- Suppress formal p-values for contrasts with fewer than 10 species or fewer than 5 non-tied species.
- Undocumented treatments remain descriptive-only.

## Evidence tiers

- `Needs replication`: fewer than 5 species or 5 non-tied species.
- `Inconclusive`: clustered interval includes zero or adjusted p-value is at least 0.05.
- `Promising`: at least 10 species, interval excludes zero, adjusted p-value below 0.05, species-balanced effect at least 0.5 class, and at least 67% directional consistency among non-ties.
- `Strong signal`: at least 30 species and 20 non-tied species, effect at least 1 class, at least 75% directional consistency, adjusted p-value below 0.01, and direction repeats in two cohorts with at least 5 species each.

## Known analytical gotchas

- A minimum-additional-pairs count based on evidence-tier thresholds is not a statistical power calculation. Label it as a review threshold.
- Repeated accessions from one species cannot independently support a cross-species `Strong signal` label.
- Trial Queue rows are operational observations, not independent confidence assessments.
- Confidence-label negation checks must treat newlines as statement boundaries.
- Species research must cite source rows for that species; drop uncited technique claims and fall back to deterministic local evidence.
