# Zotero CiteFlow 13.2.2

**发布日期**：2026-11-04
**适用版本**：Zotero `10.0` - `12.*`

## 细节打磨与多窗口事件解绑加固（v13.2.2）

- **设置页第 4 卡片主控件与第 3 卡片从属控件层级精确区分（`preferences.css`）**：
  - 第 4 卡片（刷新调度与性能控制）内的 4 个数值输入行（`.zoterocitation-number-row`）属于该卡片的一级内容主控件（上方无父级复选框），将其 `margin-inline-start` 修正为 `0`（严格贴合卡片 `16px` 内容起始线，与上方概述说明左边缘垂直对齐）；
  - 第 3 卡片（文集呈现与标签管理）内从属于「引用后自动维护标签」复选框的「引用标签文本」输入行（`.zoterocitation-number-row.zoterocitation-subordinate-row`）保持 `margin-inline-start: 24px`（精准对齐 `40px` 黄金基准线）。
- **多窗口拖拽事件 `dragend` 精确宿主文档解绑（`views/drag-cite.mjs` / `views.mjs`）**：
  - 在 `dragCite()` 绑定 `dragend` 监听器时显式保存目标文档引用 `this._dragDocument`，并在 `dispose()` 与异常回滚时优先从 `this._dragDocument` 解绑，防止多窗口焦点切换后 `this.document` 动态 getter 指向其他窗口导致事件监听器残留。

---

# Zotero CiteFlow 13.2.1

**发布日期**：2026-11-04
**适用版本**：Zotero `10.0` - `12.*`

## 执行逻辑与并发时序深度加固（v13.2.1）

- **窗口并发挂载与中途关闭自清理（`src/hooks.mjs`）**：
  - `attachWindow(win)` 引入 `binding.readyPromise` 幂等锁，防止 `onStartup()` 与 `onMainWindowLoad(win)` 并发调用时提前返回未完成初始化的窗口绑定；
  - 在 `prepareWindow`、`patchIcon`、`dragCite` 各异步阶段增加 `win.closed || binding.closed || !addon.data.alive` 检查并自动执行 `detachWindow(win)`，杜绝窗口在初始化中途关闭时残留半挂载补丁。
- **集合创建事务与会话关闭/开关切换的异步竞态闭环（`collections.mjs` / `formatting.mjs`）**：
  - `initCollection()` 在 `await collection.saveTx()` 返回后，新增对 `session.closing` 及 `collections.enable === false` 的二次核验；若事务等待期间会话进入关闭流程或用户关闭了临时集合开关，立即回滚擦除该集合并清理 `_temporaryCollectionKeys`；
  - `clearSession()` 将 `this._initializationTasks?.get?.(sessionID)` 纳入前置 `Promise.allSettled` 等待队列，彻底消除会话销毁与集合初始化并发导致的孤儿集合。
- **多文档前台窗口标题防误抢（`document-naming.mjs`）**：
  - `_resolveFallbackDocumentId()` 在读取 `probed.foregroundTitle` 前先行计算已被其他活动会话占用的文档名集合 `claimedByOthers`；当用户切换焦点至已识别文档 `A.docx` 时，未识别的后台新会话 `S2` 绝不误抢 `A.docx` 的标题，而是精准匹配唯一未被占用的可见 Word 窗口标题。
- **Word 命令完成后零节流即时刷新（`word-integration.mjs`）**：
  - `_handlePostExecCommand()` 在调用 `refreshSessionCitations()` 前清除 `this._lastRefreshAt[sessionID]`，确保用户插入或编辑引文后的显式刷新永不被前序后台轮询的 500ms 节流窗口推迟。
- **空文档确认后的排序签名缓存同步驱逐（`formatting.mjs`）**：
  - `_handleEmptyCitationSnapshot()` 在二次确认文档引文已清空时，同步驱逐 `_sortedCacheBySession` 中该会话的旧排序签名缓存，保持缓存与 `session.idData` 绝对一致。

---

# Zotero CiteFlow 13.2.0

**发布日期**：2026-11-04
**适用版本**：Zotero `10.0` - `12.*`

## 13.2.0 里程碑特性与全链路架构升级汇总

### 1. 全链路数据处理与容错加固
- **临时集合开关与核心管线彻底解耦（`word-integration.mjs`）**：
  - 关闭 `collections.enable`（不生成 Word 临时集合）时，`ensureSession()`、`_syncActiveWordSessions()` 与 `_handlePostExecCommand()` 仍完整驱动主列表「Citation」列（`session.idData`）、自动标签（`_sessionCitedIDs`）及后台文档名称识别（`session.docId`）；
  - 重新开启 `collections.enable` 时，新建集合立即根据 `session.idData` 同步回填已引用的条目，关闭时严格在 `await col.eraseTx()` 成功后才移除持久化追踪键。
