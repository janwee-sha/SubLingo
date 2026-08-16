# SubLingo 开发指南

SubLingo 是面向 IINA 1.4+ 的实时双语字幕插件。本文档供开发者构建、测试、打包和验收插件；产品功能、安装和配置说明见[用户 README](../../README.md)。

## 开发环境

- macOS 12 或更高版本
- IINA 1.4.0 或更高版本
- Node.js 24、npm 11
- Swift 6 工具链

安装锁定依赖：

```sh
npm ci
```

## 构建与自动化检查

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

主要命令的职责如下：

- `npm run test`：运行 TypeScript 自动化测试。
- `npm run typecheck`：检查插件运行时和 Sidebar 的 TypeScript 类型。
- `npm run lint`：运行 ESLint。
- `npm run build:native`：构建 universal Swift transport helper。
- `npm run test:native`：运行 native helper 测试。
- `npm run build`：构建插件运行时代码和 Sidebar。
- `npm run verify:package`：检查待打包内容。
- `npm run pack`：生成 `build/package/SubLingo-0.1.0.iinaplgz`。

## IINA 开发链接

使用 IINA 自带的插件 CLI 创建开发链接：

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin link .
```

`link` 创建 `.iinaplugin-dev` 开发链接。IINA 对开发链接禁用“卸载”按钮是预期行为；移除链接时运行：

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin unlink .
```

## 正式包验收

验收正式安装包前，先移除当前 workspace 的开发链接，再打开打包产物：

```sh
/Applications/IINA.app/Contents/MacOS/iina-plugin unlink .
open build/package/SubLingo-0.1.0.iinaplgz
```

重启 IINA，在“设置 → 插件”中启用 SubLingo，并从播放器侧边栏打开插件。正式 `.iinaplgz` 安装项必须可以从插件管理面板卸载；不要同时保留同一版本的正式安装项和开发链接。

需要实机验证的安装、卸载、权限、多窗口和播放行为，应按以下记录执行：

- [自动化验证](../validation/automated.md)
- [打包验证](../validation/package.md)
- [IINA 版本矩阵](../validation/iina-matrix.md)

## 架构与安全边界

- 插件读取当前选中的外部 SRT/ASS 文本字幕，并将译文显示为由插件管理的 IINA 第二字幕轨。
- OpenAI-compatible 和 Ollama 请求由受限 Swift helper 发出；插件运行时只连接 helper 的 `127.0.0.1` 临时端口。
- OpenAI-compatible 凭据由 helper 写入插件私有数据目录的 `credentials.json`；目录权限为 `0700`，文件权限为 `0600`。凭据不得进入 preferences、日志、诊断、进程参数或安装包。
- 翻译结果仅缓存在当前视频会话中。换片、播放结束或关窗时清理，不写入持久缓存。
- 远程 Provider 只允许 HTTPS；loopback Ollama 可以使用 HTTP。每个 Profile 可选择 macOS 系统代理或明确直连。
- 原字幕和视频播放不得因翻译延迟或失败而暂停。

详细设计和契约见当前 SDD 产物：

- [实时字幕翻译](../../specs/001-realtime-subtitle-translation/spec.md)
- [渐进翻译输出](../../specs/002-progressive-translation-output/spec.md)
- [Provider 连接生命周期](../../specs/003-provider-connection-lifecycle/spec.md)
- [自动 GitHub Release](../../specs/004-automatic-github-release/spec.md)

所有变更必须遵守[项目宪法](constitution.md)和仓库根目录的 `AGENTS.md`。
