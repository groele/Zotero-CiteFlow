# Zotero CiteFlow 项目审查与优化记录

更新日期：2026-10-14。当前状态：本地架构重构和回归测试完成；Zotero 10 + Word 的原生 CSL 插入已在隔离环境验证；CiteFlow 快捷插入的完整实机验收仍未通过。按用户要求，兼容声明扩大至 Zotero 8.0–11.0.*，但 Zotero 8、9、11 尚未实机验证，因此该范围声明不等同于完整兼容验收。

## 当前身份与兼容范围

| 项目 | 当前设置 |
|---|---|
| 显示名称 | Zotero CiteFlow |
| Add-on ID | `citeflow@groele` |
| 版本 | `10.0.0`（本地候选；Git 标签 `v10`） |
| GitHub 仓库 | `https://github.com/groele/Zotero-CiteFlow` |
| Update URL | `https://raw.githubusercontent.com/groele/Zotero-CiteFlow/main/update.json` |
| Zotero 声明范围 | 8.0–11.0.*（按用户要求；8/9/11 未实机验证） |
| Firefox 最低版本 | 115（打包目标） |

本次实机仅在 Zotero 10.0.6 与 Word 16.0.20430 上进行。更名迁移在启动早期禁用旧 ID `zoterocitation@polygon.org`，保留旧 `extensions.zotero.zoterocitation.*` 首选项和资源命名空间，以避免状态丢失和重复监听。

## 架构与维护性改造

- 从 `src/` 的 9 个 ES module 构建正式运行包；锁定 esbuild 0.28.2，面向 Firefox 115，不再依赖遗留的 `zotero-plugin-toolkit`。
- `scripts/build.ps1` 固定 XPI 文件清单和 ZIP 时间戳，校验每个归档文件与源码散列，并生成含 SHA-256 的更新清单候选。
- 运行时拆分为启动/关闭生命周期、原生引用、引用命令、列表视图、钩子及运行时工具；保留 Zotero 原生 CSL 字段结构，不自行改写引用 payload。
- 加强异常隔离、窗口与会话绑定、并发命令串行化、缓存回退、标签写入回滚、临时集合清理、关闭释放和启动取消。
- 通过构建检查排除测试脚手架、调试桥接、内嵌事件处理器和未用 toolkit 代码；XPI 只包含 9 个运行时文件。
- 新增/整理稳定性、数据、UI 生命周期、Word 集成、引导与打包检查。完整实机范围及未通过项见 [VALIDATION-40.1.0.md](VALIDATION-40.1.0.md)。

## 实机验收结果与限制

测试使用独立 Zotero profile/dataDir 和临时 Word 文件；没有写入用户主 Zotero 文库或打开的原始 Word 文档。验证到插件在 Zotero 10 中以新名称、新 ID 激活，三个合成测试条目可用，Word 原生插件能向隔离文档写入标准 `ADDIN ZOTERO_ITEM CSL_CITATION` 字段。测试后重启 profile，插件仍激活且条目/已有字段保留。

实机过程中发现 Word 的 `getActiveDocument()` 路径可能把空文档名交给 Zotero 10 host API，后者会对 `null` 调用 `indexOf()`。`src/modules/cite.mjs` 已加入临时、作用域受限的 WinWord 活动文档兼容桥，并在成功或失败路径恢复；单元回归覆盖无参数和额外 `null` 参数。但是在最后的实机候选包中，直接通过 CiteFlow API 的引用调用仍未稳定地产生 Word 字段，所以该桥尚未达到实机验收标准。

`manifest.json` 与本地 `update.json` 指向 groele/Zotero-CiteFlow，并按用户要求声明 Zotero 8.0–11.0.*。该仓库的 GitHub 主分支、Release 附件及自动更新生效状态须以本次 GitHub 提交和 Release 核验结果为准；发布可供自动安装的 XPI 前仍须修复快捷引用验收并重新构建、验证 XPI 和远端清单。

## 验证摘要

- `npm test`：15 个 Node 测试目标全部通过，包含 40 余项稳定性、数据、Word 兼容及包检查。
- `npm run package -- dist/native-candidate-40.1.0-citeflow-v3`：构建与归档完整性检查通过。
- 最新候选 XPI：`dist/native-candidate-40.1.0-citeflow-v3/zotero-citeflow-40.1.0.xpi`。
- 候选 SHA-256：`7D153CC6910D87C3F33BDF9F48DA6C4E54FB73C981AB56C7296AFE0E9A512249`。
- 实机快捷引用完整流程：未通过，不可据此宣称发布就绪。
- Zotero 8/9/11 / Firefox 153：未做实机验证；manifest 范围已按用户要求扩大，但不表示这些版本已完成验收。

## 旧版审查事项的处理情况

历史记录中“源代码缺失/只能修改编译包”“构建不可复现”“旧 toolkit 未清理”等事项已由本轮源模块与打包链解决。Zotero 11 声明、快捷引用实机成功、远端 Release/更新通道、用户主 profile 安装与自动更新仍未完成。标签与临时 Word 集合依旧是功能副作用，须继续用隔离数据验证用户可预期性及多文档清理行为。
