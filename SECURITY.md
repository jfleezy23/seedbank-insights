# Security Policy

## Supported Status

SeedBank Insights is an early desktop prototype. Public code should still follow the repo security guardrails, but users should treat builds as experimental unless a release explicitly says otherwise.

## Reporting A Vulnerability

Please avoid posting secrets, credentials, raw workbooks, or sensitive data in public issues.

Preferred reporting path:

- Use GitHub private vulnerability reporting if it is enabled for the repository.
- Otherwise contact the maintainer at `jflow23@icloud.com` with a concise description and reproduction details.

Helpful report details:

- affected version or commit
- operating system
- reproduction steps
- whether the issue involves workbook import, OpenAI handling, local storage, or packaged launch
- redacted screenshots or logs when useful

Do not include real API keys or raw workbook contents in the report.

## Secret Handling

- Do not commit API keys, tokens, passwords, `.env` files, raw workbooks, local SQLite databases, logs, or generated release output.
- OpenAI keys must be entered through the app Settings screen and stored with Electron safe storage.
- The renderer must not persist, log, or use API keys for model calls. OpenAI calls belong in Electron main behind narrow IPC handlers.
- Error messages and logs must redact key-shaped values before display or persistence.

## Public Data Guardrail

Use synthetic fixtures for tests. Raw PSU-style workbooks and locally sensitive spreadsheets belong in ignored local paths such as the workspace root or `data/raw/`.

## Maintainer Response

The maintainer should:

1. acknowledge actionable reports as soon as practical
2. reproduce using synthetic or redacted data
3. fix secrets/data exposure issues before general feature work
4. run `pnpm run secret:scan`, targeted tests, build, SCA, and relevant desktop smoke checks before publishing a fix
5. document any release-impacting security fix in the release notes
