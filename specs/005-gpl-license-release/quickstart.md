# 快速验证：GPL 许可与 v0.1.0 重发

## 本地验证

1. 确认 `LICENSE`、`package.json`、`package-lock.json` 与 README 徽章统一为 `GPL-3.0-only`。
2. 依次运行：

```sh
npm run test
npm run typecheck
npm run lint
npm run build:native
npm run test:native
npm run build
npm run verify:package
npm run pack
```

3. 运行最终归档审计，确认清单含 `LICENSE` 与 `THIRD_PARTY_NOTICES.txt`。
4. 解包正式归档，分别核验构建文件和包内 helper 的架构、可执行权限与签名。

## 远程替换验证

1. 在删除前核对旧 v0.1.0 tag commit 与旧安装包 SHA-256。
2. 推送包含一次性替换模式的许可提交，观察 Automatic Release 八项门禁和发布审计全部通过。
3. 核对远程 tag 指向触发提交、Release 为公开稳定 Latest、正文和两项资产与审计一致。
4. 下载远程安装包，确认 SHA-256 与 Release 正文一致且归档包含两份许可文件。
5. 推送移除一次性模式的清理提交，确认工作流对 v0.1.0 只读跳过。

## 人工宿主验收

使用最终 `.iinaplgz` 在 IINA 1.4+ 完成安装、启用、播放和卸载。未执行前保持四项结果为未覆盖，不用 CI 结果代替。
