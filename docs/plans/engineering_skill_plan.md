# SubLingo 开发流程 Agent 技能建议

本文总结 SubLingo 开发、诊断、正式打包和 IINA 实机验收过程中，适合沉淀为 Agent 技能的重复性流程。

核心原则是：确定性的构建和校验逻辑继续保留在项目脚本中，Agent 技能负责跨工具编排、状态判断、实机验收、安全边界和证据维护，不在 `SKILL.md` 中重复实现现有 shell 脚本。

## 建议优先级

| 优先级 | 建议技能名称                      | 主要覆盖流程                                                                                |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| P0     | `iina-plugin-release`             | 版本同步、native/build、包校验、IINA CLI 打包、归档检查、哈希和发布记录                     |
| P0     | `iina-plugin-live-acceptance`     | 正式安装、IINA UI 实测、Provider Test、实际双字幕、Profile CRUD、按钮反馈和 helper 空闲恢复 |
| P0     | `iina-helper-diagnostics`         | helper 生命周期、loopback RPC、代理路径、凭据存储、错误分类和进程诊断                       |
| P1     | `translation-provider-validation` | OpenAI-compatible/Ollama 接口、结构化输出、cue cardinality 和真实服务验证                   |
| P1     | `acceptance-evidence-maintainer`  | 更新 validation 文档、任务状态和发布证据，避免把未执行项目标记为 PASS                       |

## 1. `iina-plugin-release`

这是最适合首先实现的技能，用于统一版本变更、构建和正式打包流程。

建议包含以下步骤：

