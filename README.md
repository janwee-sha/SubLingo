# SubLingo

SubLingo 是面向 IINA 1.4+ 的实时双语字幕插件。它读取当前选中的外部 SRT/ASS，围绕播放位置有限前瞻、批量翻译，并把有效译文作为 IINA 第二字幕显示。原字幕与视频始终继续播放；翻译延迟或失败不会暂停播放。

## 功能边界

- 支持可由 IINA `@sub/<trackId>` 读取的外部 SRT、ASS/SSA 文本字幕。
- 支持 OpenAI-compatible Chat Completions 与 Ollama 原生 API。Azure Translator 暂不在可选服务中。
- 每个窗口最多一个批次在途；窗口之间可独立并发。
- 每次前瞻最多 120 秒或 40 条，provider 子批次最多 25 条或 5,000 Unicode code points。
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
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

重启 IINA 后，在“设置 → 插件”中启用 SubLingo，再从播放器插件面板打开其侧边栏。插件声明以下权限：`file-system` 用于读取所选外部字幕、维护加密 vault 与临时译文轨；`network-request` 只连接 `127.0.0.1` helper；`subtitle` 读取当前选择并管理插件拥有的第二字幕；`preferences` 保存非敏感 profile 元数据与界面默认值；`show-alert` 只用于确认 vault 重置。远程 provider 流量只由受限 Swift helper 发往用户明确选择的 endpoint。

## 首次配置

1. 在 Languages 中设置母语；确认字幕语言。语言未知时 SubLingo 不会发送字幕。
2. 创建 OpenAI-compatible 或 Ollama profile，填写精确 Model ID。OpenAI-compatible 可填写 API root（如 `/v1`）或完整 `/chat/completions` URL；两者会规范化为同一 endpoint。界面会完整展示服务类别与规范化 endpoint。
3. 对远程服务填写 API key。密钥输入是 write-only：保存后只显示“已配置”，不会回显。
4. 运行连接测试，然后点击 Select。选择该确切 profile revision 即表示授权向显示的 endpoint 发送当前有限范围内的字幕文字；endpoint 变化后必须重新选择。
5. 打开 Translate。原字幕仍为 primary，译文由插件拥有的 second subtitle track 显示。

## 权限、隐私与费用

Provider 密钥在写入 `@data/` 前以 AES-256-GCM 加密。随机 256-bit DEK 仅保存在插件作用域的 macOS Keychain 项；vault 使用带规范 AAD 的 A/B 写入、写后解密校验和最高有效 revision 恢复。Keychain、认证标签或 vault 校验失败时会 fail closed，不存在明文或同目录密钥回退。

Swift helper 只监听 `127.0.0.1` 临时端口，使用内存 bearer token，并只提供随机数、有限 HTTP、精确 job 取消和 shutdown。远程地址必须是 HTTPS；只有 loopback Ollama 可使用 HTTP。跨源重定向、URL 凭据、超限 body/response 和错误 token 会被拒绝。

请求只包含当前临近 cue 的 opaque ID、人类可读字幕文字、语言方向和少量相邻上下文，不包含视频内容或无关用户信息。诊断、状态与 UI 不包含凭据、Authorization、helper token、字幕/译文正文或 provider 原始 body。模型服务费用及内容政策由用户选择的服务决定；有限前瞻、批量和会话缓存用于控制调用量，但不构成费用保证。

## Provider 配置

- **OpenAI-compatible**：API root 或完整 `/chat/completions` URL、model 必填；Bearer key 可选。连接测试只在服务明确不支持当前 response format 时按 strict JSON Schema、JSON object、prompt JSON 顺序协商；认证、模型、配额、网络和超时错误会立即停止并给出对应操作。真实字幕批次不会因格式失败而自动换格式重发，避免重复计费。
- **Ollama**：默认 `http://127.0.0.1:11434`，model 必填。连接测试检查 `/api/version`、`/api/tags` 和 structured-output chat；插件不下载或启动模型。

## 故障排查

- **Select a readable external SRT or ASS subtitle**：当前没有字幕、轨道不是外部文本轨，或 `@sub/<id>` 不可读。插件会监听 `sid` 与 `track-list` 变化并短暂重试 IINA 的异步轨道加载；若仍提示 unreadable，请重新选中外部主字幕。
- **Confirm the subtitle language**：轨道未提供可靠语言；手动填写 BCP 47 标签（如 `en-US`）。
- **Translation service unavailable**：检查 endpoint、网络、Ollama 进程或 helper；视频和原字幕不受影响。临时错误最多在初次调用后重试 3 次，并遵守 `Retry-After`。
- **Credential vault locked/corrupt**：Keychain 或密文认证失败。Reset Vault 使用 IINA 原生确认框；确认后会永久删除已保存凭据、取消在途 provider 工作、清除 provider 实例并让所有窗口重新选择 profile，但保留不含秘密的 profile 元数据。
- **Authentication/model/quota**：按侧边栏提示检查 key、模型名称或余额。永久配置/认证/配额错误不会自动重试。
- **没有第二字幕**：确认 profile 已测试并 Select、源语言与母语不同、Translate 已启用，且 IINA 没有在加载后手动切换 second subtitle。插件只删除自己拥有的轨道，不覆盖用户后续选择。

开发与验收步骤见 [quickstart](specs/001-realtime-subtitle-translation/quickstart.md)，自动化结果见 `docs/validation/`。
