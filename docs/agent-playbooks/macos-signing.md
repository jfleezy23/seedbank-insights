# macOS signing playbook

Use this playbook for public SeedBank Insights macOS release signing, notarization, stapling, Gatekeeper checks, or diagnosing macOS trust-policy failures.

## Privacy boundary

Apple IDs, team IDs, certificate subject names, notary profile names, app-specific password labels, and local keychain details are private operator data. Keep them out of public repo docs, commit messages, release notes, AGY prompts, and shared logs.

Read the concrete local values from the private operator note under the user's Codex profile. Do not copy those values into git. Do not record the app-specific password anywhere; enter it only at Apple's hidden prompt if the notary profile must be recreated.

## Release shell setup

Run the private operator note's release shell setup block first. It must export these Apple variables for the current machine:

- `SEEDBANK_MAC_SIGNING_IDENTITY`
- `SEEDBANK_MAC_NOTARY_PROFILE`
- `SEEDBANK_MAC_APPLE_ID`
- `SEEDBANK_MAC_TEAM_ID`

Then derive the SeedBank release paths from the current package version:

```sh
export SEEDBANK_RELEASE_VERSION="$(node -p 'require("./package.json").version')"
export SEEDBANK_RELEASE_TAG="v.${SEEDBANK_RELEASE_VERSION}"
export SEEDBANK_APP_BUNDLE="release/mac-arm64/SeedBank Insights.app"
export SEEDBANK_DMG_PATH="release/SeedBank Insights-${SEEDBANK_RELEASE_VERSION}-arm64.dmg"
export SEEDBANK_MOUNT_POINT="/tmp/seedbank-release-dmg"
```

This playbook is intentionally concrete about the SeedBank artifact layout. The private operator note supplies the machine-specific Apple values.

## Required posture

- Public macOS release assets must be signed with the approved Developer ID Application certificate and notarized through the approved notary profile.
- `electron-builder` signing of the `.app` bundle is not enough. The outer `.dmg` container must also be explicitly code-signed before notarization.
- Do not publish signed-but-unnotarized, unsigned, ad hoc, or locally modified macOS artifacts.
- Build and publish from the exact release commit or tag, not a dirty working tree.
- Generate checksums only after DMG signing, notarization, and stapling, because those operations change the digest.

## Preflight

Run the release preflight and prove local Apple signing access before packaging:

```sh
pnpm run release:preflight -- --version "$SEEDBANK_RELEASE_VERSION" --tag "$SEEDBANK_RELEASE_TAG"

test -n "$SEEDBANK_MAC_SIGNING_IDENTITY"
test -n "$SEEDBANK_MAC_NOTARY_PROFILE"
test -n "$SEEDBANK_MAC_APPLE_ID"
test -n "$SEEDBANK_MAC_TEAM_ID"

security find-identity -v -p codesigning | rg --fixed-strings "$SEEDBANK_MAC_SIGNING_IDENTITY"
xcrun notarytool history --keychain-profile "$SEEDBANK_MAC_NOTARY_PROFILE"
```

If the notary profile is missing, recreate it interactively:

```sh
xcrun notarytool store-credentials "$SEEDBANK_MAC_NOTARY_PROFILE" --apple-id "$SEEDBANK_MAC_APPLE_ID" --team-id "$SEEDBANK_MAC_TEAM_ID"
```

Stop if the certificate, team, or notary profile cannot be proven. Do not guess at keychain profiles or identity names.

## Build, sign, notarize, staple

```sh
pnpm run build
pnpm exec electron-builder --mac dmg --arm64

codesign --verify --deep --strict --verbose=2 "$SEEDBANK_APP_BUNDLE"

codesign --force --sign "$SEEDBANK_MAC_SIGNING_IDENTITY" "$SEEDBANK_DMG_PATH"
codesign --verify --verbose=4 "$SEEDBANK_DMG_PATH"
codesign -dv --verbose=4 "$SEEDBANK_DMG_PATH"
hdiutil verify "$SEEDBANK_DMG_PATH"

spctl -a -vvv -t open --context context:primary-signature "$SEEDBANK_DMG_PATH"

xcrun notarytool submit "$SEEDBANK_DMG_PATH" --keychain-profile "$SEEDBANK_MAC_NOTARY_PROFILE" --wait
xcrun stapler staple "$SEEDBANK_DMG_PATH"
```

The notary submission must return `status: Accepted`. If notarization fails, inspect the notary log and do not publish.

Before notarization, `spctl` may report `source=Unnotarized Developer ID`. That is acceptable only when the origin is the expected Developer ID Application identity. `no usable signature` on the DMG means the outer DMG container was not signed.

## Required verification before upload

```sh
xcrun stapler validate "$SEEDBANK_DMG_PATH"
codesign --verify --verbose=4 "$SEEDBANK_DMG_PATH"
hdiutil verify "$SEEDBANK_DMG_PATH"
spctl -a -vvv -t open --context context:primary-signature "$SEEDBANK_DMG_PATH"

rm -rf "$SEEDBANK_MOUNT_POINT"
mkdir -p "$SEEDBANK_MOUNT_POINT"
hdiutil attach "$SEEDBANK_DMG_PATH" -nobrowse -readonly -mountpoint "$SEEDBANK_MOUNT_POINT"
codesign --verify --deep --strict --verbose=2 "$SEEDBANK_MOUNT_POINT/SeedBank Insights.app"
spctl -a -vvv "$SEEDBANK_MOUNT_POINT/SeedBank Insights.app"
hdiutil detach "$SEEDBANK_MOUNT_POINT"
```

The final DMG and mounted app must both report `accepted`, `source=Notarized Developer ID`, and the expected Developer ID origin. The mounted `.app` may not have its own stapled ticket when distributed inside a stapled DMG; treat Gatekeeper acceptance as the release proof.

Before upload, scan app resources for raw workbooks, local databases, `.env` files, API keys, and AI response caches. Release assets must not include private runtime state.

After verification, generate the checksum from the final signed and stapled DMG, upload with `gh release upload --clobber` when replacing assets, update release notes with the final SHA-256, and confirm GitHub's asset digest matches the local hash.