- **全回收站文档自动清空与脏键防护（`order-cache.mjs` / `formatting.mjs`）**：
  - 新增 `_hasOnlyTrashedCitationItems(citationsByIndex)`，精确区分「畸形快照」与「文档内所有引文均已移入 Zotero 回收站/删除」，后者自动清空 `session.idData`、移除临时集合成员并清理会话引用标签；
  - 对 `citationsByItemID` 的键统一经由 `_parseValidItemID` 过滤非正安全整数，拒绝脏键进入 `session.idData`。
- **底层 `cite.mjs` 直通守卫与多窗口自愈（`cite.mjs` / `hooks.mjs` / `views.mjs`）**：
  - 在 `src/modules/cite.mjs` 核心函数中直接内聚多窗口聚焦解析（`Zotero.getMainWindow()` 优先）与 `deleted / inTrash` 拦截；
  - `src/hooks.mjs` 实现 `rebindGlobalWindow()`，任意主窗口卸载时自动将 `globalThis.window / document / ZoteroPane / Zotero_Tabs` 重绑定至其余未关闭的活动主窗口；
  - `ViewsSessionIndex` 显式过滤 `closing: true` 的正在销毁会话。
- **回收站条目标签治理与设置页状态精准判定（`tag-governance.mjs`）**：
  - 曾被打上管理标签的条目移入回收站后，严格跳过写入并保留管理记录（便于恢复后自动清理），且不触发 `complete: false` 误报。

### 2. 模块化设置面板与排版规范
- **四卡片模块化设置页架构（`preferences.xhtml` / `preferences.css` / `preferences.mjs`）**：
  - 按业务流划分为「核心引用追踪与主列表视图」「Word 文档联动与自动标记」「性能调优与同步节流」「版本信息與运行诊断」四个单层折叠分组，仅默认展开首组；
  - 严格对齐 `16px / 40px` 三级边缘距离标准规范，消除全部内联硬编码中文，在初始化、变更、外部同步与恢复默认设置时全量联动子项启用状态；
  - 在线更新源 `update.json` 全面采用 `sha512:` 校验哈希。

---

# Zotero CiteFlow 13.0.13

**发布日期**：2026-11-04
**适用版本**：Zotero `10.0` - `12.*`

## 全链路数据处理深度加固（v13.0.13）

- **解耦临时集合开关与核心数据同步管线（`word-integration.mjs`）**：
  - 修复当用户关闭 `collections.enable`（不生成 Word 临时集合）时，`ensureSession()`、`_syncActiveWordSessions()` 与 `_handlePostExecCommand()` 因检查 `!tracked.collection` 而提前中断、导致主列表「Citation」列（`session.idData`）与自动标签（`_sessionCitedIDs`）停止更新的链路阻断问题；
  - 即使关闭临时集合，后台 `_syncSessionDocumentName()` 仍正常解析并记录 `session.docId`，确保后续随时开启临时集合时无需重新等待文档名识别。
- **文档全部引文移入回收站时的残留状态自动清空（`order-cache.mjs` / `formatting.mjs`）**：
  - 新增 `_hasOnlyTrashedCitationItems(citationsByIndex)` 精确区分「损坏/畸形快照」与「文档内所有引文均已移入 Zotero 回收站或删除」；
  - 当文档内引用的条目全部移入回收站导致 `sortedItemIDs` 为空时，不再提前退出，而是立即清空该会话的 `session.idData`、从临时集合移除回收站条目并清除对应会话的引用标签集合。
- **`_applyCitations` 脏键清洗与防污染（`formatting.mjs`）**：
  - 对 `citationsByItemID` 的键统一通过 `_parseValidItemID` 校验正安全整数，彻底拦截 `"0"`、`"-1"`、`"NaN"` 等非法键进入 `session.idData`。
- **回收站条目标签同步状态精准判定（`tag-governance.mjs`）**：
  - 当曾被打上 `/Citations` 管理标签的条目被移入回收站时，严格遵循只读防护跳过写入并保留管理记录（便于从回收站恢复后自动清理），同时不再将其误判为写入失败（`skipped = true` / `complete: false`），消除设置面板误报「应用当前更改失败」的问题。
- **会话关闭过渡期的视图索引隔离（`views/session-index.mjs`）**：
  - `_getSessionIndex()` 与 `getCitationText()` 显式过滤 `session.closing === true` 的正在销毁会话，防止会话异步关闭期间主列表「Citation」列读取到过期缓存。

---

# Zotero CiteFlow 13.0.12

**发布日期**：2026-11-04
**适用版本**：Zotero `10.0` - `12.*`

## 深度加固与审计完善（v13.0.12）

