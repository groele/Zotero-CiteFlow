# Zotero Citation（Easier Citation）

当前版本：`40.0.3`

项目类型：Zotero 插件二次开发候选版

插件 ID：`zoterocitation@polygon.org`

## 项目简介

本项目用于辅助整理 Zotero 与 Word 文档之间的引用关系，并在 Zotero 条目列表中显示引用信息。当前目录保存的是可安装插件所需的运行文件、回归测试、打包脚本和项目审查记录。

`chrome/content/scripts/index.js` 是包含插件逻辑及 `zotero-plugin-toolkit` 的编译产物，不是可独立构建的原始 TypeScript 源码。因此，本项目当前采用“发布包维护 + 行为回归验证”的方式维护。

## 来源、版权与许可证

本项目基于 [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation) 进行二次开发。

- 原项目的代码、版权声明、作者信息和许可证要求继续适用。
- 本项目不主张拥有原项目及其原始代码的版权；原项目版权归原作者及相应贡献者所有。
- 本项目新增或修改的内容属于本次二次开发范围，不能替代或删除原项目的来源和版权信息。
- 上游仓库声明的许可证为 [GNU Affero General Public License v3.0（AGPL-3.0）](https://github.com/MuiseDestiny/zotero-citation/blob/bootstrap/LICENSE)。使用、复制、修改或再分发时，应同时遵守该许可证及第三方依赖的许可证要求。
- 当前目录尚未单独附带完整的 `LICENSE` 文件；正式分发前应将适用许可证文本和必要的第三方声明一并提供。

## 当前功能范围

- 从 Word 集成会话读取引用，并在 Zotero 中维护对应的临时集合。
- 在 Zotero 条目列表中提供引用列，并根据活动 Word 文档或选中的引用集合显示引用信息。
- 支持快捷引用和拖拽引用路径的行为回归测试。
- 同步 `/Citations` 管理标签，并在条目只读、保存失败或会话关闭时保留可重试状态。
- 对启动取消、重复启动/关闭、并发 Word 命令、Zotero 10 的 `field`/`fieldIndex` 结构和 UI 生命周期进行防护。

## 兼容性

| 项目 | 当前声明或验证范围 |
| --- | --- |
| Zotero | `6.999` 至 `10.0.*`，以 `manifest.json` 为准 |
| Word | 依赖 Zotero Word 集成；真实版本矩阵尚未完成 |
| 操作系统 | Windows 路径已作为主要验证环境；Mac Word 文档名自动识别仍有限制 |
| 更新通道 | 当前候选版未配置自动更新地址 |

`strict_max_version` 不代表已经验证所有后续 Zotero 版本。升级兼容范围前，应在目标版本中重新检查 Word 集成 API、Item Tree 列注册、集合选择、拖拽事件和启动/关闭生命周期。

## 安装与使用

当前版本是本地候选包，未发布到自动更新服务器。建议先备份 Zotero 数据库和目标 Word 文档，并使用隔离 Zotero 配置进行验证。

1. 使用本项目的构建脚本生成 XPI。
2. 在 Zotero 中打开“工具 → 附加组件”。
3. 通过附加组件管理器的齿轮菜单选择“从文件安装附加组件”。
4. 选择生成的 `.xpi` 文件并重启 Zotero。
5. 在测试 Word 文档中检查插入、编辑、撤销、刷新、多文档切换和拖拽行为。

## 开发与验证

环境要求：PowerShell 7、Node.js 22 或兼容的较新 Node.js 版本。

运行全部回归测试：

```powershell
node --test tests/*.test.*
```

生成并校验 XPI：

```powershell
./scripts/build.ps1 -OutputDirectory dist/my-build
```

构建脚本会执行 JavaScript 语法检查、全部测试、运行文件清单检查以及 XPI 内外文件的 SHA-256 校验。若目标目录已有同名 XPI，脚本会停止以避免覆盖已有产物。

当前测试覆盖 23 组稳定性、8 组 Word 接口、7 组数据、界面生命周期及启动/包结构检查。测试主要使用 Node VM 模拟 Zotero/Word 接口，不能替代真实 Zotero、Word、数据库、权限和多窗口端到端验证。

## 目录结构

```text
bootstrap.js                       Zotero 启动与关闭入口
manifest.json                      插件元数据与兼容范围
prefs.js                           默认配置
chrome/content/scripts/index.js    编译后的插件运行逻辑
chrome/content/icons/               插件图标
locale/                             中英文界面资源
scripts/build.ps1                   语法、测试与 XPI 构建脚本
tests/                              稳定性、Word、数据和 UI 回归测试
PROJECT_AUDIT.md                   问题清单、风险边界和后续计划
```

## 已知限制与后续工作

- 当前目录没有与编译产物一一对应的 TypeScript 源码、依赖锁文件和完整构建工程；后续应先恢复可维护的源码结构，再切换为源码构建发布。
- 真实桌面 Zotero 与 Word 的多文档切换、连续插入、编辑、撤销、拖拽、禁用/重启清理和长文档性能仍需实机验收。
- 正式发布前需要补充许可证文件、独立更新清单、发布资产和安装/升级回归记录。
- 详细的风险分级和后续优化顺序见 [PROJECT_AUDIT.md](PROJECT_AUDIT.md)。
