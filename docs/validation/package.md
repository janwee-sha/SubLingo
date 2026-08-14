# 正式包验证

## 权威证据

每个自动发布版本的权威证据由以下内容共同构成：

- GitHub Release 中文正文：触发 commit、包内版本、精确大小、SHA-256、八项门禁、完整归档清单及两份 native helper 验收结果。
- `SubLingo-X.Y.Z.iinaplgz.sha256`：正式安装包的可下载校验文件。
- 对应 GitHub Actions 日志：固定环境、IINA 下载校验、八项门禁、最终归档审计和发布任务结果。

workflow 不为逐版本证据修改、提交或推送仓库文件，避免产生递归 `main` 触发。Git 历史、Release 和 Actions 记录承担版本历史；本文只描述当前验证契约。

## 自动发布门禁

发布流程必须严格依次通过：

```text
npm run test
npm run typecheck
npm run lint
npm run build:native
npm run test:native
npm run build
npm run verify:package
npm run pack
```

随后直接审计最终 `.iinaplgz`，确认版本与产物名一致、根目录只有 `Info.json`、`README.md` 和 `dist/` 运行材料，不包含敏感、运行时或开发文件，也不存在路径穿越、重复路径或符号链接。

`dist/native/sublingo-transport` 构建文件与包内文件必须分别包含 `arm64` 和 `x86_64`、保留可执行权限并通过严格签名验证。

## IINA 宿主边界

GitHub Actions 不打开 IINA 图形界面，因此 Release 正文必须明确以下状态：

- 真实安装：CI 未覆盖。
- 真实卸载：CI 未覆盖。
- 实际播放：CI 未覆盖。

这些宿主行为不得标记为已验证，但不阻塞自动正式 Release。用户执行正式包人工验收时，应使用 Release 中的 `.iinaplgz`，并以版本或 SHA-256 关联结果；开发链接不能替代正式包证据。
