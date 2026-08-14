# SubLingo 互联网发布方案

**结论日期**：2026-08-14

**交付轨道**：完整 SDD

## 结论

IINA 当前没有具备搜索、评分、支付和自动上架后台的独立插件市场。最接近官方市场的入口是
[`iina/iina` 仓库中的插件清单](https://github.com/iina/iina#iina-plugins-list)，其中分别列出官方插件和社区插件。

SubLingo 应采用以下组合发布方式：

- 以 GitHub 公共仓库和 GitHub Releases 作为唯一权威下载、版本与更新来源；
- 向 IINA 官方仓库提交 PR，将 SubLingo 加入社区插件清单，作为主要发现入口；
- 通过爱发电接受中国大陆用户的自愿打赏，通过 Ko-fi 接受海外用户的自愿打赏；
- itch.io 只作为可选的展示或下载镜像，不作为权威安装和更新来源；
- 打赏不解锁功能、不提供差异化安装包，也不包含翻译模型额度。

## IINA 插件分发方式

[IINA 官方文档](https://docs.iina.io/pages/creating-plugins)支持两种安装方式：

1. 用户在 IINA 中输入 GitHub 仓库地址安装；
2. 用户使用 IINA 打开 `.iinaplgz` 安装包。

IINA 官方推荐通过 GitHub 发布插件。插件在 `Info.json` 中配置 `ghRepo` 和递增的 `ghVersion` 后，IINA
可以根据 GitHub 上的版本提示用户更新。因此，GitHub 不只是源码托管渠道，也是 IINA 原生安装和更新协议的一部分。

IINA 的官方插件清单目前是人工维护的目录。插件作者可以通过 PR 申请加入社区插件列表，但这不等同于经过完整安全审核的应用商店，
SubLingo 仍需自行提供清晰的权限、隐私、费用和安装包完整性说明。

## 渠道选择

| 用途         | 推荐渠道              | 定位与理由                                                                              |
| ------------ | --------------------- | --------------------------------------------------------------------------------------- |
| 权威分发     | GitHub Releases       | 与 IINA 安装及更新机制匹配，可同时提供版本、安装包、校验值和发布说明                    |
| 插件发现     | IINA 官方社区插件清单 | 最接近 IINA 官方市场的入口，目标用户准确                                                |
| 中国大陆打赏 | 爱发电                | 支持微信和支付宝，更符合国内用户支付习惯；官方说明创作者获得赞助金额的 94%              |
| 海外打赏     | Ko-fi                 | 适合一次性自愿支持；免费方案关闭 Contributor 后，平台对 tip 收取 0%，仍有支付渠道手续费 |
| 开源赞助备选 | GitHub Sponsors       | 与仓库结合自然，但收款人必须位于支持地区；当前官方名单不含中国大陆，不应作为默认方案    |
| 自愿付款镜像 | itch.io               | 原生支持 `$0 or Donate`，但用户群和 IINA 自动更新能力弱于 GitHub                        |

爱发电的费用说明见[创作者常见问题](https://guide.afdian.com/faq/faq-for-creators)，Ko-fi 的费用说明见
[官方帮助](https://help.ko-fi.com/hc/en-us/articles/360002506494-Does-Ko-fi-take-a-fee)，itch.io 的自愿付款规则见
[定价文档](https://itch.io/docs/creators/pricing)。

## 推荐发布结构

### GitHub 仓库

GitHub 仓库是项目事实来源，应包含：

- 面向普通用户的简明产品说明、截图和一分钟安装步骤；
- 支持的 IINA 与 macOS 版本；
- 隐私、权限、字幕数据流向和第三方模型费用说明；
- 开源许可证、问题反馈入口和安全问题联系方式；
- 可被 IINA 直接安装的运行文件，以及可复现构建所需的源码、锁文件和脚本。

由于 IINA 会直接下载 GitHub 仓库内容，默认分支必须包含插件运行所需的 `dist` 和预构建 native helper，不能要求普通用户在安装前自行构建。

### GitHub Release

每个正式版本应创建对应 GitHub Release，并至少提供：

- `SubLingo-x.y.z.iinaplgz`；
- 安装包的 SHA-256；
- 版本兼容范围；
- 面向用户的变更说明；
- 安装、升级、卸载和已知限制说明。

仓库、`Info.json`、`package.json`、文件名和 Release tag 的版本必须一致。`Info.json` 还应增加正确的 `ghRepo`，并在每次正式发布时递增 `ghVersion`。

### 打赏入口

README 和 Release 页面可以同时提供爱发电与 Ko-fi 链接。若使用 GitHub 仓库的 Sponsor 按钮，可通过
`.github/FUNDING.yml` 配置外部资助地址，具体格式见 [GitHub 官方文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository)。

打赏文案应明确：

- SubLingo 可免费完整使用，打赏完全自愿；
- 打赏不会解锁额外功能、优先翻译或专属版本；
- SubLingo 不代收模型费用，也不赠送 API 额度；
- 用户选用的翻译服务可能独立收费，其条款和内容政策由对应 Provider 决定。

## 发布前缺口

SubLingo 已选择 GPL-3.0-only。仓库、包管理元数据、README 入口和正式安装包必须保持一致；正式包还必须保留随包运行依赖要求的第三方声明。

当前仓库在公开发布前仍需完成以下事项：

- 在 `Info.json` 中补充 `ghRepo` 与初始 `ghVersion`；
- 将 README 顶部调整为面向普通用户的安装与使用说明，同时保留现有开发和安全细节；
- 为 Release 自动或人工生成 `.iinaplgz`、SHA-256 和简明发布说明；
- 验证默认分支可被 IINA 通过仓库地址直接安装和更新；
- 使用正式安装包完成 IINA 中的安装、启用、升级和卸载验收；
- 准备插件截图、简短英文介绍和仓库地址，用于向 IINA 官方插件清单提交 PR；
- 建立爱发电与 Ko-fi 页面，并统一声明自愿打赏与模型费用边界。

## 推荐上线顺序

1. 确定维护者身份和公开联系方式；
2. 补齐 GitHub 安装、更新及 Release 元数据；
3. 生成候选安装包并完成与风险相称的自动化和 IINA 宿主验收；
4. 发布 GitHub 公共仓库及首个正式 Release；
5. 启用爱发电和 Ko-fi，并在仓库中加入低干扰的打赏入口；
6. 向 IINA 官方仓库提交社区插件清单 PR；
7. 根据实际受众决定是否增加 itch.io 镜像，不在多个渠道维护互相独立的版本事实。

最终原则是：**GitHub 负责可信分发和更新，IINA 官方清单负责发现，爱发电与 Ko-fi 负责自愿支持。**
