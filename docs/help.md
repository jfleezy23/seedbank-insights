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
4. Use **Species Explorer** for AI-backed germination research on a selected species.
5. Use **Treatment Comparator** for deterministic operational paired treatment comparisons.
6. Use **Advanced Analysis** for completed-trial, propagule-separated contrasts and reproducible exports.
7. Use **Data Quality** to find quarantined rows, unknown treatment codes, invalid dates, duplicate candidates, and notes that need cleanup.
8. Use **Trial Queue** for operational follow-up before turning rows into protocol evidence.
9. Use **Ask** only as a demo Q&A surface over bounded workbook context.

## Privacy And OpenAI

Workbook files, SQLite data, and species research cache files stay local to the desktop app. Raw project workbooks are ignored by git and should not be committed. The v0.4 source workflow reads synced local files; it does not use Google OAuth, Drive API tokens, background watchers, or raw workbook uploads.

OpenAI is optional. API keys are entered in Settings and stored through Electron main with OS-backed safe storage. Renderer code does not persist API keys or call OpenAI directly.

AI-generated text is advisory. Deterministic code owns workbook parsing, calculations, confidence labels, and data-quality warnings.

## License

SeedBank Insights is provided free of charge to Portland State University Seed Bank for testing, review, and evaluation. It is not a production-certified or officially PSU-owned product unless a separate agreement says so.

The project license is in `LICENSE.md`. Third-party dependency notices are in `docs/THIRD_PARTY_NOTICES.md`.
