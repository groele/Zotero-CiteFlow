# Zotero CiteFlow 核心技术与维护手册

> 本文是当前实现和验证状态的维护入口，适用于仓库 `groele/Zotero-CiteFlow`。代码是最终事实来源；本文记录的实机结果只适用于所列软件版本。当前源码版本为 **16.2.0**。更新实现后，请同步更新此文档和对应测试，不要把历史记录误当作当前验收。

## 1. 当前状态与结论

- 插件显示名称与作者：`Zotero CiteFlow`；插件 ID：`citeflow@groele`；Chrome resource：`zoterocitation`；偏好命名空间：`extensions.zotero.zoterocitation.*`。ID 与偏好命名空间刻意不同，升级时不要随意重命名，否则会造成偏好和兼容性迁移问题。
- 当前版本：`16.2.0`（对应提交与带注释标签 `v16.2.0`）。`manifest.json` 与 `update.json` 统一声明 Zotero `10.0` 至 `12.*`，但声明范围不等于全版本实机认证。
- 实机参考基线：Word 真机物理拖拽插入基线记录来自 Windows + Zotero `10.0.6` + Microsoft Word `16.0.20430`（插入 Zotero 原生可刷新 `ADDIN ZOTERO_ITEM CSL_CITATION` 域）；桌面启动、设置面板与本地化/拖拽探测需按版本在本地 Zotero 10 独立配置中复测。
- 自动化基线：`npm test` 涵盖 `tsc --noEmit` 类型守卫、`scripts/architecture-guard.mjs`（含 360 行零债务、FTL 零硬编码版本、废弃 API 扫描与版本哈希一致校验）及全部 `tests/*.test.*` 回归；Node 模拟测试不替代 Windows/Word 真实桌面端集成验证。
- 已知边界见“已知问题与风险”，每次发布前须如实记录实跑命令与通过范围。

## 2. 源码结构与职责

| 路径 | 职责 |
| --- | --- |
| `bootstrap.js` | Zotero 插件启动入口；等待 Zotero 可用、停用历史插件 ID、注册 Chrome 资源、载入生产 bundle；卸载时撤销资源并转交清理。 |
| `src/config.ts` | 插件显示名、插件 ID、内部 resource ID、Zotero 全局实例键。 |
| `src/index.ts`、`src/addon.ts`、`src/runtime.ts`、`src/preferences.ts` | 创建 addon API（含 `addon.api.citeItems` 并发拖拽占线提示）、运行时 patch 注册/恢复、设置入口与全局 bundle 初始化。 |
| `src/hooks.ts` | 启动/关闭顺序、单窗口容错挂载、`probeForegroundWordTitle`/`probeWordWindowTitles` 注册与设置应用；缺失初始主窗口或单窗口准备失败时保留设置面板与监听服务。 |
| `src/modules/cite.ts` | 将 Zotero 已选条目通过 Zotero 原生 Integration Session 写入 Word；追踪全部临时适配的 WinWord `application` 实例并在 `finally` 中恢复 `getActiveDocument`。 |
| `src/modules/citation.ts`、`src/modules/citation/*.ts` | 文档/会话扫描、前台 Word 唯一窗口同步 `activeSessionID`、同名文档路径区分、引用快照指纹脏检查与树视图行级增量失效（`refresh-helpers.ts`/`session-sync-helpers.ts`）、引用集合、标签同步与孤立托管标签启动清理、失败恢复及诊断。 |
| `src/modules/views.ts`、`src/modules/views/*.ts` | Zotero 条目表格中的引用状态列（`enabledTreeIDs: ["main"]`）、集合图标与拖拽引用生命周期。 |
| `src/modules/drop-target.ts` | Windows 原生光标下窗口与进程识别；通过 `supportsNativeDropTarget()` 仅在 Windows 启用，非 Windows 保留 Zotero 原生拖拽。 |
| `src/modules/preferences.ts` | 偏好默认值/校验、编译期版本/日期宏注入、十项设置面板绑定、主从联动与清理。 |
| `src/modules/locale.ts`、`locale/` | Fluent 本地化初始化、英文与简体中文 `.ftl` 资源（无静态版本号硬编码，使用 `v{ $version }`）。 |
| `chrome/content/preferences.xhtml`、`preferences.js`、`preferences.css` | Zotero 设置页面五段式卡片布局（16px/24px/40px 网格）、外部初始化脚本与样式；无内联事件处理。 |
| `chrome/content/scripts/index.js`、`chrome/content/preferences.js` | 从 `src/` 编译生成的生产 bundle（`minify: false`）；不要手工编辑。 |
| `csl/compact-journal-reference.csl` | 收录并维护的紧凑期刊 CSL 1.0.2 引用样式。 |
| `scripts/build-source.mjs`、`scripts/architecture-guard.mjs` | 执行 `tsc --noEmit`、全链路架构守护并用锁定版本 `esbuild` 打包 TypeScript 模块。 |
| `scripts/build.ps1` | 触发构建、打包 XPI（统一 `/` 路径条目）、计算 SHA-512 并同步更新 `dist/update.json` 与根目录 `update.json`，随后执行完整测试集。 |
| `tests/` | 启动/关闭、设置、标签/引用数据、拖拽生命周期、Word 适配、架构守护及打包契约的自动化回归。 |

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

