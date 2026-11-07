# Zotero CiteFlow

**Zotero Flow Series · 写作引用**

*让研究的每一步衔接起来。 / Connect each step of research.*

追踪 Word 文档引用，并连接 Zotero 文献操作。

[简体中文](README.md) · [English](README.en.md)

[![当前版本](https://img.shields.io/badge/version-16.0.0-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v16.0.0) · [下载 XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.0.0/zotero-citeflow-16.0.0.xpi) · [问题反馈](https://github.com/groele/Zotero-CiteFlow/issues)

[产品定位](#overview) · [安装与更新](#installation) · [快速开始](#quick-start) · [核心功能](#features) · [CSL 引用格式参考案例](#csl-example) · [设置与使用](#settings) · [数据、同步与外部服务](#data) · [兼容性与验证范围](#compatibility) · [常见问题](#troubleshooting) · [开发与详细文档](#development) · [系列产品](#series) · [项目来源与许可](#license)

<a id="overview"></a>

## 产品定位

面向使用 Zotero 与 Microsoft Word 写作的用户，在文献列表查看引用状态，维护插件管理的引用标签，并提供明确目标的拖拽引文操作。

本插件可以独立安装，按需与系列其他插件组合使用。

<a id="installation"></a>

## 安装与更新

1. 下载 [zotero-citeflow-16.0.0.xpi](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.0.0/zotero-citeflow-16.0.0.xpi)（插件版本 **16.0.0**），不要安装 Source code ZIP.
2. 在 Zotero 打开 **工具 → 插件／附加组件**，从齿轮菜单选择 **从文件安装插件**。
3. 选择 XPI，完成安装；按提示重启 Zotero。

后续可在插件管理器中检查更新。自动检查／安装取决于 Zotero 与该插件的更新设置和兼容范围。升级或迁移前备份重要数据。

更新清单: [update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json) · 插件 ID: `citeflow@groele`.

<a id="quick-start"></a>

## 快速开始

1. 打开包含 Zotero 引文的 Word 文档，并通过原生 Word 集成操作一次。
2. 回到 Zotero 检查引用列、已识别的文档状态和标签（**前置提示**：若未显示引用列，请在 Zotero 文献列表表头任意空白处点击鼠标右键，勾选开启 **「引用」(Citation)** 列）。
3. 需要插入时将文献拖入目标 Word 文档，核对实际插入位置。

<a id="features"></a>

## 核心功能

| 特色能力 | 能解决什么问题 | 实际边界 |
|---|---|---|
| Word 引文状态回看 | 在 Zotero 条目列表中呈现已识别的 Word 引文信息，帮助写作时回看条目是否已被引用。 | 状态来自插件可识别的 Word/Zotero 引文链路，不把未识别结果判定为“从未引用”。 |
| 可编辑引文拖放 | 将条目拖入 Microsoft Word 时沿用 Zotero 集成，插入可继续编辑的 Zotero 引文域，而非普通文本。 | 仅对明确的 Word 目标生效；不会改写既有 Word 引文域，也不承诺向其他应用插入。 |
| 可控的引用标签与只读保护 | 用插件拥有的标签标记引用关系；改标签文字或关闭时只处理插件自身标签，且严格受 `item.isEditable()` 保护，避免在只读群组库与回收站中非法写入。 | 关闭或改名时只处理插件可确认拥有的标签；只读条目保留所有权记录但不脏写。 |
| 分层治理架构 | 彻底清理堆砌代码，对全量函数划分 11 大职责领域分门别类治理，消灭死代码，提升可维护性与运行稳定性。 | 各领域职责清晰、边界严格，对外接口保持完全向前兼容。 |
| 三级 40px 黄金对齐基准设置面板 | 遵循 Zotero Flow 统一设置面板规范，16px 边距、二级文字与三级从属项严格对齐于 40px 垂直基准线，支持 Fluent 100% 国际化与键盘无障碍访问。 | 面板完全基于现代 Web/XUL 盒模型构建，无缝适配深色/浅色与高对比度主题。 |
| 可审计设置与自愈诊断 | 在设置页调整同步延迟、刷新延迟、性能阈值与调试日志，具备内存安全与健康状态检测。 | 诊断用于观察与自愈，不替代 Word/Zotero 的原生故障诊断。 |


<a id="csl-example"></a>

## CSL 引用样式参考案例：紧凑期刊引文格式 (Compact Journal Reference)

为满足科研人员在投递顶级期刊和国际顶级会议手稿（如 IEEE Transactions、ACM 系列、Nature 子刊、CVPR、ICCV 等）时对**严格篇幅限制（Page Limit）**的要求，CiteFlow 仓库收录并推荐了由 **Shikunhou** 专门定制的极简紧凑引文样式（CSL）：

📁 **样式文件入口**：[`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)

### 🌟 样式核心特色与设计规范

| 设计维度 | 标准传统格式 (如 APA / IEEE 完整版) | Compact Journal Reference 紧凑格式 |
|---|---|---|
| **正文引用标记** | 括号作者年 `(Vaswani et al., 2017)` 或带空隙的 `[ 1 ]` | 极简顺序数字标引 `[1]`、`[1, 2]`、`[1-4]`（自动合并连续标号） |
| **期刊与容器名称** | 全称长文本（易换行占用 2 行） | 规范斜体缩写 (`form="short"`，如 *NeurIPS,*、*IEEE Trans. PAMI,*) |
| **发表年份呈现** | 括号尾缀 `(2017)` 或普通字重 | **粗体醒目标注**（如 **2017**），视觉焦点分明 |
| **卷期与页码** | 冗余文字标识 `Vol. 30, no. 2, pp. 5998-6008` | 极简并置 `30(2), 5998-6008`（彻底省去冗余标记） |
| **文末排版间隙** | 宽段间距，带未对齐悬挂 | 悬挂齐平对齐 (`second-field-align="flush"`)，段间距设为 `0` |

### 📊 参考文献排版渲染直观对比

- **传统标准排版（耗费 3~4 行版面）**：
  > `[1] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems (Vol. 30, pp. 5998–6008). Currans Associates, Inc.`
- **Compact Journal Reference 紧凑排版（仅占用 1 行，节约 60%+ 版面空间）**：
  > `[1] Attention Is All You Need. NeurIPS, 2017, 30, 5998-6008.`

### 🚀 安装与在 Word / WPS 中使用指南

1. **获取样式文件**：
   直接从本仓库克隆或下载 [`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)；
2. **导入 Zotero 样式库**：
   - 打开 Zotero 桌面端，进入菜单 **编辑 (Edit) ➔ 设置 (Settings)**（macOS 为 **Zotero ➔ 设置**）；
   - 点击左侧 **引用 (Cite)**，切换至 **样式 (Styles)** 选项卡；
   - 点击样式列表下方的 **「+」号按钮**，选择下载的 `compact-journal-reference.csl` 导入（或直接将该文件拖拽至 Zotero 窗口）；
3. **在 Word / WPS 手稿中切换**：
   - 在 Word 或 WPS 的 Zotero 工具栏中点击 **Document Preferences (文档首选项)**；
   - 在样式列表中选择 **Compact Journal Reference** 并点击确定；
   - 配合 CiteFlow 的**实时引用列监控**与**拖拽引文**能力，全篇文献引用与文末排版瞬间完成紧凑规范化！

<a id="settings"></a>

## 设置与使用

在 **Zotero → 设置 → Zotero CiteFlow** 中查看插件偏好页。

引用追踪开关需要重启 Zotero；拖拽、引用标签文字和延迟参数分别配置。恢复默认值只重置插件的九项设置。

<a id="data"></a>

## 数据、同步与外部服务

- 引用状态依赖 Zotero 与 Word 会话识别，不是独立于 Word 的任意文档全文扫描。
- 启用自动标签会写入 Zotero 条目标签。只读条目（只读群组、回收站）会被自动跳过并予以审计记录。拖到其他应用不等于在 Word 中插入引文。

<a id="compatibility"></a>

## 兼容性与验证范围

| 项目 | 范围 |
|---|---|
| 当前插件版本 | 16.0.0 |
| 清单声明的 Zotero 范围 | `10.0` 至 `12.*` |
| 当前说明 | 16.0.0 达成全仓 360 行硬约束（0 债务），建立涵盖 13 项硬约束的 architecture-guard 自动化守护套件，重构设置面板为五大业务流转模块卡片，严格落实 14px 字号基准与 40px 黄金垂直对齐线，新增临时文集独立开关与开关联动禁用防护。 |

插件版本与 Zotero 版本分别管理。兼容声明不等于已验证所有宿主、系统和外部服务；本轮仅验证上述定向行为，未覆盖所有业务流程或主环境安装。

<a id="troubleshooting"></a>

## 常见问题

引用状态不符时，先确认当前文档身份和 Zotero Word 集成状态；提交问题时注明 Word 版本、文档切换顺序及最小复现。

反馈时提供插件与 Zotero 版本、系统、操作步骤、预期／实际结果和脱敏错误。

<a id="development"></a>

## 开发与详细文档

普通安装无需开发环境。以下为仓库已有开发入口，涉及原生测试时使用独立配置。

```powershell
npm ci
npm test
npm run package
```

- [技术与维护指南 / Technical guide](CORE-TECHNICAL-MAINTENANCE.md)
- [第三方声明 / Third-party notices](THIRD_PARTY.md)
- [版本说明 / Release notes](RELEASE_NOTES.md)
- [v16.0.0 阶段说明 / Milestone notes](docs/releases/v16.0.0.md)
- [v13.0.9 阶段说明 / Milestone notes](docs/releases/v13.0.9.md)
- [v13.0.8 阶段说明 / Milestone notes](docs/releases/v13.0.8.md)
- [v13.0.7 阶段说明 / Milestone notes](docs/releases/v13.0.7.md)
- [产品简介 / Product profile](docs/brand/PRODUCT.md)
- [品牌规范 / Brand guide](docs/brand/BRAND.md)
- [README 模板 / README template](docs/brand/README-TEMPLATE.md)
- [后续提升清单 / Improvement priorities](docs/brand/IMPROVEMENTS.md)
- [原详细指南 · README.md](docs/reference/README.md)
- [原详细指南 · README.zh-CN.md](docs/reference/README.zh-CN.md)

原详细指南保留功能细节、快捷键、历史验证与完整致谢；其中版本和测试结果属于各自记录时间。

<a id="series"></a>

## 系列产品

| 产品 | 定位 |
|---|---|
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | 文献发现 · 检索参考文献、被引文献与相关研究。 |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | 元数据整理 · 校验、规范并补全文献元数据。 |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | 阅读预览 · 在 Zotero 侧栏预览并复制格式化引文。 |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | 知识组织 · 将文献、批注与思路组织为可编辑导图。 |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | 任务推进 · 将文献研读转化为可追踪的任务与计划。 |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | 写作引用 · 追踪 Word 文档引用，并连接 Zotero 文献操作。 |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | 投稿审稿 · 管理手稿、投稿轮次与审稿回复。 |

各插件分别安装和更新；同属一个系列不意味着共享数据库或已自动联通所有流程。

<a id="license"></a>

## 项目来源与许可

**二次开发声明：** Zotero CiteFlow 基于 MuiseDestiny（Polygon）的开源插件 [zotero-citation](https://github.com/MuiseDestiny/zotero-citation) 二次开发并独立维护。上游版权、AGPL 义务和适用的第三方声明继续有效；本项目不是上游项目或 Zotero 官方发布。

许可: [AGPL-3.0-only](LICENSE).

本系列独立维护，并非 Zotero 官方产品。Zotero 及第三方名称、商标与材料归各自权利人所有。

[Release/tag policy](docs/release-tag-policy.md)
