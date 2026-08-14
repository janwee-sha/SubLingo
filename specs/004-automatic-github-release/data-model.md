# 数据模型：自动 GitHub Release

本功能不新增持久化产品数据。以下实体只存在于发布脚本、GitHub Actions 运行或 GitHub Release 服务中。

## ReleaseIdentity

- `version`：稳定 SemVer `X.Y.Z`。
- `tag`：`vX.Y.Z`。
- `commit`：触发工作流的 40 位 commit SHA。
- `artifactName`：`SubLingo-X.Y.Z.iinaplgz`。
- `checksumName`：`SubLingo-X.Y.Z.iinaplgz.sha256`。

五个项目版本位置必须先收敛为同一个 `version`。新版本一旦公开，tag、Release 和资产均不可修改；后续相同版本只进入 `published -> skipped`。

## ArchiveAudit

- `identity`：对应的 `ReleaseIdentity`。
- `packageVersion`：从归档内 `Info.json` 读取。
- `byteSize` 与 `sha256`：最终归档的精确大小和哈希。
- `entries`：ZIP 中央目录中的完整条目集合。
- `buildHelper` 与 `packageHelper`：各自的架构、权限和签名摘要。
- `gates`：八项门禁的通过状态。

只有所有字段验证通过才生成校验文件、审计 JSON 和中文 Release 正文。该实体只写入 `build/`、workflow artifact、Release 正文和 Actions 日志。

## ReleaseDraft

- `releaseId`：GitHub draft Release 身份。
- `tag` 与 `targetCommit`：必须与 `ReleaseIdentity` 一致。
- `body`：必须与当前 `ArchiveAudit` 生成的正文一致。
- `assets`：按名称保存远端资产 ID、大小和下载内容哈希。
- `state`：`absent`、`draft`、`published` 或 `conflict`。

**状态转换**：

```text
absent -> draft -> published
draft -> draft
published -> skipped
absent/draft -> conflict
```

- `absent -> draft`：创建非公开 Release；若 tag 已存在，必须先验证其提交。
- `draft -> draft`：同版本和提交恢复；相同资产复用，缺失资产上传。
- `draft -> published`：正文和两项资产全部一致后公开并标记 Latest。
- `published -> skipped`：完整门禁已在构建任务中完成，发布任务不写任何对象。
- `conflict`：tag、target commit、正文、资产名或资产内容冲突；无写入和覆盖恢复路径。
