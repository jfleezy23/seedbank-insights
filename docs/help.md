# SeedBank Insights Help

SeedBank Insights is a desktop prototype for reviewing PSU-style seed-bank propagation workbooks. It imports workbook rows, computes deterministic evidence summaries, and can use optional OpenAI calls for species research and bounded questions.

## Project Links

- GitHub: https://github.com/jfleezy23/seedbank-insights
- Contact, support, or donation coordination: jflow23@icloud.com
- Security policy: ../SECURITY.md
- License: ../LICENSE.md
- Third-party notices: THIRD_PARTY_NOTICES.md

## Basic Workflow

1. Import a PSU-style workbook or use **Load local workbook** during the prototype demo.
2. Use **Insight Board** for import status, high-level metrics, and where to go next.
3. Use **Species Explorer** for AI-backed germination research on a selected species.
4. Use **Treatment Comparator** for deterministic paired treatment comparisons.
5. Use **Data Quality** to find rows, species, treatment codes, and notes that need cleanup.
6. Use **Trial Queue** for operational follow-up before turning rows into protocol evidence.
7. Use **Ask** only as a demo Q&A surface over bounded workbook context.

## Privacy And OpenAI

Workbook files, SQLite data, and species research cache files stay local to the desktop app. Raw project workbooks are ignored by git and should not be committed.

OpenAI is optional. API keys are entered in Settings and stored through Electron main with OS-backed safe storage. Renderer code does not persist API keys or call OpenAI directly.

AI-generated text is advisory. Deterministic code owns workbook parsing, calculations, confidence labels, and data-quality warnings.

## License

SeedBank Insights is provided free of charge to Portland State University Seed Bank for testing, review, and evaluation. It is not a production-certified or officially PSU-owned product unless a separate agreement says so.

The project license is in `LICENSE.md`. Third-party dependency notices are in `docs/THIRD_PARTY_NOTICES.md`.
