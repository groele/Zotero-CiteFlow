# Zotero CiteFlow Release Notes

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
