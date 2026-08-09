# Tasks: SubLingo 实时字幕翻译 MVP

**Input**: Design documents from `/specs/001-realtime-subtitle-translation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required because the feature specification defines measurable parser, timing, caching, failure and provider-contract outcomes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the IINA TypeScript plugin and reproducible toolchain.

- [ ] T001 Create Node/TypeScript/Parcel/Vitest project metadata in package.json, tsconfig.json, vitest.config.ts, and eslint.config.js
- [ ] T002 Create IINA plugin manifest and sidebar shell in Info.json, ui/sidebar.html, ui/sidebar.ts, and ui/sidebar.css
- [ ] T003 [P] Add build/runtime artifacts and secret patterns to .gitignore and .npmignore
- [ ] T004 [P] Create IINA runtime type augmentation in src/types/iina-runtime.d.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared domain, host boundaries and test fixtures required by every story.

- [ ] T005 [P] Define domain entities, settings, status and provider contracts in src/domain/types.ts and src/providers/types.ts
- [ ] T006 [P] Implement language normalization and native-language gate in src/domain/language.ts with tests/unit/language.test.ts
- [ ] T007 [P] Implement hashing, cache identity and redacted logging helpers in src/domain/identity.ts and src/domain/logging.ts with tests/unit/identity.test.ts
- [ ] T008 Implement IINA HTTP, preferences, Keychain and file adapters in src/adapters/iina/http.ts and src/adapters/iina/storage.ts
- [ ] T009 [P] Create reusable mock IINA/HTTP fixtures in tests/helpers/fakes.ts and subtitle fixtures in tests/fixtures/
- [ ] T010 Implement sidebar/main typed message bridge in src/adapters/iina/sidebar.ts and ui/sidebar.ts

**Checkpoint**: Foundation ready; all user-story modules can use stable contracts.

---

## Phase 3: User Story 1 - 观看实时双语字幕 (Priority: P1) 🎯 MVP

**Goal**: Parse the selected external subtitle, translate upcoming cues and show synchronized second subtitles without interrupting playback.

**Independent Test**: Load an external SRT/ASS in IINA with a fake provider and verify the original primary track remains selected while generated translations appear as the second subtitle on the original timeline.

- [ ] T011 [P] [US1] Write SRT parser/render contract tests in tests/unit/srt.test.ts
- [ ] T012 [P] [US1] Write ASS parser contract tests in tests/unit/ass.test.ts
- [ ] T013 [US1] Implement normalized SRT parsing and safe SRT rendering in src/subtitles/srt.ts
- [ ] T014 [US1] Implement ASS event parsing and visible-text normalization in src/subtitles/ass.ts and src/subtitles/index.ts
- [ ] T015 [P] [US1] Write playback-window and batch selection tests in tests/unit/scheduler.test.ts
- [ ] T016 [US1] Implement playback window scheduler and logical timeout handling in src/app/scheduler.ts
- [ ] T017 [US1] Implement generated second-subtitle track ownership/reload lifecycle in src/adapters/iina/subtitle-track.ts
- [ ] T018 [US1] Integrate file/track/seek/session lifecycle in src/app/controller.ts and src/main.ts with tests/integration/controller.test.ts

**Checkpoint**: User Story 1 is independently runnable with an injected provider.

---

## Phase 4: User Story 2 - 只翻译所需内容并复用译文 (Priority: P2)

**Goal**: Enforce native-language zero calls, bounded lookahead, seek-safe generations and persistent cache reuse.

**Independent Test**: Record calls during continuous play, forward/backward seeks, reopen and native subtitles; verify request bounds, no native calls and no repeat calls for successful cached cues.

- [ ] T019 [P] [US2] Write cache store and cache-isolation tests in tests/unit/cache.test.ts
- [ ] T020 [P] [US2] Write stale-result, seek and disable integration tests in tests/integration/controller-cache.test.ts
- [ ] T021 [US2] Implement content-addressed persistent cache in src/adapters/iina/cache.ts
- [ ] T022 [US2] Add cache hydration, partial-result reuse, epoch invalidation and bounded retry to src/app/controller.ts
- [ ] T023 [US2] Add cache controls and cost/privacy status to ui/sidebar.html, ui/sidebar.ts, and ui/sidebar.css

**Checkpoint**: User Stories 1 and 2 meet cost and privacy constraints independently of concrete providers.

---

## Phase 5: User Story 3 - 配置并切换翻译服务 (Priority: P3)

**Goal**: Configure, probe and use Azure Translator, OpenAI-compatible and Ollama while isolating credentials and cached semantics.

**Independent Test**: Probe each adapter through mocked and real endpoints, translate the same batch, then switch providers and verify errors are actionable and cached results never cross profiles.

- [ ] T024 [P] [US3] Write common output validation and provider error tests in tests/contract/provider-output.test.ts
- [ ] T025 [P] [US3] Write Azure request/response/error contract tests in tests/contract/azure.test.ts
- [ ] T026 [P] [US3] Write OpenAI capability-fallback contract tests in tests/contract/openai.test.ts
- [ ] T027 [P] [US3] Write Ollama probe/chat contract tests in tests/contract/ollama.test.ts
- [ ] T028 [US3] Implement common provider validation and Azure adapter in src/providers/validation.ts and src/providers/azure.ts
- [ ] T029 [US3] Implement OpenAI-compatible and Ollama adapters in src/providers/openai.ts and src/providers/ollama.ts
- [ ] T030 [US3] Integrate sanitized profiles, Keychain secrets, connection probes and provider switching in src/providers/index.ts, src/app/controller.ts, and ui/sidebar.ts

**Checkpoint**: All three user stories are functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Packaging, security, regression and end-to-end readiness.

- [ ] T031 [P] Add user installation, permissions, privacy and troubleshooting documentation in README.md
- [ ] T032 Add redaction, endpoint validation, malformed-response and no-secret-log regression tests in tests/unit/security.test.ts
- [ ] T033 Run npm test, npm run typecheck, npm run build, and validate generated plugin contents against quickstart.md
- [ ] T034 Pack the plugin with iina-plugin pack when CLI is available and record any environment-only limitation in quickstart.md

---

## Dependencies & Execution Order

- Phase 1 blocks Phase 2; Phase 2 blocks all user stories.
- US1 establishes the playback pipeline used by US2 and US3.
- US2 and US3 can proceed independently after US1, then integrate through the controller.
- Phase 6 depends on all selected stories.

## Parallel Opportunities

- T003/T004, T005-T007/T009, parser tests T011/T012, cache tests T019/T020, and provider contract tests T024-T027 affect separate files and may run in parallel.
- Provider adapters T028/T029 are separable once T024 defines common validation.

## Implementation Strategy

1. Complete setup and pure domain/parser/scheduler boundaries.
2. Deliver US1 using an injected fake provider and validate IINA track ownership.
3. Add US2 caching and epoch semantics without changing provider contracts.
4. Add all provider adapters and configuration UI for US3.
5. Run the complete automated and IINA quickstart matrix, then package.

## Format Validation

All 34 tasks use the required checkbox, sequential ID, optional `[P]`, required story label inside story phases, concrete action and file path format.
