# Zotero Flow · 系列品牌规范

版本：1.0 · 2026-10-21

## 品牌与定位

- 系列名：**Zotero Flow**；英文扩展名：**Zotero Flow Series**。
- 系列简介：围绕 Zotero 文献库，连接文献发现、元数据整理、阅读、知识组织、任务推进与论文发表。
- English: A family of Zotero add-ons connecting literature discovery, metadata, reading, knowledge, tasks, and publication.
- 系列标语：**让研究的每一步衔接起来。 / Connect each step of research.**
- 产品显示名固定为 `Zotero MetaFlow` 等带空格的名称；仓库名使用 `Zotero-MetaFlow`。不要据品牌改动插件 ID、偏好前缀或数据目录。
- 七个插件分别安装，不要求整套安装；版本、许可证、兼容范围与更新通道分别管理。系列名称不构成官方 Zotero 关联，也不代表已实现统一账号、云端平台或所有插件之间的自动联动。

## 产品分工

| 产品 | 定位 |
|---|---|
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | 文献发现 · 检索参考文献、被引文献与相关研究。 |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | 元数据整理 · 校验、规范并补全文献元数据。 |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | 阅读预览 · 在 Zotero 侧栏预览并复制格式化引文。 |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | 知识组织 · 将文献、批注与思路组织为可编辑导图。 |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | 任务推进 · 将文献研读转化为可追踪的任务与计划。 |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | 写作引用 · 追踪 Word 文档引用，并连接 Zotero 文献操作。 |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | 投稿审稿 · 管理手稿、投稿轮次与审稿回复。 |

流程顺序用于解释职责；用户可以从任何环节开始。RefFlow 负责发现文献关系，ViewFlow 负责格式预览，CiteFlow 负责 Word 引用会话。三者不能互称相同功能。TaskFlow 的通用任务与 PaperFlow 的投稿轮次也分别说明。

## 文案规则

1. 首屏只保留产品名、一句用途、语言入口、版本、下载和反馈。
2. 简介使用“对象 + 操作 + 结果”，写当前可用行为；不使用“完美支持”“全自动”“一站式全生命周期”替代事实。
3. 兼容清单、当前原生测量、历史测试与未来改进分开写；声明上限不代表已验证未来版本。
4. 区分本地保存、Zotero 附件归档、Zotero 同步与外部备份；需要联网、API 密钥或第三方模型的能力明确说明。
5. 保留上游作者、依赖与数据集归属。许可证缺失时如实说明，不统一改成同一种许可。
6. 简介、GitHub About 和 README 使用同一产品事实来源。修正文档无需重新发布同内容 XPI；运行包元数据有变更时再按各仓库流程发布新版本。

## README 规范

默认文档为中文 `README.md`，英文为 `README.en.md`。原有 `README.zh-CN.md` 与 `README_en.md` 入口继续可用。统一十一节顺序与稳定英文锚点，详见 README-TEMPLATE.md。详细原有指南保留于 `docs/reference/`，标明保存日期与历史验证边界。

## 界面与视觉

- 延续 MetaFlow 参考的紧凑原生偏好页；正文/控件 14px、说明/按钮 13px、版本徽标 12px。
- 主要文字、说明、链接、表面和边框采用共用浅色/深色语义色；状态、警告与危险操作保留语义差别。
- 一级设置组可折叠，避免嵌套折叠；版本说明、构建日期、安装包和仓库链接独立展示。
- README 使用同样的标题层级、平面蓝色版本徽标与入口顺序；保留各产品现有图标，不虚构新的已部署图标。
- 参考色：文字 `#20242b / #f1f3f5`，说明 `#505862 / #c4c9d1`，强调 `#245ac7 / #9bbcff`，表面 `#ffffff / #35383d`。颜色顺序为浅色/深色。

## 维护

首次建立品牌规范不等于完成全部产品业务审计。每次发布分别检查身份、功能、下载链接、更新清单、兼容性、数据说明和许可。中英文事实必须一致，历史验证数字不得直接当作本轮结果。产品改进按“已观察问题 / 待验证风险 / 建议”记录。
