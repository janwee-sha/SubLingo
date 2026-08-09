# Sidebar / Main / Global Message Contract

All messages use `{ requestId, revision, payload }`. Unknown fields or stale revisions are rejected. WebView and main-supplied player IDs are never trusted; global uses the authoritative player ID passed by IINA to `global.onMessage`.

## Sidebar -> main

- `ui:ready` — request the current sanitized window view model.
- `defaults:save` — save language and non-secret defaults; does not mutate another active window.
- `profile:save` — create a new immutable provider revision from non-secret fields. Endpoint edits return the current window to unselected state.
- `secret:set` — replace write-only credential fields for a new profile revision. The value may transit memory but is never echoed back.
- `profile:select` — after displaying provider kind and normalized endpoint, authorize the exact `{profileId, revision, endpointFingerprint}` for this window.
- `provider:test` — run provider-specific version/model/schema probe using fixed non-subtitle text.
- `translation:set-enabled` — enable or disable the current PlaybackSession.
- `vault:reset` — explicit destructive reset after confirmation; overwrites wrapping material and deletes ciphertext slots.

There is no `cache:clear` command: translations are an in-memory video-session resource and are synchronously cleared on video close/replacement/window close.

## Main -> sidebar

- `state:update` — sanitized defaults, profile metadata, exact endpoint disclosure, current selection, source summary, session status, in-memory cache counts and connection result.
- `operation:error` — stable error code, user-action code and localized message; no secrets, subtitle/translation text, raw provider body or headers.
- `vault:state` — `ready | locked | unavailable | corrupt`; never contains DEK/ciphertext/credential.

Secret values are always represented as `configured: boolean`; masked placeholders are display-only and MUST NOT be submitted as replacements.

## Main -> global

- `profiles:list`
- `profile:create-revision`
- `vault:set-secret`
- `vault:reset`
- `provider:test`
- `provider:attempt`
- `provider:cancel`
- `profile:release` — release an old in-memory profile lease when a session ends or changes selection.

Every provider message includes a main-generated request ID and session/profile identity. Global keys jobs by `(authoritativePlayerId, requestId)` and permits concurrent jobs for different players.

## Global -> main

- `profiles:result`
- `profile:revision-created`
- `vault:result`
- `provider:test-result`
- `provider:attempt-result`
- `provider:attempt-error`
- `provider:cancelled`

Global targets the authoritative IINA player ID. Main discards replies that do not match its current request plus full session/window/profile identity, even if global/helper reports success.

## Selection and revision invariants

1. Saving a changed endpoint creates a new revision; it never mutates an active snapshot.
2. A new revision has no window authorization until `profile:select` succeeds after UI disclosure.
3. Window A selecting/editing/disabling a revision MUST NOT alter window B's selection or session.
4. Old revisions may live only in global memory while leased by active windows; only the latest revision requires durable storage.
5. Provider secret, DEK, loopback token and transport authorization headers MUST NOT cross global -> main/sidebar messages.
