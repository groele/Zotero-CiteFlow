# Zotero CiteFlow


**Zotero Flow Series · 写作引用**

*让研究的每一步衔接起来。 / Connect each step of research.*

追踪 Word 文档引用，并连接 Zotero 文献操作。

[简体中文](README.md) · [English](README.en.md)

[![当前版本](https://img.shields.io/badge/version-12.5.2-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v12.5.2) · [下载 XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v12.5.2/zotero-citeflow-12.5.2.xpi) · [问题反馈](https://github.com/groele/Zotero-CiteFlow/issues)

[产品定位](#overview) · [安装与更新](#installation) · [快速开始](#quick-start) · [核心功能](#features) · [设置与使用](#settings) · [数据、同步与外部服务](#data) · [兼容性与验证范围](#compatibility) · [常见问题](#troubleshooting) · [开发与详细文档](#development) · [系列产品](#series) · [项目来源与许可](#license)

<a id="overview"></a>

## 产品定位

面向使用 Zotero 与 Microsoft Word 写作的用户，在文献列表查看引用状态，维护插件管理的引用标签，并提供明确目标的拖拽引文操作。

本插件可以独立安装，按需与系列其他插件组合使用。

<a id="installation"></a>

## 安装与更新

1. 下载 [zotero-citeflow-12.5.2.xpi](https://github.com/groele/Zotero-CiteFlow/releases/download/v12.5.2/zotero-citeflow-12.5.2.xpi)（插件版本 **12.5.2**），不要安装 Source code ZIP。
2. 在 Zotero 打开 **工具 → 插件／附加组件**，从齿轮菜单选择 **从文件安装插件**。
3. 选择 XPI，完成安装；按提示重启 Zotero。

后续可在插件管理器中检查更新。自动检查／安装取决于 Zotero 与该插件的更新设置和兼容范围。升级或迁移前备份重要数据。

更新清单: [update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json) · 插件 ID: `citeflow@groele`.

<a id="quick-start"></a>

## 快速开始

1. 打开包含 Zotero 引文的 Word 文档，并通过原生 Word 集成操作一次。
2. 回到 Zotero 检查引用列、已识别的文档状态和标签。
3. 需要插入时将文献拖入目标 Word 文档，核对实际插入位置。

<a id="features"></a>

## 核心功能

| 功能 | 使用范围 |
|---|---|
| 引用状态 | 在 Zotero 列表中显示已识别文档的引用信息。 |
| 可编辑引文 | 拖入 Word 时通过 Zotero 集成插入可编辑引用域。 |
| 管理标签 | 配置引用标签文字，管理插件拥有的标签并保留无关手动标签。 |
| 设置与诊断 | 配置同步延迟、列表刷新与调试参数。 |

<a id="settings"></a>

## 设置与使用

在 **Zotero → 设置 → Zotero CiteFlow** 中查看插件偏好页。

引用追踪开关需要重启 Zotero；拖拽、引用标签文字和延迟参数分别配置。恢复默认值只重置插件的九项设置。

<a id="data"></a>

## 数据、同步与外部服务

- 引用状态依赖 Zotero 与 Word 会话识别，不是独立于 Word 的任意文档全文扫描。
- 启用自动标签会写入 Zotero 条目标签。拖到其他应用不等于在 Word 中插入引文。

<a id="compatibility"></a>

## 兼容性与验证范围

| 项目 | 范围 |
|---|---|
| 当前插件版本 | 12.5.2 |
| 清单声明的 Zotero 范围 | `8.0` 至 `11.0.*` |
| 当前说明 | 12.5.2 通过 35 项顶层自动化测试（另含内部套件）；在隔离 Zotero 10.0.6 中完成五插件共存及受控清理失败验收。本轮未重新执行真实 Word 操作或完整主题/窄窗视觉回归。 |

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
- [版本说明 / Release notes](docs/releases/v12.5.2.md)
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

基于 MuiseDestiny（Polygon）的 zotero-citation 独立维护；保留上游版权与第三方声明。

许可: [AGPL-3.0-only](LICENSE).

本系列独立维护，并非 Zotero 官方产品。Zotero 及第三方名称、商标与材料归各自权利人所有。

[Release/tag policy](docs/release-tag-policy.md)