`src/modules/views/drag-cite.ts` 仅在 `supportsNativeDropTarget()` 为真（Windows）时包装 Zotero `itemsView.onDragStart`：先调用原生 `onDragStart` 保持 `zotero/item` 等内部负载以维持文集与废纸篓拖拽，并同步选取光标下行后快照普通顶层条目；随后仅移除 `text/html` 并置空 `text/plain` 阻止默认书目粘贴。`dragend` 时检查取消标记并探测光标下窗口进程：仅 `word-confirmed` 调用 `citeItems()`；macOS/Linux 自动跳过接管以完整保留原生快速复制与拖拽体验。

关键兼容事实：Word 对空文本拖拽可能报告 `dataTransfer.dropEffect === "none"`，即使实际已释放到 Word 页面，因此不能仅凭 `dropEffect` 判定取消。Windows 探测使用 `GetCursorPos`、`WindowFromPoint`、`GetWindowThreadProcessId` 与 `QueryFullProcessImageNameW`；本地资源在同一次事件内释放。此识别能确认目标进程，但不能单凭进程名证明 Word 文档正文确实是落点，也不能保证多个 Word 文档间的活动文档就是鼠标下文档。

### 4.2 Zotero 原生 Word Integration

`src/modules/cite.ts` 不自行构造普通文本引用，而是临时适配 Zotero 的 `Integration.getApplication` 和 `Integration.Session.prototype.cite`，让 Word Integration 以当前所选条目构造原生 CSL citation，在 `finally` 路径通过 `restorePatchedApplications()` 恢复所有已包装 `application` 实例上的 `getActiveDocument` 与原生方法。Zotero 10 WinWord 路径可能以 `null` 调用 `getDocument()`，插件将这个特定参数适配为空字符串，并用调用队列防止并发串文档；`src/addon.ts` 中的 `addon.api.citeItems` 入口对进行中的并发插入显示节流非阻塞占线提示（`zoterocitation-cite-in-flight`），同时保持 `cite.ts` 核心原生写入体与 SHA-256 基线完全不变。

验收必须检查 Word 的 Zotero 域/字段及 Zotero 刷新能力，不能仅凭屏幕上出现作者标题文本判断成功。脚注样式下应检查脚注故事区；正文故事区字段数为零本身并不代表失败。

## 5. 引用追踪、集合与标签不变量

- `Citation` 通过 Zotero Word Integration 会话获得文档标识与引用快照，维护“文档 ↔ 条目”关联、引用顺序和状态缓存。
- 插件主动发起的 WinWord 命令在 Zotero 10.0.6 中可能只给出随机 session ID、没有可靠文档路径。此时临时文集显示 `Word 文档（待识别） N`，`N` 为当前进程中的稳定会话序号；以后获得可信路径时原地改名，不把随机 ID 或猜测的文件名显示给用户。
- 插件管理的引用集合/标签必须保留所有权记录。只有可以证明由插件创建/管理的 tag 才能清理；同名手动标签不得误删。
- 后台轮询与多文档收敛规则：`listener` 在多文档场景下通过只读 `probeForegroundWordTitle()` 仅在前台 Word 窗口唯一匹配单个活动会话时同步 `activeSessionID`；窗口标题识别保留多重计数（禁止用 `Set` 折叠两个同名 Word 窗口），对不同路径同名文档通过 `_getUniqueCollectionDisplayName` 附加父目录标识消除文集名歧义；未变化文档快照通过 `buildRefreshInputFingerprint` 跳过重复格式化与集合同步，并在视图未按引用列排序时通过 `invalidateRowCache` + `tree.invalidateRow` 执行行级增量重绘（超过阈值、按引用列排序或接口缺失时自动回退至 `refreshAndMaintainSelection()`）；后台窗口标题全量枚举限制为 `3000ms` 冷却周期，空闲轮询在连续 5 次无活动后平滑退避至 `3000ms`（在 `execCommand` 完成含并发 `ambiguous` 结束、会话增删或快照变化时立即复位）。
- 自定义标签名称变化必须把旧名迁移到新名；失败时保留最后一次有效所有权/状态，并允许后续重试。关闭自动标签应清除插件拥有的标记，不得删除用户手动添加的同名内容。
- 多个文档共享条目时，集合/标签体现文档并集；删除单个会话不能清掉仍被其他会话引用的条目。
- 群组库、只读库或无写权限条目需要跳过写操作并保留可恢复状态；不可把失败写入误记为已提交。
- 空快照、文档切换、无效缓存、迟到的旧 revision 均是高风险边界；采用确认/双读、revision 优先和缓存隔离，避免误清空。

