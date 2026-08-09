# Sidebar / Main Entry Message Contract

## Sidebar to main

- `ui:ready` — request current sanitized view model.
- `settings:save` — save languages, active provider and non-secret profile fields.
- `secret:set` — write a replacement credential to Keychain; never used to read one.
- `provider:test` — run a fixed one-item connection probe without subtitle content.
- `translation:set-enabled` — enable or disable the current session.
- `cache:clear` — delete SubLingo cache entries after explicit user action.

## Main to sidebar

- `state:update` — sanitized settings, current status, source track summary, cache statistics and connection result.
- `operation:error` — stable error code plus user-actionable message; no secrets or subtitle text.

Messages carry a monotonically increasing settings revision. Main rejects stale mutations. Secret values are write-only and never appear in `state:update`.