- **底层 `src/modules/cite.mjs` 原生守卫直通加固**：
  - 将多窗口聚焦解析（优先 `Zotero.getMainWindow()`，平滑回退 `globalThis.window` 与 `Zotero.getMainWindows()[0]`）与回收站/已删除条目拦截（`item.deleted !== true && item.inTrash !== true`）直接内聚至底层 `src/modules/cite.mjs` 的 `citeItems()` 核心函数中，同时在 `tests/reference-citation.test.cjs` 中建立显式结构断言与 SHA-256 归一化校验，确保无论通过 `addon.api.citeItems` 还是直接加载 `cite.mjs` 模块均具备 100% 防护。
- **多窗口生命周期与 `Views.document` 对称重绑定**：
  - `src/hooks.mjs` 新增 `rebindGlobalWindow(closingWin)` 机制：即使某窗口在未启用跟踪状态下关闭，只要其曾绑定在 `globalThis.window`，卸载时都会自动探测并重绑定到其余未关闭的活动主窗口（`!w.closed`）；
  - `src/modules/views.mjs` 的 `document` getter 与 `window` getter 完全对齐，优先返回 `this._window?.document ?? Zotero.getMainWindow?.()?.document ?? globalThis.document`。
- **临时集合开关切换的事务原子性与重开即时回填**：
  - 在 `src/modules/citation/preferences-sync.mjs` 中，关闭 `collections.enable` 时严格在 `await col.eraseTx()` 成功后才从 `_temporaryCollectionKeys` 移除对应 key，若底层事务异常则保留 key 供后续自愈清理；
  - 重新开启 `collections.enable` 时，为活动会话创建集合后立即根据 `session.idData` 同步填充已引用的文献条目（`syncCollectionItems`），并刷新会话索引。

---

# Zotero CiteFlow Release Notes

## 13.0.11 (2026-11-04) — Multi-Window Unload Fallback, Trashed Item Guard, Collection Teardown Ordering & SHA-512 Feed

- **多窗口卸载回退与回收站安全过滤（`src/hooks.mjs` / `src/addon.mjs`）**：
  - **多窗口平滑回退（`detachWindow`）**：关闭单主窗口时自动从剩余的活动主窗口（`windowBindings` 或 `Zotero.getMainWindows()`）重新绑定 `globalThis.window / document / ZoteroPane / Zotero_Tabs`，仅当最后一个主窗口关闭时才置空，根除双主窗口下关闭一个导致 `citeItems()` 空指针崩溃的问题；
  - **回收站与已删除条目严格拦截（`addon.api.citeItems`）**：在注入 Word 之前对条目进行统一安全校验，严格过滤 `item.deleted === true` 与 `item.inTrash === true`，与拖拽引文安全守卫完全对齐；
- **临时文集擦除顺序与键残留修复（`src/modules/citation/preferences-sync.mjs`）**：
  - **正序擦除与索引失效**：关闭 `collections.enable` 时，优先从活动会话解除 `session.collection` 绑定并调用 `_invalidateSessionIndex()`，逐一 `await` 集合底层 `eraseTx()`，并从 `_temporaryCollectionKeys` 移除持久化键值后存盘，最后调用 `clearStaleArtifacts()`，彻底消除临时集合残留；
- **设置页交互、排版与规范深度对齐（`preferences.mjs` / `preferences.xhtml` / `preferences.css`）**：
  - **全生命周期开关联动（`Preferences.init` / `reset`）**：在设置面板初次挂载及点击“恢复默认设置”时同步触发 `updateDependencies()`，确保子项 `disabled` 状态即时生效；
  - **首组默认展开规范**：设置页仅保留第 1 组折叠卡片默认展开（`open="open"`），其余卡片默认折叠；
  - **纯净本地化**：剔除版本信息卡片中的硬编码中文，完全由 Fluent 国际化资源驱动；
  - **排版对齐修复**：修复第 4 卡片「刷新调度与性能控制」内的一级顶部概述说明被误推至 40px 的问题，一级概述严格贴合 16px 内容基准线（0px 相对偏移）；
- **在线更新源 sha512 规范严格对齐（`scripts/build.ps1` / `tests/package.test.cjs` / `update.json`）**：
  - 严格对齐 `AGENTS.md` 205/227 条例，将构建流水线、更新清单及单元测试的哈希前缀统一规范为 `sha512:`。

## 13.0.10 (2026-11-03) — Modular Preferences Architecture, Dedicated Collections Toggle & Dependency Interlocking Guard

