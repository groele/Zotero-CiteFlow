# Zotero CiteFlow Release Notes

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
