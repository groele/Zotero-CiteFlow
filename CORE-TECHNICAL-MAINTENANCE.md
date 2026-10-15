# Zotero CiteFlow 核心技术与维护手册

> 本文是当前实现和验证状态的维护入口，适用于仓库 `groele/Zotero-CiteFlow`。代码是最终事实来源；本文记录的实机结果只适用于所列软件版本。插件版本仍为 **10.0.0**。更新实现后，请同步更新此文档和对应测试，不要把历史记录误当作当前验收。

## 1. 当前状态与结论

- 插件显示名称与作者：`Zotero CiteFlow`；插件 ID：`citeflow@groele`；Chrome resource：`zoterocitation`；偏好命名空间：`extensions.zotero.zoterocitation.*`。ID 与偏好命名空间刻意不同，升级时不要随意重命名，否则会造成偏好和兼容性迁移问题。
- 当前发布版本：`10.0.0`，GitHub 标签：`v10`。声明 Zotero `8.0` 至 `11.0.*`，但声明范围不等于完整实机认证。
- 已实机验证环境：Windows、Zotero `10.0.6`、Microsoft Word `16.0.20430`。真实 Zotero→Word 拖拽插入后，Word 中得到 Zotero 原生可刷新的 `ADDIN ZOTERO_ITEM CSL_CITATION` 字段；本轮记录的是脚注样式，因此引用字段位于脚注故事区，不在主文档正文故事区。
- 本地自动化回归：`npm test` 当前通过，34 个 Node 测试目标全部通过，0 失败。它不替代 Windows 实机验收，也不表示 Zotero 8/9/11、macOS、LibreOffice 已验证。
- 尚未发现测试可复现的阻断性故障。仍有明确的验证缺口和风险，见“已知问题与风险”。

## 2. 源码结构与职责

| 路径 | 职责 |
| --- | --- |
| `bootstrap.js` | Zotero 插件启动入口；等待 Zotero 可用、停用历史插件 ID、注册 Chrome 资源、载入生产 bundle；卸载时撤销资源并转交清理。 |
| `src/config.mjs` | 插件显示名、插件 ID、内部 resource ID、Zotero 全局实例键。 |
| `src/index.mjs`、`src/addon.mjs`、`src/runtime.mjs` | 创建 addon API、运行时 patch 注册/恢复、全局状态和 bundle 初始化。 |
| `src/hooks.mjs` | 启动/关闭顺序、主窗口绑定和设置应用；不再注册单引号快捷引用监听。 |
| `src/modules/cite.mjs` | 将 Zotero 已选条目通过 Zotero 原生 Integration Session 写入 Word；包含 WinWord 兼容适配和并发保护。 |
| `src/modules/citation.mjs` | 文档/会话扫描、引用快照与缓存、引用集合、标签同步、失败恢复及诊断。此模块承载主要数据一致性逻辑。 |
| `src/modules/views.mjs` | Zotero 条目表格中的引用状态列、集合图标和拖拽引用生命周期。 |
| `src/modules/drop-target.mjs` | Windows 原生光标下窗口与进程识别；只将确认属于 `WINWORD.EXE` 的目标交给插入路径。 |
| `src/modules/preferences.mjs` | 偏好默认值/校验、设置面板注册、变更监听、应用队列、错误状态和清理。 |
| `src/modules/locale.mjs`、`locale/` | 本地化初始化、英文和简体中文资源。 |
| `chrome/content/preferences.xhtml`、`preferences.js`、`preferences.css` | Zotero 设置页面布局、外部初始化脚本与样式；无内联事件处理。 |
| `chrome/content/scripts/index.js` | 从 `src/` 生成的运行 bundle；不要手工编辑。 |
| `scripts/build-source.mjs` | 使用锁定版本 esbuild 将 11 个 ESM 源模块打包为生产 bundle。 |
| `scripts/build.ps1` | 运行 bundle 构建、语法检查和测试，打包 XPI，校验文件清单/内容哈希，生成 update manifest。 |
| `tests/` | 启动、关闭、设置、标签/引用数据、拖拽生命周期、Word 适配及打包契约的 Node 回归。 |

## 3. 启动、运行、关闭

