# Zotero CiteFlow 工程实现与验收记录（2026-10-15）

## 结论与交付边界

提交与 Release 更新使用的包为 `dist/candidate-20261015-release-refresh/zotero-citeflow-10.0.0.xpi`，SHA-256 为 `32EF68197E25EBF863550D7116B7BACEFCCC2C0A41BD838B61E1E15434DEBEBA`。归档包含 14 个运行文件；内部 `manifest.json` 的版本为 `10.0.0`、作者为 `Zotero CiteFlow`、插件 ID 为 `citeflow@groele`。本轮保持版本号不变，提交 `main` 并更新 `v10` Release 资产及自动更新哈希；现有 `v10` Git 标签指针不移动。此前经过物理拖拽的包仍保存在 `dist/candidate-20261015-quick-removed/`，其 SHA-256 为 `EEF885C12E25A83EC583E07BCAD4AEEB1C8E32CE767695066C1A19A6C60D90DD`。

实现包括：Windows 原生光标下进程识别，只有目标确认为 `WINWORD.EXE` 才发起 Word 引用；无法识别时不插入并提示重试；随机 session ID 不再作为 Word 临时文集名；单引号快捷引用及其设置项、默认偏好已按用户意见移除。保留 Zotero 原生 Word Integration 生成 CSL 引用域，保留真实 Word 中 `dropEffect=none` 的成功路径。

## 检查环境与结果

| 层级 | 环境/证据 | 结果 |
| --- | --- | --- |
| 构建/静态回归 | Node 22、`npm test`、`scripts/build.ps1` | 11 源模块构建成功；34/34 测试目标通过；XPI 的 14 文件清单和逐项哈希校验通过。 |
| 原生 Zotero 设置 | 当前候选包；Windows 11 10.0.26300、Zotero 10.0.6；`dist/settings-native-20261015-151932/results.json` | 36/36 检查通过。外部脚本加载面板，9 个控件、9 个偏好 observer；`/Citations` 文本框、开关、错误恢复、关闭重开和插件停用/启用均被检查。 |
| 原生 Word 桥接 | 当前候选包；Word 16.0.20430；`dist/settings-native-20261015-192328/word-results.json` | 14/14 检查通过，包含原生字段、刷新、双文档和文集名称由占位到可信路径的原地更新。此组拖拽入口由测试桥接触发，不能当作物理鼠标证据。 |
| 系统级真实拖拽到 Word | 前一候选包；`dist/settings-native-20261015-150348/physical-word-drag-events.json` 与 `physical-word-field-inspection.json` | 受信任的 OS 拖拽 `dragstart/dragend`，`dropEffect=none`，一次 `cite-call` 和 `cite-complete`；保存后的 DOCX XML 含 1 个 `ADDIN ZOTERO_ITEM CSL_CITATION` 域，`citationItems[0].id=4`。当前包仅改设置页加载与打包文件，尚未重复物理拖拽。 |
| 系统级真实拖拽到资源管理器 | 前一候选包；`dist/settings-native-20261015-150348/physical-nonword-drag-events.json` | 有受信任的拖拽开始/结束，但无 `cite-call`；同一测试 Word 文档的 CSL 域数保持 1。当前包尚未重复该物理负向测试。 |
| 历史单引号实机检查 | 本轮早期候选包、隔离 Zotero 与 Word 文档 | Zotero 获得前台焦点时，单引号确实可插入真实 Zotero 域；读取 Word 太早曾短暂显示旧字段数。由于隐式光标与窗口焦点容易误解，最终产品决定移除这一入口。最终包的源码和原生设置测试均确认不再注册/触发该快捷引用。 |

## 关键实现约束

`dragend` 的目标判定必须同步完成：先读取光标坐标，再取得光标下窗口、所属 PID 与可执行文件路径。句柄和 DLL 在 `finally` 中释放。无法取得进程信息返回 `unknown`，不得调用会改变 Word 的 Integration 命令“试探”。`dropEffect` 不能用于判定 Word 释放是否成功，因为空载荷真实拖入 Word 时观测值仍可为 `none`。

