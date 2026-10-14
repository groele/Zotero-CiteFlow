# Zotero CiteFlow 拖拽引用回归修复

日期：2026-10-14。版本保持 **10.0.0**。设置侧栏名称为 **Zotero CiteFlow**。

## 原因与修复

拖拽处理器原先要求找到可见的引用列。Zotero 10 实际注册键是 `citeflow\@groele-citation`，窗口内的 Views 实例没有持有全局注册返回的键，使用 `citeflow@groele-citation` 判断会漏掉该列。请求因此回退为 Zotero 原生书目拖拽，Word 收到普通文本而没有 CSL 引用字段。原生设置测试此前伪造了未经转义的列名，掩盖了该问题。

- 拖拽引用现在由设置开关控制，引用列隐藏或尚未注册也可工作。
- 列查询使用 Zotero 实际返回的注册键，并读取合并后的列可见状态。设置帮助文本同步更新。
- 原生拖拽测试保留真实列定义，不再替换 `getColumns()`。
- 等待初始文库选择、排序上下文及列表刷新完成后注册引用列，避免首次启动排序时没有可见列。
- 对空文库缺少虚拟表格的列重置进行保护，同时保留缓存失效和界面重绘；停用插件恢复原方法。

## 最终产物与检查

- `npm test`：**32/32** 顶层测试目标通过；内部稳定性 23、数据 13、Word 模拟行为 9 个场景。
- Zotero 10.0.6，Windows：中文设置 **38/38**，英文设置 **38/38**。十个控件、默认 `/Citations` 文本框、实时开关、自定义文本、重启持久化和停用/重启清理通过。
- Microsoft Word 16.0.20430：最终同一 XPI 通过 **11/11** 真实 Word 检查。检查字段代码和 CSL JSON 中的条目 ID，确认是 `ADDIN ZOTERO_ITEM CSL_CITATION`，并非普通书目文本。
- 实测包括单项拖拽、多项拖拽、连续插入、两份文档来回切换、在已有字段追加条目、原生刷新、无书目文本泄漏，以及真实引用条目的自定义标签和关闭清理。关闭拖拽以及拖动中关闭开关均取消派发。
- XPI 的 13 文件白名单、语法、逐文件散列和构建检查通过。测试桥接只注入隔离 profile 的私有副本，正式 XPI 不含测试端点。

产物：`dist/drag-repair-final/zotero-citeflow-10.0.0.xpi`。

SHA-256：`fcdcded73948690eb6d3c01858070461e5e900d46eebd5d03577db5fd4ae9eea`。

本地证据：中文 `dist/settings-native-20261014-212116/results.json`，英文 `dist/settings-native-20261014-212222/results.json`，Word `dist/settings-native-20261014-212303/word-results.json`；Word-QA-A/B.docx 保留实际字段。

## 复现与边界

```powershell
pwsh -NoProfile -File scripts/build.ps1 -OutputDirectory dist/drag-acceptance
pwsh -NoProfile -File scripts/test-settings-native.ps1 -XpiPath dist/drag-acceptance/zotero-citeflow-10.0.0.xpi -Port 23145 -Locale zh-CN
pwsh -NoProfile -File scripts/test-settings-native.ps1 -XpiPath dist/drag-acceptance/zotero-citeflow-10.0.0.xpi -Port 23146 -Locale en-US
pwsh -NoProfile -File scripts/test-settings-native.ps1 -XpiPath dist/drag-acceptance/zotero-citeflow-10.0.0.xpi -Port 23147 -KeepRunning
# 将上一行返回的 root 传给 Word 验收脚本。
pwsh -NoProfile -File scripts/test-word-native.ps1 -SessionRoot '<root>'
# KeepRunning 主机须用测试端点的 quit 动作关闭。
```

所有写入使用独立、未同步的 Zotero 文库和新建 Word 文档，不操作主文库或用户原文。测试通过原生 DOM 拖拽处理器进入生产 citeItems，再检查真实 Word COM 字段；没有模拟最终插入，但没有使用操作系统鼠标自动化完成物理跨窗口拖放。测试预先为新文档写入 Zotero 原生样式元数据，首次样式选择对话框未覆盖。大文档、撤销、bibliography、macOS 及 Zotero 8/9/11 仍未完成本次实机覆盖。

最终测试启动日志不再出现引用列的 `this.tree is undefined` 或 `column is undefined`。仍有 Zotero loading.svg 资源日志；部分重启/退出测试有宿主翻译器解压、共享临时目录或数据库关闭日志。不能把这些剩余宿主日志或未覆盖范围称为已修复。

版本、既有 Release 附件、更新清单和标签不改动。本次提交源码、运行 bundle、测试及记录；安装修复须使用上述新构建 XPI。已拖入的普通文本不会自动变成引用字段，应删除后重新拖入。
