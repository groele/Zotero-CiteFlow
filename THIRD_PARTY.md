# 来源与构建依赖

插件引用业务逻辑基于 MuiseDestiny/zotero-citation 及本项目后续维护版本，依照仓库根目录的 AGPL-3.0 许可证分发。

当前版本已移除运行包中完整捆绑的 zotero-plugin-toolkit、调试桥及未使用的 UI/Reader/菜单工具。插件运行时使用 Zotero 和 Mozilla 宿主提供的 API，没有 npm 运行时依赖。

构建工具 esbuild 0.28.2 采用 MIT 许可证，仅用于开发和打包，不复制到 XPI；版本与校验值记录在 package-lock.json。构建依赖许可证可查看 https://github.com/evanw/esbuild/blob/main/LICENSE.md 。


## 上游衍生关系与著作权

CiteFlow README 明确以 [MuiseDestiny/zotero-citation](https://github.com/MuiseDestiny/zotero-citation) 为上游。上游 package.json 声明 `AGPL-3.0-or-later`；CiteFlow package.json 声明 `AGPL-3.0-only`。这并非自动构成冲突，因为 AGPL-3.0-or-later 允许选择版本 3，但**不得通过修改本项目的声明剥夺原上游代码已有的 or-later 权利**。应分别保留上游许可证声明、版权署名和新增贡献的授权范围。正式调整项目前请完成逐文件权利核实。

## 分发前核查（未完成的项目）

- [ ] 确认原始上游仓库修订号及实际复制/修改的文件。
- [ ] 保留上游版权行、许可证头、原始版权和免责声明；标记重要修改。
- [ ] 以最终 XPI 验证“没有 npm 运行时依赖”的现有陈述，并核查 bundled JS、图标及其他资产。
- [ ] 查验锁定构建依赖的实际版权和许可、必要署名。
- [ ] 确保向 XPI 接收者提供适当的对应源代码与构建说明，遵循 AGPL。
- [ ] 核对 README、package.json、LICENSE 与所有发布说明，不让 `only` 与 `or-later` 的适用范围相互混淆。

本文件记录已识别的上游关系和待核查义务，并非所有文件已完成法律审计的结论。2026-11-14。
