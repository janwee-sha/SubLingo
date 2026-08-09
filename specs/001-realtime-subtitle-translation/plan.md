# Implementation Plan: SubLingo 实时字幕翻译 MVP

**Branch**: `001-realtime-subtitle-translation`（Spec Kit 功能上下文；Git 当前分支为 `main`） | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-realtime-subtitle-translation/spec.md`

## Summary

以 TypeScript 构建 IINA 1.4+ 插件，并附带一个最小化、通用二进制的 Swift URLSession 传输辅助程序。每个 IINA 播放器 main entry 独立读取当前可访问的外部 SRT/ASS、围绕播放位置调度有限批次、维护内存译文缓存和第二字幕轨；global entry 只负责版本化配置、加密凭据仓库和单次 provider 调用。内置机器翻译固定为 Azure Translator 2026-06-06 标准 NMT，另支持 OpenAI-compatible Chat Completions 和 Ollama 原生 API。

传输辅助程序通过带随机会话令牌的 loopback RPC 提供真实超时、取消和响应头读取，解决 IINA `iina.http` 无 `Retry-After`/Abort 能力的问题。所有异步结果在写缓存或字幕前校验播放器、视频会话、播放窗口、配置版本和批次标识，确保多窗口、跳转、禁用和关闭时不会发生串写。

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode，插件 bundle 目标 ES2020；Swift 6/Foundation 传输辅助程序；Node.js 24 构建工具链

**Primary Dependencies**: IINA Plugin API 1.4.x、`iina-plugin-definition` 0.99.x、Parcel 2、Vitest 3、`@noble/hashes`、`@noble/ciphers`；Swift Foundation/URLSession/Security

**Storage**: IINA preferences 仅保存非秘密默认值和 profile 元数据；provider 凭据以 AES-256-GCM 密文写入 `@data/` A/B vault，随机 DEK 由 `iina.utils.keyChainWrite/keyChainRead` 保护；译文缓存仅存在于各 `PlaybackSession` 内存；当前显示 SRT 写入播放器/会话唯一的 `@tmp/` 路径并在禁用、换片、结束或关窗时删除

**Testing**: Vitest 单元、契约和控制器集成测试；Swift XCTest 传输测试；IINA 1.4.0 最低版本与当前稳定版 1.4.4 的双窗口手工验收；`iina-plugin` CLI 链接和打包验证

**Target Platform**: macOS 12+（arm64/x86_64 通用辅助程序）、IINA 1.4.0+；以 IINA 1.4.4 为主要验收环境

**Project Type**: IINA 桌面播放器 JavaScript 插件 + 最小本地传输辅助程序

**Performance Goals**: 播放位置约每 250–500ms 评估；服务在 3 秒内返回时首批 5 秒内可用；首批后 95% 字幕在显示前就绪；单窗口最多一个 provider 批次在途，窗口之间可并发；插件不暂停视频

**Constraints**: 仅支持 `@sub/<id>` 可读取的外部 SRT/ASS；播放窗口不超过 120 秒/40 条，统一 provider 子批次不超过 25 条/5,000 Unicode code points；初次调用后最多重试 3 次；provider 请求不得直接使用缺少响应头的 `iina.http`；远程地址必须 HTTPS，只有 loopback Ollama 可使用 HTTP；不得记录凭据、请求头、字幕正文或译文正文

**Scale/Scope**: 单机单用户，任意 IINA 播放器窗口各有独立会话、队列、重试、缓存、状态和第二字幕轨；全局仅共享已保存 profile/vault，provider revision 对活动窗口不可变；不包含音频转写、整片翻译、持久译文缓存或云同步

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- `.specify/memory/constitution.md` 仍是未填写模板，没有已批准的原则、质量门或治理版本。
- 本计划仍以规格中的隐私、有限前瞻、可验证映射、非阻塞播放和多窗口隔离为有效约束。
- **Pre-research gate**: PASS — 无生效 Constitution 条款冲突；所有技术未知项均进入 Phase 0 研究。
- **Post-design gate**: PASS — Phase 1 已解决凭据加密、`Retry-After`、取消和多窗口路由；没有遗留未决技术问题，也未引入规格外云端服务或持久译文缓存。

## Architecture

### Runtime ownership

```text
Sidebar WebView (per player)
  └─ settings/status messages
       ↓
Main entry (one isolated instance per IINA player)
  ├─ PlaybackSession + epochs
  ├─ source cues + scheduler + retry timers
  ├─ in-memory translation cache
  └─ generated secondary-subtitle ownership
       ↓ global.postMessage(requestId)
Global entry (one IINA-process singleton)
  ├─ immutable ProviderProfile revisions
  ├─ encrypted CredentialVault writes/decryption
  └─ one-attempt provider adapters (no retry/circuit breaker)
       ↓ token-authenticated loopback RPC