- **设置面板五大业务流转模块化重构与 40px 黄金基准对齐（`chrome/content/preferences.xhtml` / `preferences.css`）**：
  - **五大业务流转模块卡片**：自上而下分为「核心引用追踪（Core Tracking Service）」、「写作交互与快捷引文（Writing Interaction & Quick Cite）」、「临时文集与标签治理（Collections & Tag Governance）」、「刷新调度与性能控制（Scheduling & Performance）」、「诊断调试与系统维护（Diagnostics & Maintenance）」，以及独立版本信息卡片；
  - **三级层级与 40px 黄金垂直对齐**：卡片内边距统一 `16px`、二级控件标签确立 `40px` 黄金基准线、三级从属说明与控件（如标签文本输入框）声明 `margin-inline-start: 24px`，确保文字与控件左侧在 `40px` 竖线上严格垂直对齐；
- **临时文集独立开关与主从开关联动禁用防护（`prefs.js` / `preferences.mjs` / `collections.mjs` / `preferences-sync.mjs`）**：
  - **独立文集生成开关（`collections.enable`）**：新增临时文集控制偏好，允许用户自主选择是否在文库中生成 Word 临时分类文集；
  - **主从开关联动保护（`updateDependencies`）**：取消勾选「自动维护引用标签」时，子级「标签文本」输入框自动禁用（`disabled`）且行容器透明度淡化（`is-disabled`），杜绝无效交互与配置歧义；
  - **偏好实时同步与无损增删**：开关变更时动态清除旧文集或自愈恢复活跃会话文集；
- **国际化本地化同步完善（`locale/zh-CN` / `locale/en-US`）**：
  - 补充五大模块分组标题与说明文案，术语保持统一规范；
- **全量自动化测试验证**：53 项顶层测试套件 100% 通过。

## 13.0.9 (2026-11-03) — Multi-Window Tree Self-Healing, Zero-Width Citation Sanitization & Transactional Membership Guard

- **文集树多窗口与展开自愈重排（`src/modules/views/icon-patch.mjs`）**：
  - **全局多窗口文集树枚举（`_getAllCollectionsViews`）**：支持遍历覆盖主窗口及拆分标签页/外置阅读器窗口中的全部 `collectionsView` 实例，确保多窗口工作流下 Word 文档文集在每个活动窗口中均统一保持在「我的出版物」正上方；
  - **展开/折叠动态自愈刷新（`_expandRow` / `_refreshRowMap`）**：在用户展开「我的文库」或上级文集后，重排 Word 临时文集的同时自动调用 `cv._refreshRowMap()` 与 `cv.tree?.invalidate()`，杜绝文集折叠再展开时的行映射偏移动作；
- **引文纯文本标签空白净化与去重折叠（`src/modules/citation/formatting.mjs`）**：
  - 在 `_formatItemPlainCitation` 中深度剔除 Unicode 零宽字符（`\u200B-\u200F`、`\uFEFF`）及控制字符，净化学术引文标签回显；
  - 对同一条目在 Word 复合引文域中出现的重复标签进行自动折叠去重，避免同一标签过度堆叠显示；
- **文集条目同步事务异常隔离与跨库防护（`collections.mjs` / `formatting.mjs`）**：
  - 在 `syncCollectionItems` 中为 `Zotero.DB.executeTransaction` 增加专属异常捕获与诊断日志，杜绝底层数据库瞬时锁或并发事务中断全局会话刷新；
  - 在 `_applyCitations` 中采用 `citationSession.collection?.libraryID ?? Zotero.Libraries.userLibraryID`，确保条目文库归属与临时集合严格匹配；
- **全量自动化测试验证**：53 项顶层测试套件 100% 通过（新增引文标签空白净化与去重折叠测试用例）。

## 13.0.8 (2026-11-03) — Word Collection Tree Positioning Above My Publications & Legacy v40 Renaming Cleanup

- **Word 文档文集树位置精准重排（`src/modules/views/icon-patch.mjs` / `src/modules/citation/collections.mjs`）**：
  - **精准固定在「我的出版物」正上方**：彻底解决 Zotero 10 中 ICU 本地化排序（`Zotero.localeCompare`）导致中文命名的 Word 文档（如 `新建 Microsoft Word 文档.docx`）在树视图中被排在数字文件夹（如 `06_Reference Shelf`）与字母文件夹（如 `Daily Folder`）之间的视觉跳跃问题；
  - **文集树动态重排与切片重构（`_reorderCitationRowsInSlice` / `repositionCitationCollections`）**：通过对 `collectionsView._rows` 数据切片进行结构感知重排，将所有 CiteFlow 管理的 Word 临时文集统一置于所有常规文集/搜索文件夹之后、并在「我的出版物 (`publications`)」虚拟项的正上方排布；
  - **层级折叠块完整性与选区精确同步**：严格保持用户带有子文集的普通文件夹节点块完整性；重排后动态同步刷新 `_rowMap` 并精确平移 `selection.focused`、`selection.pivot` 及 `selection.selected`，确保焦点与选区零偏移；
  - **新增与重命名动态插入拦截（`_addSortedRow` / `_insertCitationRowAbovePublications`）**：在集合初始化 `initCollection`、重命名 `_renameCollection` 及 Zotero 原生 `_addSortedRow` 链路中提供无缝定位锚点，常规文集保存时自动停在 Word 文集上方，Word 文集保存时直接落在「我的出版物」上方。