1. `bootstrap.js` 通过 generation token 规避启动与禁用并发；等待 Zotero 初始化。
2. 启动时查询并停用旧插件 ID `zoterocitation@polygon.org`，防止旧版和 CiteFlow 同时注册同一套 API。若停用失败，启动中止，不应继续双重加载。
3. 注册 `zoterocitation` Chrome content/locale URI，然后载入 `chrome/content/scripts/index.js`。
4. `hooks.onStartup()` 等待 Zotero、解锁和 UI 就绪；初始化 locale 并注册设置面板。若“引用追踪”关闭，设置界面仍保留，但不启动追踪、视图和拖拽引用处理。
5. 开启时创建 `Citation`，扫描/绑定 Word 集成会话；创建 `Views` 并绑定所有 Zotero 主窗口，添加状态列。
6. 关闭时先停止设置监听与 UI，再解绑窗口，清理 Citation 会话，最后 `runtime.unregisterAll()` 恢复临时 patch。清理步骤互相隔离，某一步报错不应阻止其余步骤。

新增任何 host method patch 时，必须通过 `runtime.patch` 或 runtime 注册机制，并确保 disposer 在正常关闭、启动失败和窗口卸载路径上调用。不要直接永久覆盖 Zotero 原型方法。

## 4. 插入引用实现

### 4.1 拖拽引用

`views.mjs` 包装 Zotero `itemsView.onDragStart`：先让鼠标下的行成为选择，再快照已选的普通顶层条目；将拖拽 `text/plain` 置空以阻止 Zotero 默认文本/书目插入。`dragend` 时检查取消标记，并同步查询原生光标下的窗口所属进程。仅 `word-confirmed` 调用 `citeItems()`；`non-word` 不插入；`unknown` 不插入并显示限流提示。隐藏引用状态列不影响拖拽。

关键兼容事实：Word 对该空文本拖拽可能报告 `dataTransfer.dropEffect === "none"`，即使实际已释放到 Word 页面，因此不能仅凭 `dropEffect` 判定取消。Windows 探测使用 `GetCursorPos`、`WindowFromPoint`、`GetWindowThreadProcessId` 与 `QueryFullProcessImageNameW`；本地资源在同一次事件内释放。此识别能确认目标进程，但不能单凭进程名证明 Word 文档正文确实是落点，也不能保证多个 Word 文档间的活动文档就是鼠标下文档。

### 4.2 Zotero 原生 Word Integration

`cite.mjs` 不自行构造普通文本引用，而是临时适配 Zotero 的 `Integration.getApplication` 和 `Integration.Session.prototype.cite`，让 Word Integration 以当前所选条目构造原生 CSL citation，再恢复原方法。Zotero 10.0.6 的 WinWord 路径可能以 `null` 调用 `getDocument()`，而原实现会对它执行字符串操作；插件将这个特定参数适配为空字符串。调用队列防止并发命令串到错误的文档；所有临时替换在 `finally` 路径恢复。

验收必须检查 Word 的 Zotero 域/字段及 Zotero 刷新能力，不能仅凭屏幕上出现作者标题文本判断成功。脚注样式下应检查脚注故事区；正文故事区字段数为零本身并不代表失败。

## 5. 引用追踪、集合与标签不变量

- `Citation` 通过 Zotero Word Integration 会话获得文档标识与引用快照，维护“文档 ↔ 条目”关联、引用顺序和状态缓存。
- 插件主动发起的 WinWord 命令在 Zotero 10.0.6 中可能只给出随机 session ID、没有可靠文档路径。此时临时文集显示 `Word 文档（待识别） N`，`N` 为当前进程中的稳定会话序号；以后获得可信路径时原地改名，不把随机 ID 或猜测的文件名显示给用户。
- 插件管理的引用集合/标签必须保留所有权记录。只有可以证明由插件创建/管理的 tag 才能清理；同名手动标签不得误删。
- 自定义标签名称变化必须把旧名迁移到新名；失败时保留最后一次有效所有权/状态，并允许后续重试。关闭自动标签应清除插件拥有的标记，不得删除用户手动添加的同名内容。
- 多个文档共享条目时，集合/标签体现文档并集；删除单个会话不能清掉仍被其他会话引用的条目。
- 群组库、只读库或无写权限条目需要跳过写操作并保留可恢复状态；不可把失败写入误记为已提交。
- 空快照、文档切换、无效缓存、迟到的旧 revision 均是高风险边界；采用确认/双读、revision 优先和缓存隔离，避免误清空。

修改这部分时，必须在 `tests/v40-stability.test.js` 与 `tests/v4002-data.test.js` 中扩展针对所有权、回滚、并发、文档隔离、共享标签和失败恢复的测试。

## 6. 设置项

所有偏好目前位于 `extensions.zotero.zoterocitation.`。面板由 Zotero PreferencePanes API 注册，面板标题 `Zotero CiteFlow`。注册的外部 `preferences.js` 捕获动态片段的 `load` 事件并初始化面板，窗口关闭时移除监听；设置片段不再使用内联 `onload`。一般变更即时保存并排队应用；“引用追踪”影响启动时是否创建功能服务，变更后需重启 Zotero。格式错误的值回退到默认值，写入/应用失败会在面板显示。

