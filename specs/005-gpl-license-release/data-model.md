# 数据模型：GPL 许可与 v0.1.0 重发

## LicenseIdentity

- `spdx`：固定 `GPL-3.0-only`。
- `licenseFile`：仓库根 `LICENSE`，内容为标准 GNU GPL v3 全文。
- `readmeBadge`：显示 `License: GPL v3` 并链接本仓库许可文件。

## PackageComplianceFiles

- `LICENSE`：项目许可全文，归档根必需普通文件。
- `THIRD_PARTY_NOTICES.txt`：`@noble/hashes 2.3.0` 名称、版权与 MIT 全文，归档根必需普通文件。
- 两个文件与仓库根源文件逐字一致；缺失或额外根条目均为无效归档。

## ReplacementGuard

- `tag`：固定 `v0.1.0`。
- `oldCommit`：固定 `ef15570911d180c139e77f5d38dc0a5169ba4235`。
- `oldArtifactName`：固定 `SubLingo-0.1.0.iinaplgz`。
- `oldArtifactSha256`：固定 `4b023319072a48a47fff13c77e9c838c087bc32f1aaea68bd48dd1daf2d15b13`。
- `expectedCommit`：本次 Actions 触发提交。
- 状态：`verify-old` → `remove-old-release` → `remove-old-tag` → `create-draft` → `verify-assets` → `publish` → `verify-latest`。
- 任一旧身份校验失败时保持 `verify-old` 且无远程写入；公开前失败时不返回成功状态。

## ReleaseIdentity

- 沿用现有 `version`、`tag`、`commit`、`artifactName`、`byteSize`、`sha256`、门禁、归档清单和两份 helper 属性。
- `entries` 新增且要求 `LICENSE`、`THIRD_PARTY_NOTICES.txt`。
- 成功状态仍要求公开、非 prerelease、tag 指向触发提交且为 Latest。
