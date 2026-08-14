# 缺陷验证：生成字幕轨切换干扰

- **Slug**：subtitle-track-ux
- **测试日期**：2026-08-14
- **评估**：./assessment.md
- **修复**：./fix.md
- **结果**：partial

## 摘要

修复相关测试、全量回归、静态检查和正式包校验全部通过，未发现自动化回归。原始症状依赖 IINA 1.4.4 的字幕渲染与 OSD，尚未执行实机播放复现，因此不能判定为端到端已验证。

## 已执行检查

| 检查 | 命令或操作 | 结果 | 说明 |
|---|---|---|---|
| 修复后复现 | 在 IINA 1.4.4 中安装正式包并按评估步骤播放 | not-run | 需要用户在真实 IINA 宿主中观察首次落位、连续输出和 OSD |
| 新增或更新测试 | `npm test -- tests/integration/subtitle-track.test.ts tests/integration/progressive-translation.test.ts` | pass | 2 个文件、20 项测试通过 |
| 全量回归 | `npm test` | pass | 162 项通过，2 项 live provider 测试按配置跳过 |
| 类型检查 | `npm run typecheck` | pass | plugin 与 webview TypeScript 检查通过 |
| 代码规范 | `npm run lint` | pass | ESLint 通过 |
| 正式包校验 | `npm run verify:package` | pass | 架构、签名、包结构和敏感材料检查通过 |
| 正式包一致性 | 对归档及其中 `dist/main.js` 计算 SHA-256 | pass | 包哈希与修复报告一致，归档 bundle 与当前构建一致 |

## 输出摘录

```text
Test Files  2 passed (2)
Tests  20 passed (20)

Test Files  34 passed | 1 skipped (35)
Tests  162 passed | 2 skipped (164)

Package verification passed
a5be908b81f06e1e669cb38d26d517a6bfd86fb312118d26f09aa093864a527c  build/package/SubLingo-0.1.0.iinaplgz
531aa8d3d042ed461b7160c2d407d5adbb32f298159d9597bafff89d71de4d68  dist/main.js in archive
```

## 剩余风险

- 自动化端口能证明 `sub-add auto SubLingo`、按需轨道选择和异步恢复，但不能证明 IINA 实际字幕位置及 OSD 是否无闪现。
- 尚未确认正式包安装后字幕菜单显示短标题 `SubLingo`，也未观察连续渐进输出。

## 建议

暂不关闭缺陷。请在 IINA 1.4.4 中安装 SHA-256 为 `a5be908b81f06e1e669cb38d26d517a6bfd86fb312118d26f09aa093864a527c` 的正式包，按评估步骤确认首条译文直接显示为第二字幕、连续输出无切轨提示且轨道名为 `SubLingo`；获得实机结果后再将验证结论更新为 `verified` 或 `failed`。
