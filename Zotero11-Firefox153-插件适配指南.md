# Zotero 11 / Firefox 153 插件适配指南

日期：2026-10-14
用途：帮助其他 Zotero 插件排查平台升级风险并实施迁移。
依据：[Zotero 11 for Developers](https://www.zotero.org/support/dev/zotero_11_for_developers)、官方源码，以及 ZoteroPreview 40.1.5 的修改与自动验证。

> 本指南区分官方平台变更、通用工程建议和本插件案例。代码示例需要结合插件结构使用；自动测试通过不等于完成 Zotero 11 实机验收。

## 1. 优先检查哪些部分

| 优先级 | 检查对象 | 主要风险 | 处理方向 |
| --- | --- | --- | --- |
| 高 | XUL 布尔属性及对应 CSS、选择器 | `hidden="false"` 也会隐藏；属性值比较失效 | 使用布尔属性、`toggleAttribute()`、`hasAttribute()` |
| 高 | 内联脚本、内联事件、`oncommand` 赋值 | 当前临时兼容可能掩盖未来 CSP 问题；字符串赋值会清空处理器 | 外部脚本与 `addEventListener()` |
| 高 | `ownerGlobal` | 新平台返回 `undefined`，可能静默失效 | 节点使用 `documentGlobal` 或 `ownerDocument.defaultView` |
| 高 | 登录管理器 | 同步方法移除或抛错 | 改为异步接口，向调用链传播 `await` |
| 中 | 沙箱内建对象修改 | 冻结对象上的赋值可能静默失败或抛错 | 避免修改内建对象；必要时仅调整自建沙箱 |
| 中 | XUL checkbox 事件 | `CheckboxStateChange` 已移除 | 改用 `command`，程序赋值后显式更新业务状态 |
| 中 | 菜单图标、懒加载服务 | 元素类型、接口参数变化 | 更新图标 CSS，传入 `Ci` 接口对象 |
| 中 | 设置页、启动与禁用生命周期 | 加载时序、重复绑定、资源残留 | 按宿主生命周期初始化并独立清理资源 |
| 按需 | wizard、search 输入框、browser | 按钮缺失、双清除按钮、意外远程浏览器 | 逐项检查实际使用位置 |

上述问题可能静默发生。不能只凭插件成功加载或控制台没有报错判断兼容。

## 2. 官方平台变更与迁移示例

### 2.1 XUL 布尔属性改为按存在性判断

受影响属性包括 `hidden`、`collapsed`、`selected`、`disabled`、`checked`。任何属性值，包括字符串 `"false"`，都表示属性存在。

```js
// 旧写法：新平台上仍然隐藏
element.setAttribute('hidden', false);

// 修改：条件为 false 时移除属性
element.toggleAttribute('hidden', shouldHide);

// 有反射布尔属性的元素也可使用
element.hidden = shouldHide;
element.disabled = shouldDisable;
```

读取与选择器也要同步修改：

```js
// 旧写法可能无法匹配 hidden=""
element.getAttribute('hidden') === 'true';
document.querySelector('[hidden="true"]');

// 新写法
element.hasAttribute('hidden');
document.querySelector('[hidden]');
```

```css
/* 更新所有按布尔属性值匹配的规则 */
[hidden] { /* ... */ }
[disabled] { /* ... */ }
```

注意：旧版 Gecko 的 XUL 元素可能依赖 `hidden="true"` 等值。若插件同时支持旧平台，应优先使用宿主反射属性，并在各平台验证实际状态。需要直接操作属性时，可根据 `Zotero.platformMajorVersion` 分支处理；不要把所有旧版属性选择器机械替换后就认定兼容。

同类变化：`<browser remote="false">` 在新平台也会创建远程浏览器。非远程 browser 应省略 `remote` 属性。

### 2.2 `ownerGlobal` 改为 `documentGlobal`

新属性位于 `Node`，不再是所有 `EventTarget` 都可访问的属性。

```js
// 旧写法
const win = element.ownerGlobal;

// 对 DOM 节点，同时兼顾旧平台
const win = element.documentGlobal ?? element.ownerDocument?.defaultView;
```

对于 Window、非节点事件目标等，使用已知窗口引用或按对象类型处理，不要统一套用节点访问方式。

### 2.3 checkbox 改用 `command`

```js
checkbox.addEventListener('command', () => {
    updateSetting(checkbox.checked);
});

// 程序赋值不会自动触发用户 command 事件
checkbox.checked = desiredValue;
updateSetting(desiredValue);
```

如果业务需要通知多个订阅方，应调用明确的状态更新函数或自己的事件机制，避免依赖已移除的事件。

### 2.4 避免向 `oncommand` 赋字符串

Firefox 153 的 `oncommand` 是 WebIDL 事件处理属性。下面的字符串赋值会变为 `null`，还可能覆盖原有处理器：

```js
// 需要修改
element.oncommand = 'handleCommand()';

// 推荐
element.addEventListener('command', handleCommand);
```

同时排查 XHTML 中的 `onload`、`onclick`、`oncommand` 和内联 `<script>`，逐步迁移到外部脚本。

### 2.5 为未来 chrome CSP 移除内联脚本

官方说明：Firefox 对 chrome 文档增加基线 CSP，会阻止内联脚本和内联事件；Zotero 当前通过配置暂时关闭该限制，但计划迁移自身代码后恢复。因此，这是应提前处理的迁移项，不应描述成当前所有 Zotero 11 构建已经阻止内联事件。

普通页面可以在外部脚本中监听适当的文档加载事件。**Zotero 设置页是动态插入的片段，不能直接假定 `DOMContentLoaded` 会在片段插入后再次发生。**

官方当前设置页实现会先加载注册的脚本，再插入片段，最后向容器直接子节点派发非冒泡 `load` 事件。可通过捕获阶段监听，按自己的根节点过滤：

```js
(() => {
    const rootID = 'my-plugin-preferences';
    const initialized = new WeakSet();

    function init() {
        const root = document.getElementById(rootID);
        if (!root || initialized.has(root)) return;
        // 查找本插件控件、设置初始值、绑定监听器。
        initialized.add(root);
    }

    function onLoad(event) {
        if (event.target?.id === rootID) init();
    }

    document.addEventListener('load', onLoad, true);
    init(); // 兼顾脚本加载时片段已经存在的情况。

    // 插件禁用、设置页移除或窗口关闭时执行：
    // document.removeEventListener('load', onLoad, true);
    // 并移除控件监听器。
})();
```

这是针对当前 Zotero 设置页实现的模式，不是所有窗口的通用加载协议。适配时核对实际宿主版本及[官方设置页源码](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/preferences/preferences.js)。

注册设置页时也应明确命名空间：

```js
Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + 'prefs.xhtml',
    scripts: [rootURI + 'prefs.js'],
    defaultXUL: true,
});
```

`defaultXUL: true` 适合以 XUL 为默认命名空间、使用 `html:` 前缀的片段。HTML 默认命名空间、使用 `xul:` 前缀的片段应采用相应配置。不要给所有插件统一添加该参数。

### 2.6 沙箱内建对象默认冻结

插件 bootstrap 所在的 system-principal 沙箱内，修改 `Promise`、`Array.prototype`、`JSON.parse` 等内建对象可能失败。插件自己的普通对象仍可修改。

推荐将包装逻辑放到自己的函数或对象中，避免 monkey patch。若插件确实需要修改**自行创建的沙箱**中的内建对象，可在创建时指定：

```js
const sandbox = new Cu.Sandbox(principal, {
    freezeBuiltins: false,
    // 保留该沙箱实际需要的其他选项。
});
```

该选项不是解冻宿主 bootstrap 沙箱的通用方案，也不是每个插件都需要添加的配置。

### 2.7 懒加载服务需要接口对象

```js
// 旧接口名字符串
XPCOMUtils.defineLazyServiceGetter(target, 'io',
    '@mozilla.org/network/io-service;1', 'nsIIOService');

// 新接口对象
XPCOMUtils.defineLazyServiceGetter(target, 'io',
    '@mozilla.org/network/io-service;1', Ci.nsIIOService);
```

`defineLazyServiceGetters()` 的配置也要检查。项目中没有全局 `Ci` 时，可根据脚本作用域从 `Components.interfaces` 获取。

### 2.8 登录管理器全面转向异步接口

`findLogins()` 不再可用，`searchLogins()` 已移除；改为 `await searchLoginsAsync({...})`。新增、修改、删除登录记录也要使用对应 `Async` 方法。

```js
const logins = await Services.logins.searchLoginsAsync({
    origin: 'https://example.com',
});
```

根据实际 origin、formActionOrigin、httpRealm 等字段确定筛选条件，并核对方法返回类型。向上修改调用链，确保 UI 在结果返回后更新；无法 `await` 的同步路径应读取已维护的缓存，不应保留同步密码查询。

### 2.9 菜单图标与其他控件

- `<menuitem>` / `<menu>` 内部图标从 XUL `<image>` 改为 HTML `<img>`。自定义图标需设置 `--menuitem-icon`，并保留 `list-style-image` 供 macOS 原生菜单使用。通过 `Zotero.MenuManager` 添加菜单的插件，官方说明无需为此修改。
- `<wizard>` 不再提供 `extra1`、`extra2` 按钮，需要时自行创建。
- chrome 文档中的 `<input type="search">` 自带清除按钮，检查是否与插件自己的按钮重复。
- 官方说明 Zotero 已处理 `<search-textbox>`、toolbarbutton 的 `wantdropmarker`、chrome DTD 加载及父进程 `eval()` 的部分变化。不要因 Firefox 单独移除了某功能就盲目重写；以 Zotero 运行环境为准。

## 3. 生命周期加固：通用建议

以下不是 Firefox 153 新增的 API 破坏，但适合在迁移时同时处理。

### 3.1 取消等待宿主初始化期间的启动

```js
let startupGeneration = 0;

async function startup(data) {
    const generation = ++startupGeneration;
    await Zotero.initializationPromise;
    if (generation !== startupGeneration) return;
    // 加载脚本、注册栏目和其他资源。
}

function shutdown() {
    ++startupGeneration;
    // 清理已注册资源。
}
```

该模式防止禁用后继续执行尚未完成的初始化。若后续还有 `await`，应在对应等待点之后再检查取消状态。

### 3.2 隔离清理阶段的异常

栏目、Notifier、偏好观察器、设置页事件、计时器、样式和本地化资源应分别清理。一个宿主注销接口抛错，不应使后面的步骤全部跳过。

```js
function cleanup(action) {
    try { action(); }
    catch (error) { Zotero.logError(error); }
}

cleanup(() => unregisterNotifier());
cleanup(() => unregisterPreferenceObservers());
cleanup(() => unregisterSections());
cleanup(() => removePreferenceListeners());
```

以上示例处理同步清理；异步资源需要等待并捕获 Promise 拒绝。避免用无记录的空 catch 掩盖真正问题，确保重复 shutdown 可以安全执行。

### 3.3 同时捕获同步刷新异常和 Promise 拒绝

```js
// refresh() 同步抛错时，下面的 catch 接不到
Promise.resolve(state.refresh()).catch(handleError);

// 让 refresh() 在 Promise 链内部执行
Promise.resolve().then(() => state.refresh()).catch(handleError);
```

## 4. ZoteroPreview 40.1.5 的实际修改映射

| 文件 | 实际修改 | 性质 |
| --- | --- | --- |
| `prefs.xhtml` | 删除根节点内联 `onload` | 提前规避未来 CSP 限制 |
| `zoteropreview_prefs.js` | 外部捕获 `load`；按根节点只初始化一次；文档独立作用域；统一收集并释放监听器 | 设置页时序与生命周期加固 |
| `bootstrap.js` | 明确 `defaultXUL: true`；启动代次取消；将加载与注册放入失败清理路径；独立释放 Fluent | 命名空间明确化与启动清理加固 |
| `zoteropreview.js` | 维护设置页清理集合；隔离各注销步骤异常；捕获同步刷新异常 | 运行时可靠性 |
| `tests/gecko153.test.cjs` | 设置事件、冻结沙箱、启动取消、启动失败清理、旧平台模式检查 | 自动回归 |
| `tests/native-sidebar.test.cjs` | 冻结内建对象条件下运行现有侧栏测试；新增宿主清理失败测试 | 自动回归 |
| `test.ps1` | 纳入 Gecko 153 兼容性测试 | 验证入口 |
| 版本、更新清单与文档 | 升级 40.1.5，构建 XPI 并核对哈希 | 交付一致性 |

本插件没有使用 `ownerGlobal`、`CheckboxStateChange`、同步登录管理器或懒加载服务字符串接口，因此这些项目属于审计通过，没有相应接口替换提交。富文本剪贴板接口也未因本次迁移被替换。

## 5. 检索与验收流程

### 5.1 初步代码检索

```powershell
rg -n 'ownerGlobal|CheckboxStateChange|defineLazyServiceGetter|findLogins|searchLogins|addLogin|modifyLogin|removeLogin' .
rg -n 'oncommand|onload|onclick|<script|setAttribute|getAttribute|hidden|collapsed|disabled|checked|selected|remote=' .
rg -n 'Array\.prototype|JSON\.parse\s*=|Promise\s*=|freezeBuiltins|extra1|extra2|type="search"|list-style-image' .
```

检索命中不等于缺陷：逐项确认元素命名空间、执行作用域、调用接口和代码是否实际运行。大型仓库应排除依赖、历史构建产物和第三方源码，避免噪声。

### 5.2 自动验证

1. 执行 JS 语法检查与已有功能回归。
2. 检查 XUL 布尔属性写入、读取、CSS 和选择器的完整链路。
3. 在冻结内建对象的沙箱条件下验证插件代码。
4. 模拟脚本先加载、片段后插入、非冒泡 load 的设置页流程。
5. 模拟初始化中禁用、注册失败、单个注销接口异常、反复启停。
6. 校验 manifest、更新清单、XPI 文件及哈希的一致性。

### 5.3 Zotero 11 / Firefox 153 实机验证

使用[官方开发版](https://www.zotero.org/support/dev/zotero_11_for_developers)及**独立 profile 和数据目录**，避免让开发版打开日常生产数据库。

- 确认 `Zotero.version` 和 `Zotero.platformMajorVersion`，不能只看安装目录名。
- 安装最终 XPI，重启后确认持久加载。
- 验证设置页首次打开、切换、再次打开和保存。
- 验证隐藏、禁用、选中、勾选状态的实际视觉与交互结果。
- 验证主库、阅读页、多窗口、快速切换和真实格式化输出。
- 实际点击复制并检查纯文本、富文本粘贴结果；模拟 API 调用不足以替代这一步。
- 禁用、重新启用、卸载后检查栏目、事件、观察器、计时器和样式是否释放。
- 对支持范围内的旧 Zotero / Gecko 做回归；按实际目标补充 Windows、macOS、Linux 和深色模式。

## 6. 兼容声明与当前验证边界

本项目 manifest 与自动更新清单现按用户要求声明 Zotero `8.0`–`11.0.*`。该声明只控制 Zotero 的安装/更新版本筛选，不代表 Zotero 8、9 或 11 已完成实机验收。官方 Zotero 11 开发者说明及其发布政策可能变化，正式发布前仍应复核官方通知并完成目标版本回归。

ZoteroPreview 当前结果：10 项侧栏测试、4 项 Gecko 153 适配测试、2 项发布一致性检查，共 16 项通过；语法与 XPI 文件哈希校验通过。

已下载的官方开发版元数据为 `11.0-dev.5+dac1ad489`，平台范围 `153.0–153.99.*`。启动独立开发版的操作被自动审批审查拒绝，工具仅返回 `blocked by policy`，没有更具体原因。因此本项目尚未完成 Zotero 11 的真实 UI、CSL、剪贴板和安装重启验收，不能据此宣称已经全面兼容。CiteFlow 的快捷插入路径另有 P0 实机问题，详见 `VALIDATION-40.1.0.md`。

## 7. 参考资料

- [Zotero 11 平台变更与开发版说明](https://www.zotero.org/support/dev/zotero_11_for_developers)
- [Zotero 10 开发者说明：前一平台升级的背景](https://www.zotero.org/support/dev/zotero_10_for_developers)
- [Zotero 设置页加载实现](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/preferences/preferences.js)
- [Zotero 原生条目栏目 API](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/pluginAPI/itemPaneManager.js)
- [Searchfox：核对 Mozilla 接口和变更](https://searchfox.org/)
- 本项目详细验证记录：[VALIDATION.md](VALIDATION.md)
