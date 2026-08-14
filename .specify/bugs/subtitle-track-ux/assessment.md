# 缺陷评估：生成字幕轨切换干扰

- **Slug**：subtitle-track-ux
- **创建日期**：2026-08-14
- **来源**：用户粘贴描述及 `docs/manual-test-recording/` 下的截图、录屏
- **结论**：valid
- **严重程度**：medium

## 报告

翻译首次输出会短暂显示为第一字幕，随后才移到第二字幕；渐进输出期间频繁切换字幕轨，且过长的生成轨道标识符遮挡第二字幕。

证据：

- `docs/manual-test-recording/2nd-subtitle-misplaced.png`
- `docs/manual-test-recording/subtitle-track-identifier-too-long.png`
- `docs/manual-test-recording/local-ollama-profile-08131423.mov`

## 症状

播放中每次发布译文快照都会加载并选中一个新的外挂 SRT，导致译文先占用主字幕位置，再被重新指定为第二字幕；轨道切换提示使用包含 player、session 和 revision 的长文件名并遮挡画面。预期是原字幕始终保持主轨，译文直接进入第二字幕，生成轨道具备简短稳定的显示名称。

## 复现

1. 在 IINA 中播放视频并手动加载、选择原字幕。
2. 启用 SubLingo，选择可产生渐进结果的翻译 Profile。
3. 等待首个及后续译文快照发布。
4. 观察首个译文短暂位于第一字幕、随后移到第二字幕，并在后续发布时出现长轨道标识符提示。

## 疑似代码路径

- `src/adapters/iina/subtitle-track.ts:42` — 每次 `swap` 都创建、加载、选中并删除一条新字幕轨。
- `src/adapters/iina/subtitle-track.ts:48` — 生成文件名包含完整 player、session 和 revision，直接成为无标题轨道的显示标识符。
- `src/adapters/iina/subtitle-track.ts:80` — 每轮连续三次重写主字幕和第二字幕选择，放大切轨干扰。
- `src/adapters/iina/subtitle-track.ts:149` — `loadTrack` 按 IINA/MPV 默认行为立即选中新轨道为主字幕。
- `tests/integration/subtitle-track.test.ts:48` — 现有覆盖确认最终选择正确，但未约束加载时不抢主轨、短标题及避免冗余选择写入。

## 根因假设

置信度：高。IINA 的 `loadTrack` 对应 mpv 默认 `sub-add ... select`，而 mpv 官方契约规定 `sub-add` 默认立即选择新字幕；当前代码只能在加载完成后恢复原主轨并设置第二轨。渐进快照反复执行同一流程，长临时文件名又未通过 `sub-add` 的 `title` 参数覆盖，因此产生截图所示的错位和提示。`sub-add ... auto` 可在已有主轨时避免选择新轨，并允许用固定短标题标识轨道。

## 建议修复

**首选**：由 IINA port 使用 mpv `sub-add` 的 `auto` 标志加载生成字幕，并传入短标题 `SubLingo`。轨道管理器只在当前值不符合预期时写入 `sid` 或 `secondary-sid`，保留短暂稳定性检查以处理异步宿主状态，但不再每轮无条件重复切换。

不采用 `sub-reload`：mpv 官方实现会卸载、重新添加轨道并把新轨道切为主字幕，无法满足第二字幕无错位的目标。

**可能修改的文件**：

- `src/adapters/iina/subtitle-track.ts`
- `tests/integration/subtitle-track.test.ts`

**需要新增或更新的测试**：

- 生成字幕通过 `sub-add <path> auto SubLingo` 加载，不调用会默认选中的 `loadTrack`。
- 加载未改变主轨时不写入 `sid`，只将新轨设为第二字幕。
- 宿主异步误选新轨时仍恢复原主轨，但稳定状态不产生重复选择写入。
- 后续快照保持主轨不变并移除旧生成轨。

## 风险与考虑

- 绕过 IINA `loadTrack` 的额外宿主检查；仅用于插件自行生成并已解析为绝对路径的本地 SRT，边界有限。
- IINA 实际事件时序无法由纯单元测试完整证明，需要在 IINA 1.4.4 中人工验收首次输出及连续渐进输出。
- 不改变翻译、缓存、文件清理或用户字幕轨所有权契约。

## 待确认问题

无。
