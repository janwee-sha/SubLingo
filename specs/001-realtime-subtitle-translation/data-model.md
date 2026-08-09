# Phase 1 Data Model: SubLingo 实时字幕翻译 MVP

## PluginSettings

- `enabled: boolean`
- `targetLanguage: BCP47 | null`
- `sourceLanguage: BCP47 | null`
- `sourceLanguageMode: "track" | "manual"`
- `activeProvider: "azure" | "openai" | "ollama"`
- `lookaheadSeconds: 120`、`lookaheadCues: 40`
- `refillSeconds: 30`、`refillCues: 10`

Validation: target language required before translation; manual source must be valid and cannot be blank; base-language equality prevents automatic translation unless both values are explicit variants.

## ProviderProfile

- Common: `kind`、`baseUrl`、`model?`、`capability?`、`revision`
- Azure: `region`、fixed `apiVersion=2026-06-06`、Keychain reference
- OpenAI-compatible: `model`、optional Bearer-key reference、structured-output capability
- Ollama: `model`、default `http://127.0.0.1:11434`

Validation: remote non-loopback endpoints require HTTPS; secrets never serialize with profiles; profile revision changes whenever semantic configuration changes.

## SubtitleSource

- `videoFingerprint`
- `trackId`
- `externalPath`
- `format: "srt" | "ass"`
- `contentHash`
- `language`
- ordered `cues`

Identity: SHA-256 of normalized video URL plus normalized complete subtitle content. A track without readable content is unsupported.

## SubtitleCue

- `id`、`index`
- `startMs`、`endMs`
- `sourceText`、`normalizedText`
- `state: unseen | queued | inFlight | translated | failed | stale`
- `attempts`

Validation: finite non-negative timestamps, `endMs >= startMs`, non-empty human-readable text. Invalid cues are reported and skipped.

## PlaybackSession

- `sessionId`、`epoch`、`windowEpoch`
- current source/profile/settings fingerprints
- current position and status
- original primary/secondary track IDs
- generated track ID/path
- at most one active batch

State transitions:

`disabled -> waitingForSubtitle -> waitingForLanguage -> nativeNoTranslation | ready -> translating -> ready | partialFailure | serviceUnavailable`

File, track, provider or language changes create a new session epoch. Seek creates a new window epoch.

## TranslationBatch

- `batchId`、`sessionEpoch`、`windowEpoch`、`providerRevision`
- `items[{id,text}]`
- `characterCount`
- `status: queued | inFlight | succeeded | partial | retryable | terminal | stale`
- `attempt`

Validation: at most 25 cues and 5,000 Unicode code points; every ID unique; only current-window uncached cues may be queued.

## TranslationCacheEntry

- `schemaVersion`
- `cacheKey`
- source/video/cue hashes
- source/target language
- provider semantic fingerprint
- translated text
- `createdAt`、`lastUsedAt`

Cache key includes video, subtitle, cue, language direction, provider kind, endpoint/region, model/deployment, provider API version and prompt version. It excludes secrets.

## GeneratedSubtitleTrack

- `sessionId`、`path`、`trackId`
- ordered translated cues
- `revision`

Lifecycle: absent -> written -> loaded as secondary -> reloaded on new translations -> removed on disable/file change/end. The original primary track is never replaced.
