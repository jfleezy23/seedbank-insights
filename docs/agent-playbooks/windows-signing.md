# Windows signing playbook

Use this playbook only for Windows public release signing, signing preflight, or investigating signature failures.

## Privacy boundary

Specific signing account names, certificate profile names, resource groups, subject identities, and local reference paths are private operator details. Keep them out of repo docs, commit messages, logs, and release notes.

If this machine needs those details, read the local-only note under the user's Codex profile. Do not copy its contents into git.

## Required posture

- Public Windows release assets must be signed by the approved production signing provider.
- Do not publish `NotSigned`, self-signed, ad hoc, or `UnknownError` Windows assets.
- Use Windows release tooling for verification. PowerShell `Get-AuthenticodeSignature` is useful, but `signtool verify /pa /v <file>` is the release proof.
- Use the approved signing CLI/provider. Do not replace it with `Set-AuthenticodeSignature` or a local self-signed certificate.
- Azure CLI must already be authenticated before signing. The preflight only checks authentication; it must not create accounts, subscriptions, paid resources, or billing-backed services.

## Preflight

Run this before building or signing Windows release assets:

```sh
pnpm run verify:windows-signing-env
```

The preflight checks for:

- `gh auth status`
- `az account show`
- a usable `signtool.exe`
- the approved signing CLI on PATH
- a clean worktree
- no staged raw workbook, cache, database, secret, or build-output files
- a recent Sonar workflow link
- package version consistency

If any signing preflight check fails twice with the same symptom, stop and diagnose. Do not guess at certificate locations, token scopes, or signing identity.

## Release signing sequence

Use placeholders in repo docs and fill them from local-only operator notes at runtime:

```powershell
# Build from the exact release tag or commit, not a dirty working tree.
git checkout --detach <release-tag-or-sha>
pnpm run build
pnpm exec electron-builder --win --x64 --publish never

# Sign unpacked app binaries with the approved production signing provider.
sign code artifact-signing `
  "release\win-unpacked\SeedBank Insights.exe" `
  "release\win-unpacked\resources\elevate.exe" `
  --artifact-signing-endpoint "<endpoint>" `
  --artifact-signing-account "<account>" `
  --artifact-signing-certificate-profile "<profile>" `
  --azure-credential-type azure-cli `
  --description "SeedBank Insights" `
  --description-url "https://github.com/<owner>/<repo>" `
  --file-digest SHA256 `
  --timestamp-url "<timestamp-url>" `
  --timestamp-digest SHA256 `
  --verbosity Information

# Rebuild the installer from the signed unpacked app only after human test approval.
pnpm exec electron-builder --win nsis --x64 --prepackaged release\win-unpacked --publish never

# Sign the final setup executable with the same approved profile.
sign code artifact-signing `
  "release\SeedBank Insights Setup <version>.exe" `
  --artifact-signing-endpoint "<endpoint>" `
  --artifact-signing-account "<account>" `
  --artifact-signing-certificate-profile "<profile>" `
  --azure-credential-type azure-cli `
  --description "SeedBank Insights" `
  --description-url "https://github.com/<owner>/<repo>" `
  --file-digest SHA256 `
  --timestamp-url "<timestamp-url>" `
  --timestamp-digest SHA256 `
  --verbosity Information
```

## Required verification before upload

```powershell
$signtool = "<path-to-signtool.exe>"
& $signtool verify /pa /v "release\SeedBank Insights Setup <version>.exe"
& $signtool verify /pa /v "release\win-unpacked\SeedBank Insights.exe"
& $signtool verify /pa /v "release\win-unpacked\resources\elevate.exe"
```

All release binaries must report successful verification with zero errors. Electron-builder log lines that mention signing are not proof; verify the actual files after signing.

After verification, copy or rename the final signed asset to the public asset name, regenerate the checksum from that signed file, upload with `gh release upload --clobber`, and confirm GitHub's asset digest matches the local hash.
