# 实施计划：GPL 许可与 v0.1.0 重发

**功能目录**：`005-gpl-license-release` | **日期**：2026-08-14 | **规格**：[spec.md](spec.md)

## 摘要

在仓库、元数据、README 和正式安装包中统一采用 `GPL-3.0-only`，随安装包保留 `@noble/hashes` 的 MIT 声明；扩展打包与归档审计契约，并以仅限已知旧身份的一次性 CI 模式替换远程 v0.1.0。完成替换后删除一次性模式，恢复已发布稳定版本只读跳过。

## 技术上下文

**语言/版本**：TypeScript 5.9、Node.js 24.18.0、npm 11、POSIX shell、Swift 6

**主要依赖**：Vitest 3.2、GitHub CLI、GitHub Actions、IINA 1.4.4 打包 CLI、`@noble/hashes` 2.3.0

**存储**：Git 仓库文件、`.iinaplgz` ZIP 归档、GitHub tag/Release/资产

**测试**：Vitest 合同测试、TypeScript 类型检查、ESLint、Swift 测试、归档审计与 native helper 验收

**目标平台**：macOS 12+、IINA 1.4+；发布构建使用 GitHub macos-15 arm64 runner

**项目类型**：IINA 桌面插件及其自动发布流水线

**性能目标**：不改变运行性能；发布审计在现有 Actions 时限内完成

**约束**：版本保持 0.1.0；许可证固定为 GPL-3.0-only；旧远程身份必须精确匹配后才能替换；失败关闭；生产代码不添加注释

**规模/范围**：根许可证与声明、README/元数据、打包/审计/发布脚本、CI 合同测试和发布文档；不改变插件运行时

## 宪法检查

- **验证与产品安全**：通过。打包契约和远程替换均有合同测试、八项门禁和最终远程核验。
- **生产代码无注释且默认仅使用英语**：通过。脚本中的新错误、字段和状态名使用英语且不添加代码注释。
- **敏感数据与外部副作用最小化**：通过。不触碰凭据或字幕；远程写入仅限用户指定的 GitHub Release。
- **可重建且最小的发布产物**：通过。许可证与第三方声明属于合规分发必需材料，其他白名单保持封闭。
- **生产代码只实现当前功能需求**：通过。一次性替换能力在完成后删除，不保留未来兼容路径。

设计后复核：通过。归档合同只增加两个明确根文件；替换接口只接受已知旧身份和当前审计材料，没有扩大插件产品行为。

## 项目结构

```text
LICENSE
THIRD_PARTY_NOTICES.txt
README.md
package.json
package-lock.json
scripts/
├── pack.sh
├── verify-package.sh
├── audit-release.mjs
└── publish-release.mjs
.github/workflows/release.yml
tests/contract/
├── release-metadata.test.ts
├── release-audit.test.ts
├── release-publish.test.ts
└── release-workflow.test.ts
specs/005-gpl-license-release/
```

**结构决策**：沿用现有单仓库插件与发布脚本结构，不新增运行时模块；一次性远程替换逻辑放在现有发布接口中并在成功后删除。

## 复杂度跟踪

无宪法例外。
