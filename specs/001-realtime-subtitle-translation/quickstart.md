# Quickstart Validation Guide

## Prerequisites

- macOS 12 or later on Apple Silicon or Intel
- IINA 1.4.0+；final matrix includes minimum 1.4.0 and current stable 1.4.4
- Node.js 24 and npm 11
- Xcode/Swift toolchain capable of building a universal Foundation helper
- IINA's bundled `iina-plugin` CLI
- External SRT and ASS fixtures plus one configured Azure/OpenAI-compatible/Ollama endpoint as applicable

The expected entities, lifecycles and interfaces are defined in [data-model.md](./data-model.md) and [contracts/](./contracts/).

## Build and automated validation

```sh
npm ci
npm run test
npm run typecheck
npm run build:native
npm run test:native
npm run build
npm run verify:package
```

Expected:

- parser, scheduler, language gate, cache identity, epoch, retry and provider contract tests pass;
- credential-store tests prove a fixed helper-owned path, UUID/field validation, atomic replace/delete, JSON `null` for a missing key, directory `0700` and file `0600`; scans find no credential in preferences, package, UI messages, logs or diagnostics;
- transport tests prove loopback-only auth, health preflight, deadlines, cancellation, redirect safety, response bounds, `Retry-After` extraction, URLSession system routing and libcurl explicit no-proxy direct routing;
- universal helper contains arm64 and x86_64 slices, and `dist/main.js`, `dist/global.js` plus sidebar assets are produced.

## Install into IINA

