# Phase 0 Research: SubLingo 实时字幕翻译 MVP

本文记录规划阶段已解决的技术未知项。所有决策均已落实到 [plan.md](./plan.md) 和 Phase 1 设计；不存在遗留未决技术问题。

## IINA 与平台基线

**Decision**: 最低支持 IINA 1.4.0，以当前稳定版 IINA 1.4.4 为主要验收环境；统一要求 macOS 12+，使用 Node.js 24、TypeScript、Parcel 构建 classic/require-compatible bundle。

**Rationale**: IINA 1.4.0 正式启用插件系统；截至 2026-08-10，官方最新稳定版是 1.4.4。IINA main/global entry 运行在 JavaScriptCore 而非浏览器，Node 仅用于构建和测试。统一 macOS 12+ 可让 arm64/x86_64 helper 采用同一部署下限。[IINA 下载页](https://blog.iina.io/download/)；[IINA 开发指南](https://docs.iina.io/pages/dev-guide.html)

**Alternatives considered**: 仅支持 1.4.4 会不必要缩小 1.4 系列范围；保留 macOS 10.15 Intel 的差异化部署会扩大 native helper 构建矩阵；直接发布 ESM 不能依赖 IINA 当前不完整的模块支持。

## 多窗口运行边界

**Decision**: 每个播放器 main entry 独立拥有 `PlaybackSession`、调度、重试、缓存、状态和字幕轨；global entry 只拥有凭据 broker、不可变 provider revisions 和单次 provider broker。

**Rationale**: IINA 明确为每个 player 创建独立 core、mpv 和插件 main instance，并为 global entry 创建单独的单例。global 消息回调提供 host-supplied player ID，可安全路由返回结果。[Getting Started](https://docs.iina.io/pages/getting-started.html)；[Global Entry](https://docs.iina.io/pages/global-entry.html)；[Global API](https://docs.iina.io/interfaces/IINA.API.Global)

活动窗口引用不可变 `{profileId, revision, endpointFingerprint}`。编辑 profile 创建新 revision 并清除编辑窗口的选择授权；其他窗口继续租用旧的内存 snapshot，直到其会话结束。global 不实现共享 retry queue、negative circuit breaker 或 session cache。

**Alternatives considered**: 全部逻辑放 global 会混合播放器生命周期；每个窗口并发写同一个 credential document 会产生竞态；全局可变 active provider 会让一个窗口的设置变化污染其他窗口。

## 可读取字幕范围

**Decision**: 只接受 `core.subtitle.id` 指向、`isExternal=true` 且 `@sub/<trackId>` 可读并可验证为 SRT/ASS 的文本轨；使用 binary `FileHandle` 处理 BOM/编码，再解析完整 cue 集合。

**Rationale**: IINA Track API 暴露轨道身份、语言和外部属性，File API 暴露当前媒体 `@sub/:id` 文件；IINA/mpv 0.38 没有可用于完整预取内嵌 cue 的公共接口。[Subtitle API](https://docs.iina.io/interfaces/IINA.API.SubtitleAPI.html)；[Track](https://docs.iina.io/interfaces/IINA.Track.html)；[File](https://docs.iina.io/interfaces/IINA.API.File)；[FileHandle](https://docs.iina.io/interfaces/IINA.API.FileHandle.html)

**Alternatives considered**: 调用 ffmpeg 提取内嵌字幕会扫描媒体并增加进程/格式范围；只读 mpv 当前字幕文本无法构建 120 秒前瞻；依赖未来 mpv `sub-lines` 不适用于 IINA 当前打包的 mpv 0.38。

## 播放调度与会话失效

**Decision**: 监听 file/track/seek/end/window 事件并以约 250–500ms 采样 `core.status.position`。`sessionEpoch` 在换片、换轨、语言/provider 改变、禁用或关闭时递增；`windowEpoch` 在 seek 时递增并等待约 300ms 稳定后重新调度。

**Rationale**: IINA Event API 支持 `iina.file-loaded`、`iina.window-will-close` 及任意 `mpv.*` 事件；Status API 的 position 可为空，因此所有入口必须容错。逻辑 epoch 是处理无论是否物理取消都可能迟到结果的最终防线。[Event API](https://docs.iina.io/interfaces/IINA.API.Event.html)；[Status API](https://docs.iina.io/interfaces/IINA.API.StatusAPI.html)

**Alternatives considered**: 只用固定 interval 无法立即感知关闭/换片；在播放回调中 await 网络会阻塞编排；只检查 batch ID 无法隔离 profile/seek/session 变化。

## 有限窗口与统一批次

**Decision**: 候选范围从当前 cue/播放位置开始，按先到达的 120 秒或 40 条截断；剩余未处理范围低于 30 秒或 10 条时补充。发送层再按 25 条或 5,000 Unicode code points 拆分，单播放器仅一批在途。

**Rationale**: 120/40 和 30/10 来自规格成本边界。25/5,000 是三个 provider 的统一低延迟约束，不是 Azure 平台上限；Azure 2026 标准 NMT 实际支持更大的数组/字符范围。[Azure limits](https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits)

**Alternatives considered**: 单条调用重复公共 prompt/HTTP 开销；按整片预翻译违反 FR-005/SC-003；使用 provider 最大上限会增加 LLM 延迟和失败重试成本。

## 第二字幕更新与清理

**Decision**: 每次 revision 先写完整 UTF-8 SRT 到 `@tmp/sublingo/<playerId>/<sessionId>/` 新路径，再 `sub-add`，识别新增轨道 ID，恢复 primary ID、设置 `secondID`，最后移除旧的 plugin-owned track/file。禁用、换片、`end-file`、`window-will-close` 时同步失效 epoch、清 Map/定时器并删除 owned tracks/files。

**Rationale**: IINA 高层 API 有 `loadTrack` 和 `secondID`，更新/删除需使用 mpv `sub-add`/`sub-remove`。revision swap 避免覆写时的部分读取和 `sub-reload` ID 模糊；只记录并移除精确 owned ID，不碰用户轨道。[Core/Subtitle API](https://docs.iina.io/interfaces/IINA.API.SubtitleAPI.html)；[MPV API](https://docs.iina.io/interfaces/IINA.API.MPV.html)；[mpv 0.38 commands](https://github.com/mpv-player/mpv/blob/v0.38.0/DOCS/man/input.rst)

**Alternatives considered**: overlay 不是真实第二字幕；每批新增不回收会泄漏轨道；覆写同一 SRT 再 reload 更容易读到半写文件。异常崩溃不能保证逐视频清理，但 `@tmp` 仍由 IINA 临时目录生命周期回收；正常关闭路径满足 FR-023。

## 插件私有凭据文件

**Decision**: 2026-08-11 用户明确选择移除 macOS Keychain。OpenAI-compatible API key 由 token-authenticated helper 写入固定 `@data/credentials.json`；temporary replacement 以 `O_EXCL|O_NOFOLLOW` 与 `0600` 创建，完整写入并 `fsync` 后原子 rename。插件数据目录限制为 `0700`。Ollama 不访问 credential RPC。

**Rationale**: Keychain 能提供密钥与文件分离的静态保护，但实机 ACL/签名行为导致反复系统密码提示，且 IINA 1.4.4 首次写入存在兼容问题。把“加密密钥”与密文放在同一目录不能抵御已经能读取该目录的进程，因此新模型不做伪加密，改为清楚披露当前用户文件权限边界。provider key 仍不进入 preferences、安装包、Sidebar、日志或诊断。[IINA File API](https://docs.iina.io/interfaces/IINA.API.File)

Legacy AES/Keychain 代码和依赖被删除；启动只清理旧 `vault-a.json`/`vault-b.json`，不读取或删除系统 Keychain item，从而不会触发密码对话框。升级用户需重新输入一次 OpenAI key。

**Alternatives considered**: session-only credential 会要求每次重启重输；同目录加密没有实际隔离；继续调试 Keychain ACL 无法满足用户“不考虑引入”的决定；将 secret 放命令参数会进入进程列表和 IINA 日志。

## macOS 代理与 direct 路由

**Decision**: Profile 明确保存 `system | direct`。system 使用 URLSession 与 macOS proxy policy；direct 使用系统 libcurl 并固定 `CURLOPT_NOPROXY="*"`，不复用 CFNetwork 的 proxy dictionary。

**Rationale**: macOS 26 实机中，即使清除继承的 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 并把旧 `connectionProxyDictionary` 的 HTTP/HTTPS/SOCKS enable 全设为 false，helper 系统日志仍显示 direct 请求连接 `127.0.0.1:10808`。同一 endpoint 的 libcurl no-proxy 探测直接返回预期 HTTP 401，且 helper 日志不再出现该代理地址。Apple 已建议使用新的 proxy configuration API，但空数组仍表示采用 system settings，不能表达强制 direct。[URLSession proxy configurations](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/proxyconfigurations)

**Alternatives considered**: 仅在 process 启动后 unset env 对 macOS 26 已缓存状态无效；旧 CFNetwork dictionary 实测无法强制 direct；调用 `/usr/bin/curl` 会增加子进程生命周期并容易错误暴露 header，因此选择进程内 libcurl C API。

## IINA HTTP 能力与严格 Retry-After

**Decision**: provider 流量不直接使用 `iina.http`，而由一个最小 Swift URLSession helper 通过 authenticated loopback RPC 承载；`iina.http` 只用于 global 到 `127.0.0.1` helper 的本机 RPC。

**Rationale**: IINA 1.4.4 官方实现返回 `text/data/statusCode/reason`，没有响应 headers，也没有 abort/timeout handle，因此无法严格实现 FR-020。WebView fetch 有 headers/AbortController，但任意 OpenAI-compatible endpoint 未必允许 CORS；IINA `utils.exec` 会记录命令参数，直接调用 curl 会泄露 credential header。URLSession helper 可安全读取 `Retry-After`、执行真实超时/取消，并保持 provider endpoint 兼容性。[IINA HTTP API](https://docs.iina.io/interfaces/IINA.API.HTTP)；[HTTP response type](https://github.com/iina/iina-plugin-definition/blob/master/iina/index.d.ts)；[IINA HTTP implementation](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptAPIHttp.swift)；[IINA exec implementation](https://github.com/iina/iina/blob/v1.4.4/iina/JavascriptAPIUtils.swift)

helper 绑定 loopback ephemeral port，自行生成并仅通过 stdout hook 返回 bearer token。它限制 body/response 大小、只允许 HTTPS remote 或 loopback HTTP，以 job ID 支持 cancel，并提供固定路径 credential read/replace/delete。system 网络路由阻止跨 origin redirect 泄露 auth；direct 路由禁用自动 redirect。所有 provider adapter 一次只执行一个 attempt；main entry 决定是否/何时重试。

**Acceptance remediation**: helper 的 300 秒 idle lease 保留，但 Global 不再永久缓存一个 session。共享 supervisor 在每次 provider dispatch 前以 `/v1/random` 探活，过期时合并并发重启；provider adapter 即使被缓存也在每次调用时使用 supervisor。探活发生在 provider body 发送前，entropy 可安全重试一次，已派发 provider POST 则只失效 session 而不由 supervisor 重放。

**Alternatives considered**: 放宽为“可见时才遵守 Retry-After”会改变明确规格；WebView fetch 缩小 OpenAI-compatible 范围；curl 命令参数会进入 IINA 日志；通用本地代理或长期后台服务超出需要。helper 只实现受限 request/cancel/health/credential RPC，不保存播放器或 provider 策略状态。

## 统一重试规则

**Decision**: 一次初始请求后最多自动重试 3 次，总尝试最多 4 次；默认等待为 `1s, 2s, 4s + jitter`，合法 `Retry-After` 使等待变为两者最大值。网络错误、deadline、408、临时 429、500/502/503 和 provider 明确临时错误可重试；配置、认证、模型、billing/quota、普通 4xx、refusal 和 malformed success 不重试。

**Rationale**: 这精确化 FR-020 的“最多重试 3 次”。等待期间持续校验 session/window/profile/batch；过期立即取消 timer/helper job。已经映射成功的 ID 从后续 retry 中移除。

**Alternatives considered**: 固定间隔容易放大限流；对所有 429 重试会浪费余额；全局 circuit breaker 会把一个窗口的错误传播到其他窗口。

## 内置机器翻译服务

**Decision**: 选择 Azure Translator Text API `2026-06-06` 的标准 `general` NMT；endpoint、subscription key 必填，region 根据 resource 类型条件必填，不自动切换到 LLM deployment。

**Rationale**: 当前 GA API 支持同步 `inputs[]`、`value[]` 对应和 100+ 语言；Azure 具有 global/geographical endpoints，F0 每月提供 200 万字符标准翻译，桌面 BYOK 比 Google ADC/IAM 简单。[Azure Translate API](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/2026-06-06/translate-api)；[overview/endpoints](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/overview)；[authentication](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/authentication)；[pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/translator/)

Azure 不返回调用方 cue ID，因此仅在 response count 与请求一致且每个 position 有唯一目标文本时接受整批；任何 count/shape 异常使整批为 protocol failure，防止位置偏移错配。

**Alternatives considered**: DeepL API 简洁但 free/pro endpoint 与地区可用性更受限；Google Advanced 需要 OAuth/ADC/IAM；Amazon 实时 TranslateText 一次只接收一个字符串，异步 batch 不适合实时字幕。

## OpenAI-compatible 契约

**Decision**: 使用 `{apiRoot}/chat/completions`、`stream:false` 和可选 Bearer key。连接检查依次协商 strict `json_schema`、`json_object`、prompt-only JSON 并缓存 capability；真实字幕批次不做失败后格式 fallback。

**Acceptance remediation**: endpoint 字段只接受并展示 API root 语义，保存用户输入且不把完整 `/chat/completions` URL 折叠成 root。请求构造统一去除末尾 `/` 后追加 `/chat/completions`；界面同步显示该实际地址，因此误填完整路径会显式形成重复后缀并按服务响应失败。

**Rationale**: Chat Completions 是第三方兼容服务的最大共同接口。Strict Structured Outputs 可保证 schema；JSON mode 只保证有效 JSON，所以所有层级仍须本地校验 opaque cue ID、唯一性和非空文本。[Chat API](https://developers.openai.com/api/reference/resources/chat)；[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

**Alternatives considered**: Responses 的第三方兼容范围较小；异步 Batch API 不满足实时延迟；逐条请求浪费公共 prompt token；在真实 batch 上自动重试不同格式可能重复计费。

## Ollama 契约

**Decision**: 使用本地 Ollama 原生 `/api/version`、`/api/tags`、`/api/chat`，`stream:false`、JSON Schema `format`、temperature 0、可用时 `think:false`。默认地址 `http://127.0.0.1:11434`，远程 Ollama/custom auth 不在 MVP 保证范围。

**Rationale**: 原生 API 支持版本、模型诊断和 structured output；本地访问无需认证，connection/model/schema probe 可分别给出可操作错误。[Ollama chat](https://docs.ollama.com/api/chat)；[structured outputs](https://docs.ollama.com/capabilities/structured-outputs)；[model list](https://docs.ollama.com/api/tags)；[authentication](https://docs.ollama.com/api/authentication)

**Alternatives considered**: `/v1/chat/completions` 会丢失原生诊断；streaming 增加 NDJSON 中途错误处理；Ollama Cloud 当前 structured-output 限制和远程隐私语义超出“本地 Ollama”范围。

## 会话缓存

**Decision**: 成功译文只存每个 `PlaybackSession` 的内存 Map；cache identity 包含 source/cue、语言方向、provider kind、endpoint、model/API/prompt 和 immutable revision。禁用可保留本会话 Map 以便重新启用，视频结束/换片/关窗必须立即 clear 且不写 `@data`。

**Rationale**: 这同时满足同一会话 seek/replay 复用与 FR-023 关闭删除。动态 SRT 是显示媒介，不是缓存，也必须在正常生命周期结束时删除。

**Alternatives considered**: 持久 content-addressed cache 与最新规格冲突；按文本单独复用会忽略语境/provider 变化；全局 cache 会污染多窗口生命周期。