Swift transport helper
  └─ URLSession timeout/cancel, safe redirects, response headers/body
```

Global entry MUST route replies using the host-supplied player ID from `global.onMessage`, never a player ID supplied inside message data. Provider jobs are keyed by `(playerId, requestId)`; the helper and global broker may run jobs for different players concurrently. Retry classification and scheduling stay in main entry so a failure in one player cannot throttle or change another.

### Credential flow

Provider credentials are not stored as Keychain password items. On first vault creation, cryptographic entropy supplied by the native helper creates a 256-bit DEK; only that wrapping key is placed in the plugin-scoped Keychain item. Global entry encrypts all credential fields with AES-256-GCM before writing versioned A/B vault slots to `@data/`, binding plugin ID, vault ID, profile ID and revision as AAD. Plain credentials are transient, write-only UI inputs and are never returned to main/sidebar view models.

If Keychain access, authenticated decryption, entropy, or vault verification fails, the vault fails closed and the sidebar asks the user to reset/re-enter credentials. There is no plaintext or same-file-key fallback.

### Strict transport behavior

IINA 1.4.4 `HTTPResponse` still omits response headers, and IINA provides no request abort handle. The bundled helper therefore:

- binds only `127.0.0.1` on an ephemeral port and emits its random bearer token through the non-logged stdout hook;
- accepts bounded JSON requests from global entry, never provider requests from arbitrary local clients;
- rejects non-HTTP(S) schemes, URL credentials, remote plaintext HTTP and cross-origin redirects that could leak authorization;
- returns selected normalized headers such as `retry-after` and `x-request-id` inside its JSON response;
- supports cancellation by opaque job ID and enforces provider-specific deadlines;
- never logs or echoes authorization values or request/response bodies to diagnostics.

Main entry performs the initial attempt plus at most three retries with delays `1s, 2s, 4s + jitter`. A valid `Retry-After` seconds or HTTP-date value raises the delay to `max(localBackoff, retryAfter)`. Pending timers and helper jobs are cancelled when the session, window, profile revision or batch becomes stale.

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-subtitle-translation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cache-entry.schema.json
│   ├── credential-vault.schema.json
│   ├── provider-output.schema.json
│   ├── transport-protocol.md
│   ├── translation-provider.md
│   └── ui-messages.md
└── tasks.md                 # 由后续 speckit-tasks 基于本设计重新生成
```

### Source Code (repository root)

```text
Info.json
package.json
src/
├── app/                     # 每播放器 controller、调度、重试和状态
├── domain/                  # 稳定实体、语言、身份、缓存规则
├── subtitles/               # SRT/ASS 解析和安全 SRT 渲染
├── providers/               # Azure/OpenAI-compatible/Ollama adapters
├── vault/                   # global-entry 加密 vault 与 profile revisions
├── adapters/iina/           # 文件、轨道、sidebar/global 消息桥
├── main.ts                  # 每播放器入口
└── global.ts                # 全局 vault/provider broker 入口

ui/                          # Sidebar 设置和状态 WebView
native/transport/
├── Package.swift
├── Sources/SubLingoTransport/
└── Tests/SubLingoTransportTests/

tests/
├── unit/
├── contract/
├── integration/
├── security/
└── fixtures/
```

**Structure Decision**: 使用一个插件包、两个 JavaScript entry 和一个职责受限的 native helper。纯领域、字幕、映射、调度和重试逻辑不依赖 IINA；main entry 只接触所属 player；global entry 是持久设置和 provider 调用的唯一写入者；helper 不包含产品状态或重试策略。

## Design Gates and Complexity Tracking

| Decision | Why required | Rejected simpler alternative |
|----------|--------------|-------------------------------|
| Swift URLSession transport helper | FR-020 要求读取并遵守 `Retry-After`，同时取消过期请求；IINA 1.4.4 HTTP bridge 不暴露 headers/abort | `iina.http` 只能做逻辑超时；WebView fetch 会把任意兼容 endpoint 限制为 CORS 可用；`curl` 参数会被 IINA 记录并泄露秘密 |
| Global entry profile/vault broker | 多 main entry 需安全共享保存配置，同时保持活动 revision 和播放器状态隔离 | 每窗口直接写同一个 vault 会产生竞态；把播放状态放全局会违反 FR-025 |
| Keychain-wrapped AES-GCM DEK | FR-017 要求凭据以插件本地密文保存，同时不能把解密密钥同文件保存 | 直接保存 provider secret 到 Keychain 不符合选定存储模型；同目录保存 key 不能提供有效静态保护；每次启动输入主密码会显著增加 MVP 摩擦 |

以上均不是 Constitution 违规；它们是满足明确规格所需且边界受控的复杂度。设计没有未解决的 gate failure。
