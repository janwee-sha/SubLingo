# 契约：Sidebar Profile 与操作反馈

## 权威删除

沿用现有成功消息：

```ts
type ProfileDeleted = {
  requestId: string;
  profileId: string;
  selectionInvalidated: boolean;
};
```

`profile:deleted` 只在取消相关翻译与 Test、删除凭据和全部 Profile revisions、清理 Provider cache 并持久化成功后发送。它是 Sidebar 即时移除的唯一权威事件。

- 成功：Main 立即过滤目标 Profile 和匹配选择，Sidebar 立即加入墓碑并移除条目，清理匹配编辑、凭据展示、Test 与 pending 状态；重复结果幂等。
- 取消：沿用原 request ID 的 `operation:result { ok: false, cancelled: true, action: "delete-profile" }`，保留 Profile 和全部业务状态。
- 失败：沿用原 request ID 的 `operation:error`，保留 Profile 和全部业务状态。
- 无关 Profile：选择、编辑、Test、pending 与反馈不得改变。

Main 只接受最新 `profiles:list` request ID 的结果；收到删除成功时必须先过滤当前快照，再请求新列表。Sidebar 对任何列表快照过滤当前 WebView 生命周期墓碑。删除前开始、删除后迟到的结果不得恢复条目。

## 删除成功结果槽

删除失败或取消在原 Profile 行操作区显示终态。成功时删除 Profile 内容与按钮，并仅在本窗口原列表位置保留：

```text
role="status" aria-live="polite" + 成功消息
```

结果槽不属于 Profile 集合，不可 Select、Edit、Test 或 Delete，不进入持久化。其他窗口因同一 Profile 被删除而收到无本地请求归属的成功事件时，只收敛业务状态，不创建无来源反馈。

## 反馈区域

| 操作 | 区域 |
| --- | --- |
| Translate 开关 | `translation-toggle` |
| Save Languages | `language-settings` |
| Profile Save/Update 与随后的 Credential 终态 | `profile-editor` |
| Profile Select/Test/Delete | `profile-row:<profileId>` |
| Subtitle Retry | `subtitle-retry` |

每个区域在对应操作控件正下方提供独立 `role="status" aria-live="polite"`。Profile 列表容器不得与行内状态形成重复播报。Sidebar 在发送消息时建立 request→region/action 关联；Main/Global 消息不增加 region 字段。

`sidebar-state.ts` 必须先于 `sidebar.ts` 以 classic script 加载并暴露全局工厂；不得把 Sidebar 改为 module script。状态工厂不得访问 DOM，使 Vitest 可直接执行同一生产转换。

- 同一区域只有最新 request 可更新 busy 或终态消息。
- 新请求取代旧请求时，旧控件不得继续表现为该区域当前 busy；旧请求最终返回时可以完成自身清理，但不得覆盖新消息。
- 未知、重复或迟到结果不得改变当前反馈。
- 不同区域可并行更新且互不覆盖。
- Profile 行重绘必须按 action identity 恢复 busy/idle 和反馈，不保存旧 DOM 引用。
- 权威业务状态与反馈分离；Main 的选择/删除快照仍可收敛，但无归属的旧结果不产生消息。

## Profile Test

Test 结果必须匹配 request ID、Profile ID、revision 和当前 Profile 行最新请求后才能更新 Test 状态。删除或 revision 更新会使旧结果失效。Test 成功精确显示：

`Connection test passed. Select this profile for translation.`

Test 不创建选择、不授权字幕外发，也不改变其他窗口。

## Profile Save/Update

Profile revision 创建与可选 Credential 保存可以沿用同一 request ID。Sidebar 必须保留本次 `selectionInvalidated`，直到整个两段式操作结束。更新使选择失效时，无论是否同时保存新凭据，最终成功消息都精确为：

`Profile updated. Select it again for translation.`

普通 Save、Credential 失败和 revision 失败继续使用各自既有安全结果分类。生产用户文案不得包含 `to authorize translation`。

## Profile 默认名称

- 初始、New 或 Reset：名称来源为 `system`，值等于当前 Service type `<option>` 的可见文本。
- `system` 状态切换 Service type：值跟随新可见名称。
- 任意用户 input：来源变为 `user`；清空、空白或输入与默认相同的文本也不得再自动覆盖。
- 载入既有 Profile：来源为 `saved`，切换 Service type 不覆盖保存名称。
- 再次 New profile：恢复 `system`。

保存发送输入的实际 trim 值，不使用 Sidebar 通用回退名；空白继续由下游既有名称处理。不得把 placeholder 当成输入。

## 数据边界

Profile View 继续只暴露 `credentialConfigured`。反馈、墓碑、pending 状态和结果槽不得包含凭据值、Authorization、完整 endpoint、字幕、译文或 Provider 原始响应。
