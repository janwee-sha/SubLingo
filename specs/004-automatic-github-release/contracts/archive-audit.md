# 最终归档审计契约

## 输入

- 已通过现有 `scripts/pack.sh` 生成的 `.iinaplgz`。
- 发布元数据脚本确认的版本与产物名。
- 触发工作流的精确 commit SHA。
- 八项门禁全部通过的结构化状态。
- `dist/native/sublingo-transport` 构建文件。

## ZIP 安全边界

1. 任何条目都不得使用绝对路径、反斜线、空段、`.`、`..`、NUL 或盘符路径。
2. 条目名不得在大小写不敏感比较后重复，不得加密或表示符号链接。
3. 根目录只允许 `Info.json`、`README.md` 与 `dist/`；三个类别均必须存在。
4. `dist/` 内拒绝源码、测试、规格、依赖树、构建缓存、运行时目录、日志、source map、环境文件、凭据、证书私钥和密钥材料。
5. 先完成上述中央目录校验，再解包到唯一临时目录；无论成功或失败都只清理该临时目录。

## 版本与 native helper

- 文件名必须为 `SubLingo-X.Y.Z.iinaplgz`，包内 `Info.json.version` 必须等于发布元数据版本。
- 构建文件和包内 `dist/native/sublingo-transport` 必须分别包含 `arm64` 与 `x86_64`，具有可执行权限，并通过 `codesign --verify --strict`。
- 包内 ZIP 模式和解包后的文件模式都必须保留可执行位。

## 输出

- 原始安装包的同名副本。
- `<安装包名>.sha256`，内容为小写 SHA-256、两个空格和安装包文件名。
- `release-notes.md`，使用中文记录 commit、包内版本、大小、SHA-256、八项门禁、归档清单和两份 helper 属性，并明确 CI 未覆盖 IINA GUI 安装、卸载和播放。
- `release-audit.json`，供发布任务和 Actions 日志核对，不作为正式下载资产。

任一检查失败时不得生成可发布输出。
