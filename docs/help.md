# SeedBank Insights Help

SeedBank Insights is a desktop prototype for reviewing PSU-style seed-bank propagation workbooks. It imports workbook rows, computes deterministic evidence summaries, and can use optional OpenAI calls for species research and bounded questions.

## Project Links

- GitHub: https://github.com/jfleezy23/seedbank-insights
- Contact, support, or donation coordination: jflow23@icloud.com
- Security policy: ../SECURITY.md
- License: ../LICENSE.md
- Third-party notices: THIRD_PARTY_NOTICES.md

## Basic Workflow

1. Use **Imports → Dataset Manager** to register locally synced workbook files, review the import preview, and commit immutable versions.
2. Select an individual analysis scope or explicitly create a combined scope. Importing a file does not silently change the active scope.
3. Use **Insight Board** for import status, high-level metrics, and where to go next.
4. Use **Species Explorer** to review matched local propagation results for a selected species first, then optional AI-backed germination context.
5. Use **Treatment Comparator** for deterministic operational paired treatment comparisons.
6. Use **Advanced Analysis** for completed-trial, propagule-separated contrasts and reproducible exports.
7. Use **Data Quality** to find quarantined rows, unknown treatment codes, invalid dates, duplicate candidates, and notes that need cleanup.
8. Use **Trial Queue** for operational follow-up before turning rows into protocol evidence.
9. Use **Ask** only as a demo Q&A surface over bounded workbook context.

## Dataset Manager Terms

- **Register** means choose a locally synced workbook file and let the app remember its source path and content hash. Registering shows a preview; it does not make the file active by itself.
- **Choose workbook files** is the button that starts registration and preview. It reads local synced files, but it does not import or activate them until you confirm the reviewed preview.
- **Relink** reconnects a registered source after a Drive Desktop file moves, is renamed, or becomes cloud-only. It does not merge, deduplicate, or replace historical imports.
- **Analysis scope** is the dataset currently being analyzed by Insight Board, Advanced Analysis, Ask, and species research. A scope can be one imported cohort or an explicitly created combined scope.
- **Import preview** is the safety check before committing a version. Accepted rows can be analyzed; quarantined rows remain visible for cleanup instead of being silently dropped.
- **Treatment codebook** is the formal mapping for treatment tokens. Use it only when a token meaning is known for a specific propagule type. The Glossary explains acronyms, but the codebook controls formal analysis eligibility.

## Privacy And OpenAI

Workbook files, local database files, and species research cache files stay local to the desktop app. Raw project workbooks are ignored by git and should not be committed. The v0.4 source workflow reads synced local files; it does not use Google OAuth, Drive API tokens, background watchers, or raw workbook uploads.

OpenAI is optional. API keys are entered in Settings and stored through Electron main with OS-backed safe storage. Renderer code does not persist API keys or call OpenAI directly.

AI-generated text is advisory. Deterministic code owns workbook parsing, calculations, confidence labels, and data-quality warnings. In Species Explorer, matched local treatment results lead: completed (`D`) comparisons are primary, active (`ND`) comparisons are preliminary, undocumented codes are descriptive-only, and `PC`, `LPC`, and `4PC` stay separate. AI can explain the local result and suggest a next trial, but cannot upgrade or contradict it.

## Species Explorer

Species Explorer is the primary field-facing tab for asking, “What happened for this species under these treatments?” The first panel shows matched local workbook evidence by species and propagule type. It compares only like with like: same accession, source lot when recorded, cohort, workbook version, and completed or active status.

Use completed results as the main evidence. Treat active results as preliminary. Open the evidence details before making a protocol call so the accession, source lot, cohort, worksheet, row, and recorded date are visible. If the app says there is no matched comparison, that means the workbook does not yet contain a valid within-accession pair for that species; it is not hiding a raw-average winner.

AI research appears below local propagation results. It can help explain field context and suggest follow-up trials, but the local verdict comes from deterministic workbook evidence.

## Species Explorer Terms

- **Control** is the recorded comparison condition, commonly `C`; a non-control pair is presented as two treatments, not as a control comparison.
- **Pretreatment** is a pre-sowing or propagation step. Cold-moist and warm-moist stratification are different pretreatments; use the documented duration and temperature rather than assuming them from a code.
- **Propagation class (`PC`)** records the germination endpoint. `LPC` and `4PC` are later liner and 4-inch rootball endpoints, not missing or zero PC values.
- **Trial termination date (`TTD`)** is when the recorded trial outcome was closed or assessed.
- **Source lot / source accession** identifies the propagule origin. A **matched accession** compares the same accession and source lot when available, species, propagule type, cohort, and workbook version under two treatments.

## License

SeedBank Insights is provided free of charge to Portland State University Seed Bank for testing, review, and evaluation. It is not a production-certified or officially PSU-owned product unless a separate agreement says so.

The project license is in `LICENSE.md`. Third-party dependency notices are in `docs/THIRD_PARTY_NOTICES.md`.
