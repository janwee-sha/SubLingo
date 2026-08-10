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
- vault tests reject wrong key/AAD/tag/ciphertext and scans find no credential plaintext in preferences, `@data`, logs or diagnostics;
- transport tests prove loopback-only auth, deadlines, cancellation, redirect safety, response bounds and `Retry-After` extraction;
- universal helper contains arm64 and x86_64 slices, and `dist/main.js`, `dist/global.js` plus sidebar assets are produced.

## Link into IINA

Use the CLI bundled with the IINA version under test:

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

Restart IINA, grant the declared plugin permissions, and open the SubLingo sidebar. On first credential save, verify an encrypted vault is created and the provider secret does not appear in preferences or any `@data` file.

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

1. Run Azure 2026-06-06, OpenAI-compatible and local Ollama probes, then translate the same small fixture with each provider.
2. Verify Azure positional count/shape mismatch caches zero items; verify OpenAI/Ollama unknown/duplicate/empty IDs are rejected while unambiguous valid IDs may be retained.
3. Change endpoint or semantic profile settings. The current window becomes unselected and sends nothing until the new kind/address is shown and explicitly selected.
4. Exercise missing configuration, bad credentials, missing model, unreachable endpoint, quota and malformed output; each shows an actionable non-blocking state without logging sensitive content.
5. Save one OpenAI-compatible profile with an API root and one with the equivalent full `/chat/completions` URL; both must display the same canonical root and each real subtitle batch must produce only one billed translation attempt.

### Retry and transport

Use a controlled endpoint that returns temporary failures:

1. Without `Retry-After`, observe at most three retries after the initial attempt with increasing 1s/2s/4s-class delays plus jitter.
2. With `Retry-After: 3`, confirm no retry begins before three seconds.
3. Return permanent 401/403/invalid model/quota errors; confirm zero automatic retries.
4. Disable, seek out of range, change profile and close the video during backoff; confirm the timer and helper job are cancelled.
5. Attempt wrong loopback token, remote HTTP, URL credentials and cross-origin authorization redirect; helper rejects all of them.

### Credential vault

1. Save credentials and confirm only AES-GCM envelope metadata/ciphertext appears in the two vault slots; provider secret is absent from disk/logs/diagnostics.
2. Relaunch IINA and verify the plugin-scoped wrapping key unlocks the vault without showing credentials in the UI.
3. Corrupt ciphertext, tag, nonce and AAD independently; each fails closed and requests credential reset/re-entry.
4. Simulate an interrupted A/B write; the highest valid authenticated revision recovers.
5. Make Keychain unavailable; no provider request is sent and there is no plaintext fallback.
6. Click Reset Vault and cancel the IINA-native confirmation; credentials and selections remain unchanged. Confirm once in a multi-window run; credentials are removed, provider jobs/caches are cancelled, every window becomes unselected, and sanitized profile metadata remains available.

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

Inspect the package to confirm no vault/test fixtures/secrets are included, helper executable permissions/signature are valid, and permission/privacy text explains the local helper plus user-selected remote endpoint behavior.
