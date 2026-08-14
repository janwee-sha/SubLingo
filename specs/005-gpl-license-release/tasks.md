# 任务：GPL 许可与 v0.1.0 重发

**输入**：`specs/005-gpl-license-release/` 中的设计产物

**测试要求**：打包与远程发布契约变更必须先增加自动化合同测试，再实现脚本行为。

## 阶段 1：治理与授权基础

- [X] T001 修订 `docs/engineering/constitution.md` 与 `.agents/skills/iina-plugin-release/SKILL.md`，允许并要求发布包携带合规材料
- [X] T002 在 `LICENSE` 添加标准 GPL v3 全文，并在 `package.json`、`package-lock.json` 设置 `GPL-3.0-only`
- [X] T003 [P] 在 `README.md` 顶部添加指定样式的 GPL v3 徽章链接
- [X] T004 [P] 在 `THIRD_PARTY_NOTICES.txt` 保存 `@noble/hashes 2.3.0` 的 MIT 版权与全文

---

## 阶段 2：用户故事 1——确认项目许可（P1）

**目标**：仓库入口、全文和元数据一致表达 GPL-3.0-only。

**独立测试**：合同测试读取所有许可入口并确认固定 SPDX、徽章样式与本仓库链接。

- [X] T005 [US1] 在 `tests/contract/release-metadata.test.ts` 增加许可元数据与 README 徽章合同测试
- [X] T006 [US1] 扩展 `scripts/release-metadata.mjs` 校验许可证文件、包元数据和 README 入口（FR-001、FR-002、SC-001）

---

## 阶段 3：用户故事 2——获得合规安装包（P2）

**目标**：最终安装包携带项目许可和随包第三方声明，且审计继续失败关闭。

**独立测试**：归档合同接受且要求两个根许可文件，并拒绝缺失、额外和不安全条目。

- [X] T007 [US2] 在 `tests/contract/release-audit.test.ts` 增加许可根文件必需性和归档清单测试
- [X] T008 [US2] 更新 `scripts/pack.sh` 与 `scripts/verify-package.sh` 复制并逐字校验许可文件（FR-003、FR-004）
- [X] T009 [US2] 更新 `scripts/audit-release.mjs` 的根白名单、必需项和仓库源文件一致性校验（FR-003、FR-004、SC-002）

---

## 阶段 4：用户故事 3——替换 v0.1.0 正式发布（P3）

**目标**：通过一次性失败关闭的 CI 模式，用当前许可提交替换已知旧 v0.1.0。

**独立测试**：旧身份匹配时产生替换计划；任一身份或模式不匹配时无写入拒绝；成功状态与普通跳过状态可区分。

- [X] T010 [US3] 在 `tests/contract/release-publish.test.ts` 增加一次性替换身份、操作顺序和失败关闭测试
- [X] T011 [US3] 在 `tests/contract/release-workflow.test.ts` 增加仅 v0.1.0 可启用的一次性 CI 输入合同
- [X] T012 [US3] 扩展 `scripts/publish-release.mjs` 实现旧 tag/资产哈希校验、删除旧对象并重建当前 draft（FR-005–FR-009）
- [X] T013 [US3] 更新 `.github/workflows/release.yml` 传入固定旧身份和一次性替换开关（FR-005–FR-008）

---

## 阶段 5：文档、验证与远程交付

- [X] T014 更新 `docs/plans/production_plan.md`，记录 GPL-3.0-only 已选定并移除许可证缺口
- [X] T015 运行 `specs/005-gpl-license-release/quickstart.md` 中的八项门禁、归档审计和 helper 验收
- [ ] T016 提交并推送许可发布提交，等待并核验远程 v0.1.0 Release、tag、资产与 Latest 状态
- [ ] T017 删除 `scripts/publish-release.mjs`、`.github/workflows/release.yml` 和相关测试中的一次性替换能力，恢复稳定版本只读跳过
- [ ] T018 提交并推送清理提交，确认后续工作流不会再次替换 v0.1.0

## 依赖与顺序

- T001–T004 完成后才能执行用户故事任务。
- US1 与 US2 的测试和实现按编号顺序执行；US3 依赖 US2 能生成新的合规安装包。
- T015 依赖所有本地实现完成；T016 必须在 T017 之前完成远程替换；T018 是最终稳定性验收。
- T003 与 T004 修改不同文件且无未完成同级依赖，可并行；其余任务涉及发布热点文件或真实顺序，不并行。

## 实施策略

先完成仓库授权和合规归档，再加入受控远程替换。只有本地全部门禁通过才推送替换提交；远程成功后立即删除一次性能力并用第二个提交验证默认只读策略。