- **项目历史遗留 `v40` 实验代号与文件名彻底清理规范**：
  - 将所有历史 `tests/v40*.test.js` 测试套件标准化重命名为语义清晰的 `tests/citation-stability.test.js`、`tests/citation-data.test.js`、`tests/citation-ui.test.js` 与 `tests/citation-word.test.js`；
  - 将 `VALIDATION-40.1.0.md` 归档为 `VALIDATION-early-candidate.md`，清理遗留的 `build-legacy-nullfix-probe.py` 探测脚本，全面剔除所有核心维护文档中的旧代号残留。
- **全量自动化测试验证**：52 项顶层测试套件 100% 通过（新增针对中文 Word 集合行位置重排与选区保持的端到端用例）。

## 13.0.7 (2026-11-03) — Multi-Source Word Document Identification, Drag-Target Window Title Extraction & Pending Collection Self-Healing

- **消除「Word 文档（待识别） 1」的多源文档智能识别引擎（`drop-target.mjs` / `document-naming.mjs` / `word-integration.mjs` / `collections.mjs`）**：
  - **拖拽释放瞬间精准捕获目标 Word 窗口标题（`resolveWordDropTarget`）**：在用户将文献拖入 Word 窗口时，虽然底层 `cite.mjs` 以 `docId = null` 调用原生 `execCommand`，`drop-target.mjs` 现通过 `GetAncestor(targetWindow, GA_ROOT)` + `GetWindowTextW` 直接从鼠标落点所在的精确 `WINWORD.EXE` 顶层窗口提取文档标题（自动剥离 `- Word`、`[兼容模式]`、`- 已保存到此电脑`、`- 只读` 等状态后缀），使拖拽引文创建的集合直接以真实文档名命名，彻底告别 `Word 文档（待识别） 1`；
  - **后台轮询无歧义 `OpusApp` 窗口自愈重命名（`_syncSessionDocumentName` / `probeWordWindowTitles`）**：当会话在启动或后台扫描时处于 `Word 文档（待识别） N` 状态，或用户将未保存的 `文档1` 在 Word 中按下 `Ctrl+S` 另存为正式文件名（如 `毕业论文.docx`）时，后台轮询通过枚举可见 `OpusApp` 窗口（在单文档或排除已识别文档后唯一无歧义时）自动将临时集合原地重命名为最新文档名，同时在多未识别文档并存时严格拒绝盲猜；
  - **集合初始化直通命名（`initCollection` / `ensureSession`）**：创建临时集合时若已知悉文档标识，直接赋予真实文档名称，不再先以 `Word 文档（待识别） 1` 落盘后再二次改名；
  - **SharePoint / OneDrive URL 与特殊字符容错解析（`_getDocumentDisplayName`）**：支持提取 SharePoint `Doc.aspx?file=xxx.docx` 查询参数中的文档名，并对含字面量 `%`（如 `进度50%论文.docx`）的云端 URL 实施分段容错解码（避免 `decodeURIComponent` 抛出 `URIError` 导致回退为待识别状态），同时保持对 `%2F`/`%5C` 路径分隔符注入的严格拦截。
- **全量自动化测试验证**：51 项顶层测试套件 100% 通过。

## 13.0.6 (2026-11-03) — Active Collection Guard, Polling Command Yield, Multi-Window Refresh Deduplication & 14px Typography Alignment

- **活跃会话临时集合防误删保护（`src/modules/citation/collections.mjs`）**：
  - 在 `_clearStaleTemporaryCollections` 中提取当前所有未关闭活跃会话（`!session.closing && session.collection?.key`）的 `activeKeys` 白名单集合；即便在会话运行期间触发孤儿资产清理（`clearStaleArtifacts`），也绝不误删当前正在编辑的 Word 文档临时集合。
- **Word 原生指令期间后台轮询瞬时让出（`src/modules/citation/word-integration.mjs`）**：
  - 在 `_syncActiveWordSessions` 遍历刷新多会话引文快照的循环体内新增 `if (this._listenerStopped || this._isExecCommandRunning) break;` 抢占式检查，一旦用户在轮询中途发起 Word 原生 `execCommand` 引文插入/编辑指令，后台轮询立即中断让出，杜绝与 Word COM/Integration 事务争用。
