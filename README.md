# SubLingo

SubLingo 是面向 IINA 1.4+ 的实时双语字幕插件。它读取当前选中的外部 SRT/ASS，围绕播放位置有限前瞻、批量翻译，并把有效译文作为 IINA 第二字幕显示。原字幕与视频始终继续播放；翻译延迟或失败不会暂停播放。

## 功能边界

- 支持可由 IINA `@sub/<trackId>` 读取的外部 SRT、ASS/SSA 文本字幕。
- 支持 OpenAI-compatible Chat Completions 与 Ollama 原生 API。Azure Translator 暂不在可选服务中。
- 每个窗口最多一个批次在途；窗口之间可独立并发。
- 每次前瞻最多 120 秒或 40 条，调度批次最多 25 条或 5,000 Unicode code points；OpenAI-compatible 与 Ollama 的实际 wire request 再按最多 2 条拆分并按原顺序聚合。
- 只缓存当前视频会话的成功译文；换片、播放结束或关窗时立即清空，不写入磁盘。
- 不包含音频转写、图形/内嵌字幕提取、整片预翻译、译文导出、云同步或持久译文缓存。

## 安装与构建

要求 macOS 12+、Node.js 24/npm 11、Swift 6 工具链，以及 IINA 1.4.0 或更高版本。

```sh
npm ci
npm run test
npm run typecheck
npm run build:native
npm run test:native
npm run build
npm run verify:package
npm run pack
```

正式安装与验收请先移除当前 workspace 的开发链接，然后用 IINA 打开打包产物：

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin unlink .
open build/package/SubLingo-0.1.2.iinaplgz
```

`iina-plugin link .` 只创建 `.iinaplugin-dev` 开发链接；IINA 对这种链接禁用“卸载”按钮是预期行为，开发链接应使用 `iina-plugin unlink .` 移除。正式 `.iinaplgz` 安装项必须可以从 IINA 插件管理面板卸载。

重启 IINA 后，在“设置 → 插件”中启用 SubLingo，再从播放器插件面板打开其侧边栏。插件声明 `file-system` 用于读取所选外部字幕、执行受限 helper、保存可选 provider key 与管理临时译文轨；`network-request` 只连接 `127.0.0.1` helper；`show-alert` 只用于确认永久删除 profile 及其凭据。非敏感 profile 元数据与界面默认值写入 IINA preferences。远程 provider 流量只由受限 Swift helper 发往用户明确选择的 endpoint。

## 首次配置

1. 在 Languages 中设置母语；确认字幕语言。语言未知时 SubLingo 不会发送字幕。
2. 创建 OpenAI-compatible 或 Ollama profile，填写精确 Model ID。OpenAI-compatible 必须填写 API root（如 `https://example.com/v1`）；界面原样展示该值，并明确预览实际请求地址 `{API root}/chat/completions`。若把完整 `/chat/completions` 地址填入 root 字段，后缀会再次追加，连接测试预期失败。
3. 对远程服务填写 API key。密钥输入是 write-only：保存后只显示“已配置”，不会回显。
4. 建议先运行连接测试，再点击 Select。Select 只表示选择该确切 profile revision 并授权向显示的 endpoint 发送有限范围内的字幕文字，不表示 API key 或连接已经通过验证；endpoint 变化后必须重新选择。
5. 打开 Translate。原字幕仍为 primary，译文由插件拥有的 second subtitle track 显示。

## 权限、隐私与费用

SubLingo 不使用 macOS Keychain，因此正常保存、重启与翻译不会触发 Keychain 密码对话框。OpenAI-compatible API key 由 bearer-token 认证的 helper 原子写入插件私有 `@data/credentials.json`：目录权限固定为 `0700`，文件权限固定为 `0600`，输入框保持 write-only，密钥不会写入 preferences、安装包、Sidebar 状态、日志或诊断。Ollama 不保存也不读取凭据。

该文件是本地明文，并非静态加密。它能防止其他 macOS 账号和普通文件权限下的意外读取，但不能抵御已经能以当前 macOS 用户身份读取文件的进程。把加密密钥与密文放在同一目录并不会改善这一边界；如需抵御同账号进程，只能改用 Keychain、用户口令或不持久保存密钥。本版本选择无系统密码提示的使用体验，并在界面和文档中明确披露这一取舍。

