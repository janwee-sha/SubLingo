# Tasks: SubLingo 实时字幕翻译 MVP

**Input**: Design documents from `/specs/001-realtime-subtitle-translation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required because the specification defines mandatory user-scenario tests and measurable parser, timing, privacy, retry, provider-contract and multi-window outcomes. In each user-story phase, write the listed tests first and confirm that they fail for the intended missing behavior before implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated as an independent increment. Setup and Foundational phases contain only shared prerequisites.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its phase prerequisites because it changes different files and does not depend on another incomplete task in the same group.
- **[Story]**: Maps the task to User Story 1, 2 or 3.
- Every task includes concrete repository-relative file paths.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the reproducible TypeScript/IINA/Swift project skeleton required by every story.

- [X] T001 Initialize Node 24 workspace scripts and pin Parcel, TypeScript, Vitest, `iina-plugin-definition`, `@noble/hashes`, and `@noble/ciphers` in package.json and package-lock.json
- [X] T002 [P] Configure separate plugin and WebView TypeScript environments plus build outputs in tsconfig.json, tsconfig.plugin.json, and tsconfig.webview.json
- [X] T003 [P] Configure unit/contract/integration test discovery, linting, and formatting in vitest.config.ts, eslint.config.js, and .prettierrc.json
- [X] T004 [P] Define IINA main/global/sidebar entries, minimum version, loopback network access, filesystem permission, and user-facing permission descriptions in Info.json
- [X] T005 [P] Create bundle entry and sidebar shells in src/main.ts, src/global.ts, ui/sidebar.html, ui/sidebar.ts, and ui/sidebar.css
- [X] T006 [P] Create the universal Swift helper package and native build command in native/transport/Package.swift and scripts/build-native.sh
- [X] T007 [P] Exclude dependencies, build outputs, vault/runtime files, secrets, and validation artifacts from packages and source control in .gitignore and .npmignore
- [X] T008 [P] Add deterministic subtitle/provider fixtures in tests/fixtures/subtitles/sample.srt, tests/fixtures/subtitles/sample.ass, tests/fixtures/subtitles/invalid.srt, tests/fixtures/providers/azure-success.json, tests/fixtures/providers/openai-success.json, and tests/fixtures/providers/ollama-success.json

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared identifiers, safe diagnostics, typed RPC, the native transport boundary, and an injectable one-attempt provider contract.

**⚠️ CRITICAL**: No user-story integration can begin until this phase is complete.

- [X] T009 Define shared opaque IDs, session/profile fingerprints, provider request/result types, and sanitized view-model primitives in src/domain/types.ts and src/providers/types.ts
- [X] T010 [P] Implement reusable fake IINA APIs, deterministic clock, and injected provider/transport doubles in tests/helpers/fake-iina.ts, tests/helpers/fake-clock.ts, and tests/helpers/fake-provider.ts
- [X] T011 [P] Write failing UTF-8/base64, canonical hashing, and redacted-diagnostic tests in tests/unit/codec-identity.test.ts and tests/security/redaction.test.ts
- [X] T012 Implement JavaScriptCore-safe UTF-8/base64 codecs, SHA-256 identity helpers, and allowlist-only diagnostics in src/domain/codec.ts, src/domain/identity.ts, and src/domain/logging.ts
- [X] T013 [P] Write failing Swift protocol tests for loopback binding, bearer auth, random bytes, bounded request/cancel, redirect rejection, header extraction, shutdown, and parent-loss exit in native/transport/Tests/SubLingoTransportTests/ServerTests.swift and native/transport/Tests/SubLingoTransportTests/HTTPClientTests.swift
- [X] T014 Implement framed startup, system entropy, authenticated loopback routing, size validation, shutdown, and parent/idle liveness in native/transport/Sources/SubLingoTransport/Protocol.swift, native/transport/Sources/SubLingoTransport/Server.swift, and native/transport/Sources/SubLingoTransport/main.swift
- [X] T015 Implement URLSession deadlines, exact-job cancellation, same-origin redirect handling, remote HTTPS/loopback HTTP enforcement, and selected response headers in native/transport/Sources/SubLingoTransport/HTTPClient.swift
- [X] T016 [P] Write failing TypeScript contract tests for helper startup framing, bearer RPC, random, request, cancellation, unavailable-helper, and redacted failures in tests/contract/transport-client.test.ts
- [X] T017 Implement helper process bootstrap and the typed local RPC client in src/adapters/iina/transport-process.ts and src/transport/client.ts
- [X] T018 [P] Write failing authoritative-player routing, stale revision, colliding request ID, and concurrent-window RPC tests in tests/contract/global-rpc.test.ts
- [X] T019 Implement strict Sidebar/Main/Global message schemas and host-player-ID routing in src/domain/messages.ts, src/adapters/iina/sidebar-rpc.ts, and src/adapters/iina/global-rpc.ts
- [X] T020 Implement the one-attempt provider interface and deterministic injected fake provider in src/providers/provider.ts and src/providers/fake.ts
- [X] T021 Add IINA 1.4 runtime type augmentation and null-safe wrappers for preferences, file handles, events, mpv, Keychain, and global messaging in src/types/iina-runtime.d.ts and src/adapters/iina/runtime.ts
- [X] T022 Implement stable session states, provider error categories, user-action codes, and redacted error normalization in src/domain/status.ts and src/domain/errors.ts

**Checkpoint**: Native and TypeScript transport contracts pass; fakes can drive a player-scoped controller without any concrete provider.

---

## Phase 3: User Story 1 - 观看实时双语字幕 (Priority: P1) 🎯 MVP

**Goal**: Read a selected external SRT/ASS, translate nearby cues through an injected provider, and maintain a synchronized plugin-owned second subtitle without interrupting the original video/subtitle in one or many windows.

**Independent Test**: Open one or two videos with external non-native SRT/ASS fixtures and an injected provider; continuous play, pause/resume, delayed results and disable must keep the original subtitle/video running while correct translations appear only on the owning window's second track.

### Tests for User Story 1

- [X] T023 [P] [US1] Write failing SRT parse/render tests for BOM, multiline cues, overlap, malformed entries, exact timing, ordering, escaping, and UTF-8 output in tests/unit/srt.test.ts
- [X] T024 [P] [US1] Write failing ASS event tests for dynamic Format columns, comma-containing dialogue, override tags, `\N`, speaker text, malformed rows, timing, and ordering in tests/unit/ass.test.ts
- [X] T025 [P] [US1] Write failing selected-track tests for `isExternal`, `@sub/<id>` bytes, BOM/encoding, unreadable/unsupported tracks, and content identity in tests/unit/subtitle-source.test.ts
- [X] T026 [P] [US1] Write failing playback-session tests for nullable position, pause/resume, file/track/seek epochs, delayed-result rejection, and player-specific temp identities in tests/unit/playback-session.test.ts
- [X] T027 [P] [US1] Write failing generated-track tests for full-file revision swap, primary preservation, exact owned-ID removal, user second-track changes, disable, end-file, and window-close cleanup in tests/integration/subtitle-track.test.ts
- [X] T028 [P] [US1] Write failing controller acceptance tests for first translations, no placeholders on delay/failure, disable cancellation, and two-window result/status/track isolation in tests/integration/us1-playback.test.ts

### Implementation for User Story 1

- [X] T029 [P] [US1] Implement BOM-aware byte decoding, encoding warnings, and safe unsupported-file results in src/subtitles/encoding.ts
- [X] T030 [P] [US1] Implement normalized SRT parsing and deterministic UTF-8 SRT rendering in src/subtitles/srt.ts
- [X] T031 [P] [US1] Implement ASS Events parsing, visible-text normalization, control-tag stripping, and cue ordering in src/subtitles/ass.ts
- [X] T032 [US1] Implement selected external-track validation, `@sub/<id>` binary reads, format detection, content hashing, and cue loading in src/subtitles/source.ts and src/adapters/iina/subtitle-source.ts
- [X] T033 [P] [US1] Implement player-local PlaybackSession state, session/window epochs, file/track/seek/close listeners, and timer/job invalidation in src/app/playback-session.ts and src/adapters/iina/playback-events.ts
- [X] T034 [US1] Implement nearby-cue selection and a single in-flight injected-provider pipeline that never awaits inside playback callbacks in src/app/scheduler.ts and src/app/translation-pipeline.ts
- [X] T035 [P] [US1] Implement complete-SRT revision writes, mpv track discovery/swap, secondID ownership, primary preservation, and cleanup in src/adapters/iina/subtitle-track.ts
- [X] T036 [US1] Orchestrate source loading, provider results, valid cue mapping, non-blocking status, generated-track revisions, disable, and stale-result rejection in src/app/controller.ts
- [X] T037 [US1] Wire one controller per IINA main instance, unique player/session paths, lifecycle cleanup, and Sidebar/Main/Global RPC in src/main.ts
- [X] T038 [US1] Implement mother/source language controls, enable/disable toggle, source summary, and non-blocking session status in ui/sidebar.html, ui/sidebar.ts, and ui/sidebar.css

**Checkpoint**: User Story 1 runs end-to-end with an injected provider and remains independently verifiable across two IINA player instances.

---

## Phase 4: User Story 2 - 只翻译所需内容并复用译文 (Priority: P2)

**Goal**: Enforce the native-language zero-call gate, bounded/refilled lookahead, minimal request content, seek-safe retries, in-session cache reuse, and immediate cache purge on video close.

**Independent Test**: With a recording provider, exercise native subtitles, ten minutes of a long video, backward/forward/rapid seeks, temporary errors, disable/close and reopen; verify request bounds, retry timing, successful cache reuse, stale cancellation, minimal payloads, and zero cross-session reuse.

### Tests for User Story 2

- [X] T039 [P] [US2] Write failing BCP 47 normalization, base-language equality, explicit regional override, track/manual origin, and unknown-source gate tests in tests/unit/language.test.ts
- [X] T040 [P] [US2] Write failing 120-second/40-cue window, 30-second/10-cue refill, 25-cue/5,000-code-point split, pause, seek debounce, and long-cue tests in tests/unit/scheduler-bounds.test.ts
- [X] T041 [P] [US2] Write failing session-cache identity, provider/language/source isolation, partial success, backward-seek reuse, memory-only behavior, and close/reopen purge tests in tests/unit/session-cache.test.ts
- [X] T042 [P] [US2] Write failing retry classification, initial-plus-three attempt cap, 1s/2s/4s jitter, delta/date `Retry-After`, successful-ID exclusion, and stale timer/job cancellation tests in tests/unit/retry.test.ts
- [X] T043 [P] [US2] Write failing recording-provider integration tests for native zero calls, bounded ten-minute viewing, minimal request payloads, rapid seek, disable/backoff cancellation, video-close purge, and reopen non-reuse in tests/integration/us2-cost-privacy.test.ts

### Implementation for User Story 2

- [X] T044 [P] [US2] Implement BCP 47 normalization, reliable/manual source selection, native-language gating, and explicit regional overrides in src/domain/language.ts
- [X] T045 [P] [US2] Extend window selection with exact lookahead/refill bounds, stable-seek debounce, Unicode code-point batching, and one-active-batch flow control in src/app/scheduler.ts
- [X] T046 [US2] Build provider requests from untranslated IDs, language direction, human-readable text, and minimal adjacent context only in src/app/request-builder.ts
- [X] T047 [P] [US2] Implement the PlaybackSession-owned Map, semantic cache keys, partial-result insertion, successful reuse, and synchronous clear in src/app/session-cache.ts
- [X] T048 [P] [US2] Implement provider error classification and session-local retry timers using exponential jitter plus observable `Retry-After` in src/app/retry-policy.ts
- [X] T049 [US2] Integrate language gates, bounded refill, cache hits, partial retries, helper cancellation, seek epochs, and close/replacement purge into src/app/controller.ts
- [X] T050 [US2] Add no-translation, preparing, running, partial-failure, service-unavailable, bounded-work, and session-cache indicators in ui/sidebar.ts and ui/sidebar.html

**Checkpoint**: User Story 2 proves cost/privacy constraints with a recording provider and leaves no translation cache on disk or across video sessions.

---

## Phase 5: User Story 3 - 配置并切换翻译服务 (Priority: P3)

**Goal**: Securely save, test, explicitly select, and switch immutable Azure/OpenAI-compatible/Ollama profile revisions while preserving credential secrecy and per-window isolation.

**Independent Test**: From blank settings, save and probe each provider, select the disclosed kind/address, translate the same fixture, switch profiles and edit endpoints; verify actionable errors, encrypted-at-rest credentials, required reselection, correct response mapping, and no cross-profile/window result reuse.

### Tests for User Story 3

- [X] T051 [P] [US3] Write failing AES-256-GCM vectors, unique nonce, wrong key/AAD/tag/ciphertext, A/B recovery, vault reset, and Keychain-unavailable tests in tests/contract/credential-vault.test.ts
- [X] T052 [P] [US3] Write failing immutable profile revision, endpoint fingerprint, explicit selection, lease/release, stale mutation, authoritative player routing, and concurrent-window tests in tests/contract/provider-profiles.test.ts
- [X] T053 [P] [US3] Write failing common output tests for unknown/duplicate/empty IDs, partial valid results, refusal, malformed JSON, usage, and redacted provider errors in tests/contract/provider-output.test.ts
- [X] T054 [P] [US3] Write failing Azure 2026-06-06 NMT request/auth/region, positional count/shape, language, deadline, request ID, and error-classification tests in tests/contract/azure.test.ts
- [X] T055 [P] [US3] Write failing OpenAI-compatible strict-schema/JSON/prompt probe, no real-batch fallback, ID mapping, model/auth, refusal/length/filter, quota, and error tests in tests/contract/openai.test.ts
- [X] T056 [P] [US3] Write failing Ollama version/tags/schema probe, local HTTP/remote HTTPS, non-stream chat, think/temperature, missing-model, cold-timeout, and error tests in tests/contract/ollama.test.ts
- [X] T057 [P] [US3] Write failing Sidebar/Main/Global message tests for write-only secrets, sanitized views, endpoint disclosure, selection authorization, stale revision rejection, provider test, and vault reset in tests/contract/ui-messages.test.ts
- [X] T058 [P] [US3] Write failing scans proving credentials, DEK, loopback token, auth headers, subtitle text, and provider bodies never enter preferences, `@data` plaintext, logs, status, or diagnostics in tests/security/credential-leakage.test.ts
- [X] T059 [P] [US3] Write failing end-to-end tests for all providers, connection failures, endpoint reselection, provider/language/model cache isolation, old-revision leases, helper failure, and two-window independent switching in tests/integration/us3-providers.test.ts

### Implementation for User Story 3

- [X] T060 [P] [US3] Implement canonical vault AAD, AES-256-GCM encrypt/decrypt, envelope schema checks, and authenticated revision comparison in src/vault/crypto.ts and src/vault/types.ts
- [X] T061 [US3] Implement Keychain-wrapped DEK creation/read, helper-supplied entropy, serialized A/B vault writes, write-read verification, recovery, fail-closed states, and reset in src/vault/store.ts and src/adapters/iina/keychain.ts
- [X] T062 [P] [US3] Implement normalized provider profiles, immutable revisions, endpoint fingerprints, exact-window selections, in-memory old-revision leases, and durable latest metadata in src/providers/profiles.ts
- [X] T063 [P] [US3] Implement common strict ID validation, Azure positional validation, sanitized usage/request IDs, and retryable/permanent provider errors in src/providers/validation.ts and src/providers/errors.ts
- [X] T064 [P] [US3] Implement Azure Translator 2026-06-06 standard-NMT request, conditional region auth, positional mapping, deadline, and error adapter in src/providers/azure.ts
- [X] T065 [P] [US3] Implement OpenAI-compatible Chat Completions capability probes, non-stream request construction, strict local mapping, and no-billing-duplicate fallback rules in src/providers/openai.ts
- [X] T066 [P] [US3] Implement local Ollama version/model/schema probes and native non-stream structured chat adapter in src/providers/ollama.ts
- [X] T067 [US3] Implement the global vault/profile/provider broker, one-attempt transport jobs, exact player reply routing, cancellation, helper liveness, and lease cleanup in src/providers/broker.ts and src/global.ts
- [X] T068 [US3] Integrate per-window profile selection, endpoint-change invalidation, provider revision fingerprints, connection results, switch cancellation, and cache isolation in src/app/controller.ts
- [X] T069 [US3] Implement active OpenAI-compatible/Ollama profile forms, masked write-only credential input, exact kind/address/model disclosure, connection tests, explicit selection, and revision-aware switching in ui/sidebar.html, ui/sidebar.ts, and ui/sidebar.css; keep unvalidated Azure support out of the UI
- [X] T070 [US3] Implement confirmed vault reset and actionable locked/corrupt/auth/model/quota/rate-limit/helper-unavailable states without sensitive diagnostics in src/vault/reset.ts and ui/sidebar.ts

**Checkpoint**: Both active provider categories can be configured and switched securely; each IINA window keeps an independent active revision, session, cache, status and result stream. Azure remains intentionally unavailable until separately validated.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete documentation, accessibility, performance evidence, native packaging, full validation and release packaging.

- [X] T071 [P] Document installation, permissions, encrypted vault behavior, provider privacy/cost, supported subtitle/provider boundaries, and troubleshooting in README.md
- [X] T072 [P] Implement package-content, universal-architecture, executable-permission, secret-pattern, and forbidden-runtime-file checks in scripts/verify-package.sh
- [X] T073 [P] Add keyboard navigation, accessible labels/status announcements, responsive narrow-sidebar layout, and reduced-motion styling in ui/sidebar.html and ui/sidebar.css
- [X] T074 [P] Add automated latency/readiness, 95%-before-display, zero-pause, cache-hit, bounded-call, and multi-window performance assertions in tests/integration/performance.test.ts
- [X] T075 [P] Add the controlled failure/Retry-After/provider simulator and full acceptance runner in tests/helpers/provider-server.ts and tests/integration/acceptance-metrics.test.ts
- [X] T076 Harden universal helper build, signature verification, parent-death cleanup, packaged executable discovery, and IINA 1.4 compatibility in scripts/build-native.sh and src/adapters/iina/transport-process.ts
- [X] T077 Run npm tests, typecheck, native tests, builds, package verification, and record exact results in docs/validation/automated.md
- [ ] T078 Execute quickstart.md on IINA 1.4.0 and 1.4.4 with SRT/ASS, all providers, vault tampering, Retry-After, close/reopen, and two windows, recording evidence in docs/validation/iina-matrix.md
- [X] T079 Pack the verified plugin with IINA's `iina-plugin`, inspect its permission/privacy presentation and contents, and record artifact path/hash in docs/validation/package.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 establishes the workspace, then T002–T008 can proceed in parallel.
- **Foundational (Phase 2)**: Depends on Setup and blocks user-story integration. Test tasks precede their corresponding transport/RPC implementation.
- **User Story 1 (Phase 3)**: Depends on Foundational and establishes the playback/controller/second-track pipeline.
- **User Story 2 (Phase 4)**: Pure language/scheduler/cache/retry work can begin after Foundational; controller integration T049 depends on the US1 controller from T036.
- **User Story 3 (Phase 5)**: Vault/profile/provider modules can begin after Foundational; broker/controller integration T067–T070 depends on the US1 pipeline, and the final cache-isolation acceptance in T059/T068 uses US2 cache semantics.
- **Polish (Phase 6)**: Depends on all stories selected for release; T077–T079 run sequentially after implementation and validation tooling.

### User Story Dependency Graph

```text
Setup -> Foundational -> US1 -> US2 ---------------------> Polish
                         |      |                           ^
                         |      +-> US3 final integration --+
                         +--------> US3 vault/providers -----+