Zotero 10 的插件主动 WinWord 命令可能以 `docId=null` 启动 Integration；此时没有可靠文件名。显示 `Word 文档（待识别） N` 是明确占位，不宣称已经读到真实文件名。会话映射仍以 session ID 为键；以后 Integration 提供可信路径时，现有文集原地重命名。URL 名称只解码最终 basename，编码的路径分隔符不当作文件名。此改动不触及附件物理文件名或 Word 引用内容。

## 尚未覆盖的风险

1. 进程判定只能证明释放时光标下属于 Word，不能证明落点是 Word 正文，也不能证明多 Word 窗口时 Integration 的活动文档就是鼠标下的文档。需要可靠窗口到文档映射和双文档物理拖拽矩阵后，才可宣称精确落点安全。
2. 非 Windows 平台返回 `unknown` 并停止自动插入；macOS 尚无同等级实现和实机验收。
3. 当前物理测试覆盖单屏当前缩放、Zotero 10.0.6 与 Word 16.0.20430；其他 Zotero 大版本、多显示器、高 DPI 和长期真实文档尚待回归。
4. 一次性用户提示由 Zotero `ProgressWindow` 展示并在 15 秒内限流。`unknown` 分支的禁插入由自动化与隔离 Zotero 合成拖拽检查覆盖；尚未找到可稳定复现原生查询失败的真实桌面条件。

## 兼容性核验（当前候选包）

- 对照 Zotero 官方 [8 开发者说明](https://www.zotero.org/support/dev/zotero_8_for_developers)、[9 开发者说明](https://www.zotero.org/support/dev/zotero_9_for_developers) 和 [10 开发者说明](https://www.zotero.org/support/dev/zotero_10_for_developers) 检查了源码：未使用已列明的单选集合旧接口、`DataTransfer.types.contains()` 或旧 JSM 导入；Zotero 10 多选集合读取走 `getSelectedCollections()`。这些是静态检查，不替代目标版本实机运行。
- 设置页由 PreferencePanes 的 `scripts` 字段加载 `chrome/content/preferences.js`，移除 XHTML 内联 `onload`；通过新候选包在 Zotero 10.0.6 中检查面板打开、关闭重开、停用/启用和所有九项设置。此改动针对未来 chrome CSP 收紧的风险，不能据此宣称 Zotero 11 已通过验收。
- 核验本机 Zotero 10.0.6 的 `Integration.getApplication()` 每次创建新的 WinWord Application 实例；因此 `cite.mjs` 对该实例的临时 `getActiveDocument` 适配在该版本不污染后续原生 Integration 实例。`Session.prototype.cite` 和 `getApplication` 仍是宿主内部接口，未来大版本需要重新核对源码和真实 Word 域。
- 发布前的根 `update.json` 和 `v10` Release 都指向旧 XPI（旧 SHA-256：`c7b398d4928cb01326c462c44302a7dfe9f7f7be6bb1159d486688c5f29838c8`）；已将 feed 与本次 XPI 对齐，并在 Release 中替换同名资产。上传后重新从 GitHub 下载 Release XPI，并用 Release API 与 GitHub `update.json` 交叉核验，三处 SHA-256 均为 `32ef68197e25ebf863550d7116b7bacefccc2c0a41bd838b61e1e15434debeba`。`v10` 标签保持原指针，因此 Release 的源码归档仍对应原标签提交，当前重建源码提交位于 `main`。Zotero 8、9、11 无本轮实机证据，manifest 的 `8.0–11.0.*` 是安装筛选声明，而非通过证明。
- 对两个候选 XPI 逐项比较，运行文件变化仅为新增 `preferences.js`、修改 `preferences.xhtml`、以及 bundle 增加 `scripts` 与 `defaultXUL` 两行设置页注册参数；Word 插入、拖拽和标签实现字节未变。这使前一候选包的物理拖拽证据对核心路径仍有参考价值，但不把它冒充当前包的物理输入验收。
