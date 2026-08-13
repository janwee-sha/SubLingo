# 翻译服务频繁创建连接且不释放

## 状态

已关闭（2026-08-14）。

## 关闭依据

- 根因是远程 OpenAI-compatible 网关将内容变化的字幕请求识别为不同活动会话，导致会话数持续增长并触发 429；运行期现为每个 Provider 实例复用稳定的 `X-Session-Id`，传输连接也受统一并发上限约束。
- 自动化测试、原生测试和正式包信息见 [`package.md`](../validation/package.md)。
- IINA 正式安装包人工验收 T023 已通过，见 [`iina-matrix.md`](../validation/iina-matrix.md)。

## 场景描述：

1. 打开一段长视频并加载外挂字幕，然后选择 OpenAI-compatible Profile 执行翻译工作；
2. SubLingo 正常翻译1至2分钟左右，第二字幕有输出；
3. 随后第二字幕不再输出翻译结果；
4. 测试 Profile，仍旧响应连接正常，第二字幕仍旧无输出；
5. 在 Profile 连接的上游通过 OmniRoute 提供的 Provider 中测试响应“错误: Server busy — 20 active connections (limit 20). Retry after 30s.”；
6. 返回测试 SubLingo 中的 Profile 仍旧连接正常，第二字幕仍旧无输出；
7. 重启 IINA 重新测试 Profile，响应“The service returned HTTP 429. Check service health or try a different network route.”的异常。
8. 等待一段时间后，测试 Profile 响应连接成功，选择 Profile 后第二字幕正常输出。
