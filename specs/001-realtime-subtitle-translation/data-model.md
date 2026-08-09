# Phase 1 Data Model: SubLingo 实时字幕翻译 MVP

## GlobalDefaults

- `enabledByDefault: boolean`
- `targetLanguage: BCP47 | null`
- `sourceLanguageMode: "track" | "manual"`
- `sourceLanguage: BCP47 | null`
- `lastProfileId: string | null`（只用于新窗口默认值，不代表任何活动窗口已授权）
- 固定调度值：`lookaheadSeconds=120`、`lookaheadCues=40`、`refillSeconds=30`、`refillCues=10`

Validation: target/source language 使用规范化 BCP 47；基础语言相同默认进入 `nativeNoTranslation`，只有用户明确选择不同 target variant 时允许覆盖。preferences 不得包含 credential、subtitle text、translation 或活动会话状态。

## ProviderProfileRevision

- `profileId: UUID`
- `revision: positive integer`
- `displayName: string`
- `kind: "azure" | "openai" | "ollama"`
- `endpoint: normalized URL`
- `endpointFingerprint: SHA-256`
- `model?: string`
- `capability?: "strict-json-schema" | "json-object" | "prompt-json"`
- `apiVersion/promptVersion`
- Azure: `region?: string`、`deployment="general"`、`apiVersion="2026-06-06"`
- `credentialRef?: { vaultId, secretRevision }`
- `createdAt`

Validation:

- remote endpoint MUST be HTTPS；只有 exact loopback Ollama 可使用 HTTP。
- URL 不允许 username/password、fragment 或非 HTTP(S) scheme。
- Azure endpoint/key 必填，region 按 resource 类型条件必填，model 固定标准 NMT。
- OpenAI-compatible model 必填，Bearer key 可选，capability 只由显式 connection probe 写入。
- Ollama model 必填，MVP 不承诺 remote custom headers/auth。
- profile edit 创建新 revision；不得原地修改活动 revision。

## CredentialVaultEnvelope

- `formatVersion: 1`
- `vaultId: UUID`
- `revision: positive integer`
- `algorithm: "A256GCM"`
- `nonceB64: 12-byte unique nonce`
- `ciphertextAndTagB64`
- `entries: [{profileId, secretRevision, fieldNames}]`（非秘密索引可放 envelope 外层）

Lifecycle: absent -> initializing -> unlocked | locked -> rewriting -> verified。A/B slot 中 authenticated revision 最大且可成功解密者为当前 vault。

Validation:

- DEK 必须是 helper 安全随机生成的 32 bytes，并仅通过 plugin-scoped Keychain item 持久化。
- AAD 必须规范编码 plugin ID、vault ID、format version、revision。
- 每次 write/re-encrypt 使用新 nonce；nonce 不得由 counter、时间或 `Math.random` 产生。
- 写入 inactive slot 后立即 read/decrypt/compare，验证成功才视为 committed。
- Keychain、tag、AAD、schema 或 verify 失败均 locked/fail closed；绝不回退明文。

## WindowProviderSelection

- `profileId`
- `revision`
- `endpointFingerprint`
- `authorizedAt`

Identity: 用户在 sidebar 查看 kind + normalized endpoint 后主动选择，生成当前窗口的 selection。endpoint/profile revision 改变后 selection 立即无效，必须重新选择；其他窗口持有的旧 selection/snapshot 不改变。

## SubtitleSource

- `trackId: number`
- `isExternal: true`
- `format: "srt" | "ass"`
- `contentHash: SHA-256`
- `language: BCP47 | null`
- `languageOrigin: "track" | "manual" | "unknown"`
- `decode: {encoding, bom, warnings[]}`
- `cues: ordered SubtitleCue[]`

Identity: `{videoSessionId, trackId, contentHash}`。`@sub/<id>` 不可读、无法安全解码或非 SRT/ASS 时为 unsupported；同名视频/字幕不得替代内容 hash。

## SubtitleCue

- `id: opaque stable ID within source`
- `index: non-negative integer`
- `startMs: non-negative integer`
- `endMs: integer >= startMs`
- `sourceText: string`
- `normalizedText: string`
- `contextText?: string`（仅最少必要相邻上下文）

Validation: timestamps finite；只把可读人类文本发送 provider；ASS override tags 不进入 provider/output，`\N` 转换为可读换行；无效 cue 报 warning 并跳过，不阻断视频。

## PlaybackSession

- `playerId: host-supplied ID`
- `sessionId: UUID`
- `sessionEpoch: integer`
- `windowEpoch: integer`
- `enabled: boolean`
- current video/source/language fingerprints
- `selection: WindowProviderSelection | null`
- `positionMs`、`paused`、`seekStableAt`
- `status: SessionStatus`
- `cache: Map<cacheKey, SessionCacheEntry>`
- `activeBatch: TranslationBatch | null`
- `retryTimerIds: Set`
- original primary/secondary IDs
- `generatedTrack: GeneratedSubtitleTrack | null`

