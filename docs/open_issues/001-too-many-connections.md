# 翻译服务频繁创建连接且不释放

## 场景描述：

1. 打开一段长视频并加载外挂字幕，然后选择 OpenAI-compatible Profile 执行翻译工作；
2. SubLingo 正常翻译1至2分钟左右，第二字幕有输出；
3. 随后第二字幕不再输出翻译结果；
4. 测试 Profile，仍旧响应连接正常，第二字幕仍旧无输出；
5. 在 Profile 连接的上游通过 OmniRoute 提供的 Provider 中测试响应“[ 错误: Server busy — 20 active connections (limit 20). Retry after 30s.]”；
6. 返回测试 SubLingo 中的 Profile 仍旧连接正常，第二字幕仍旧无输出；
7. 重启 IINA 重新测试 Profile，响应“The service returned HTTP 429. Check service health or try a different network route.”的异常。
8. 等待一段时间后，测试 Profile 响应连接成功，选择 Profile 后第二字幕正常输出。