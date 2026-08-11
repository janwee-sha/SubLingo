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
- `endpoint: validated URL`（OpenAI-compatible 保存用户输入的 API root；其他 provider 可做 provider-specific normalization）
- `endpointFingerprint: SHA-256`
- `model?: string`
- `capability?: "strict-json-schema" | "json-object" | "prompt-json"`
- `apiVersion/promptVersion`
- Azure: `region?: string`、`deployment="general"`、`apiVersion="2026-06-06"`
- `credentialConfigured: boolean`（仅用于 sanitized view；不持久化秘密值）
- `createdAt`

Validation:

- remote endpoint MUST be HTTPS；只有 exact loopback Ollama 可使用 HTTP。
- URL 不允许 username/password、fragment 或非 HTTP(S) scheme。
- Azure endpoint/key 必填，region 按 resource 类型条件必填，model 固定标准 NMT。
- OpenAI-compatible model 必填，Bearer key 可选，capability 只由显式 connection probe 写入。
- OpenAI-compatible endpoint 不折叠 `/chat/completions`；请求地址始终由保存值去除末尾 `/` 后追加 `/chat/completions`。endpoint fingerprint 使用保存值，避免 UI 披露与实际授权不一致。
- Ollama model 必填，MVP 不承诺 remote custom headers/auth。
- profile edit 创建新 revision；不得原地修改活动 revision。
- profile delete 删除该 identity 的全部 revision 与 credential reference，并清理其 selections/leases；其他 profile 不变。

## CredentialStoreDocument

- fixed path: `@data/credentials.json`
- POSIX mode: file `0600`, plugin data directory `0700`
- `formatVersion: 1`
- `credentials: Record<profile UUID, {apiKey: non-empty string}>`

Lifecycle: absent -> read | atomic replacement -> persisted。helper 在同目录以不可跟随 symlink 的 exclusive temporary file 创建 replacement，完整写入、`fchmod(0600)`、`fsync` 后原子 rename。Profile delete 是幂等的单 entry 删除；文档上限 1 MiB。

Validation:

- RPC 只接受 UUID profile ID 与唯一 `apiKey` 字段，最大 8,192 UTF-8 bytes。
- helper 读取时要求 regular file、当前用户 owner、最大尺寸，并恢复/确认 `0600`。
- 凭据不进入 preferences、安装包、UI 回传、普通状态、日志或诊断。
- 该文档不使用 Keychain且不宣称静态加密；同一 macOS 用户下具备文件读取能力的其他进程属于明确披露的剩余风险。

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

`TransportSupervisor`:

- current replaceable `TransportSession | null`
- coalesced `starting` and `healthCheck` promises
- operations: `health`, fixed-path `credentialRead/Write/Delete`, `request`, `cancel`, `shutdown`, session invalidation
- a side-effect-free `/v1/random` health check before every provider dispatch

`TransportJob`:

- `jobId`
- authoritative `(playerId, requestId)` owner
- `url`、`method`、sanitized timeout/size policy
- `state: pending | completed | cancelled | timedOut`
- selected response metadata: status, `retry-after`, `x-request-id`, content type

Validation: token/request secrets/bodies never log；remote URL must be HTTPS, except loopback HTTP；system route 使用 URLSession，direct route 使用 libcurl `CURLOPT_NOPROXY="*"`；response/header/body limits enforced；cancel affects only exact job ID。credential RPC 不能选择文件路径或任意字段。空闲 helper 退出后 supervisor 在 provider body 派发前重建 session；health 与幂等 credential read/full-replace/delete 可安全重试一次，但已经调用 `/v1/request` 的 provider POST 不在 supervisor 层重放。
