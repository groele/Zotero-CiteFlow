# Easier Citation 40.0.3 本地候选版

本目录是 Zotero 插件的可安装包工程。`chrome/content/scripts/index.js` 是包含插件逻辑及 `zotero-plugin-toolkit` 的编译产物，**不是可独立构建的原始 TypeScript 源码**。本轮只对可明确验证的发布层问题做了小范围修复。当前版本是本地试用候选版，未发布到更新服务器；自动更新地址已移除，后续需要为此分支建立独立的更新清单。

## 开发与验证

在 PowerShell 7 和 Node.js 22 中运行：

```powershell
node --test tests/*.test.*
./scripts/build.ps1 -OutputDirectory dist/my-build
```

打包脚本检查 JS 语法、运行全部测试、只收录 9 个运行文件，并逐个对照 XPI 内外文件的 SHA-256。若输出目录已有同名 XPI，脚本会停止，避免覆盖已有候选包；可指定一个新的输出目录。

本轮最终候选包路径与散列见 `PROJECT_AUDIT.md`；`dist` 其他目录中的文件是过程产物。

`tests/v40-stability.test.js`、`v4002-word.test.js`、`v4002-ui.test.js`、`v4002-data.test.js` 由早期本地 40.0.2 验证工程迁入并改为直接测试当前目录。现覆盖 23 组稳定性、8 组 Word、7 组数据与界面生命周期场景；新增 `bootstrap.test.cjs` 和 `package.test.cjs` 覆盖启动异常清理与包结构。所有这些测试主要使用 Node VM 模拟 Zotero/Word 接口。

## 安装前的验证边界

请先备份 Zotero 数据库和目标 Word 文档，并在隔离配置或测试文档中检查：插入、编辑、撤销、刷新、多文档切换、拖拽、禁用与重新启用、重启后的临时集合和标签清理。自动化测试通过与 XPI 文件完整，只证明上述模拟场景和打包结果；不等于真实 Zotero 与 Word 联动已通过。

当前 `manifest.json` 将兼容范围限制为 Zotero `6.999` 至 `10.0.*`。扩展到后续版本之前，应先在目标版本核对集成 API、列注册、拖拽事件和真实 Word 流程，然后调整版本声明。不可只修改 `strict_max_version`。

本轮问题清单、优先级和后续处理顺序见 [PROJECT_AUDIT.md](PROJECT_AUDIT.md)。
