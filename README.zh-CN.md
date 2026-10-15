<div align="center">

# Zotero CiteFlow

**连接 Zotero 与 Microsoft Word，清晰追踪文献引用状态。**

[English](README.md) · [简体中文](README.zh-CN.md)

![Version](https://img.shields.io/badge/version-10.0.0-blue) ![Zotero](https://img.shields.io/badge/Zotero-8.0%E2%80%9311.0.*-green) ![License](https://img.shields.io/badge/license-AGPL-3.0-only-lightgrey)

[下载插件](https://github.com/groele/Zotero-CiteFlow/releases/tag/v10) · [问题反馈](https://github.com/groele/Zotero-CiteFlow/issues) · [版本发布](https://github.com/groele/Zotero-CiteFlow/releases)

**Zotero Flow Series**

</div>

---

## 项目概述

Zotero CiteFlow 是 Zotero Flow Series 中独立维护的插件，连接 Zotero 与 Microsoft Word，清晰追踪文献引用状态。 项目侧重在 Zotero 桌面环境中提供清晰、实用的科研工作流程。

## 核心功能

- 在 Zotero 中识别 Word 文档引用的文献。
- 在文献列表显示引用状态与相关信息。
- 利用 Zotero 原生 Word 集成，不改写文档引用字段。
- 在 Zotero 工作流中查看和管理引用关系。

## 界面展示

实现结构、验收情况和已知风险请见[核心技术与维护手册](CORE-TECHNICAL-MAINTENANCE.md)。

## 兼容性

| 项目 | 说明 |
| --- | --- |
| 插件版本 | `10.0.0` |
| 插件作者（安装包信息） | `Zotero CiteFlow` |
| 插件 ID | `citeflow@groele` |
| 声明兼容范围 | `8.0–11.0.*` |
| 验证情况 | 已在 Windows 的 Zotero 10.0.6 与 Microsoft Word 16.0.20430 环境进行实机验证；Zotero 8/9/11 尚未完成实机验收。 |

兼容性声明不等于列出版本均已完成实机验证。

## 安装指南

1. [下载当前版本 XPI](https://github.com/groele/Zotero-CiteFlow/releases/tag/v10)（`zotero-citeflow-10.0.0.xpi`）。
2. 打开 Zotero 的 **工具 → 插件**（不同版本的菜单名称可能不同）。
3. 选择 **从文件安装插件**，选中 XPI，按提示重启。

自动更新清单：[update.json](https://github.com/groele/Zotero-CiteFlow/blob/main/update.json)。

## 快速开始

1. 下载 Release 中的 XPI，通过 Zotero 插件管理器从文件安装。
2. 打开包含 Zotero 引用的 Word 文档并使用 Zotero Word 集成。
3. 在 Zotero 文献列表查看引用信息与状态。

## 配置与注意事项

Windows 下打开 **编辑 → 设置 → Zotero CiteFlow**。即使关闭引用跟踪，设置面板仍可使用。

| 设置项 | 默认值 | 生效方式 |
| --- | --- | --- |
| 启用引用跟踪 | 开启 | 重启 Zotero 后生效 |
| 快捷引用（英文单引号键） | 开启 | 立即生效；编辑文本或按组合键时不触发 |
| 拖拽引用 | 开启 | 立即生效；引用列隐藏时也可使用 |
| 引用后自动添加标签 | 开启 | 立即生效；关闭时清理插件维护的标签 |
| 引用标签文本 | `/Citations` | 立即生效；迁移插件维护的标签 |
| 引用标签同步延迟 | 150 ms | 用于后续标签同步任务 |
| 文献列表刷新延迟 | 120 ms | 用于后续刷新任务 |
| 诊断统计时间窗 | 300000 ms | 用于后续诊断查询 |
| 慢操作记录阈值 | 50 ms | 用于后续性能统计 |
| 调试日志 | 关闭 | 立即生效 |

设置自动保存。标签文本支持 1–200 个字符，可填写“已引用”等中文文本；数字参数须符合面板标明的整数范围。**恢复默认设置**仅重置这十项设置，保留原先手动添加的同名标签及其他 Zotero 设置。标签重命名在一次条目保存中完成；写入失败时回滚标签并保留管理记录以便重试。设置保存或应用失败时，面板会显示提示。

详见[核心技术与维护手册](CORE-TECHNICAL-MAINTENANCE.md)中的实机验证证据与剩余限制。拖拽引用已在 Windows、Zotero 10.0.6 和 Word 16.0.20430 实测；单引号快捷键已有自动化覆盖，但尚未完成同等级的桌面端验收。

## 开发与测试

在仓库根目录运行以下命令。涉及 Zotero 桌面实机测试时，请先配置项目要求的独立测试环境。

```powershell
npm ci
npm test
npm run package
```

上述命令为项目提供的开发与测试入口，不表示所有系统环境或集成测试均已通过。

## 文档与支持

[核心技术与维护手册](CORE-TECHNICAL-MAINTENANCE.md) · [第三方声明](THIRD_PARTY.md)

[提交问题](https://github.com/groele/Zotero-CiteFlow/issues) · [查看源码](https://github.com/groele/Zotero-CiteFlow)

## 致谢与项目来源

Zotero CiteFlow 最初基于 [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation) 开源项目二次开发，原项目作者为 MuiseDestiny (Polygon)。感谢原作者及贡献者的基础工作。此 Zotero Flow Series 版本独立维护，并非上游项目或 Zotero 官方发布。原作者版权及适用的第三方声明继续有效。

## 许可证

本项目遵循 **AGPL-3.0-only**，具体以 [LICENSE](LICENSE) 及适用的第三方版权声明为准。

Zotero 及相关商标归各自权利人所有。
