# Zotero Flow · 产品提升与文档审查

日期：2026-10-21。范围：MetaFlow、RefFlow、ViewFlow、MindFlow、TaskFlow、CiteFlow、PaperFlow。

本轮检查产品定位、主 README、中英文入口、清单与当前发布版本、许可、数据说明及部分源代码。前一轮的六插件设置页验证作为已有证据引用；本轮未执行新的业务流程测试。以下把已观察问题与后续验证建议分开列示。

## 已观察到的问题与本轮修复

| 问题 | 证据 | 本轮处理 |
|---|---|---|
| CiteFlow、RefFlow 中文 README 仍指向 12.3.0；ViewFlow 中文入口也未随英文主文档持续维护 | 原 README.zh-CN.md 与当前 12.3.3 Release 对照 | 两种语言由同一产品资料生成；旧入口保留并指向当前文档 |
| 七插件采用不同首屏、章节、标语和语言分布 | 现有七份主 README | 统一首屏与十一节结构，中文为默认，英文单独成文 |
| CiteFlow、RefFlow、ViewFlow 英文简介有动词语法问题和相同套话 | 原主 README 的 “that track/discover/preview” 句式 | 改为对象、操作与结果明确的产品介绍 |
| ViewFlow 原 README 的开发代码块仅以两个反引号结束 | 原 README.md、README.zh-CN.md | 新 README 使用完整代码块；保存的参考指南同步修复，原字节副本另外保留 |
| 同步、兼容性和验证结论表达不一致 | 清单、数据文件位置、既有说明 | 分开列示本地保存、附件归档、Zotero 同步、外部服务及实际验证范围 |
| 产品职责容易重叠 | 预览、Word 引用、关系发现与两类任务产品的介绍 | 明确 RefFlow／ViewFlow／CiteFlow 及 TaskFlow／PaperFlow 的职责边界 |

## 下一步优先级

优先级表示建议的工作顺序，不是对所有功能完成情况或产品成熟度的全面评分。

| 优先级 | 产品 | 已确认事实 | 建议与验收目标 |
|---|---|---|---|
| P1 | TaskFlow | 设置源代码明确列出 10 个无运行消费者的键：subwindowCompactMode、locateOnTaskClick、dragDropFromLibrary、academicPresets、pdfReaderJumpPage、enableSound、pomodoroFocus、pomodoroShortBreak、pomodoroLongBreak、autoArchiveDays | 优先决定哪些能力保留；需要的选项接入运行链路，其余移入开发计划或移除无效入口。每个保留设置应有可观察结果及保存／重开验证。不要把独立存在的 PDF 定位功能与未接入的同名设置混为一谈 |
| P1 | PaperFlow | 当前仓库缺少独立 LICENSE 文件，旧文档亦明确说明许可待确认 | 由权利人确定授权并补全许可证与归属；本轮不擅自增加授权。功能验收随后覆盖投稿轮次、备份恢复和远端同步冲突 |
| P2 | CiteFlow | 依赖 Zotero 与 Word 会话及原生集成；设置测试不能代表 Word 全流程 | 补一份明确的 Word／操作系统支持矩阵；优先回归双文档切换、重命名、取消插入和插入失败恢复。当前是验证建议，本轮未新确认这些场景存在故障 |
| P2 | MindFlow | 本地工作区、导图附件、Zotero 文件同步和 WebDAV 备份是独立结果；当前清单仅允许 Zotero 10.0.x | 把保存与归档状态放在清晰位置，并验证跨窗口修改、多导图选择、群组权限和恢复流程；AI 模型错误与引用原文核对独立验收 |
| P2 | RefFlow | 多数据源排序、原文编号、相似关系和引用关系语义不同；来源规范已有明确约束 | 提升来源、部分结果和匹配置信度的可见性；补外部服务失败、分页、取消与图谱方向的真实场景回归。保留 Semantic Scholar 官方接口与独立兜底角色 |
| P2 | MetaFlow | 规则可以写条目字段，指标包含在线结果及随包名单；当前版本为 12.1.0 | 优先展示变更来源、填空／覆盖策略和名单日期；将 MetaFlow 加入与其他六插件相同的原生设置一致性验收。本轮未测其设置几何，因此不声称已经与六插件完全一致 |
| P3 | ViewFlow | 12.3.3 已修复样式初始化等待；独立阅读窗口可能缺少所需侧栏 | 优先补“栏目不可用／样式未安装”的直观提示，并验证复制文本／富文本及辅助技术操作；无需为品牌统一扩张为 Word 引用追踪工具 |

### 源代码核对入口

- [TaskFlow 未接入设置列表](https://github.com/groele/Zotero-TaskFlow/blob/main/chrome/content/scripts/preferences.js)
- [PaperFlow 许可说明与产品文档](https://github.com/groele/Zotero-PaperFlow)
- [CiteFlow 设置与生效逻辑](https://github.com/groele/Zotero-CiteFlow/blob/main/src/modules/preferences.mjs)
- [MindFlow 宿主、数据与导图操作](https://github.com/groele/Zotero-MindFlow/blob/main/chrome/content/scripts/index.js)
- [RefFlow 数据源与接口约束](https://github.com/groele/Zotero-RefFlow/blob/main/docs/DATAFLOW-AND-API-SPEC.md)
- [MetaFlow 工作流与数据设计](https://github.com/groele/Zotero-MetaFlow/blob/main/docs/global-workflow-and-data-layout.md)
- [ViewFlow 样式初始化](https://github.com/groele/Zotero-ViewFlow/blob/main/zoteropreview_prefs.js)

## 统一品牌与交付结构

- 系列：Zotero Flow；标语：让研究的每一步衔接起来 / Connect each step of research。
- 职责：RefFlow 发现 → MetaFlow 整理 → ViewFlow 预览 → MindFlow 组织 → TaskFlow 推进 → CiteFlow 引用 → PaperFlow 投稿。此顺序是用途说明，不是已部署的跨插件自动流水线。
- 每个仓库：README.md、README.en.md，以及 docs/brand 下的品牌规范、产品资料、统一模板和本清单。
- 原长篇指南保留于 docs/reference；旧文件中的版本与历史测试不自动变为本轮测试结果。
- 本轮为品牌和文档更新，保留已发布运行包与更新清单。六插件现有版本 12.3.3、MetaFlow 12.1.0；品牌统一不要求虚增版本或改写已有标签。

## 后续维护要求

发布时从清单和 Release 读取实际版本、身份与安装资产，校验中英文一致、相对链接、代码块、来源和数据说明。品牌规范不是更换许可证、扩展兼容上限或承诺未实现功能的依据。
