# Testing Strategy

SeedBank Insights uses layered checks so import correctness, desktop launch behavior, and public-repo hygiene fail early.

## Unit And Integration Tests

```sh
pnpm run test
```

Coverage includes:

- treatment parsing
- note observation extraction
- statistical confidence helpers
- OpenAI response validation
- synthetic Excel import

## UI Tests

```sh
pnpm run test:ui
```

Coverage includes:

- dashboard first render
- sidebar navigation
- settings modal state
- AI species insight generation controls
- key-save readiness behavior

UI tests should use synthetic app data and must not require a real OpenAI key.

## Database Smoke

```sh
pnpm run db:smoke
```

The SQLite smoke path verifies import persistence, data-quality issue persistence, and reconstruction of an import result for later AI regeneration.

## Desktop Packaging Smoke

```sh
pnpm run app:build
pnpm run app:smoke
```

This validates packaged wiring, but it is not the final release claim. A maintainer must also launch the packaged app and inspect evidence from the actual app bundle or executable.

## Security And Dependency Checks

```sh
pnpm run secret:scan
pnpm run sca
```

The secret scan reports filenames and rule names only. It intentionally does not print matched values.

## Manual Review Checklist

For UI or desktop changes, inspect:

- first viewport layout
- mobile or narrow-window behavior when applicable
- disabled states
- overflow and clipping
- visible warnings
- splash and icon resources in packaged builds
- launch-error behavior for risky startup paths
