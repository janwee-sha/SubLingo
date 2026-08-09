# Local Transport Helper Protocol

The helper is a bundled universal macOS executable with only four responsibilities: secure randomness, bounded upstream HTTP, cancellation and selected response-header extraction. It has no player state, provider retry policy, cache or persistent secret storage.

## Startup and authentication

Global entry launches the helper with non-secret arguments only. The helper binds `127.0.0.1` on an ephemeral port, generates a high-entropy bearer token with the system CSPRNG, and emits one framed readiness line to the IINA stdout hook:

```json
{"type":"ready","port":49152,"token":"<memory-only-token>","protocolVersion":1}
```

IINA must not log stdout-hook frames. All RPC requests require `Authorization: Bearer <token>`. The helper rejects non-loopback clients, wrong content type, missing/invalid tokens, duplicate live job IDs and oversized input before any upstream request.

## `POST /v1/random`

Request:

```json
{ "bytes": 32, "purpose": "vault-dek" }
```

Response:

```json
{ "bytesB64": "..." }
```

Allowed sizes/purposes are fixed by protocol. This endpoint supplies vault DEK/nonces only; values are never logged or persisted by the helper.

## `POST /v1/request`

Request:

```json
{
  "jobId": "uuid",
  "method": "POST",
  "url": "https://provider.example/v1/chat/completions",
  "headers": { "Content-Type": "application/json", "Authorization": "Bearer ..." },
  "body": { "provider-specific": "object" },
  "timeoutMs": 30000,
  "maxResponseBytes": 1048576
}
```

Success/protocol response:

```json
{
  "jobId": "uuid",
  "transportState": "completed",
  "statusCode": 429,
  "headers": {
    "retry-after": "2",
    "x-request-id": "req_redacted_safe_id",
    "content-type": "application/json"
  },
  "bodyText": "{...}"
}
```

Only an allowlist of response headers is returned. Upstream headers/body are never written to stdout/stderr or helper logs. The global adapter parses the provider body; main/sidebar diagnostics receive redacted normalized errors only.

## `POST /v1/cancel`

```json
{ "jobId": "uuid" }
```

Cancellation is idempotent and applies only to the exact active URLSession task. Response state is `cancelled | already-completed | unknown` and never affects another player/job.

## `POST /v1/shutdown`

Requires the session token. Stops accepting requests, cancels remaining jobs, clears in-memory request/header copies and exits. Unexpected helper exit marks only pending attempts as transport failures; main decides whether their own current batches may retry.

## Security and bounds

- Bind IPv4 loopback only; reject proxy forwarding and non-loopback peer addresses.
- Exit when the parent IINA process disappears, after an authenticated shutdown, or after a bounded idle lease with no active jobs, so a crash cannot leave a reusable proxy behind.
- Remote destinations require HTTPS. Plain HTTP is accepted only for loopback Ollama.
- Reject URL userinfo, fragments, unsupported methods and DNS/redirect transitions that violate the original normalized origin.
- Never forward Authorization across redirects; allow same-origin redirects only within a small fixed count.
- Enforce request, response and timeout caps before allocation.
- Do not expose a generic file, shell, DNS or arbitrary local-network API.
- The bearer token, provider headers, request body and response body are memory-only and excluded from all diagnostics.