- **会话待命名映射完整回收与多窗口视图刷新去重（`order-cache.mjs` / `lifecycle.mjs` / `formatting.mjs`）**：
  - 在 `cleanupSessionState` 中同步清理 `this._pendingCollectionNames?.delete(sessionID)`，并在 `_resetInternalTrackingMaps` 中重置 `_pendingCollectionNames` 与 `_pendingCollectionNumber`，消除长周期多文档会话的映射残留；
  - 在 `scheduleItemsViewRefresh` 中引入 `seenViews = new Set()` 对 `itemsView` 实例去重，避免多窗口枚举时对同一视图重复调用 `refreshAndMaintainSelection()`。
- **设置面板控件字号与版本徽标严格对齐（`preferences.css` / `preferences.xhtml`）**：
  - 严格对齐 `AGENTS.md` 4.1 字号基准，将 `.zoterocitation-number-row label`、`input[type="number"]`、`input[type="text"]` 与 `button` 的字号从 `13px` 统一提升至标准 **`14px`**，并同步更新设置页顶部版本徽标至 `v13.0.6`。
- **全量自动化测试验证**：50 项顶层测试套件 100% 通过。

## 13.0.5 (2026-11-03) — Drag-End Item Re-Verification, Trashed-Item Ordinal Isolation & Native Win32 Handle Caching

- **文内引文序数计算与回显的回收站文献隔离（`order-cache.mjs` / `formatting.mjs`）**：
  - 在 `getSortedItemIDs` 与 `_applyCitations` 中增加 `Zotero.Items.get(id)` 状态核验，若 Word 历史引文域中仍指向已被用户移入回收站或删除的文献（`zotItem.deleted === true || zotItem.inTrash === true`），自动将其从有效引文序数序列与 `idData` 回显映射中剔除，绝不允许已废弃/撤回文献挤占正常文献的 `[1], [2], [3]` 序号。
- **拖拽释放时刻（`dragend`）二次合法性防呆校验（`src/modules/views/drag-cite.mjs`）**：
  - 在 `dragend` 触发 `addon.api.citeItems` 之前，对捕获的拖拽条目再次执行 `item.deleted !== true && item.inTrash !== true && item.isRegularItem?.() && item.isTopLevelItem() && Number.isSafeInteger(Number(item.id)) && Number(item.id) > 0` 二次校验，防止拖拽过程中条目状态变更导致非法插入。
- **视图层 `currentSession` 存在性校验加固（`src/modules/views/session-index.mjs`）**：
  - 在 `getCitationText` 中仅当 `Zotero.Integration.currentSession.sessionID` 确实存在于已跟踪的 `index.sessions` 中时才将其作为活跃会话，否则平滑回退至按条目唯一定位。
- **Win32 原生 `ctypes` 库与路径缓冲区复用（`drop-target.mjs` / `hooks.mjs`）**：
  - 在 `drop-target.mjs` 中缓存 `user32.dll`、`kernel32.dll` ABI 函数声明与 64KB `pathBuffer`，消除每次拖拽释放时重复 `ctypes.open` / `ctypes.close` 与大数组分配的开销，并在插件 `onShutdown` 时通过 `closeDropTargetCtypes()` 确定性释放原生句柄。
- **全量自动化测试验证**：48 项顶层测试套件（含新增 2 项针对拖拽释放二次校验与回收站文献序号隔离的专项测试）100% 通过。

## 13.0.4 (2026-11-03) — Per-Item Transient Omission Recovery, Ghost-Session Isolation & Dual-Mode ID Hardening

- **单条目瞬态缺失防丢与历史引文回退（`src/modules/citation/formatting.mjs`）**：
  - 在 `_applyCitations` 中取 `Object.keys(citationsByItemID)` 与 `sortedItemIDs` 的完整并集（`citationIDKeySet`），防止当某篇已在文内被引用的文献（存在于 `sortedItemIDs`）在 `citationsByItemID` 局部刷新瞬态缺失时从文档引文集合与列表回显中脱落；
  - 在 `_formatItemPlainCitation` 中支持当 `citationsByItemID[id]` 瞬态为空时，若 `oldIdData[id]` 已存有同序号（`${order}: ...`）的有效引文文本，则平滑继承上一帧有效文本而非闪烁 `1: (error)`。
- **正在关闭/幽灵会话标签防污染（`src/modules/citation/tag-governance.mjs`）**：
  - 在 `_collectActiveCitedIDSet` 中过滤掉 `session.closing === true` 以及既不在 `Zotero.Integration.sessions` 也不在 `this.sessions` 中的残留幽灵会话 ID，确保关闭 Word 文档后引用标签能够 100% 干净摘除，绝不因残留映射阻止标签回收。