```

### Within Each User Story

- Write the story's tests first and confirm the expected failures.
- Implement pure models/parsers/policies before adapters and orchestration.
- Complete main/global/sidebar integration only after the underlying contracts pass.
- Stop at each checkpoint and run the stated independent test before advancing.

## Parallel Opportunities

### Setup and Foundation

- After T001: T002–T008 touch separate configuration, manifest, UI, native and fixture files.
- T011, T013, T016 and T018 can be authored in parallel; their implementations remain ordered by the contracts they establish.

### User Story 1

```text
Parallel tests: T023, T024, T025, T026, T027, T028
Parallel pure implementations after tests: T029, T030, T031
Parallel host/session implementations after source contracts: T033, T035
Ordered integration: T032 -> T034 -> T036 -> T037 -> T038
```

### User Story 2

```text
Parallel tests: T039, T040, T041, T042, T043
Parallel implementations after tests: T044, T045, T047, T048
Ordered integration: T045 -> T046 -> T049 -> T050
```

### User Story 3

```text
Parallel tests: T051 through T059
Parallel core implementations after tests: T060, T062, T063
Parallel provider adapters after T063: T064, T065, T066
Ordered integration: T060 -> T061; T061/T062/T064/T065/T066 -> T067 -> T068 -> T069 -> T070
```

### Cross-Story Team Strategy

- After Foundational, one stream can deliver US1 playback while another builds the US3 vault/provider modules that do not touch the controller.
- US2 pure modules can start after Foundational, but merge their controller changes only after US1 reaches T036.
- UI tasks T050 and T069 are ordered because they modify the same sidebar files.

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational.
2. Complete US1 with the injected provider.
3. Stop and run the US1 independent test across SRT, ASS, delayed results, disable and two windows.
4. This is the smallest demonstrable playback MVP; a product-ready provider-configurable MVP still requires US2 and US3.

### Incremental Delivery

1. **Foundation**: Secure local transport, typed RPC, fakes and safe diagnostics.
2. **US1**: Real-time bilingual second-subtitle pipeline with injected provider.
3. **US2**: Cost/privacy gates, bounded work, retry behavior and session-only reuse.
4. **US3**: Saved provider profiles, explicitly disclosed local credentials, and provider integrations.
5. **Polish**: Cross-version/two-architecture validation and packed plugin.

## Notes

- `[P]` means parallel only after all earlier phase prerequisites are complete.
- Story labels provide traceability to the three prioritized scenarios in spec.md.
- The native helper performs one attempt; main entry owns retry policy and per-player cancellation.
- Translation caches are memory-only and must never be written to preferences or `@data`.
- Existing uncommitted spec/design changes are inputs to these tasks and must be preserved.

## Phase 7: Convergence

- [X] T080 Implement the original full-URL canonicalization convergence; the literal API-root acceptance requirement introduced later supersedes its endpoint behavior through T085–T086
- [X] T081 Propagate sanitized authentication, endpoint, model, quota/rate-limit, timeout, network, protocol, and helper errors through native transport, Global/Main RPC, and actionable sidebar status per FR-016 / US3-AC4 (partial)
- [X] T082 Implement the original native-confirmed vault reset flow; the user-facing reset control is superseded and removed by per-Profile deletion through T087–T090
- [ ] T083 Add regression coverage and rerun authorized OpenAI-compatible plus Ollama IINA acceptance, correcting validation evidence so only completed end-to-end scenarios are marked passed per SC-006 / T078 (partial)
- [X] T084 Resynchronize external subtitle discovery on IINA `sid` and `track-list` changes, retry delayed `@sub` exposure, and retain specific safe source failure states without resetting an unchanged source

## Phase 8: Acceptance Remediation

- [X] T085 [P] Add failing helper-discovery and literal OpenAI API-root request tests for development links, ambiguous packages, and `/chat/completions` composition
- [X] T086 Fix helper discovery for canonical and `.iinaplugin-dev` installs, preserve user-entered API roots, and return installation-specific safe errors
- [X] T087 [P] Add failing profile update/delete, vault credential deletion, targeted cancellation, and multi-window invalidation tests
- [X] T088 Implement revision-aware Profile editing, confirmed deletion, per-profile credential removal, targeted request cancellation, and connected-window refresh
- [X] T089 [P] Add failing sidebar contracts for removal of Reset Vault, Profile CRUD controls, and request-correlated operation feedback
- [X] T090 Implement Profile editor state plus loading/success/error/selected button feedback that cannot be overwritten by session polling
- [X] T091 [P] Add failing same-window `end-file`/reopen controller lifecycle and generated-track cleanup coverage
- [X] T092 Implement reusable video-session teardown distinct from permanent window close
- [X] T093 Update 001 contracts/validation guidance and run TypeScript, Swift, build, package, live OpenAI, and available IINA/Ollama acceptance checks

## Phase 9: Helper Lease and Credential Remediation

- [X] T094 [P] Add failing transport-supervisor regressions for expired helper sessions, concurrent restart coalescing, safe entropy retry, and no provider POST replay
- [X] T095 Implement a restartable shared helper supervisor and make cached Provider adapters plus the credential vault acquire the current transport session for every operation
- [X] T096 [P] Add failing vault-stage error and Sidebar state contracts that separate selection consent, credential persistence, connection testing, and helper/Keychain/vault failures
- [X] T097 Implement safe vault failure propagation and neutral Profile selection feedback without plaintext credential fallback or implicit Test gating
- [X] T098 Update development-link versus installed-package guidance and add the five-minute-idle, credential-restart, OpenAI, and Ollama acceptance procedure
- [ ] T099 Run the complete TypeScript/Swift/build/package suite and validate the formally installed IINA package against the available live providers
- [X] T100 Add a fixed-purpose, write-only Security.framework bridge for IINA 1.4.4 first Keychain item creation, parent-IINA access control, async vault integration, and regression tests without exposing a wrapping-key read/generic Keychain RPC
- [X] T101 Decode IINA's rejected non-2xx helper Promise into safe RPC errors, retire invalidated helper processes, and suppress automatic resubmission after a batch exhausts its retry policy
- [X] T102 Use IINA 1.4.4's actual lowercase Keychain runtime exports with compatibility fallback and add restart-oriented credential-vault regression coverage
- [X] T103 Bound OpenAI-compatible chat requests to two subtitle items, aggregate restored results, and expose sanitized provider failure details in Session status

## Phase 10: Keychain Removal and Direct Transport Remediation

T100 and T102 remain as historical acceptance work but are superseded by the user-approved storage decision below.

- [X] T104 [P] Replace Keychain/AES-vault tests with failing helper credential read/write/delete, safe-error, fixed-path and POSIX `0600` contract tests
- [X] T105 Implement atomic plugin-private `credentials.json` persistence, migrate RPC/UI messages from vault to credential state, remove Keychain APIs/bridge and AES dependencies, and clean obsolete encrypted envelope files without reading Keychain
- [X] T106 Implement a libcurl-backed direct route with explicit `CURLOPT_NOPROXY="*"`, retain URLSession for macOS proxy mode, and verify a credential-free OpenAI endpoint probe no longer uses `127.0.0.1:10808`
- [X] T107 Bound Ollama chat requests to two subtitle items, aggregate ordered results/usage, and cancel each active split request
- [X] T108 Update specifications, privacy text and validation records; run TypeScript, Swift, universal build, bundle, package verification and formal packaging
- [X] T109 Install the new formal package and validate OpenAI-compatible plus Ollama Test/actual six-cue second-subtitle output, credential restart, profile CRUD, button feedback and five-minute helper recovery in IINA 1.4.4
- [X] T110 [P] Add a native regression for IINA 1.4.4 omitting the serialized `{}` health body after the installed 0.1.1 package returned HTTP 400
- [X] T111 Accept only zero-byte or literal `{}` health bodies, preserve bearer authentication, and release the correction as 0.1.2

## Phase 11: Structured Output Cardinality Remediation

- [X] T112 [P] Add a failing provider-output regression proving each OpenAI/Ollama split request requires exactly one result per requested wire ID
- [X] T113 Add exact `minItems`/`maxItems` request-schema bounds without weakening partial-response validation, rerun live Ollama six-cue IINA acceptance, and release the correction

## Phase 12: Idle Helper Recovery Remediation

- [X] T114 Reproduce IINA's bodyless stale-loopback rejection after the native helper's 300-second idle exit; map `helper-rpc-failed` to recoverable `HELPER_UNAVAILABLE`, preserve helper classifications through credential access, and add no-secret regressions
- [X] T115 Build and formally install 0.1.4, then prove replacement-helper startup, retained OpenAI credential/Test, Ollama Test, Profile update/delete feedback, and actual second-subtitle output after idle expiry
