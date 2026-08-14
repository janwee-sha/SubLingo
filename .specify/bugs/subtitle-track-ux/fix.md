# 缺陷修复：生成字幕轨切换干扰

- **Slug**：subtitle-track-ux
- **修复日期**：2026-08-14
- **评估**：./assessment.md
- **状态**：applied

## 摘要

生成字幕改为通过 mpv 以非选中模式加载，并使用固定短标题 `SubLingo`。轨道协调只在选择不符合预期时写入属性，避免译文首次抢占主字幕及稳定状态下的重复切轨。

## 变更

| 文件 | 变更 | 说明 |
|---|---|---|
| `src/adapters/iina/subtitle-track.ts` | 修改 | 使用 `sub-add ... auto SubLingo`，按需校正主轨和第二轨，并缩短异步稳定等待 |
| `tests/integration/subtitle-track.test.ts` | 更新测试 | 覆盖非选中加载、短标题、主轨零冗余写入及异步误选恢复 |

## 测试新增或更新

- `adds a non-selected generated subtitle with a short track title` — 固定 `sub-add` 的绝对路径、`auto` 标志和短标题。
- `replaces the generated track while preserving the primary subtitle` — 固定正常发布期间不写 `sid`，每个快照只选择一次新第二轨。
- `reasserts the second track after IINA asynchronously selects it as primary` — 固定宿主异常时序下的延迟恢复。

## 本地验证

- `npm test -- tests/integration/subtitle-track.test.ts tests/integration/progressive-translation.test.ts` → 20 项通过。
- `npm run typecheck` → 通过。
- `npm run lint` → 通过。
- `npm test` → 162 项通过，2 项按配置跳过；需要本机回环端口的测试在沙箱外运行。
- `npx prettier --check src/adapters/iina/subtitle-track.ts tests/integration/subtitle-track.test.ts .specify/bugs/subtitle-track-ux/assessment.md` → 通过。
- `npm run build` → 通过。
- `npm run build:native`、`npm run test:native` → universal helper 构建、签名检查及契约测试通过。
- `npm run verify:package`、`npm run pack` → 通过；正式包 SHA-256 为 `a5be908b81f06e1e669cb38d26d517a6bfd86fb312118d26f09aa093864a527c`。
- IINA 1.4.4 实机检查 → 待用户按交付步骤验收。
- 全库 `npm run format:check` → 未通过，仅报告本次未修改的 `docs/plans/feature_plan.md`、`docs/plans/production_plan.md`、`docs/validation/iina-matrix.md`。

## 与评估的偏差

无。

## 后续

- 在 IINA 1.4.4 中验证首次译文直接显示为第二字幕、连续渐进输出不出现切轨提示，并确认字幕菜单显示短标题 `SubLingo`。