Swift helper 只监听 `127.0.0.1` 临时端口，使用内存 bearer token，并只提供 health、固定路径 credential read/replace/delete、有限 HTTP、精确 job 取消和 shutdown。helper 在 300 秒无活动后退出；下一次操作会在发送 provider body 前探活并按需启动新 session。真实 provider POST 一旦派发便不会由 helper supervisor 自动重放。远程地址必须是 HTTPS；只有 loopback Ollama 可使用 HTTP。跨源重定向、URL 凭据、超限 body/response 和错误 token 会被拒绝。

每个 Profile 可选择 **Use macOS proxy settings** 或 **Connect directly**。前者使用 URLSession；后者使用进程内系统 libcurl 并强制 `CURLOPT_NOPROXY="*"`，不依赖 macOS 26 已无法可靠表达“完全直连”的旧 CFNetwork proxy dictionary。direct 禁止自动重定向，避免 Authorization 被带到其他地址。

请求只包含当前临近 cue 的 opaque ID、人类可读字幕文字、语言方向和少量相邻上下文，不包含视频内容或无关用户信息。诊断、状态与 UI 不包含凭据、Authorization、helper token、字幕/译文正文或 provider 原始 body。模型服务费用及内容政策由用户选择的服务决定；有限前瞻、批量和会话缓存用于控制调用量，但不构成费用保证。

## Provider 配置

- **OpenAI-compatible**：API root 与 model 必填；Bearer key 可选。保存后 endpoint 保持用户输入，不会把完整路径悄悄改写成 root；所有请求固定追加 `/chat/completions`。连接测试只在服务明确不支持当前 response format 时按 strict JSON Schema、JSON object、prompt JSON 顺序协商；认证、模型、配额、网络和超时错误会立即停止并给出对应操作。真实字幕批次不会因格式失败而自动换格式重发，避免重复计费；每次 wire request 最多包含两条 cue。
- **Ollama**：默认 `http://127.0.0.1:11434`，model 必填且不需要凭据。连接测试检查 `/api/version`、`/api/tags` 和 structured-output chat；实际字幕也按每次最多两条 cue 拆分。插件不下载或启动模型。

## 故障排查

- **Select a readable external SRT or ASS subtitle**：当前没有字幕、轨道不是外部文本轨，或 `@sub/<id>` 不可读。插件会监听 `sid` 与 `track-list` 变化并短暂重试 IINA 的异步轨道加载；若仍提示 unreadable，请重新选中外部主字幕。
- **Confirm the subtitle language**：轨道未提供可靠语言；手动填写 BCP 47 标签（如 `en-US`）。
- **Translation service unavailable**：检查 endpoint、网络、Ollama 进程或 helper；视频和原字幕不受影响。临时错误最多在初次调用后重试 3 次，并遵守 `Retry-After`。
- **Credential could not be saved**：确认使用正式安装包、插件 data directory 可写，并完全退出后重启 IINA。OpenAI key 保存于固定的 `credentials.json`；删除某个 profile 时，IINA 原生确认框会明确提示其保存凭据也将永久删除，并取消该 profile 的在途工作与窗口授权。
- **代理导致连接失败**：先使用默认的 macOS proxy；若代理拒绝本地或远程服务，再把该 Profile 改为 direct 并重新 Select/Test。direct 明确绕过 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 与 macOS 系统代理。
- **Helper unavailable**：正常空闲退出会自动恢复；若仍失败，确认正式包或唯一开发链接内包含可执行的 universal helper。正式验收不要同时保留 `.iinaplugin` 与 `.iinaplugin-dev` 副本，重启 IINA 后重试。
- **Authentication/model/quota**：按侧边栏提示检查 key、模型名称或余额。永久配置/认证/配额错误不会自动重试。
- **没有第二字幕**：确认 profile 已测试并 Select、源语言与母语不同、Translate 已启用，且 IINA 没有在加载后手动切换 second subtitle。插件只删除自己拥有的轨道，不覆盖用户后续选择。

开发与验收步骤见 [quickstart](specs/001-realtime-subtitle-translation/quickstart.md)，自动化结果见 `docs/validation/`。