修改这部分时，必须在 `tests/citation-stability.test.js` 与 `tests/citation-data.test.js` 中扩展针对所有权、回滚、并发、文档隔离、共享标签和失败恢复的测试。

## 6. 设置项

所有偏好目前位于 `extensions.zotero.zoterocitation.`。面板由 Zotero PreferencePanes API 注册，面板标题 `Zotero CiteFlow`。注册的外部 `preferences.js` 捕获动态片段的 `load` 事件并初始化面板，窗口关闭时移除监听；设置片段不再使用内联 `onload`。一般变更即时保存并排队应用；“引用追踪”影响启动时是否创建功能服务，变更后需重启 Zotero。格式错误的值回退到默认值，写入/应用失败会在面板显示。

| 设置 | 默认 | 范围/行为 |
| --- | --- | --- |
| 引用追踪 (`enable`) | 开 | 需重启；关闭后设置面板仍可用。 |
| 拖拽引用 (`dragCite.enable`) | 开 | 即时；独立于状态列是否显示；非 Windows 自动禁用该开关并保留原生拖拽。 |
| 临时引用文集 (`collections.enable`) | 开 | 即时；开启时在个人文库维护文档关联的临时文集。 |
| 自动引用标签 (`citationTags.enable`) | 开 | 即时；关闭时清理插件拥有的标签。 |
| 引用标签文本 (`citationTags.text`) | `/Citations` | 即时；去除首尾空格，1–200 字符，不允许控制字符。 |
| 标签同步延时 (`citationTagDebounceMs`) | 150 ms | 0–2000 ms。 |
| 条目视图刷新延时 (`itemsViewRefreshDebounceMs`) | 120 ms | 0–2000 ms。 |
| 诊断统计窗口 (`healthWindowMs`) | 300000 ms | 10000–3600000 ms。 |
| 慢操作阈值 (`perfSlowThresholdMs`) | 50 ms | 5–5000 ms。 |
| 调试日志 (`debug`) | 关 | 即时。 |

偏好 observer 会同步多个设置窗口；应用队列合并快速连续更新，关闭插件时取消尚未提交的 UI 更新。恢复默认只重置这十项，不重置 Zotero 其他偏好或文档数据。旧版 `quickCite.enable` 用户偏好即使仍存在于 Zotero 配置中，也不再被读取或执行。

## 7. 构建、测试、打包

要求 Node.js `>=22`、PowerShell 7（或兼容 `pwsh`）和锁文件指定依赖。

```powershell
npm ci
npm test
pwsh -NoProfile -File scripts/build.ps1 -OutputDirectory dist\candidate
```

`npm test` 与 `npm run build` 会执行 `tsc --noEmit`、`node --test scripts/architecture-guard.mjs` 并重建 TypeScript bundle；`scripts/build.ps1` 会校验打包清单、使用 `/` 规范压缩 XPI、计算 SHA-512 并同步 `dist/update.json` 与根目录 `update.json` 后运行全部 `tests/*.test.*`。不要编辑生成的 bundle 来修复功能：改 `src/` 并重新构建。

**发布校验顺序：**检查 `manifest.json`、`package.json`、`package-lock.json`、`docs/brand/product.json`、`preferences.xhtml`、`README.md`、`README.en.md`、`scripts/architecture-baseline.json` 与 `update.json` 的版本/ID/兼容范围（`python scripts/release-tags.py --self-test`）；对 Release XPI 计算 SHA-512 并与两个 `update.json` 比对；验证 tag dereference、`main` 提交和 Release asset 指向同一源码版本。

