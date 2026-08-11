# Sidebar / Main / Global Message Contract

All messages use `{ requestId, revision, payload }`. Unknown fields or stale revisions are rejected. WebView and main-supplied player IDs are never trusted; global uses the authoritative player ID passed by IINA to `global.onMessage`.

## Sidebar -> main

- `ui:ready` — request the current sanitized window view model.
- `defaults:save` — save language and non-secret defaults; does not mutate another active window.
- `profile:save` — without identity fields, create a profile; with exact `{profileId, expectedRevision}`, update that profile by creating its next immutable revision. Endpoint edits return the editing window to unselected state.
- `secret:set` — replace write-only credential fields for a new profile revision. The value may transit memory but is never echoed back.
- `profile:select` — after displaying provider kind and normalized endpoint, select and authorize the exact `{profileId, revision, endpointFingerprint}` for subtitle delivery in this window. Success does not assert that credentials or connectivity were tested.
- `provider:test` — run provider-specific version/model/schema probe using fixed non-subtitle text.
- `profile:delete-request` — ask Main to show IINA's native destructive-action confirmation for one exact profile revision; the WebView cannot confirm or delete it itself.
- `translation:set-enabled` — enable or disable the current PlaybackSession.

There is no `cache:clear` command: translations are an in-memory video-session resource and are synchronously cleared on video close/replacement/window close.

## Main -> sidebar

- `state:update` — sanitized defaults, profile metadata, exact endpoint disclosure, current selection, source summary, session status, in-memory cache counts and connection result.
- `operation:error` — stable error code, user-action code and localized message; no secrets, subtitle/translation text, raw provider body or headers.
- `operation:result` — request-correlated success or cancellation result used to restore button state without overwriting session status.
- `profile:deleted` — confirms deletion and identifies the profile whose editor/selection must be cleared.
- `credential:state` — `ready | unavailable`, plus safe `code/category/userAction` fields for the fixed local credential store; never contains the credential value.

Secret values are always represented as `configured: boolean`; masked placeholders are display-only and MUST NOT be submitted as replacements.

## Main -> global

- `profiles:list`
- `profile:create-revision`
- `profile:delete`
- `profile:select`
- `credential:set`
- `provider:test`
- `provider:attempt`
- `provider:cancel`
- `profile:release` — release an old in-memory profile lease when a session ends or changes selection.

Every provider message includes a main-generated request ID and session/profile identity. Global keys jobs by `(authoritativePlayerId, requestId)` and permits concurrent jobs for different players.

## Global -> main

- `profiles:result`
- `profile:revision-created`
- `profile:deleted`
- `profile:selected`
- `credential:result`
- `provider:test-result`
- `provider:attempt-result`
- `provider:attempt-error`
- `provider:cancelled`
- `credential:state`

Global targets the authoritative IINA player ID. Main discards replies that do not match its current request plus full session/window/profile identity, even if global/helper reports success.

## Selection and revision invariants

1. Saving a changed endpoint creates a new revision; it never mutates an active snapshot.
2. A new revision has no window authorization until `profile:select` succeeds after UI disclosure.
3. Window A selecting/editing/disabling a revision MUST NOT alter window B's selection or session.
4. Old revisions may live only in global memory while leased by active windows; only the latest revision requires durable storage.
5. Provider secret, loopback token and transport authorization headers MUST NOT cross global -> main/sidebar messages.
6. Deleting a profile removes all of its revisions and local credential, cancels only its provider work, invalidates every affected window, and leaves unrelated profiles and windows intact.
7. Selected, credential configured/not configured, and Test not-tested/passed/failed are independent UI states. Select remains available before Test and its success text MUST NOT contain an authentication-success claim.
