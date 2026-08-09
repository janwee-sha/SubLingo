# Translation Provider Contract

## Internal Interface

```ts
interface TranslationBatchRequest {
  sourceLanguage: string;
  targetLanguage: string;
  items: Array<{ id: string; text: string }>;
  sessionEpoch: number;
  windowEpoch: number;
}

interface TranslationBatchResult {
  translations: Array<{ id: string; text: string }>;
  requestId?: string;
  usage?: { input?: number; output?: number; characters?: number };
}
```

Providers MUST accept one batch per request, never log text or credentials, and return only results that can be associated with requested IDs. Application validation accepts unique, known IDs with non-empty text; unknown/duplicate/empty results remain uncached.

## Azure Translator

- `POST {endpoint}/translate?api-version=2026-06-06`
- Headers: exact `Content-Type: application/json`, `Ocp-Apim-Subscription-Key`, `Ocp-Apim-Subscription-Region`, `X-ClientTraceId`
- Body is the 2026-06-06 `inputs` object for one target language.
- Response order maps to request order; count mismatch is a partial/protocol failure.

## OpenAI-compatible

- `POST {apiRoot}/chat/completions`
- Optional `Authorization: Bearer <key>`
- Non-streaming messages with untrusted subtitle items encoded as JSON.
- Capability order: strict `json_schema` -> `json_object` -> prompt-only JSON.
- Output contract: `{ "translations": [{ "id": "c1", "text": "..." }] }`.

## Ollama

- Probe `GET /api/version` and `GET /api/tags`.
- `POST /api/chat` with `stream:false`, JSON Schema format and temperature 0.
- Output JSON is read from `message.content` and validated with the common contract.
