# Phase 0 Research: SubLingo 实时字幕翻译 MVP

## IINA 插件基线

**Decision**: 最低支持 IINA 1.4.0，以 1.4.3 为主要集成环境；使用 TypeScript、Parcel 与每播放器 main entry。

**Rationale**: 插件系统从 1.4.0 正式启用。每个播放器实例拥有独立的 mpv 和插件实例，适合把播放会话状态隔离在 main entry。官方开发流程支持 Parcel、TypeScript、sidebar、preferences、文件与网络 API。

**Alternatives considered**: 原生 Swift 扩展会扩大签名和分发范围；global entry 不掌握播放器轨道状态；WebView 承载调度会增加消息同步和 CORS 风险。

## 可读取字幕范围

**Decision**: MVP 只支持 `@sub/<id>` 可读取且格式为 SRT/ASS 的外部文本字幕。

**Rationale**: IINA 文件别名最终依赖字幕轨 `externalFilename`；内嵌流没有可直接读取的源文件。此边界与规格中“不可读取的内嵌字幕不承诺支持”一致。

**Alternatives considered**: 调用外部 ffmpeg 提取内嵌字幕会增加进程权限、平台依赖和完整媒体扫描，不适合 MVP。

## 第二字幕更新

**Decision**: 生成唯一 UTF-8 SRT 到 `@tmp/`，使用 `sub-add ... auto` 加载后设为 `core.subtitle.secondID`，后续覆写同一路径并 `sub-reload`；清理时恢复用户原第二字幕。

**Rationale**: mpv 原生支持 primary/secondary 两轨及外部字幕重载；生成 SRT 可避免复制 ASS 样式，同时保持时间轴和换行。

**Alternatives considered**: overlay 无法作为真正第二字幕参与 IINA 字幕控制；每批新增轨会泄漏轨道并改变用户选择；生成 ASS 增加样式和转义复杂度。

## 网络传输

**Decision**: provider adapters 在 main entry 使用 `iina.http`。POST 必须使用精确 `Content-Type: application/json`，且请求体顶层为对象。

**Rationale**: IINA 的 HTTP 包装器在该 Content-Type 下将 `data` 字典编码为 JSON，可避免 WebView CORS。API 没有请求句柄、AbortSignal 或原生超时，因此使用 Promise 逻辑超时、单在途批次和多层 epoch 丢弃迟到响应。

**Alternatives considered**: WebView fetch 可能受 CORS 影响；`utils.exec(curl)` 会把 argv 写入日志且无 stdin/cancel，可能泄漏凭据。

## 机器翻译服务

**Decision**: 首发机器翻译选择 Azure Translator 标准 NMT，固定 2026-06-06 API，采用用户自带 subscription key 和 region。

**Rationale**: 支持大批量同步输入、100+ 语言、F0 每月 200 万字符额度和多个公共云路由；桌面 BYOK 配置比 Google IAM 简单，免费额度与当前 DeepL Developer 计划相比更适合持续观看。

**Alternatives considered**: Google Cloud Translation 语言覆盖更广但项目/IAM 配置更重；DeepL 接口简单但免费计划和地区/条款限制更明显。

## OpenAI-compatible 契约

**Decision**: 使用 Chat Completions，而不是 Responses 或异步 Batch。连接探针依次协商 strict JSON Schema、JSON object、提示词 JSON；所有层级都进行本地 ID 校验。

**Rationale**: Chat Completions 是兼容服务覆盖最广的共同接口；稳定 ID 可避免模型乱序、遗漏或附加结果造成时间轴错配。

**Alternatives considered**: Responses 的第三方兼容覆盖不足；Batch 完成窗口不适合实时字幕；逐条请求浪费公共提示 Token。

## Ollama 契约

**Decision**: 使用 Ollama 原生 `/api/version`、`/api/tags`、`/api/chat`，不复用其部分 OpenAI 兼容层。

**Rationale**: 原生接口支持 JSON Schema、`stream:false`、temperature、模型列表和推理用量；本地默认地址无需认证。

**Alternatives considered**: `/v1/chat/completions` 会损失原生诊断与格式能力；Ollama Cloud 不属于本地服务 MVP。

## 凭据与缓存

**Decision**: API 密钥写 macOS Keychain；非秘密配置写 preferences；缓存使用内容寻址、版本化的 `@data/` JSON 条目，动态轨只写 `@tmp/`。

**Rationale**: Keychain 避免秘密进入设置文件；缓存键包含所有语义输入，可跨 seek/重开复用而不会混用服务、模型或语言结果。

**Alternatives considered**: preferences 明文保存密钥风险高；单个无版本大 JSON 文件容易发生不匹配和损坏；云同步超出 MVP。
