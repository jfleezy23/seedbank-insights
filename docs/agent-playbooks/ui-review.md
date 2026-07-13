# UI review playbook

Use this playbook for React UI changes, CSS/layout changes, app copy, responsive behavior, screenshots, and usability issues.

## Usability bar

- The UI should be usable by average humans and mostly self-explanatory.
- Prefer plain language. In user-facing UI, say "local database" or "local data" rather than engine terms such as "SQLite".
- Alerts and insights must match the user's work context. Interaction noise such as canceled requests should not appear as data insight.
- Use Apple-like clarity: simple labels, visible state, short explanations near unfamiliar controls, and no generic system-looking popups when an app-styled dialog is available.

## Layout checks

- Verify desktop and narrow widths for changed surfaces.
- Check spacing, overlap, wrapping, disabled states, empty states, hover/focus affordances, scroll behavior, and visual stability.
- Screenshots are evidence. Inspect rendered pixels when the issue is visual.
- For form rows, ensure fields do not collide at common widths; prefer responsive wrapping or grid breakpoints over arbitrary pixel nudges.
- UI badges and pills should use a centered badge template: `inline-flex`, `align-items: center`, `justify-content: center`, explicit min-height, and line-height control.

## Workspace ownership

- Insight Board is overview and routing.
- Species Explorer leads with local species-specific propagation evidence and keeps AI context below deterministic results.
- Treatment Comparator owns deterministic treatment analysis.
- Data Quality owns warnings and import problems.
- Trial Queue owns follow-up work.
- Ask owns demo Q&A.
- A selected navigation label without a real content change is a regression.

## Desktop packaging checks

- `electron-builder --dir` only proves packaging completed; it does not prove the app starts.
- For desktop review candidates, run `pnpm run app:build` and `pnpm run app:smoke`, then launch the packaged app itself.
- Verify splash rendering, packaged icon resource presence, main window load, and first-screen stability.
- Vite apps loaded from an Electron `file://` bundle need relative built asset URLs (`base: "./"`).
- Packaged default workbook/cache discovery cannot depend only on `process.cwd()`.

## Independent UI review

- AGY is useful for code-level UI review. Use Gemini broadly and Claude Sonnet only for targeted React interaction/layout concerns when credits justify it.
- Do not ask AGY to analyze images. Give it code, diffs, components, CSS, and tests.
- Validate AGY UI comments against the rendered app before treating them as blockers.