`link` is only for development. It creates an `.iinaplugin-dev` symlink, so IINA intentionally does not expose its normal Uninstall action. Remove it with the matching CLI command:

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
/Applications/IINA.app/Contents/MacOS/iina-plugin unlink .
```

Release and acceptance testing MUST use the packed artifact. After unlinking the workspace, open `build/package/SubLingo-0.1.2.iinaplgz` with IINA, restart IINA, grant the declared permissions, and confirm the installed plugin's Uninstall action is enabled. Do not keep an installed package and a development link with the same identifier during acceptance.

Open the SubLingo sidebar. On first OpenAI-compatible credential save, verify `@data/credentials.json` is created with mode `0600`, its parent directory is `0700`, and the provider secret does not appear in preferences, Sidebar messages, logs or diagnostics. The product must label this file as local plaintext rather than encrypted storage. Saving/selecting/testing Ollama must not create or read a credential entry.

## End-to-end validation

### P1 — playback and second subtitle

1. Open a video with an external non-native SRT, configure source/target languages and select a disclosed provider category + endpoint.
2. Play continuously. The original primary subtitle stays selected; translated cues appear as the second subtitle without pausing playback.
3. Repeat with ASS containing commas, multiple event fields, override tags and `\N`; timing/order remain exact and control tags never render as text.
4. Delay the provider beyond a cue start; video/original subtitles continue and no placeholder, technical error or wrong cue appears.
5. Disable while a request is active; the provider task/timers are cancelled, late output is ignored, and only the plugin-owned second track/file is removed.

### P2 — bounded work and session cache

1. Play native-language subtitles, pause and seek ten times; provider call count remains zero.
2. Watch only the first ten minutes of a 60-minute fixture. No selected range exceeds 120 seconds/40 cues and no provider sub-batch exceeds 25 cues/5,000 code points.
3. Seek backward within the same video session; successful cues reuse the in-memory cache with zero repeated successful calls.
4. Seek rapidly to a distant final position; old unstarted work stops, active work is cancelled/invalidated, and old results never enter the new track.
5. Close the video, confirm the session Map and generated SRT are removed, then reopen the same video; previous translations are not reused.

### P3 — providers, consent and failures

1. Run OpenAI-compatible and local Ollama probes, then translate the same small fixture with each active provider.
2. Verify OpenAI/Ollama unknown/duplicate/empty IDs are rejected while unambiguous valid IDs may be retained.
3. Change endpoint or semantic profile settings. The current window becomes unselected and sends nothing until the new kind/address is shown and explicitly selected.
4. Exercise missing configuration, bad credentials, missing model, unreachable endpoint, quota and malformed output; each shows an actionable non-blocking state without logging sensitive content.
5. Save an OpenAI-compatible profile with an API root. The saved list must display exactly that root and the UI must preview `{root}/chat/completions`; probe and real subtitle requests must use that address. Entering a full `/chat/completions` URL is intentionally treated as a root, previews the duplicated suffix, and is expected to fail unless that unusual route exists.
6. Select a saved profile, edit it and click Save Profile repeatedly; the same list item advances revision without creating duplicates. Cancel one Delete confirmation, then confirm it; only that profile, credential, work and affected-window authorization disappear.
7. For every action button and the Translate switch, verify an immediate busy/pressed state followed by a request-correlated success, cancellation or error message that remains separate from Session polling.
8. Verify Selected, key saved/not saved, and Test not tested/passed/failed remain independent. Selecting before Test is allowed and must not claim authentication success.

### Retry and transport

Use a controlled endpoint that returns temporary failures:

1. Without `Retry-After`, observe at most three retries after the initial attempt with increasing 1s/2s/4s-class delays plus jitter.
2. With `Retry-After: 3`, confirm no retry begins before three seconds.
3. Return permanent 401/403/invalid model/quota errors; confirm zero automatic retries.
4. Disable, seek out of range, change profile and close the video during backoff; confirm the timer and helper job are cancelled.
5. Attempt wrong loopback token, remote HTTP, URL credentials and cross-origin authorization redirect; helper rejects all of them.
6. Complete one helper request, leave SubLingo idle for at least 310 seconds, then Test and translate again. The expired helper is replaced before the provider body is sent, concurrent operations share one restart, and no dispatched provider POST is replayed by Global.
7. Test the same allowed HTTPS endpoint in system and direct mode. Confirm system uses macOS proxy policy; direct reaches it through in-process libcurl with explicit no-proxy and does not connect to the configured proxy address. Repeat direct against loopback Ollama.

### Local credential store

1. Save one OpenAI-compatible key. Confirm no Keychain password dialog appears, `credentials.json` is owned by the current user with mode `0600`, and the plugin data directory is `0700`.
2. Relaunch IINA. Confirm the profile reports its key as configured, Test succeeds with the saved key, the full key is never shown in the UI, and no system password dialog appears.
3. Replace the key for the same Profile and confirm the fixed document is atomically replaced without producing duplicate profiles or caller-selected credential paths.
4. Make the data directory unavailable or the file malformed; provider work fails closed with local-store guidance and does not fall back to preferences, environment variables, command arguments or Keychain.
5. Confirm the UI and README disclose that the file is not encrypted and cannot protect against another process already able to read files as the current macOS user.
6. Upgrade from the old encrypted-vault build. Confirm obsolete `vault-a.json`/`vault-b.json` are removed without accessing the old Keychain item, no password prompt appears, and the user is asked to re-enter the OpenAI key once.
7. Cancel a profile Delete request in IINA's native confirmation; its credential and selections remain unchanged. Confirm deletion in a multi-window run; that profile's local credential, jobs/caches and selections are removed while unrelated profiles and windows remain available.

### Multi-window isolation

1. Open at least two IINA windows, including a test with the same media/subtitle in both.
2. Enable different provider revisions/languages, then independently play, pause, seek, fail, disable and close each window.
3. Confirm player/session/request IDs, caches, timers, statuses, temp paths and generated track IDs never cross windows.
4. Edit a profile in window A. Window B keeps its leased old revision until its session ends; A must explicitly select the new endpoint revision.
5. Fail or close A while B translates; B's video, original subtitle, retries and second track remain unaffected.

## Packaging

After both IINA versions and both CPU slices pass:

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin pack .
```

Inspect the package to confirm no credential/vault runtime file, test fixture or secret is included; helper executable permissions/signature are valid; and permission/privacy text explains the local plaintext credential file, helper and user-selected remote endpoint behavior.