1. 核对 `Info.json`、`package.json`、`package-lock.json` 和打包脚本中的项目版本。
2. 只修改项目自身的版本字段，不误改第三方依赖中相同的版本号。
3. 调用现有项目脚本：

   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build:native`
   - `npm run test:native`
   - `npm run build`
   - `npm run verify:package`
   - `npm run pack`

4. 校验 native helper：

   - 包含 arm64 和 x86_64 两个架构。
   - 保持可执行权限。
   - 具有有效签名。

5. 检查归档只包含发布文件，不包含密钥、运行时数据、源码、测试或构建开发目录。
6. 输出产物绝对路径、大小、SHA-256 和包内实际版本。
7. 更新当前发布文档，同时保留历史版本验收记录。
8. 明确区分两种安装方式：

   - `iina-plugin link .` 创建 `.iinaplugin-dev` 开发链接，IINA 对该链接禁用“卸载”按钮属于预期行为。
   - `.iinaplgz` 用于正式安装和发布验收，安装项必须能从插件管理面板正常卸载。

现有的 `build-native.sh`、`verify-package.sh` 和 `pack.sh` 应继续作为该技能调用的底层实现，不应把其中的 shell 逻辑复制到技能说明中。

## 2. `iina-plugin-live-acceptance`

该技能用于正式安装后的完整人工验收，并依赖已有的通用 `computer-use` 技能操作 IINA。

建议固定以下验收矩阵：

1. 确认安装目录是普通目录而不是符号链接。
2. 核对已安装版本和 main/global/helper 文件哈希。
3. 确认插件管理器中的“卸载”按钮可用。
4. 打开指定视频和外部字幕测试文件。
5. 分别验证 OpenAI-compatible 和 Ollama：

   - Test 成功。
   - Select 状态正确。
   - 实际播放达到预期 cue 数量。
   - 原字幕与翻译字幕同时显示。
   - 生成的第二字幕轨存在。

6. 验证 Profile 生命周期：

   - 新建 Profile。
   - 编辑现有 Profile。
   - 以空密钥更新时保留已有密钥。
   - 更新现有 Profile 时不产生重复项。
   - 删除操作弹出 IINA 原生确认。
   - 取消删除后显示明确反馈，Profile 保持不变。

7. 验证按钮的 busy、success、error 和 cancelled 状态反馈。
8. 等待 helper 达到空闲超时并自然退出，再验证下一次 Test 能自动启动新的 helper PID。
9. 验收结束后，清理由本次任务启动的 IINA、Ollama 和 helper 进程。

该技能需要明确以下安全边界：

- 永不输出 `providers/` 中的 API key。
- 只测试用户已经授权的 endpoint 和凭据范围。
- 永久删除 Profile 及凭据必须在操作发生前获得确认。
- 不使用开发链接执行正式安装验收。
- 不因 stale helper 自动重放已经派发的真实 provider POST。

## 3. `iina-helper-diagnostics`

该技能适合诊断 helper、凭据和网络路径问题，避免仅根据 UI 错误文本猜测根因。

建议包含以下诊断决策树：

1. helper 是否存在、父进程是否为 IINA、PID 和运行时长是否合理。
2. 当前属于 helper 启动失败、父进程退出、空闲退出，还是 stale client/session。
3. IINA 是否返回了没有 helper 响应体的 loopback rejection。
4. 错误应归类为哪一种稳定类型：

   - `HELPER_UNAVAILABLE`
   - `HELPER_PROTOCOL`
   - `AUTHENTICATION`
   - `PROVIDER_TIMEOUT`
   - endpoint、model 或 quota 错误

5. `TransportSupervisor` 是否允许丢弃旧 session 并启动替代 helper。
6. provider POST 是否已经派发，以及是否存在重复发送风险。
7. health 请求是否兼容 IINA 的零字节 body 和字面量 `{}`。
8. `direct` 路径是否确实绕过 CFNetwork、环境代理和 macOS 系统代理。
9. `credentials.json` 是否位于固定插件私有目录，并保持父目录 `0700`、文件 `0600`。
10. 是否意外引入 Keychain API、Keychain helper 或系统密码提示。
11. 如何在不打印密钥的前提下验证凭据写入、读取、保留和删除。

该技能应优先调用已有 native 合同测试、transport regressions 和只读进程检查，再决定是否需要修改代码。

## 4. `translation-provider-validation`

该技能适合未来增加新的 OpenAI-compatible 服务、模型或 Ollama 模型时复用。

建议包含：

- 安全读取被版本控制忽略的 provider fixture，不打印或持久化 API key。
- 区分 API root 和完整 `/chat/completions` URL。
- 验证模型 ID、认证、response format 和错误分类。
- OpenAI-compatible 请求固定在 API root 后追加 `/chat/completions`。
- Ollama 检查 `/api/version`、`/api/tags` 和 `/api/chat`。
- 验证短 wire ID、输出顺序、允许的 ID 集合以及 `minItems`/`maxItems`。
- 验证单 cue、双 cue、六 cue 拆分和聚合。
- 确认输入输出 cue 数量严格一致，避免 schema-valid 的空 translations 被当作成功。
- 禁止在日志、诊断和最终回复中显示 Authorization、API key、字幕正文或 provider 原始 body。

## 5. `acceptance-evidence-maintainer`

该技能用于维护验收记录的准确性，避免自动测试、实机测试和历史缺陷相互混淆。

建议包含：

- 将自动测试、IINA 实机测试、历史缺陷和当前发布结果分开记录。
- 只有真实执行过的项目才能标记为 PASS。
- 使用明确的状态语义：

  - `PASS`
  - `PASS / AUTOMATED`
  - `FAIL / FIXED`
  - `NOT RUN`
  - `NOT APPLICABLE`

- 更新 `tasks.md` 时，只关闭已经满足全部验收条件的任务。
- 记录版本、IINA 版本、产物哈希、cue 数量、helper PID 更替和未测试项。
- 版本回退或重发时保留历史版本证据，不机械替换历史内容。
- 永久删除等未实际执行的场景，应明确标记为自动化覆盖或仍待人工验证。

## 建议实施顺序

若只先实现一个技能，建议从 `iina-plugin-live-acceptance` 开始。该流程包含最多人工判断，最能避免“自动测试通过但 IINA 实际不可用”的问题。

之后依次实现：

1. `iina-plugin-live-acceptance`
2. `iina-plugin-release`
3. `iina-helper-diagnostics`
4. `translation-provider-validation`
5. `acceptance-evidence-maintainer`
