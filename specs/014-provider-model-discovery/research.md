# 研究：服务模型发现与凭据扩展

## 模型发现职责

- **决策**：新增独立的生产模型发现模块，输入 Service type、Endpoint、网络路线、可选 API Key 与 job ID，输出清洗后的 Model ID。翻译用 `ConfiguredProvider` 不增加 `listModels()`。
- **理由**：现有 OpenAI 与 Ollama Provider 构造都要求非空 Model ID，而新建表单必须能在 Model ID 尚未确定时发现目录；独立职责也便于直接测试无字幕 GET 请求。
- **备选方案**：让翻译 Provider 接受伪 Model ID 会削弱构造不变量；在 Sidebar 或 Main 直接联网会绕过 Global、helper、重定向与凭据边界。

## OpenAI 与 Ollama 目录协议

- **决策**：OpenAI 对规范化 API Root 去除尾斜杠后发送 `GET /models`，解析顶层 `data[].id`，完全忽略 `owned_by`。Ollama 对规范化 server root 发送 `GET /api/tags`，优先读取每项 `model`，缺失时回退同一项的 `name`。两者均可携带 Bearer，使用 Profile 的 system/direct 路线、10 秒超时和现有 1 MiB 响应上限。
- **理由**：这分别符合 [OpenAI Models API](https://developers.openai.com/api/reference/resources/models) 与 [Ollama List models](https://docs.ollama.com/api/tags)；Ollama 的 `name` 回退保持既有部署兼容。Ollama 官方也规定远程 API Key 使用 [Bearer Authorization](https://docs.ollama.com/api/authentication)。
- **备选方案**：按 `owned_by` 筛选会漏掉兼容服务或组织模型；同时收集 Ollama 的 `model` 与 `name` 可能让一个条目生成两个选项；内置模型列表违反响应驱动要求。

## Model ID 清洗

- **决策**：只接受字符串；对每个值 `trim()`，过滤空值，用区分大小写的集合按首次出现顺序精确去重，不排序、不改写标点、命名空间或版本标签。HTTP 成功且数组为空或全部条目无效是成功的空目录；无效 JSON 或顶层结构是协议失败。
- **理由**：该规则同时保持服务声明的精确身份、稳定顺序和可预测测试；成功空目录必须清空已知项，失败则保留上次成功目录。
- **备选方案**：大小写折叠、自然排序或别名规范化都会改变合法 ID；把空目录当失败会留下已被服务删除的模型。

## 运行期目录与请求所有权

- **决策**：Global 保存按完整发现上下文隔离的最近成功目录和凭据代次；Main 保存逐窗口目录快照、自动请求合并状态和最新请求身份；Sidebar 保存当前表单上下文、控件模式与模型区域反馈。Global 和 Main/Sidebar 均只接受仍属当前对象身份且上下文相等的结果。
- **理由**：Global 能在 IINA 启动时非阻塞预取已保存 Profile，并在 Profile/凭据变化时取消或拒绝失效请求；逐窗口 latest-only 状态则防止 Endpoint、Service type、Profile、网络路线和手动刷新竞态污染当前 UI。
- **备选方案**：只在 Sidebar 保存目录无法满足 IINA 启动预取；只在 Global 比较 Endpoint 无法表达逐窗口草稿和手动请求优先级；持久化目录会制造跨会话陈旧状态。

## 自动与手动刷新

- **决策**：Global 在恢复 Profile 后后台预取；Main 接受最新 Profile 列表时请求缺失或失效目录，并通过 Sidebar 可见边沿识别真正打开事件；Sidebar 初次载入、切换 Service/Profile、载入或重置编辑器时刷新有效上下文，Endpoint 输入在 400 毫秒稳定且格式有效后刷新。等价自动请求可合并；手动刷新总是创建新请求并取代重叠自动请求。
- **理由**：400 毫秒防抖避免逐字符网络请求，同时在 3 秒服务响应下为 5 秒呈现目标留有余量。`ui:ready` 也用于保存、凭据和删除后的重载，不能单独代表用户打开 Sidebar。
- **备选方案**：每次 input 都刷新会放大外部副作用；只依赖 `ui:ready` 会重复请求；固定周期轮询会产生无需求网络流量；自动请求不得吞掉用户明确发起的手动刷新。

## 凭据授权与 Ollama 扩展

- **决策**：刷新消息永不携带 API Key。只有请求中的 Profile ID、revision、kind、规范化 Endpoint、fingerprint 与网络路线全部匹配 Global 权威 Profile 时，Global 才从 helper 读取该 Profile 的密钥；新建或已修改但未保存的 Endpoint 只做匿名刷新。Ollama 复用现有 `apiKey` 字段和保存、替换、状态、删除生命周期，并在 `/api/version`、`/api/tags`、`/api/chat` 统一添加可选 Bearer。
- **理由**：密钥继续沿 Sidebar 保存 → Main 转发 → Global → helper 的单向路径；草稿地址不能获得另一个已保存 Endpoint 的密钥。现有存储已经按 Profile 隔离且只向 Sidebar 返回 `credentialConfigured`。
- **备选方案**：把表单密钥附在刷新消息上会增加敏感数据流；为 Ollama 建新存储或写入 preferences 会扩大安全和迁移范围；强制凭据会破坏无需认证的 Ollama。

## 凭据替换与旧 Provider

- **决策**：凭据写入成功后递增该 Profile 的运行期凭据代次，取消该 Profile 的发现、Test 与活动翻译请求，并清除全部 revision 的 Provider cache；随后按权威状态刷新。删除 Profile 同样清理目录、任务、代次和凭据。保存失败不改变代次，旧凭据仍为权威。
- **理由**：凭据按 Profile ID 而非 revision 存储；仅删除当前 revision cache 会让旧 revision Provider 继续持有旧 Key，也会允许旧目录结果误报成功。
- **备选方案**：为每个 revision 保存独立密钥会改变 native 存储与迁移契约，超出当前范围；保留活动旧 Provider 不符合替换后的权威凭据语义。

## Sidebar 模型控件

- **决策**：使用原生 `<select>` 展示响应模型及固定的 `Custom model ID…` 项，配合仅在自定义模式显示的必填文本输入；当前 Profile 始终只保存一个精确 Model ID。刷新按钮与选择框同排，具有可访问名称、`aria-busy` 和紧邻的 `role="status" aria-live="polite"` 反馈槽；模型区域参与既有全局单消息竞态。
- **理由**：原生 select 明确区分已知与自定义模式，键盘和屏幕阅读器行为可预测。目录更新只重分类当前值：仍在目录中显示为已知，已消失则显示为自定义，但绝不改值或自动选首项。
- **备选方案**：`datalist` 无法可靠区分已知/自定义；自制组合框增加无障碍复杂度；只保留文本框无法呈现服务端目录。

## OpenAI 名称与兼容数据

- **决策**：内部 `kind: "openai"`、Profile ID、revision、已保存 `displayName`、Endpoint、Model ID、fingerprint 和 `OpenAICompatibleProvider` 协议含义保持不变；当前 Service type 映射与新建 Profile 的系统默认名改为 `OpenAI`。历史 release notes 和既有验收记录不回写。
- **理由**：稳定内部标识避免数据迁移和网络语义变化；既有 metadata 没有记录名称来源，不能安全判断恰好等于 `OpenAI-compatible` 的名称是否由用户自定义，因此一律保留已保存名称。
- **备选方案**：修改内部 kind 会引入无必要迁移；按字符串迁移既有 `displayName` 可能覆盖用户选择；全仓替换会篡改历史。

## 网络披露与权限

- **决策**：更新 `Info.json`、根 README、全部当前本地化 README 和开发文档，明确“已配置或正在编辑的 Endpoint 可接收不含字幕的模型目录请求；只有用户明确 Select 的 Profile 才接收字幕”。权限集合、`allowedDomains: ["127.0.0.1"]` 和 native helper 不变。
- **理由**：自动启动/打开刷新在 Select 前产生新网络副作用，现有“只联系已选择服务”的披露不再准确；上游仍通过用户配置的 Endpoint 和既有 loopback helper，不需要扩大宿主权限。
- **备选方案**：不改披露违反宪法 III；让 WebView 直连或扩大 allowed domains 会破坏现有安全边界。

## 验证与发布边界

- **决策**：用生产模块的 Vitest 契约、单元、集成和安全测试覆盖协议、状态、凭据与竞态；运行现有 Swift transport 回归及八项构建/打包门禁；在 IINA 1.4.4 的当前候选包上由开发者一人验收启动、打开、多窗口、认证和播放行为。真实 Provider 测试保持显式 opt-in，配置只读取 `docs/providers`，不记录 Endpoint、Key 或响应正文。
- **理由**：自动化可证明确定性逻辑，但无法替代 IINA WebView 生命周期、正式安装和播放不阻塞。014 未指定发布版本，规划不能擅自提升版本、生成 release notes 或发布。
- **备选方案**：文档字符串断言不能证明生产行为；开发链接不能证明正式包；默认公网测试会引入凭据、成本和网络不稳定性。