| 设置 | 默认 | 范围/行为 |
| --- | --- | --- |
| 引用追踪 | 开 | 需重启；关闭后设置面板仍可用。 |
| 拖拽引用 | 开 | 即时；独立于状态列是否显示。 |
| 自动引用标签 | 开 | 即时；关闭时清理插件拥有的标签。 |
| 引用标签文本 | `/Citations` | 即时；去除首尾空格，1–200 字符，不允许控制字符。 |
| 标签同步延时 | 150 ms | 0–2000 ms。 |
| 条目视图刷新延时 | 120 ms | 0–2000 ms。 |
| 诊断统计窗口 | 300000 ms | 10000–3600000 ms。 |
| 慢操作阈值 | 50 ms | 5–5000 ms。 |
| 调试日志 | 关 | 即时。 |

偏好 observer 会同步多个设置窗口；应用队列合并快速连续更新，关闭插件时取消尚未提交的 UI 更新。恢复默认只重置这九项，不重置 Zotero 其他偏好或文档数据。旧版 `quickCite.enable` 用户偏好即使仍存在于 Zotero 配置中，也不再被读取或执行。

## 7. 构建、测试、打包

要求 Node.js `>=22`、PowerShell 7（或兼容 `pwsh`）和锁文件指定依赖。

```powershell
npm ci
npm test
pwsh -NoProfile -File scripts/build.ps1 -OutputDirectory dist\candidate
```

`npm test` 会先重建 bundle，再运行所有 `tests/*.test.*`。打包脚本还检查入口语法、仅包含明确列出的 14 个运行文件、归档文件与源码逐项哈希相同，并生成 `update.json`。默认输出目录 `dist`；若对应版本的 XPI 已存在，脚本会拒绝覆盖。不要编辑生成的 bundle 来修复功能：改 `src/` 并重新构建。

**发布校验顺序：**检查 `manifest.json`、`package.json`、XPI manifest、`update.json` 的版本/ID/兼容范围；对 Release XPI 计算 SHA-256 并与 update feed 比对；验证 tag dereference、`main` 提交和 Release asset 指向同一源码版本。本次按用户要求原位更新 `v10` Release 的 `10.0.0` XPI 和 feed 哈希，未改版本号或移动现有 `v10` 标签；因此源码归档仍指向旧标签提交，重建源码可在 `main` 查看。

## 8. 测试覆盖和证据等级

### 本次自动化验证

本次工程实现后运行 `npm test`：ESM 构建成功（11 个源模块），**34/34 测试目标通过，0 失败**。包含设置行为与无效值、外部脚本动态加载/释放、开关、启动/关闭恢复、拖拽事件门控、原生调用形状、缓存/标签所有权/回滚、多会话隔离和打包清单契约。

这些测试大多运行在 Node 测试替身上；“模拟 Word/Zotero API 测试通过”不能等同于真实桌面端成功。

### 实机验收记录

已在 Windows + Zotero 10.0.6 + Word 16.0.20430 的隔离文库和空白文档实测：前一候选 XPI 将普通顶层条目拖到 Word 页面时，受信任的 `dragstart/dragend`、`dropEffect=none`、一次 cite 调用与真实 `ADDIN ZOTERO_ITEM CSL_CITATION` 域均被核实；拖到文件资源管理器时不发生 cite 调用，Word 域数保持不变。当前候选 XPI 只改变设置页加载和打包文件，已重新通过原生设置检查 36 项及 Word 桥接检查 14 项；尚未对当前包重复物理拖拽。单引号入口及设置项已移除。详见本次工程验收记录。

尚无等价证据覆盖 Zotero 8/9/11、macOS Word、LibreOffice、多个显示器/DPI 缩放或用户长期真实文档。发布声明必须保留这一边界。

## 9. 已知问题与风险（按优先级）

### P1 — 同一 Word 进程中的落点和文档身份

当前目标识别以 `WINWORD.EXE` 进程为门槛，能阻止 Zotero、资源管理器及其他进程的外部拖拽误写 Word；但 Word 功能区、空白窗体或另一个文档窗口仍归属同一进程。后续若要保证“鼠标下的确切 Word 文档”等于 Integration 活动文档，需要只读、可靠的窗口到文档映射，并以双文档/后台窗口实机矩阵验证。不能用读取“当前活动文档”代替拖拽目标的证明。

### P2 — Zotero 声明支持范围大于测试范围

manifest 声明 Zotero `8.0–11.0.*`，实机记录只覆盖 `10.0.6`。插件依赖 Integration 内部对象、item view 私有方法和窗口生命周期 API，Zotero 升级可能改变这些接口。

