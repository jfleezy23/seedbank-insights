# AGENTS.md

## Start here

- Be accurate before being fast. Prefer the smallest correct change that solves the task.
- Inspect the repo before editing: read this file, run `git status --short`, and identify dirty files.
- Treat dirty files as user or agent work. Do not revert, overwrite, stage, or clean unrelated changes.
- Keep scope tight. Do the requested task, not adjacent refactors.
- Never use `git add .` or `git add -A` unless explicitly told to. Stage explicit paths only.
- Before staging or committing, inspect `git status` and the relevant diff.
- Do not add paid services, paid tiers, billing-backed tools, or paid upgrades unless the user explicitly approves.

## Task playbooks

Load the matching playbook before acting when a task touches that area:

- Release, merge, CI, Sonar, packaging, AGY review, or public artifacts: `docs/agent-playbooks/release.md`
- Windows release signing or certificate/tooling checks: `docs/agent-playbooks/windows-signing.md`
- UI, React layout, screenshots, visual polish, or app usability: `docs/agent-playbooks/ui-review.md`
- Workbook import, raw data, provenance, local database, or data-quality behavior: `docs/agent-playbooks/data-imports.md`
- Statistical methods, evidence tiers, treatment effects, or Advanced Analysis: `docs/agent-playbooks/statistics.md`

Keep this top-level file short. If a durable instruction grows past a few bullets, move it into a playbook and link it here.

## Verification commands

Use commands, not memory:

- Quick implementation gate: `pnpm run verify:quick`
- Full gate for shared behavior or release-impacting changes: `pnpm run verify:full`
- Release candidate gate: `pnpm run verify:release`
- Workflow/security/SCA gate: `pnpm run verify:workflow`
- Windows signing environment preflight: `pnpm run verify:windows-signing-env`
- Release preflight only: `pnpm run release:preflight`

Do not claim a gate passed unless the command actually ran and its output was checked.

## Failure circuit breaker

If the same command, tool, workflow, signing step, upload, or external check fails twice with the same symptom, stop retrying. Inspect logs, repo docs, official docs, or the internet as needed; identify the likely root cause; then report the evidence before changing strategy. Do not hide a repeated failure behind a workaround.

## Repo shape

- This is a standalone Electron + React + TypeScript repo.
- Keep source in `src/`, Electron code in `electron/`, tests in `tests/`, scripts in `scripts/`, docs in `docs/`, and design/brand assets in `assets/branding/`.
- Commit synthetic fixtures and deterministic tests instead of raw project data.
- Local or sensitive workbook data, databases, caches, secrets, and release output stay ignored unless the user explicitly approves otherwise.

## Security and AI guardrails

- OpenAI and other AI tools are assistive only. Deterministic TypeScript owns calculations, confidence labels, and evidence selection.
- Do not commit API keys. Store user-provided keys only through Electron safe storage or an equivalent OS-backed secret mechanism.
- Treat API keys, tokens, passwords, and credentials as secrets even if the user pastes them into chat. Do not repeat, log, print, place in shell history, write to files, include in screenshots, or pass through renderer code.
- When checking for leaked secrets, prefer filename-only or redacted output. Never echo secret values back to the user.
- AI summaries must not upgrade confidence labels or hide data-quality warnings.

## Completion report

When finishing work, report:

1. Summary of the change
2. Main files touched
3. Validation performed
4. Risks, limitations, or follow-ups

## Sources for this structure

- OpenAI Codex best practices recommend short, practical `AGENTS.md` files and moving task-specific detail into referenced markdown when the file grows: https://developers.openai.com/codex/learn/best-practices
- The AGENTS.md convention treats this file as a predictable agent README with setup, style, and test guidance: https://agents.md/
- GitHub Copilot agent guidance emphasizes executable build/test/validation commands in the agent environment: https://docs.github.com/copilot/how-tos/agents/copilot-coding-agent/best-practices-for-using-copilot-to-work-on-tasks
- Community practice from Cursor/Codex users reinforces short always-on rules, scoped playbooks, and scripts for live state rather than stale prose.
