# Translation Provider Contract

## Internal one-attempt interface

```ts
interface TranslationBatchRequest {
  playerId: string;
  requestId: string;
  batchId: string;
  sessionId: string;
  sessionEpoch: number;
  windowEpoch: number;
  profileId: string;
  profileRevision: number;
  endpointFingerprint: string;
  sourceLanguage: string;
  targetLanguage: string;
  items: Array<{ id: string; text: string; context?: string }>;
}

interface TranslationBatchResult {
  translations: Array<{ id: string; text: string }>;
  providerRequestId?: string;
  usage?: { input?: number; output?: number; characters?: number };
}

interface ProviderAttemptError {
  category:
    | "network" | "timeout" | "http" | "authentication"
    | "configuration" | "model" | "quota" | "refusal"
    | "protocol" | "cancelled";
  retryable: boolean;
  statusCode?: number;
  providerCode?: string;
  retryAfterMs?: number;
  providerRequestId?: string;
  userAction: string;
}
```

Global entry MUST perform exactly one attempt per request. It MUST NOT schedule retries, cache results, mutate a player session, or apply a shared circuit breaker. Main entry alone applies the initial-attempt-plus-three-retries rule and rejects any result whose complete session/profile/batch identity is stale.

Provider requests MUST contain no video bytes or unrelated user data. Adapters and helper MUST never log credentials, authorization headers, subtitle/translation bodies, or raw model output. Diagnostic errors expose stable codes and redacted request IDs only.

## Common output validation

All ID-based providers use [provider-output.schema.json](./provider-output.schema.json). Application validation accepts only unique requested IDs with trim-non-empty text; unknown, duplicate, empty or invalid results remain uncached. Partial valid ID results MAY succeed independently, and only missing IDs MAY be retried.

Azure is positional rather than ID-based. It accepts results only when the response count exactly equals request count and every position contains one valid target-language result. Any positional shape/count ambiguity makes the entire attempt a protocol failure and caches zero entries.

## Azure Translator 2026-06-06

- Standard `general` NMT only; no automatic LLM routing.
- `POST {endpoint}/translate?api-version=2026-06-06`
- Headers: `Content-Type: application/json`, `Ocp-Apim-Subscription-Key`, conditional `Ocp-Apim-Subscription-Region`, `X-ClientTraceId`.
- Body uses current `inputs[]` with one target language.
- Map `value[i].translations[0].text` to `request.items[i]` only after full positional validation.
- Suggested logical deadline: 15 seconds.

## OpenAI-compatible Chat Completions

- `POST {apiRoot}/chat/completions`
- Optional standard `Authorization: Bearer <key>` only.
- `stream:false`; subtitle items are JSON-encoded untrusted data, never interpolated as instructions.
- Capability selected by explicit connection probe: strict `json_schema` -> `json_object` -> prompt-only JSON.
- A real subtitle batch MUST NOT be resent under a fallback response format.
- Output: `{ "translations": [{ "id": "c1", "text": "..." }] }`.
- Suggested logical deadline: 30 seconds unless the saved profile explicitly changes it within a safe range.

## Ollama native API

- Local default `http://127.0.0.1:11434`; non-loopback HTTP is rejected.
- Probe `GET /api/version`, `GET /api/tags`, then a one-item schema generation.
- `POST /api/chat` with `stream:false`, common JSON Schema `format`, temperature 0, and `think:false` when supported.
- Parse and validate JSON in `message.content` using the common ID contract.
- Suggested logical deadline: 60 seconds to permit local cold model loading.

## Error and retry classification

Retryable: network failure, transport deadline, HTTP 408, temporary 429, 500, 502, 503, or provider-typed transient error.

Not retryable: invalid endpoint/configuration, authentication/authorization, missing model, unsupported language, billing/spend/usage quota, refusal/content policy, malformed successful response, or ordinary permanent 4xx.

The transport parses `Retry-After` as delta seconds or HTTP-date. When valid, it returns `retryAfterMs`; main waits `max(1s/2s/4s + jitter, retryAfterMs)`. Invalid/negative values are ignored. Timer fire and every completion revalidate session/window/profile/batch identity.