## 8. 测试覆盖和证据等级

### 自动化与桌面验证分工

`npm test` 覆盖生命周期、设置双向绑定、标签/集合所有权与回滚、WinWord 适配恢复、Zotero 10+ 拖拽/列契约、CSL 规范以及全链路架构守护；这些 Mock 回归不能替代 Windows/Zotero/Word 真机桌面端的集成验证。

### 实机验收基线与边界

真实 Word 物理拖拽基线来自历史候选包在 Windows + Zotero `10.0.6` + Microsoft Word `16.0.20430` 的验证（普通顶层条目拖入 Word 产生单次 cite 调用与 `ADDIN ZOTERO_ITEM CSL_CITATION` 域，拖入资源管理器保持零插入）。每次改版通过 `scripts/test-settings-native.ps1` 在本地隔离配置的真实 Zotero 10 中验证插件加载、Fluent 双语渲染、设置十项控制同步、原生拖拽过滤与零废弃日志后，仍需以真实 Word 环境复验物理拖拽写入。尚无等价实机证据覆盖 Zotero 11/12、macOS Word、LibreOffice 或多显示器高分屏矩阵。

## 9. 已知问题与风险（按优先级）

### P1 — 同一 Word 进程中的落点和文档身份

当前目标识别以 `WINWORD.EXE` 进程为门槛，能阻止 Zotero、资源管理器及其他进程的外部拖拽误写 Word；但 Word 功能区、空白窗体或另一个文档窗口仍归属同一进程。后续若要保证“鼠标下的确切 Word 文档”等于 Integration 活动文档，需要只读、可靠的窗口到文档映射，并以双文档/后台窗口实机矩阵验证。不能用读取“当前活动文档”代替拖拽目标的证明。

### P2 — Zotero 声明支持范围大于测试范围

`manifest.json` 与 `update.json` 声明支持 Zotero `10.0` 至 `12.*`，当前实机测试围绕 Zotero `10.0.x` 进行。插件依赖 Integration 内部对象、item view 方法与窗口生命周期 API，后续大版本升级仍需复测。

### P2 — 非 Windows 平台默认保留原生拖拽行为

`drop-target.ts` 通过 `supportsNativeDropTarget()` 仅在 Windows 启用 Word 进程确认与拖拽接管；macOS 与 Linux 默认禁用 `dragCite` 控制项并保持 Zotero 原生拖拽及快速复制不变。若未来需支持 macOS Word，应先引入等效只读目标进程确认机制并完成实机回归。

### P2 — 文档中仍有历史/过期结论

`PROJECT_AUDIT.md`、`VALIDATION-early-candidate.md` 等旧文档保留了历史阶段记录；当前实现与工程规范以 `AGENTS.md`、本手册与对应版本 `docs/releases/` 说明为准。

## 10. 后续开发准则

1. 先定位 `src/` 的源实现和相邻回归，再修改生成 bundle；提交前执行完整 `npm test`。
2. 插入行为改动必须分开验证 Zotero 原生字段、Word 字段位置（正文/脚注）和 Zotero 刷新能力。
3. 任何 tag/collection 清理都要证明插件所有权；为中途失败增加回滚与重试测试。
4. 异步设置/UI/窗口事件要覆盖：关闭期间、重复绑定、快速连续改值、一个窗口销毁而其他窗口仍打开。
5. 触及 Zotero 私有 API 时记录测试过的 Zotero 版本，并给出降级/恢复路径。
6. 更新版本时逐一检查 `package.json`、`manifest.json`、Release tag、XPI 文件名、`update.json` 链接和哈希；只改一个版本来源会造成升级失败。

## 11. 关联文档和文件

- 用户文档：`README.md`、`README.en.md`、`RELEASE_NOTES.md`、`docs/releases/`
- 第三方组件/许可：`THIRD_PARTY.md`、`LICENSE`
- 设置界面：`chrome/content/preferences.xhtml`、`chrome/content/preferences.js`、`chrome/content/preferences.css`
- 发布元数据：`manifest.json`、`update.json`
- 构建：`package.json`、`package-lock.json`、`scripts/build-source.mjs`、`scripts/build.ps1`
- 主要回归：`tests/settings-behavior.test.cjs`、`tests/preferences.test.mjs`、`tests/reference-citation.test.cjs`、`tests/citation-stability.test.js`、`tests/citation-data.test.js`、`tests/citation-word.test.js`、`tests/bootstrap.test.cjs`

