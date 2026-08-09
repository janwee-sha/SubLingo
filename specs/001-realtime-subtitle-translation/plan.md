# Implementation Plan: SubLingo 实时字幕翻译 MVP

**Branch**: `001-realtime-subtitle-translation`（Spec Kit 功能上下文；Git 当前分支为 `main`） | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-realtime-subtitle-translation/spec.md`

## Summary

以 TypeScript 构建 IINA 1.4+ 插件，读取当前可访问的外部 SRT/ASS 字幕，根据播放位置选择有限前瞻窗口并批量调用 Azure Translator、OpenAI-compatible Chat Completions 或 Ollama 原生 API。译文以本地缓存复用，动态生成 SRT 并作为 IINA 第二字幕显示；语言门控、单批次并发和会话 epoch 保证不翻译母语字幕、不预翻译整片且不让迟到结果污染当前播放。

## Technical Context

**Language/Version**: TypeScript strict mode，目标 ES2020；Node.js 24 构建工具链

**Primary Dependencies**: IINA Plugin API 1.4.x、`iina-plugin-definition`、Parcel 2、`@noble/hashes`

**Storage**: IINA preferences 保存非秘密设置，macOS Keychain 保存凭据，`@data/` 保存版本化译文缓存，`@tmp/` 保存动态 SRT

**Testing**: Vitest 单元/契约测试；IINA 1.4.0 与 1.4.3 手工集成验收；`iina-plugin` CLI 构建链接和打包

**Target Platform**: macOS 11+、IINA 1.4.0+

**Project Type**: IINA 桌面播放器 JavaScript 插件

**Performance Goals**: 每 500ms 评估播放窗口；服务在 3 秒内响应时首批 5 秒内可用；首批后 95% 字幕在显示前就绪；插件不暂停视频

**Constraints**: 仅外部 SRT/ASS；窗口上限 120 秒/40 条；请求上限 25 条/5,000 字符；每播放器单在途批次；IINA HTTP 无物理取消，必须用逻辑超时和 epoch；不得记录秘密或字幕正文

**Scale/Scope**: 单机单用户，每个 IINA 播放器实例独立运行；每类翻译服务保存一个 profile；不包含音频转写、整片翻译或云端缓存同步

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Constitution 文件仍为未填写模板，没有已生效的原则、质量门或治理版本。
- 本计划遵循规格中的隐私、范围、可测性和非阻塞要求。
- **Pre-research gate**: PASS — 无生效条款冲突，无需复杂度例外。
- **Post-design gate**: PASS — 设计未引入规格外的后端、跨设备服务或整片翻译。

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-subtitle-translation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── app/                 # 播放会话与实时调度
├── domain/              # 稳定实体、状态与语言规则
├── subtitles/           # SRT/ASS 解析与生成 SRT
├── providers/           # Azure/OpenAI-compatible/Ollama adapters
├── adapters/iina/       # IINA HTTP、文件、Keychain、字幕轨桥接
└── main.ts              # 插件入口与生命周期编排

ui/                      # Sidebar 设置与状态 WebView
tests/
├── unit/
├── contract/
├── integration/
└── fixtures/
```

**Structure Decision**: 采用单插件工程。核心领域逻辑不依赖 IINA 全局对象，便于 Node/Vitest 验证；仅 `src/adapters/iina/` 和 `src/main.ts` 接触宿主 API。

## Complexity Tracking

无 Constitution 违规，不需要复杂度豁免。
