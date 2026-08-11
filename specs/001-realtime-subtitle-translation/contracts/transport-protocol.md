# Local Transport Helper Protocol

The bundled universal macOS helper has constrained responsibilities: authenticated health checks, fixed-path credential persistence, bounded upstream HTTP, exact-job cancellation, selected response-header extraction and shutdown. It has no player state, provider retry policy or translation cache.

## Startup and authentication

Global launches the helper with only a resolved plugin data-directory path and optional parent PID. The helper binds `127.0.0.1` on an ephemeral port, generates a high-entropy bearer token with the system CSPRNG, and emits one framed readiness line:

```json
{"type":"ready","port":49152,"token":"<memory-only-token>","protocolVersion":1}
```

IINA must not log stdout-hook frames. Every RPC requires `Authorization: Bearer <token>`. The helper rejects non-loopback clients, invalid tokens, duplicate live job IDs and oversized input before upstream work.

## `POST /v1/health`

Request `{}` or the zero-byte body emitted by IINA 1.4.4 for an empty object; response `{ "state": "ok" }`. This endpoint is side-effect free and is used before provider or credential operations to replace an expired idle helper. Every non-empty body other than literal `{}` is rejected.

## `POST /v1/credentials`

Only these fixed operations are accepted:

```json
{ "action": "read", "profileId": "uuid" }
{ "action": "write", "profileId": "uuid", "fields": { "apiKey": "..." } }
{ "action": "delete", "profileId": "uuid" }
```

Read returns `{ "fields": {"apiKey":"..."} }` or `{ "fields": null }`; write/delete return `saved`/`deleted`. The caller cannot choose a path or arbitrary field. The helper stores one fixed `credentials.json` under the supplied plugin data directory. Replacements use an exclusive no-follow temporary file, `0600`, full write, `fsync`, then atomic rename; the directory is `0700`. The document is limited to 1 MiB and owned by the current user.

This file is intentionally described as local plaintext, not encrypted. It never enters preferences, the release package, Sidebar messages, logs or diagnostics. Keychain is not accessed.

## `POST /v1/request`

```json
{
  "jobId": "uuid",
  "method": "POST",
  "url": "https://provider.example/v1/chat/completions",
  "headers": { "Content-Type": "application/json", "Authorization": "Bearer ..." },
  "proxyMode": "system | direct",
  "body": { "provider-specific": "object" },
  "timeoutMs": 30000,
  "maxResponseBytes": 1048576
}
```

Success returns the exact job ID, status code, allowlisted `retry-after`/`x-request-id`/`content-type` headers and body text. Headers/bodies are never written to stdout/stderr or diagnostics.

- `system`: URLSession follows macOS proxy policy and permits at most three same-origin redirects.
- `direct`: in-process system libcurl sets `CURLOPT_NOPROXY="*"`, disables automatic redirects and does not depend on deprecated CFNetwork proxy dictionaries.

## Cancellation and shutdown

`POST /v1/cancel` with `{ "jobId": "uuid" }` cancels only that URLSession task or libcurl transfer and returns `cancelled | already-completed | unknown`.

`POST /v1/shutdown` stops the authenticated session. Unexpected helper exit marks pending attempts as transport failures; Main alone decides bounded provider retries.

## Security and bounds

- Bind IPv4 loopback only; exit on parent loss, authenticated shutdown or 300-second idle lease.
- Remote destinations require HTTPS; plain HTTP is accepted only for exact loopback Ollama.
- Reject URL userinfo, fragments, unsupported methods and invalid proxy modes.
- Enforce request, response, credential-document and timeout caps.
- Do not expose generic file, shell, DNS, Keychain or arbitrary local-network APIs.
- The loopback token, provider headers/bodies and credentials remain memory-only outside the fixed `0600` file.

## Global-entry supervision

- Cached providers resolve the current helper session on every operation.
- Global performs `/v1/health` before dispatching a provider body and coalesces concurrent replacement.
- Credential read, full replace-write and delete are idempotent and may retry once after helper replacement.
- Cancellation from an expired session returns `unknown` without starting a helper solely to cancel lost work.
- A `/v1/request` failure after dispatch invalidates the session but is never replayed by the supervisor.