**建议：**每个 Zotero 大版本至少跑一次插件启动/关闭、设置、跨窗口拖拽、Word 插入与原生刷新；维护兼容适配器时将版本差异封装，不要散布私有 API 判断。

| Zotero 版本 | 当前证据 | 发布前最低验收 |
| --- | --- | --- |
| 8 | 官方确认 Firefox 140 平台迁移；本项目未作 8.x 实机测试。 | 插件加载与设置页、拖拽目标、真实 Word CSL 域、刷新、禁用清理。 |
| 9 | 官方称主要开发者接口变化较少；本项目未作 9.x 实机测试。 | 同上，并检验与 8.x 的 API 适配。 |
| 10 | 10.0.6 隔离设置 36 项、Word 桥接 14 项通过；前一候选包有物理正/负拖拽证据。 | 每次触及拖拽或插入链，应以最终包重复物理正/负拖拽。 |
| 11 | manifest 按既有要求声明至 `11.0.*`；本项目无可引用的 11.x 实机验收。 | 独立 profile 的启动、设置、脚本加载、拖拽正/负目标、双 Word 文档、原生域刷新和停用清理。 |

主要升级接触面是 `Integration.getApplication`/`Session.prototype.cite`/`execCommand`、`itemsView.onDragStart`/`_resetColumns`、`ItemTreeManager`、PreferencePanes 和 Windows `js-ctypes`。前两组属于 Zotero 内部实现，manifest 的兼容声明不能保证其行为不变。Zotero 10 已明确改变多选集合与 item tree 结构；现有代码处理了 `getSelectedCollections()`，但每次大版本升级仍应按上表复测。外部设置脚本提前去掉了内联 `onload`，降低未来 chrome CSP 收紧时的设置页失效风险。

版本依据：[Zotero 8 for Developers](https://www.zotero.org/support/dev/zotero_8_for_developers)、[Zotero 9 for Developers](https://www.zotero.org/support/dev/zotero_9_for_developers)、[Zotero 10 for Developers](https://www.zotero.org/support/dev/zotero_10_for_developers)、[Zotero 7 插件设置页注册示例](https://www.zotero.org/support/dev/zotero_7_for_developers)。Zotero 11 的具体接口必须以届时可访问的官方说明和实际开发/正式版为准。

### P2 — Windows 以外的平台尚无目标确认实现

`drop-target.mjs` 在非 Windows 平台返回 `unknown`，因此不会自动发起 Word 引用。该降级保护数据，但会改变 macOS 的旧式拖放行为。若要支持 macOS，应先找到同等级的只读窗口进程识别接口，再完成 macOS Word 的实机回归；不能恢复“离开源窗口即插入”的默认逻辑。

### P2 — 文档中仍有历史/过期结论

`PROJECT_AUDIT.md`、`VALIDATION-40.1.0.md` 等旧文档保留了历史失败结论。当前实现以本文和本次工程验收记录为准；读取旧报告时需先核对日期、版本和测试范围。

## 10. 后续开发准则

1. 先定位 `src/` 的源实现和相邻回归，再修改生成 bundle；提交前执行完整 `npm test`。
2. 插入行为改动必须分开验证 Zotero 原生字段、Word 字段位置（正文/脚注）和 Zotero 刷新能力。
3. 任何 tag/collection 清理都要证明插件所有权；为中途失败增加回滚与重试测试。
4. 异步设置/UI/窗口事件要覆盖：关闭期间、重复绑定、快速连续改值、一个窗口销毁而其他窗口仍打开。
5. 触及 Zotero 私有 API 时记录测试过的 Zotero 版本，并给出降级/恢复路径。
6. 更新版本时逐一检查 `package.json`、`manifest.json`、Release tag、XPI 文件名、`update.json` 链接和哈希；只改一个版本来源会造成升级失败。

## 11. 关联文档和文件

- 用户文档：`README.md`、`README.zh-CN.md`
- 第三方组件/许可：`THIRD_PARTY.md`、`LICENSE`
- 设置界面：`chrome/content/preferences.xhtml`、`chrome/content/preferences.js`、`chrome/content/preferences.css`
- 发布元数据：`manifest.json`、`update.json`
- 构建：`package.json`、`package-lock.json`、`scripts/build-source.mjs`、`scripts/build.ps1`
- 主要回归：`tests/settings-behavior.test.cjs`、`tests/preferences.test.mjs`、`tests/reference-citation.test.cjs`、`tests/v40-stability.test.js`、`tests/v4002-data.test.js`、`tests/v4002-word.test.js`、`tests/bootstrap.test.cjs`

