# 来源与构建依赖

插件引用业务逻辑基于 MuiseDestiny/zotero-citation 及本项目后续维护版本，依照仓库根目录的 AGPL-3.0 许可证分发。

40.1.0 已移除运行包中完整捆绑的 zotero-plugin-toolkit、调试桥及未使用的 UI/Reader/菜单工具。插件运行时使用 Zotero 和 Mozilla 宿主提供的 API，没有 npm 运行时依赖。

构建工具 esbuild 0.28.2 采用 MIT 许可证，仅用于开发和打包，不复制到 XPI；版本与校验值记录在 package-lock.json。构建依赖许可证可查看 https://github.com/evanw/esbuild/blob/main/LICENSE.md 。