- **视图层双模态 Item ID 一致性解析（`src/modules/views/session-index.mjs`）**：
  - 在 `_getSessionIndex` 与 `getCitationText` 中增加 `Number.isSafeInteger(numericID) && numericID > 0` 严格校验，并同时兼容 `session.idData[numericID]` 与 `session.idData[itemID]` 双模态键查找，杜绝字符串/数字键类型差异导致的引文列空白。
- **集合同步与历史标签迁移正整数加固（`collections.mjs` / `preferences-sync.mjs`）**：
  - `syncCollectionItems` 升级为 `Number.isSafeInteger(id) && id > 0` 过滤；
  - `_loadLegacyManagedTagState` 增加正安全整数过滤，防止损坏的历史偏好数组污染标签所有权状态。
- **全量自动化测试验证**：46 项顶层测试套件（新增 3 项针对单条目瞬态缺失恢复、幽灵会话隔离与双模态 ID 解析的专项测试）100% 通过。

## 13.0.3 (2026-11-03) — Academic Citation Determinism, Stability & Performance Hardening

- **参考文献引文序数绝对决定性（Zero-Error Academic Citation Ordinal Determinism）**：
  - 在 `src/modules/citation/order-cache.mjs` 中新增 `_isValidCitationIndexKey(key)` 与 `_parseValidItemID(rawId)` 双重严格整数校验；彻底拦截 `citationsByIndex` 上的非数值键（防止 `Number(a) - Number(b)` 产生 `NaN` 导致 `Array.prototype.sort` 排序乱序错位），杜绝因引文序号错乱引发的学术引文失准风险；
  - 对引文字符串显示实施控制字符与多空白规范化清洗（`_formatItemPlainCitation`），保障列表回显与引文预览一致性。
- **Word 会话双向撕裂快照防呆保护（Bidirectional Torn-Snapshot Guard）**：
  - 在 `src/modules/citation/formatting.mjs` 的 `_readSessionCitationSnapshots` 中将撕裂快照检测升级为双向防呆：不仅在 `citationsByIndex` 为空而 `citationsByItemID` 非空时触发，且在 `citationsByIndex` 非空而 `citationsByItemID` 处于瞬态更新为空时同样触发 `50ms` 延迟重读并标记 `transientMismatch: true`，严禁半成品快照清空已有引文状态。
- **回收站与已删除文献全链路防护（Trash & Deleted Item Hard Guard）**：
  - 在 `tag-governance.mjs`（`_isWritableCitationItem`）、`formatting.mjs`（`_applyCitations`）与 `drag-cite.mjs`（`_onDragStart`）全链路拦截 `item.deleted === true || item.inTrash === true` 的条目：禁止将回收站/已删除文献拖入 Word 插入引文、禁止混入文档引文集合、禁止对其写入自动标签。
- **拖拽引文去重与超时防悬空**：
  - 拖拽多选条目时按 `item.id` 严格去重，防止单次拖放重复插入同一篇文献；新增 60 秒拖拽会话过期保护（`_dragStartedAt`），防止异常中断的拖拽状态残留。
- **高频轮询重入锁与虚拟列表 $O(1)$ 性能优化**：
  - 在 `word-integration.mjs` 的 `listener` 定时轮询中新增 `_isTickRunning` 重入互斥锁，防止慢速 I/O 时轮询任务重叠并发；
  - 在 `icon-patch.mjs` 中将 DOM 节点断开清理优化为仅在容量达到阈值（64 节点）时按需触发，消除虚拟树高频滚动时的每行 $O(N)$ 遍历开销；
  - 在 `order-cache.mjs` 中为 `_sortedCacheBySession` 增加有界容量淘汰（上限 64 会话），防止长期开启多篇文档导致内存增长。
- **全量自动化测试验证**：43 项顶层测试套件（含新增学术引文决定性、双向撕裂快照与回收站拦截专项测试）100% 通过。

## 13.0.2 (2026-11-03)

- **27 模块多文件物理领域解耦**：彻底告别单文件 1,913 行代码堆砌，将 `src/modules/citation.mjs` 与 `src/modules/views.mjs` 按职责拆分为 `src/modules/citation/` 下的 11 个独立领域模块与 `src/modules/views/` 下的 5 个独立视图模块，所有源码文件行数严格控制在 350 行以内；
- **超长复杂函数细粒度拆分**：深度审计并拆解 `_syncCitationTags`、`_installWordIntegrationHooks`、`_refreshSessionCitations`、`_performClear`、`listener`、`clearStaleArtifacts`、`getCitationText` 等核心长函数，提炼 20 个单一职责辅助方法；
- **新增模块化架构专项自动化测试（`tests/modular-architecture.test.mjs`）**：全量 40 项顶层测试套件 100% 通过。

## 13.0.1 (2026-11-02)

