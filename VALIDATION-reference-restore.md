# 引用流程恢复与本次安装包检验

日期：2026-10-15。名称：Zotero CiteFlow。版本保持 10.0.0。

## 对照及修复范围

引用行为以已验证的原生 Word CSL 字段创建与刷新路径为基准；测试使用独立哈希固定该行为，避免后续设置变更引入回归。

早先的源码重建（94b7d71）在引用入口增加了会话 token/绑定校验。在绑定缺失或不匹配时，该分支调用原生 Session.cite，而不消费已经捕获的条目，可能弹出选文献窗口。它不是设置功能所需的改动。本次移除此校验、token 传递和额外的条目 ID 转换，恢复参考文件中的 citeItems 选择、字段创建、条目追加、注册、刷新及失败清理流程。

与参考入口相比，仅保留此前已有的临时 WinWord null-name 兼容适配：本机宿主 getActiveDocument 调用 getDocument(null)，后者对参数调用 indexOf；适配使用同一宿主的 getDocument("") 活动文档路径，并在 finally 恢复 getApplication。它不生成或改写 CSL、作者、题名、年份及引用样式。除该明确列出的适配外，整个引用模块与参考提取文本逐行相同；标准化文本 SHA256 为 `cd1abee3602efb5fe33b63d36fc25f039bbc1b07760f14d3fed9ffa9b2c989b4`。新增测试固定此值，防止设置变更意外改动插入流程。

保留已经实现的十个设置、完整设置名称、自定义标签文本框及 /Citations 默认值。保留上一修复中按设置开关控制拖拽和共享 Zotero 实际引用列键的处理。没有新增 Word 窗口探测、低层 COM 调用或引用格式转换。本地此前的实验代码已移除，正式包不包含它们。

## 本次结果

- Node：33/33 顶层目标通过；内部 Word 模拟行为 10、数据 13、稳定性 23 个场景。
- 同一正式 XPI，Zotero 10.0.6，中文设置 38/38，英文设置 38/38。
- 同一 XPI 的隔离副本，Word 16.0，11/11 原生字段检查通过。实际读取 ADDIN ZOTERO_ITEM CSL_CITATION 字段及 JSON 条目 ID；覆盖单项、多项、连续插入、两份文档切换、现有引用追加、原生刷新、无普通书目文本泄漏、自定义标签及实时关闭。
- 构建包 13 个文件的白名单、语法、源文件与压缩条目的逐文件散列验证通过。正式包排除全部测试端点及测试驱动。
- 版本、现有更新清单、Git 标签和 Release 附件保持不变。

证据：

- 中文：`dist/settings-native-20261015-091524/results.json`
- 英文：`dist/settings-native-20261015-091635/results.json`
- Word：`dist/settings-native-20261015-091730/word-results.json`，同目录 Word-QA-A.docx、Word-QA-B.docx 保留实际引用字段。

Word 首次复跑在测试客户端出现 UTF-8 响应解码错误，导致中文标签断言失败；修正测试客户端显式 UTF-8 编解码后完整复跑通过。旧失败记录保留为 word-results-previous-utf8.json，未据此修改产品标签实现。测试驱动同时修正了 Windows PowerShell COM SaveAs 参数类型；使用现有 Word 进程时只关闭自己的测试文档，不退出用户 Word。

## 验证边界与历史结论更正

Word 验收通过 Zotero 的真实生产拖拽处理器派发合成 DOM 拖拽事件，再调用真实 Word 插入并检查实际字段；未完成本次操作系统鼠标跨窗口拖放的最终验收。因此不能将 11 项结果表述为物理拖放已经完全恢复，也不能据此排除用户现场仍有拖放问题。此前文档中的“单项拖拽”等描述应按此边界理解。

首个新文档的样式选择对话框未覆盖：验收为隔离文档预置了原生样式元数据。macOS、其他 Zotero 版本、其他 Word 进程实例及大文档未在本次重新实测。日志仍有宿主 loading.svg、GMP 组件卸载 getResourceURI、翻译器解压/退出 SQLite 日志；它们不属于本次通过项，也未宣称已修复。

本次没有操作主 Zotero 文库、已有真实引用及用户正文。已插入的普通书目文本不会自动转为 Zotero 字段。

## 安装包

`dist/citeflow-10.0.0-checked-20261015/zotero-citeflow-10.0.0.xpi`

SHA256：`dee65bd90329dc5ab64882e7f338332709eb0d18e5c08592c5e3c06bd94478a1`

安装此 XPI 后重启 Zotero。请以此路径区分同为 10.0.0 的旧包；本次没有替换 GitHub 现有 Release 附件。