`SessionStatus`:

- `disabled`
- `waitingForSubtitle`
- `waitingForLanguage`
- `nativeNoTranslation`
- `waitingForConfiguration`
- `preparing`
- `running`
- `partialFailure`
- `serviceUnavailable`

State transitions:

```text
disabled
  -> waitingForSubtitle
  -> waitingForLanguage
  -> nativeNoTranslation
  -> waitingForConfiguration
  -> preparing -> running
                  -> partialFailure -> running
                  -> serviceUnavailable -> preparing
any -> disabled | waitingForSubtitle (new source/session)
```

File/source/language/provider/disable/close increments `sessionEpoch`; seek increments `windowEpoch`。任何 async completion 必须完全匹配 player/session/sessionEpoch/windowEpoch/profile revision/batch ID 才能改变状态、cache 或轨道。

## TranslationBatch

- `batchId: UUID`
- `playerId`、`sessionId`、`sessionEpoch`、`windowEpoch`
- `profileId`、`profileRevision`、`endpointFingerprint`
- `sourceLanguage`、`targetLanguage`
- `items: [{id, text, optional minimalContext}]`
- `characterCount`
- `attempt: 0 | 1 | 2 | 3`（0 为初次请求，1–3 为重试）
- `helperJobId?: UUID`
- `status: "queued" | "inFlight" | "partial" | "succeeded" | "waitingRetry" | "terminal" | "stale" | "cancelled"`
- `successfulIds: Set<string>`
- `lastError?: ProviderAttemptError`

Validation: items 唯一、最多 25 条且总计最多 5,000 Unicode code points；只能包含当前窗口中未缓存、仍在前瞻范围的 cue。一个 PlaybackSession 最多一个 batch inFlight/waitingRetry；不同 player 可并发。

## ProviderAttemptError

- `category: "network" | "timeout" | "http" | "authentication" | "configuration" | "model" | "quota" | "refusal" | "protocol" | "cancelled"`
- `retryable: boolean`
- `statusCode?: number`
- `providerCode?: string`
- `retryAfterMs?: non-negative integer`
- `requestId?: string`
- `userAction: stable action code`

Validation: `retryAfterMs` 仅来自 helper 解析的合法 `Retry-After` 或 provider 结构化字段，不解析自然语言。诊断对象不得包含 credential/header/body/subtitle/translation。

## RetrySchedule

- `retryNumber: 1 | 2 | 3`
- `baseDelayMs: 1000 | 2000 | 4000`
- `jitterMs`
- `providerRetryAfterMs?: number`
- `scheduledFor`
- batch/session/profile fingerprints

Effective delay: `max(baseDelayMs + jitterMs, providerRetryAfterMs ?? 0)`。timer fire 前再次验证 batch 尚属当前有限范围；失效则取消而不发送。successful IDs 永不重试。

## SessionCacheEntry

- `sessionId`
- `cacheKey: SHA-256`
- `cueId`、`sourceContentHash`
- `sourceLanguage`、`targetLanguage`
- `providerSemanticFingerprint`
- `translation: non-empty string`

Cache key 包含 cue/source identity、语言方向、provider kind、endpoint、model/deployment、API/prompt version 和 profile revision，不含 credential。Entry 只存在于所属 PlaybackSession Map；不得序列化到 preferences/`@data`。视频结束/换片/关窗时同步 clear；重开同一视频创建新 Map。

## GeneratedSubtitleTrack

- `sessionId`
- `revision`
- `path`
- `trackId`
- `cueIds: ordered string[]`
- `owned: true`

Lifecycle:

```text
absent -> full file written -> loaded/detected -> selected as second
       -> next revision atomically swapped -> old track/file removed
       -> removed/deleted on disable, new file, end-file, or window close
```

插件永不替换 primary。清理只移除精确 owned track；仅当当前 secondID 仍是 owned track 时恢复启动前 secondID，避免覆盖用户后续手动选择。

## TransportSession / TransportJob

`TransportSession`:

- `port: ephemeral loopback port`
- `bearerToken: native-random, memory only`
- `helperPid/liveness`
- `state: starting | ready | failed | stopped`

`TransportJob`:

- `jobId`
- authoritative `(playerId, requestId)` owner
- `url`、`method`、sanitized timeout/size policy
- `state: pending | completed | cancelled | timedOut`
- selected response metadata: status, `retry-after`, `x-request-id`, content type

Validation: token/request secrets/bodies never log；remote URL must be HTTPS, except loopback HTTP；redirect cannot change origin with authorization；response/header/body limits enforced；cancel affects only exact job ID。
