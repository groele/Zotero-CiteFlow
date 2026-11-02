# Zotero CiteFlow Release Notes

## 13.0.0 (2026-11-02) — Major Architectural & Quality Milestone

### 核心重大架构升级 (Major Architecture Decoupling)
- **微内核服务解耦**：彻底重构历史单体大类（1596 行），划分为五大高内聚低耦合的领域服务模块：
  - `citation-model.mjs`：纯数学与算法层，负责序号推断、引用格式计算与数据状态映射，纯净无 DOM/UI 依赖；
  - `collection-manager.mjs`：Word 临时集合生命周期管理，支持文档重命名侦测、集合同步与孤儿集合自动自愈清理；
  - `tag-manager.mjs`：自动化引用标签治理中心，严格执行 `item.isEditable()` 原生权限防护，只读群组与回收站文献防脏写；
  - `word-integration.mjs`：Microsoft Word 进程拦截器与文档名称标准化，增强异常恢复与多文档切换鲁棒性；
  - `diagnostics.mjs`：遥测诊断与健康监控引擎，提供慢操作统计、滑动窗口健康自检与内存安全清理；
  - `citation.mjs`：轻量级门面协同中心，统一事件总线与外部生命周期对接。

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
