# Zotero CiteFlow 40.1.0 实机验证记录

日期：2026-10-14。所有桌面功能测试均在独立 profile、独立 dataDir 和 `dist/native-20261014-141648/` 中执行。主 Zotero 配置和用户原始 Word 文档未参与测试。

## 环境与产物

- Zotero 10.0.6（Windows）；Microsoft Word 16.0，build 16.0.20430。
- 插件以 `citeflow@groele` 加载，元数据名称为 `Zotero CiteFlow`，版本 `40.1.0`。
- 已重启隔离 Zotero profile，插件保持 active，三个合成测试条目及已有测试字段保留。
- 最新候选包：`dist/native-candidate-40.1.0-citeflow-v3/zotero-citeflow-40.1.0.xpi`，SHA-256 `7D153CC6910D87C3F33BDF9F48DA6C4E54FB73C981AB56C7296AFE0E9A512249`。

## 通过项

- `npm test` 的 15 个测试目标通过：启动关闭与资源清理、首选项迁移、并发会话绑定、异常回滚、缓存/标签同步、Word 字段注册和 XPI 清单/散列检查。
- 在真实 Zotero 界面启动后确认新 add-on ID、显示名称、版本和 `active: true`；插件诊断返回 `errors: []`。
- 在真实 Word 中启动 Zotero 原生集成并向隔离文档 A 插入了一条引用。Word COM 检查到 `ADDIN ZOTERO_ITEM CSL_CITATION` 字段、原生 CSL JSON payload 和渲染文本 `[1]`。
- 隔离文库出现插件管理的文档集合和 `/Citations` 标签；重启后插件和测试文献仍可用。
- 首次测试遇到 Zotero 10 WinWord 活动文档适配器将空值传给 `getDocument()` 的问题。候选源码为快速引用调用添加受限临时包装，确保 `getActiveDocument()` 将所有未用参数统一映射为 `getDocument("")`，并在 `finally` 恢复原函数；单元用例覆盖额外 `null` 参数。

## 未通过或未覆盖项

- **P0：CiteFlow 快捷插入尚未通过实机验收。** 在候选 XPI 重启后，通过控制台调用 `Zotero.ZoteroCitation.api.citeItems()` 未能稳定观察到新增 Word CSL 字段。诊断没有报告错误，但缺少可验证的字段写入；不能把原生 Word 按钮插入成功误认为 CiteFlow 快捷插入成功。需要继续检查 Word 当前活动文档绑定、会话选择和异步提示框生命周期，再重跑端到端测试。
- 最终使用全新隔离 profile 重复该调用，Word 测试文档仍为 0 个字段；在调用前包裹 `Session.prototype.cite` 做只读计数，调用期间计数为 0。插件诊断无错误，但测试不能证明原生 `Session.cite` 已触发。随后停用了该 profile，未对主 Word 文档做试探写入。
- 多文档切换、长文档刷新、编辑已有引用、生成/刷新 bibliography、撤销、拖放和快捷键输入尚未完整覆盖。
- 旧 ID 自动禁用迁移已通过模拟测试；本隔离 profile 不预装旧插件，因此没有验证用户升级时的真实双插件迁移。
- Zotero 8、9、11 / Firefox 153 均未做实机验证。manifest 与更新清单已按用户要求声明 Zotero 8.0–11.0.*；该元数据声明不构成跨版本实机兼容证明。
- 当前更新 URL 和 feed 是本地候选配置；没有向 GitHub 主分支推送，也没有建立 GitHub Release，故远端自动更新尚未启用。

由于 P0 快捷插入未通过，当前构建仅作候选，不建议安装到主 profile 或作为已验证稳定版公开发布。