- **函数级深度治理与 11 大领域分层**：彻底清理历史无序堆砌代码，对全量函数进行分门别类的体系化重构，明确划分 11 大职责领域；
- **微模块初始化重构**：将臃肿构造函数拆分为 6 个微子初始化器，提升可读性与局部自愈能力；
- **剔除无用死代码**：彻底清理历史孤立未引用文件，保证代码库绝对纯净；
- **全量自动化测试回归**：37 项顶层测试套件 100% 通过。

## 13.0.0 (2026-11-02) — Major Architectural & Quality Milestone

### 核心重大架构升级 (Major Architecture Decoupling)
- **函数级深度治理与 11 大领域分层**：彻底清理历史无序堆砌代码，对全量函数进行分门别类的体系化重构，明确划分 11 大职责领域：
  - 常量与配置键管理（Section 1）
  - 构造与子系统细粒度初始化（Section 2: `_initSessionTracking`, `_initDiagnosticsAndTelemetry`, `_bindPublicApi`, `_initPreferencesAndConfig`, `_initWordIntegrationState`, `_initTimersAndDebounce`）
  - 遥测诊断、指标统计与健康自检（Section 3: `logError`, `_bumpDebugCounter`, `_recordPerf`, `assertHealth`, `getHealthSummary`, `getPerformanceStats`）
  - 配置读取、数值限幅与状态持久化（Section 4: `applyPreferences`, `_loadKeySet`, `_loadManagedTagState`, `_saveManagedTagIDs`）
  - Word 文档路径解析与名称规范化（Section 5: `_sanitizeFolderName`, `_getDocumentDisplayName`, `_getPendingCollectionName`）
  - 临时引文集合生命周期与孤儿资产治理（Section 6: `clearStaleArtifacts`, `initCollection`, `syncCollectionItems`）
  - Word 进程拦截器与集成轮询引擎（Section 7: `listener`, `_installWordIntegrationHooks`, `ensureSession`, `_renameCollection`）
  - 文档引文顺序推断与签名缓存（Section 8: `getSortedItemIDs`, `_getSortedCache`, `_setSortedCache`, `cleanupSessionState`）
  - 自动化引用标签治理与只读保护（Section 9: `syncCitationTags`, `_syncCitationTags`, `scheduleCitationTagSync`, `_isWritableCitationItem`）
  - 格式化引文生成与列表刷新（Section 10: `updateCitations`, `_applyCitations`, `refreshSessionCitations`, `scheduleItemsViewRefresh`）
  - 完整生命周期销毁与资源重置（Section 11: `clear`, `_performClear`）
- **剔除无用死代码**：彻底清理历史孤立未引用文件，保证每一个模块与函数均具备严密的调用链路与 100% 自动化测试覆盖。

### 视觉与无障碍标杆 (Settings Grid & Visual Standards)
- **三级 40px 黄金基准对齐**：全面贯彻 Zotero Flow 2026-11-02 设置规范：
  - 容器外边框为 `0px`，卡片内边距严格锁定 `padding-inline: 16px`；
  - 二级主选项文字与三级从属说明/输入框统一垂直对齐于 **40px** 黄金基准垂线（`16px` 图标 + `8px` 间距 + `24px` 从属缩进）；
  - 全量采用 Fluent（`FTL`）国际化，消灭全部硬编码中文，支持完整键盘 Tab 导航与无障碍屏幕阅读器读屏标记。

### 运行时与宿主前瞻兼容 (Runtime & Forward Compatibility)
- **Gecko 153+ / Firefox 140+ ESM 现代化**：全面废弃旧 Gecko/XUL 假设，构建输出对齐现代浏览器与 Zotero 10、11、12 全周期生命周期（`strict_min_version: "10.0"`, `strict_max_version: "12.*"`）。
- **只读文献安全防护**：全面保障群组只读权限库与回收站文献的数据完整性，杜绝网络协同冲突。

---

## 12.6.0 (2026-11-02)

- 完成设置页重构与首阶段模块解耦验证。
- 引入 Fluent 多语言本地化支持。
- 全量自动化测试回归通过。

---

## 12.5.3 (2026-10-25)

- Await late native column cleanup after disposal before completing registration.
- 36 top-level automated tests and isolated Zotero 10.0.6 initial/restart controlled acceptance passed; real Word insertion was not repeated.

## 12.3.0 (2026-10-20)

- Unify the Zotero Settings preferences style across the Flow plugins.
- Use collapsible top-level groups only, with a compact layout and a separate release information footer.
- List version notes, build date, XPI download and repository links on distinct rows.
- Preserve existing preference IDs, values and handlers.

## 12.2.0 (2026-10-18)

- The settings page now presents three concise, always-visible groups without disclosure panels.
- The update feed now targets the exact versioned release tag and XPI filename, with the final XPI SHA-256 recorded for integrity verification.
