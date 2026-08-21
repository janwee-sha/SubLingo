# 契约：模型刷新消息

所有 Sidebar 请求使用既有严格 envelope：

```json
{
  "requestId": "models:<window-scope>:<sequence>",
  "revision": 1,
  "payload": {}
}
```

未知字段必须拒绝；以下结构中的 `endpoint` 只用于请求并不得进入反馈或日志。

## Sidebar → Main → Global

消息名：`provider:models`

```json
{
  "requestId": "models:window-a:4",
  "revision": 1,
  "payload": {
    "trigger": "manual",
    "kind": "ollama",
    "endpoint": "https://service.example/api",
    "proxyMode": "system",
    "profileId": "optional-uuid",
    "profileRevision": 3,
    "endpointFingerprint": "optional-opaque-value"
  }
}
```

- `trigger` 为 `open`、`endpoint`、`profile`、`credential` 或 `manual`；`startup` 只用于 Global 内部。
- Profile 三字段必须同时存在或同时省略。
- API Key、Authorization、模型选择、字幕、译文、播放位置和原始 Provider 数据不得出现。
- Main 绑定发送窗口身份后原样转发；Global 不信任客户端 Profile 字段，只用它们验证能否读取权威凭据。

## Global → Main → Sidebar 成功

消息名：`provider:models-result`

```json
{
  "requestId": "models:window-a:4",
  "ok": true,
  "contextKey": "opaque-context",
  "models": ["model-a", "namespace/model:b"]
}
```

- `models` 已按 [模型目录契约](./model-directory.md) 清洗，可以为空。
- `contextKey` 是不含密钥的上下文摘要；Main 与 Sidebar 仍必须同时核对 request ID 和当前上下文。
- Main 只把结果写入所属窗口缓存，并等待活动 WebView 的 `ui:poll` 安全送达。

## Global → Main → Sidebar 失败

消息名：`provider:models-result`

```json
{
  "requestId": "models:window-a:4",
  "ok": false,
  "contextKey": "opaque-context",
  "category": "authentication",
  "retryable": false,
  "statusCode": 401,
  "code": "optional-safe-code",
  "userAction": "CHECK_CREDENTIALS"
}
```

失败结构不得含 `models`；接收方保留当前 Model ID、Custom 能力和上次成功目录。未知、重复、取消、旧上下文、旧 Profile revision、旧凭据代次和非最新请求均不得改变目录或反馈。

## 启动与 Profile 快照

Global 启动预取不需要 player 消息。Main 请求 Profile 列表时，每个安全 Profile view 可选携带：

```json
{
  "modelCatalog": {
    "contextKey": "opaque-context",
    "models": ["model-a"]
  }
}
```

该字段只能来自当前权威上下文最近一次成功目录；凭据或目录错误不得进入 Profile view。Main 对缺失或失效目录触发非阻塞自动请求，等价自动请求可以合并。
