<div align="center">

<img src="chrome/content/icons/citeflow.svg" alt="Zotero CiteFlow Logo" width="96" height="96" />

# Zotero CiteFlow

**Zotero Flow Series · 写作引用**

*让研究的每一步衔接起来。 / Connect each step of research.*

追踪 Word 文档引用，并连接 Zotero 文献操作。

[简体中文](README.md) · [English](README.en.md)

[![当前版本](https://img.shields.io/badge/version-16.3.1-245ac7?style=flat-square)](https://github.com/groele/Zotero-CiteFlow/releases/tag/v16.3.1) · [下载 XPI](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.3.1/zotero-citeflow-16.3.1.xpi) · [问题反馈](https://github.com/groele/Zotero-CiteFlow/issues)

![Zotero 10.0–12.*](https://img.shields.io/badge/Zotero-10.0--12.*-2f855a?style=flat-square)
![License AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0--only-64748b?style=flat-square)
![Tests 93 Passed](https://img.shields.io/badge/tests-93%20unit%2Fintegration%20%7C%2013%20guards-0d9488?style=flat-square)

</div>

---

[产品定位](#overview) · [安装与更新](#installation) · [快速开始](#quick-start) · [核心功能详解](#features) · [CSL 样式参考案例](#csl-example) · [设置项完整参考](#settings) · [数据、同步与安全](#data) · [兼容性与验证范围](#compatibility) · [常见问题排查](#troubleshooting) · [工程架构与开发](#development) · [系列产品](#series) · [项目来源与许可](#license)

<a id="overview"></a>

## 📖 产品定位

在撰写学位论文、期刊稿件或并行推进多篇综述时，研究者经常面临三个实际断点：在 Zotero 文献库中看不清某篇文献是否已进入当前 Word 手稿、很难区分不同 Word 文档各自引用了哪些文献、以及直接从文献管理软件拖入文本会失去 Zotero 原生可编辑的 CSL 引文域。

**Zotero CiteFlow**（插件 ID：`citeflow@groele`）面向使用 Zotero 与 **Microsoft Word** 写作的用户：
- 在 Zotero 主文献列表实时显示当前已识别 Word 文档中的**引用序号与引文文本**；
- 在个人文库左侧文集树维护与当前 Word 文档同步的**临时分类**（固定显示在「我的出版物」正上方）；
- 以**所有权可追溯、只读安全保护**的方式为已引用条目自动维护引用标签（默认为 `/Citations`）；
- 在 Windows 上经由原生光标窗口/进程确认后，将选中文献**直接拖入 Microsoft Word** 插入标准可编辑 CSL 引文域，不改写文稿中既有的其它 Word 引文。

> [!NOTE]
> 本插件可完全独立安装使用，亦可按需与 [Zotero Flow 系列](#series) 其它插件配合，覆盖论文阅读与写作的不同环节。插件内部 100% 本地运行，不发起网络请求。

---

<a id="installation"></a>

## 📦 安装与更新

### 安装当前稳定版 (`v16.3.1`)

1. 前往 GitHub Releases 下载安装包 [**`zotero-citeflow-16.3.1.xpi`**](https://github.com/groele/Zotero-CiteFlow/releases/download/v16.3.1/zotero-citeflow-16.3.1.xpi)（版本 **16.3.1**）。**不要下载** GitHub 自动生成的 `Source code (zip)` 源码压缩包。
2. 打开 Zotero，进入菜单 **工具 → 插件／附加组件**（或 **Tools → Plugins/Add-ons**）。
3. 点击右上角齿轮图标，选择 **从文件安装插件… (Install Add-on From File…)**，选中下载好的 `.xpi` 文件并按提示重启 Zotero。

### 安装包完整性校验指纹 (`16.3.1`)

| 校验项 | 数值 |
|---|---|
| 安装包文件名 | `zotero-citeflow-16.3.1.xpi`（`98,761` 字节，20 个 ZIP 条目） |
| SHA-256 | `58ED767983502BA75EBF70F60939A4340554E4251D07D27D569E379689C0ED35` |
| SHA-512 | `1b0fbe2b6ae0a6a597e9e062660a2027e435e595aaa595029a42aa857ff8ca3144d61c43703d8e1b97271d51182cb7e70ec280e0e39f979b64964c6f0b48e960` |

### 旧版迁移与自动更新

- **平滑停用旧版上游冲突插件**：如果设备曾安装 `zoterocitation@polygon.org`，CiteFlow 的 [`bootstrap.js`](bootstrap.js) 在启动时会先检查并停用旧版实例，防止两个插件同时拦截 `Zotero.Integration` API 与窗口挂载导致冲突，并在首次加载时兼容迁移历史持久化的托管集合/标签记录，不删除用户手工标签。
- **在线更新源**：[update.json](update.json) · 插件 ID：`citeflow@groele` · 声明兼容范围：`10.0` – `12.*`。升级或大规模整理文库前建议做好数据备份。

---

<a id="quick-start"></a>

## 🚀 快速开始（4 步上手）

1. **开启「引用」状态列**：在 Zotero 主界面文献列表表头任意空白处点击**鼠标右键**，勾选 **引用**（英文界面为 **Citation**）。
2. **连接当前 Word 文档**：在 Microsoft Word 中打开包含 Zotero 引文的 `.docx` 文稿（或在正文中光标处用 Zotero 工具栏插入/刷新一次引文），触发或建立原生 `Zotero.Integration` 文档会话。
3. **查看三处实时联动反馈**：
   - **文献列表「引用」列**：直观呈现每篇文献在当前识别文档中的引用序号与短格式文本（例如 `[1] Vaswani et al., 2017`）；
   - **左侧个人文库临时分类**：在「我的文库」下方、「我的出版物」正上方出现以当前 Word 文档名命名的临时分类，成员列表随文内增删引文自动增减；
   - **自动引用标签**：个人文库中已在打开文档被引用的文献会自动加上 `/Citations`（可在设置页自定义文本）。
4. **拖拽直接插入引文（Windows）**：在 Zotero 主列表选中 1 篇或多篇普通文献条目，直接拖入目标 Microsoft Word 文档页面松手，即可在光标位置插入可编辑的标准 Zotero CSL 引文域；若将文献拖向 Zotero 自身其它文集或废纸篓，仍完整保留 Zotero 原生移动行为。

---

<a id="features"></a>

## ✨ 核心功能详解

### 能力总览与实际边界

| 核心能力 | 解决什么写作问题 | 实现机制与实际边界 |
|---|---|---|
| **Word 引文状态与 P1-B 前景焦点同步** | 多篇 Word 文档并行编辑时，在 Zotero 列表回看「当前正在写的这篇稿子引用了哪几篇文献、排第几号」。 | 通过 Zotero Word Integration 会话读取引用快照并规范化文本；`v16.2.0` 新增只读 Win32 前景标题唯一匹配同步 `activeSessionID`，存在标题冲突或未连接 Integration 会话时绝不误切或判定“从未引用”。 |
| **Windows 原生目标确认拖拽插入** | 将选中文献直接拖到 Word 即生成可刷新的 Zotero 引文域，避免粘贴普通文本破坏参考文献序号联动。 | 仅在 Windows 且经 Win32 光标进程探测确认落点为 `WINWORD.EXE` 时接管 `dragend` 调用原生插入；保留 `zotero/item` 负载、清除 `text/html` 与置空 `text/plain`；macOS/Linux 保持原生拖拽与快速复制，且不适配 WPS Writer。 |
| **个人文库 Word 临时分类管理** | 在左侧分类树直接点选当前正在写的 Word 文稿，集中浏览该文稿已引用的全部参考条目。 | 仅在个人文库（**我的文库**）维护临时分类，经切片重排固定在「我的出版物」正上方；支持不同目录同名文件自动附加父目录标识（如 `paper.docx (Chapter1)`）；不向群组库创建临时集合。 |
| **所有权驱动的引用标签与只读保护** | 按「已被当前稿件引用」筛选或高亮文献，同时防止改名或关闭功能时误删用户自己手动打的标签。 | 为每条自动添加的标签持久化记录管理所有权；多文档间取引文并集；严格遵守 `item.isEditable()` 与回收站/已删除拦截红线，跳过只读群组库与回收站条目写入。 |
| **指纹脏检查与 ItemTree 行级重绘** | 长文档与大型文献库下频繁轮询造成的界面闪烁与冗余计算开销。 | 通过快照输入指纹跳过未变化的重复格式化与集合同步；安全条件下仅失效变动行对应的树行缓存，按引用列排序或大批量变化时自动回退全量刷新。 |
| **全生命周期异常自愈与并发保护** | 防止快速连拖、会话中途关闭、窗口卸载或 Word 未保存命名造成孤儿集合与包装残留。 | 入口并发锁加 ≥ 2000ms 节流占线提示；`finally` 彻底恢复原生 WinWord `getActiveDocument`；多主窗口卸载自动重绑定；启动自动清理无活跃会话的孤立插件托管标签。 |

---

### 1. 多文档引用追踪、P1-B 前景同步与消歧引擎

```text
  Microsoft Word (WINWORD.EXE) ──(Zotero Integration Session)──► CiteFlow 轮询 / 命令监听
             │                                                             │
             ├──► probeForegroundWordTitle() (Win32 只读探测)              ├──► 唯一匹配单个活跃会话？
             │                                                             │     ├─ 是 ─► 自动切换 activeSessionID & 定向刷新
             │                                                             │     └─ 否 / 焦点在 Zotero ─► 保持原会话不盲猜
             └──► 新建未保存文档 ("文档1") / 另存为正式文件名             └──► 多重集窗体消歧 ──► 原地无损重命名临时分类
```

- **P1-B 前景 Word 会话唯一匹配同步 (`v16.2.0`)**：通过 [`src/modules/drop-target.ts`](src/modules/drop-target.ts) 抽取的轻量只读探测函数 [`probeForegroundWordTitle()`](src/modules/drop-target.ts) 与 [`session-sync-helpers.ts`](src/modules/citation/session-sync-helpers.ts) 的 [`syncForegroundActiveSession()`](src/modules/citation/session-sync-helpers.ts)，当用户在多个已打开的 Word 文档间切换焦点并回到 Zotero 查看文献时，仅当系统当前可见的前景 Word 窗口标题能够与活动会话**唯一匹配**，才自动同步 `activeSessionID` 并定向刷新列表视图；若同时打开两个同名窗口或焦点仍在 Zotero，保持原会话不动，绝不跨文档误认。
- **未识别会话原地自愈与多重集标题消歧**：当主动发起集成指令时 Zotero 偶发仅返回随机 session ID、尚无正式路径，插件会在文集树显示稳定序号命名 `Word 文档（待识别） N`，待另存为正式文件名或单义匹配后台 `OpusApp` 窗口时自动原地重命名为真实文档名；`v16.2.0` 将窗口标题扣减从原本会折叠重复名称的 `Set` 升级为**多重集计数差集**，彻底消除两个重名 Word 窗口并存时的误判抢名。
- **不同路径同名文档父目录限定**：若用户同时打开 `D:\Thesis\Chapter1\draft.docx` 与 `D:\Thesis\Chapter2\draft.docx`，[`_getUniqueCollectionDisplayName()`](src/modules/citation/document-naming.ts) 会自动识别路径前缀差异，生成 `draft.docx (Chapter1)` 与 `draft.docx (Chapter2)` 等可区分文集名；SharePoint / OneDrive 云端链接及含 `%` 特殊字符文件名亦通过分段容错解码完整解析。
- **学术引文序数决定性与双向撕裂快照防呆**：[`order-cache.ts`](src/modules/citation/order-cache.ts) 严格过滤非数值序号键及非正整数条目 ID，并在读取 `citationsByIndex` 与 `citationsByItemID` 时实行**双向一致性确认**——若检测到写入半成品造成的单边空白，自动延迟 `50ms` 重读而不轻率清空既有引用状态；若文档内所有已引条目均被移入 Zotero 回收站，则会准确识别全回收站文档状态并清理会话残留与序数挤占。

### 2. Windows 可编辑 CSL 拖拽插入（原生负载无损兼容）

- **精准分流 Zotero 原生拖拽与 Word 拖拽**：[`drag-cite.ts`](src/modules/views/drag-cite.ts) 仅在 `supportsNativeDropTarget()` 为 `true`（Windows 平台）时包装 `itemsView.onDragStart`：
  1. 首先调用 Zotero 原生 `onDragStart`，完整保留 `zotero/item` 等内部负载，因此将文献拖入左栏其它文集、子文集或废纸篓的行为 100% 与原生一致；
  2. 同步快照选中条目（过滤非普通条目、非顶层附件与已删除/回收站条目，并按 ID 去重）；
  3. 仅移除 `text/html` 并置空 `text/plain`，防止拖放瞬间将普通纯文本书目粘贴进 Word 破坏格式；
  4. 在 `dragend` 触发时，使用缓存的 Win32 `ctypes` 句柄（`GetCursorPos` + `WindowFromPoint` + `GetWindowThreadProcessId` + `QueryFullProcessImageNameW`，在 `onShutdown` 确定性释放）确认光标落点确实位于 `WINWORD.EXE` 进程。若拖入资源管理器、浏览器或其它非 Word 应用则零触发；仅在状态为 `word-confirmed` 时唤醒 [`addon.api.citeItems`](src/addon.ts)。
- **原生 Word CSL 域写入与包装清理**：[`src/modules/cite.ts`](src/modules/cite.ts) 并不自行拼装静态字符串，而是通过临时适配 `Zotero.Integration` 会话使 Word 在光标处插入完整的原生可编辑 CSL 引文域（并兼容 Zotero 10 WinWord 以 `null` 调用 `getDocument()` 的边界情况）。操作结束后的 `finally` 阶段经 `restorePatchedApplications()` 完整还原全部临时适配的 WinWord `application` 原生方法。
- **并发拖拽占线非阻塞提示 (`v16.2.0`)**：上一次引文插入尚未结束时再次拖拽条目，[`src/addon.ts`](src/addon.ts) 会立即抑制并发重入冲突，并通过 `Zotero.ProgressWindow` 弹出节流 ≥ `2000ms` 的温和占线提示（*“上一次引用插入尚未完成，请稍后再试。”*），避免干扰写作或卡死队列。

### 3. 文集树定位与个人文库临时分类管理

- **精准固定在「我的出版物」正上方**：针对 Zotero 10+ 按系统 locale 自动排序导致中文或字母文件名与用户日常文件夹穿插跳跃的痛点，[`icon-patch.ts`](src/modules/views/icon-patch.ts) 通过结构感知的数据切片重排，将所有 CiteFlow 管理的 Word 文档临时分类统一置于用户常规文集/已保存搜索之后、「我的出版物 (`publications`)」虚拟行**正上方**，同时保留常规文件夹展开/折叠子树结构完整性、正确还原排序行自有 `isCollection` 属性并精确维持树选区焦点不偏移。
- **与核心追踪流水线解耦**：关闭「在文集树中生成 Word 临时分类」偏好时，插件会先从活跃会话解绑并原子执行 `eraseTx()` 清理临时集合，但列表「引用」列、文档身份识别与自动标签管线仍继续完整运转；重新开启时会立即依据当前缓存的 `session.idData` 自动重建并回填已引用条目。

### 4. 所有权可证明的自动引用标签治理

- **只清自身、不伤手工**：插件内部维护 `_managedCitationTagIDs` 与持久化标签状态，明确区分「由 CiteFlow 自动打上的标签」与「用户早已手动标注的同名标签」。关闭自动标签开关或文档不再引用某文献时，只摘除由插件负责管理的标签，原有手工标签原封不动。
- **多文档并集逻辑**：当文献 $A$ 同时被 Word 文档 1 和文档 2 引用时，仅关闭文档 1 不会摘除 $A$ 的引用标签，确保跨稿件写作用标状态不丢失。
- **自定义文本在线迁移与回滚**：修改「引用标签文本」（如将 `/Citations` 改为 `已引用`）后，自动将托管文献由旧标签平滑迁移至新标签；若遇局部保存异常，保留有效所有权与状态快照支持重试。
- **启动孤立标签自愈**：插件启动清理无任何活跃 Word 会话认领的遗留托管标签（同时跳过正在运行中的会话及回收站/只读条目）。

### 5. 增量脏检查、行级定点重绘与自适应轮询调度 (`v16.2.0`)

- **输入指纹脏检查 ([`refresh-helpers.ts`](src/modules/citation/refresh-helpers.ts))**：对会话引文快照、引用标签设置、排序状态与活跃状态计算确定性指纹 [`buildRefreshInputFingerprint()`](src/modules/citation/refresh-helpers.ts)，输入完全一致时跳过冗余格式化与数据库写入，在集合重建或同步失败时自动失效指纹强制重算。
- **ItemTree 行级局部失效与安全全量回退**：结合 Zotero `10.0.8` 原生树接口（`invalidateRowCache`、`getRowIndexByID`、`getSortField` / `getSortFields`、`tree.invalidateRow`），当受影响的条目数可控且当前未按「引用」列排序时，仅精确重绘变动文献对应行；一旦检测按引用列排序、批量超过阈值或宿主接口不可用，自动无缝退回 `refreshAndMaintainSelection()` 全量刷新保证视图一致性。
- **3 秒探测冷却与监听平滑退避 ([`session-sync-helpers.ts`](src/modules/citation/session-sync-helpers.ts))**：后台全量 Word 窗口枚举受 `WINDOW_PROBE_COOLDOWN_MS = 3000` 约束；当连续 `5` 次后台轮询无状态变更时，监听步进平滑退避至最大 `3000ms` 间隔以降低空转功耗；一旦用户在 Word 中执行引文操作（包含 `execCommand` 并发重入结束后的补偿）或打开/切换会话，立即复位退避恢复即时响应。

---

<a id="csl-example"></a>

## 📄 CSL 引用格式参考案例：Compact Journal Reference

为满足科研人员在投递顶级期刊和国际顶会手稿（如 IEEE Transactions、ACM 系列、Nature 子刊、CVPR、ICCV 等）时对**严格篇幅限制（Page Limit）**的要求，CiteFlow 仓库收录了专门定制的极简紧凑 CSL 1.0.2 引用样式（由 **Shikunhou** 定制，并在 `16.1.0` 中经测试规范化校验）：

📁 **样式文件入口**：[`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)

### 样式核心特色对比

| 设计维度 | 标准传统格式 (如 APA / IEEE 完整版) | Compact Journal Reference 紧凑格式 |
|---|---|---|
| **正文引用标记** | 括号作者年 `(Vaswani et al., 2017)` 或带空隙 `[ 1 ]` | 极简顺序数字标引 `[1]`、`[1, 2]`、`[1-4]`（连续范围自动合并） |
| **期刊与容器名称** | 全称长文本（易换行占用 2 行） | 规范斜体缩写 (`form="short"`，如 *NeurIPS,*、*IEEE Trans. PAMI,*) |
| **发表年份呈现** | 括号尾缀 `(2017)` 或普通字重 | **粗体醒目标注**（如 **2017**） |
| **卷期与页码** | 冗余文字标识 `Vol. 30, no. 2, pp. 5998-6008` | 极简并置 `30(2), 5998-6008`（省略冗余标签） |
| **文末排版间隙** | 宽段间距，带未对齐悬挂 | 悬挂齐平对齐 (`second-field-align="flush"`)，段间距 `0` |

### 排版效果直观对比

- **传统标准排版（约占 3–4 行）**：
  > `[1] Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. In Advances in Neural Information Processing Systems (Vol. 30, pp. 5998–6008). Currans Associates, Inc.`
- **Compact Journal Reference 紧凑排版（单行即完整呈现，节省 60%+ 篇幅）**：
  > `[1] Attention Is All You Need. NeurIPS, 2017, 30, 5998-6008.`

### 导入与使用步骤

1. 下载或从本地仓库获取 [`csl/compact-journal-reference.csl`](csl/compact-journal-reference.csl)。
2. 打开 Zotero → **编辑 (Edit) / 设置 (Settings) → 引用 (Cite) → 样式 (Styles)**（macOS 为 **Zotero → 设置**），点击列表下方的 **「+」号** 选择该 `.csl` 文件导入（或直接拖入 Zotero 主窗口）。
3. 在文字处理软件的 Zotero 工具栏点击 **Document Preferences（文档首选项）**，选择 **Compact Journal Reference** 并确定即可应用。
   - **功能边界提醒**：上述 `.csl` 样式文件本身可用于 Word 或 WPS；但 **CiteFlow 的实时引用列追踪、Word 临时文集、自动引用标签与 Windows 拖拽插入能力仅支持 Microsoft Word，不适配 WPS Writer**。

---

<a id="settings"></a>

## ⚙️ 设置项完整参考

打开路径：**Zotero → 编辑 / 工具 → 设置 → Zotero CiteFlow**（Windows / Linux 通常位于 **编辑 → 设置**，macOS 位于 **Zotero → 设置**）。

- 设置面板采用 Zotero Flow 统一 **五卡片单层折叠布局 + 16px / 24px / 40px 三级黄金垂直对齐规范**，100% 由 Fluent 国际化驱动并适配深色/浅色主题。
- **即时自动保存与多窗口双向同步**：全部偏好存储于 `extensions.zotero.zoterocitation.*`；通过 Zotero 高级设置编辑器（Config Editor）修改时设置面板会同步刷新；快速连续输入通过串行队列防抖合并（以最后一次有效 revision 为准）。
- **即使关闭总开关，设置面板仍保持可打开与可恢复**。点击卡片 5 底部的 **「恢复默认设置」** 仅重置下表所列 10 项设置，**不会**清理 Word 文档既有引文，也保留用户手工标签与其它 Zotero 全局偏好。

### 全部 10 项原生设置说明

| 所属模块卡片 | 面板控件名称 | 内部偏好键 (`extensions.zotero.zoterocitation.*`) | 默认值 | 允许范围 / 约束 | 生效时机与联动行为 |
|---|---|---|---|---|---|
| **1. 基础服务与引用追踪** | 启用 CiteFlow 引用跟踪 | `enable` | `true` (开) | 布尔开关 | **修改后需重启 Zotero 生效**；关闭后不加载追踪监听、列注册与拖拽接管，仅保留设置面板与偏好观察器。 |
| **2. 写作交互与快捷插入** | 启用拖拽引用 | `dragCite.enable` | `true` (开) | 布尔开关 | **即时生效**；引用列隐藏时依然可用。**仅 Windows 支持**：在 macOS / Linux 下该控件自动置灰禁用并完整保留原生快速复制拖拽。 |
| **3. 文集呈现与标签管理** | 在文集树中生成 Word 临时分类 | `collections.enable` | `true` (开) | 布尔开关 | **即时生效**；仅在个人文库维护分类。关闭时自动擦除插件管理的临时集合但保持引用列与标签正常运行；重开立即从现存会话回填。 |
| **3. 文集呈现与标签管理** | 引用后自动维护标签 | `citationTags.enable` | `true` (开) | 布尔开关 | **即时生效**；主从联动控制器——关闭后禁用下方「引用标签文本」输入框、自动清除无效编辑提示并还原已保存文本，同时仅摘除插件拥有所有权的标签。 |
| **3. 文集呈现与标签管理** | 引用标签文本 | `citationTags.text` | `"/Citations"` | 1–200 字符非空文本（禁止换行与 ASCII 控制字符） | **即时生效**；保存时自动去除首尾空白。修改后平滑迁移插件托管的所有引用标签并保留用户其它手动标签；输入非法则阻止保存并提示错误。 |
| **4. 刷新调度与性能控制** | 引用标签同步延迟 (ms) | `citationTagDebounceMs` | `150` | `0` – `2000` 整数 | 用于后续自动标签批量防抖同步（超过边界值自动拒绝并回显保存值，底层读取按区间限幅）。 |
| **4. 刷新调度与性能控制** | 文献列表刷新延迟 (ms) | `itemsViewRefreshDebounceMs` | `120` | `0` – `2000` 整数 | 用于后续条目列表视图防抖重绘调度。 |
| **4. 刷新调度与性能控制** | 诊断统计时间窗 (ms) | `healthWindowMs` | `300000` | `10000` – `3600000` 整数 | 控制运行时健康检查与性能统计滚动时间窗（默认 5 分钟）。 |
| **4. 刷新调度与性能控制** | 慢操作记录阈值 (ms) | `perfSlowThresholdMs` | `50` | `5` – `5000` 整数 | 超过该耗时的内部同步或刷新步骤会被计入性能诊断慢操作统计。 |
| **5. 诊断调试与系统维护** | 启用详细调试日志 | `debug` | `false` (关) | 布尔开关 | **即时生效**；在 Zotero Debug Output 中输出 CiteFlow 详细追踪日志，日常推荐关闭。 |

> [!TIP]
> 历史旧版中的单引号快捷键（`quickCite.enable`）已在现代重构中彻底移除，以避免多文档环境下因光标位置与目标文档歧义造成误插；即使用户配置中仍残留该旧键，运行时也不会再读取或拦截按键。

---

<a id="data"></a>

## 🔒 数据、同步与外部服务边界

- **完全纯本地运行**：CiteFlow 所有源码及依赖打包运行于 Zotero 桌面端本地进程内，**零外部 API 请求、零账号登录、零云端上传**。
- **不代替数据库同步**：引用状态与临时分类基于本地运行时 Word `Zotero.Integration` 会话与本机偏好键值同步，引用追踪元数据（`_temporaryCollectionKeys`、`_managedTagIDs` 等）仅保存于本地首选项。
- **严格区分「拖入 Word」与「文档既有字段」**：拖拽操作仅调用 Zotero 原生引用插入接口在光标处插入新引文，绝不擅自扫描磁盘任意 `.docx`、也不改写或覆写文档中既有的其它 Word 引文域。
- **团队群组库零污染承诺**：无论是否打开临时分类或自动标签开关，CiteFlow 均只操作当前用户的个人文库并严格前置校验 `item.isEditable()`，只读群组库与回收站绝不出现脏写报错或非法同步冲突。

---

<a id="compatibility"></a>

## 🌐 兼容性与验证范围

请将**清单兼容声明**与**当前实机验证覆盖范围**严格区分看待：

| 维度 | 说明 |
|---|---|
| **当前插件版本** | `16.3.1` |
| **清单声明的 Zotero 兼容范围** | `10.0` 至 `12.*`（`manifest.json` & `update.json`） |
| **编译与引擎架构** | TypeScript 严格模式（`tsconfig.json` `strict: true`），esbuild 目标 `firefox140` / Gecko `153+`，生产包保持未压缩可审计 (`minify: false`)，全面禁用 `Cu.import` / `Components.*` / `defaultIn` 等过时 API |
| **`v16.3.1` 自动化验证** | • `tsc --noEmit`：0 错误<br>• `scripts/architecture-guard.mjs`：13/13 通过（37 个 TS 模块均 `<= 360` 行、零债务、`43` 组对称 FTL 键、`10` 处版本统一对齐 `v16.3.1`）<br>• 全套 Node 自动化测试 (`npm test`)：**93/93** 通过（含 `tests/citeflow-fixes.test.mjs` 6 项、`tests/enhancement-stability.test.mjs` 6 项、`citation-stability` 25 项、`citation-data` 13 项、`citation-word` 10 项及锁定的 `cite.ts` 守卫/SHA-256 核验等） |
| **历史桌面端实机隔离验收（`v16.2.0`）** | `v16.2.0` 曾对 `dist/zotero-citeflow-16.2.0.xpi` 执行 `scripts/test-settings-native.ps1` 真实 **Zotero `10.0.8`** 隔离配置文件启动与设置页验收（`zh-CN` 40/40、`en-US` 40/40 通过）；`v16.3.1` 本轮未重跑桌面端 Zotero 实机隔离启动验收。 |
| **历史 Word 真机物理基线** | Windows + Zotero `10.0.6` + Microsoft Word `16.0.20430` 曾完成真实普通条目拖拽插入可刷新 `ADDIN ZOTERO_ITEM CSL_CITATION` 域与非 Word 拖放零插入验收（记录于 [CORE-TECHNICAL-MAINTENANCE.md](CORE-TECHNICAL-MAINTENANCE.md)）。 |
| **诚实未覆盖边界** | `v16.3.1` 本轮尚未在桌面环境中执行真机 Zotero 设置页冒烟，也尚未启动**双窗口物理 Microsoft Word（`WINWORD.EXE`）**执行实时焦点切换与实体 COM 插入联合实测；尚未实机认证 Zotero `11` / `12`、macOS Word、LibreOffice Writer 或用户主配置文件升级迁移。 |

---

<a id="troubleshooting"></a>

## ❓ 常见问题与排查指南

| 现象 | 常见原因 | 排查与解决步骤 |
|---|---|---|
| **文献列表中看不到「引用」列** | Zotero 默认不会自动强制弹出隐藏扩展列，或此前被关闭。 | 在主列表任意列标题右侧空白处**右键点击表头**，勾选 **引用** (Citation) 列；若开启了总开关仍未出现，检查是否刚打开「启用 CiteFlow 引用跟踪」（该项需重启 Zotero）。 |
| **临时分类显示「Word 文档（待识别） N」** | 由插件侧触发新建或重连时，Zotero/WinWord 尚未回传可信文件路径（例如新建未保存文档 `文档1`）。 | 无需手动改名！在 Word 中保存文档（`Ctrl+S`）或于该文档使用一次 Zotero Word 插件命令，CiteFlow 会在背景标题唯一匹配时原地自动更新为真实文档名。 |
| **打开两个相同名称的 Word 文档但路径不同** | 仅看文件名无法区分两篇手稿。 | `v16.2.0` 已支持父目录消歧（如 `paper.docx (Chapter1)` vs `paper.docx (Chapter2)`）；若两篇处于完全相同的窗口标题（如同时打开同一副本或未保存标题撞车），插件会拒绝盲猜以防止错归属，请先区分标题或重新聚焦所需文档触发同步。 |
| **拖文献到 Word 弹出“无法确认拖拽目标是 Word”** | 拖拽释放落点不在 `WINWORD.EXE` 文档窗口（例如落在了 WPS Writer、浏览器、桌面或 Word 功能区外）。 | 请确认软件为 Microsoft Word（不支持 WPS Writer），并将条目直接松手在 Word 文档**正文编辑页面**内；若仍频繁失败，请开启 `debug` 日志并联系开发者附带 Word 版本号反馈。 |
| **拖拽后提示“上一次引用插入尚未完成”** | 上一次拖拽进入 WinWord 的 COM 引文对话或集成事务尚未返回。 | 这是 `v16.2.0` 的非阻塞保护提示，等待数秒待 Word 完成上一个 CSL 域写入或关闭 Word 内正在弹出的引用选框后再拖拽即可。 |
| **macOS / Linux 下无法勾选“启用拖拽引用”** | 原生光标准确进程确认依赖 Windows Win32 `ctypes` 接口，为防止非目标窗口误插，非 Windows 平台默认禁用接管。 | 在 macOS / Linux 下「启用拖拽引用」控件会自动保持禁用态，同时完整保留 Zotero 原生快速复制与拖拽功能（请使用 Word Zotero 工具栏插入引文，但引用状态列、临时分类与自动标签仍可按 Word 集成情况使用）。 |
| **群组库条目没有出现临时集合或自动标签** | 临时分类设计仅写入用户个人文库，且只读/群组库或回收站条目受 `item.isEditable()` 写保护。 | 属于刻意设计的数据安全边界，防止污染多人共享群组库或触发错误权限弹窗。 |
| **问题反馈请附带哪些信息？** | 便于精准复现定位。 | 请在 [GitHub Issues](https://github.com/groele/Zotero-CiteFlow/issues) 提供：CiteFlow 与 Zotero 版本号、操作系统及 Word 版本、多文档切换顺序、开启 `debug` 后的脱敏错误日志及最小复现步骤。 |

---

<a id="development"></a>

## 🛠️ 工程架构与开发指南

CiteFlow 在底层架构上彻底消除了早期的巨型单文件代码堆砌，采用 **TypeScript 严格类型组合 (`composeDomains`) + esbuild 极速打包（保留未混淆代码以利开源审计与堆栈定位）**：

```text
github-sources/Zotero-CiteFlow/
├── bootstrap.js                       # Zotero 插件生命周期入口（legacy 停用、chrome 注册、加载 bundle）
├── prefs.js                           # 10 项原生偏好默认值声明
├── manifest.json / update.json        # 清单、兼容范围与自动更新 SHA-512 清单
├── src/
│   ├── index.ts / hooks.ts / addon.ts / runtime.ts   # 启动挂载、并发防护与宿主安全 Patch 管理器
│   ├── preferences.ts                                # 设置页控制器（编译期注入 __buildVersion__ / __buildDate__）
│   └── modules/
│       ├── cite.ts                    # 受保护的原生 Word Integration 引文写入内核（SHA-256 锁定基线）
│       ├── drop-target.ts             # Win32 光标窗口/进程识别与轻量只读前景标题探测
│       ├── citation/                  # 10 个组成领域模块 + 契约 + session-sync-helpers.ts / refresh-helpers.ts
│       └── views/                     # 5 个视图领域模块（引用列、文集图标与重排、拖拽接管、就绪守卫）
├── chrome/content/                    # Fluent 纯净驱动的五卡片 40px 栅格设置页与构建输出 bundle
├── locale/{zh-CN,en-US}/              # 双语严格对称的 42 个 Fluent 条目
├── csl/compact-journal-reference.csl  # 紧凑期刊 CSL 1.0.2 引用样式参考案例
├── scripts/                           # architecture-guard.mjs、build-source.mjs、build.ps1、test-settings-native.ps1、release-tags.py
└── tests/                             # 87 项自动化回归与架构守卫测试用例
```

### 常用开发、测试与打包命令（Windows / PowerShell + Node >= 22.14）

```powershell
# 1. 安装依赖（严格按 lockfile）
npm ci

# 2. 类型检查与 13 项全链路架构合规守卫（360 行上限 / FTL 对称 / API 禁令 / 版本与哈希一致）
npm run typecheck
npm run guard

# 3. 构建编译与全量自动化测试（87 项单测与集成测试，基于 Node 原生类型擦除）
npm test

# 4. 打包确定性生产 XPI 并自动更新 SHA-512 更新源
npm run package

# 5. 在隔离配置下启动真实 Zotero 桌面端执行设置页实机验收（默认需本机已安装 Zotero）
pwsh -NoProfile -File scripts/test-settings-native.ps1 -XpiPath dist\zotero-citeflow-16.2.0.xpi -Locale zh-CN

# 6. 验证发布标签规范
python scripts/release-tags.py --self-test
```

### 扩展技术文档与历史记录索引

- [核心技术与维护手册 / Technical maintenance guide](CORE-TECHNICAL-MAINTENANCE.md)
- [完整更新日志 / Release notes](RELEASE_NOTES.md) · [v16.2.0 说明](docs/releases/v16.2.0.md) · [v16.1.0 说明](docs/releases/v16.1.0.md) · [v16.0.0 说明](docs/releases/v16.0.0.md)
- [早期版本阶段说明](docs/releases/v13.0.9.md) · [v13.0.8](docs/releases/v13.0.8.md) · [v13.0.7](docs/releases/v13.0.7.md)
- [系列品牌规范 / Brand guide](docs/brand/BRAND.md) · [README 模板](docs/brand/README-TEMPLATE.md) · [产品简介](docs/brand/PRODUCT.md) · [改进追踪](docs/brand/IMPROVEMENTS.md)
- [原详细参考文档 · 中文](docs/reference/README.zh-CN.md) · [原详细参考文档 · English](docs/reference/README.md)（保留早期版本细节，其中版本与验证数字仅代表当时记录）
- [第三方组件声明 / Third-party notices](THIRD_PARTY.md) · [发布与标签治理政策](docs/release-tag-policy.md)

---

<a id="series"></a>

## 🔗 Zotero Flow 系列产品

系列七款插件各自独立安装、独立更新与独立维护版本，同属一个系列并不代表共用数据库或已自动联通全部跨插件操作：

| 产品 | 核心定位 |
|---|---|
| [Zotero RefFlow](https://github.com/groele/Zotero-RefFlow) | **文献发现** · 检索参考文献、被引文献与相关研究。 |
| [Zotero MetaFlow](https://github.com/groele/Zotero-MetaFlow) | **元数据整理** · 校验、规范并补全文献元数据。 |
| [Zotero ViewFlow](https://github.com/groele/Zotero-ViewFlow) | **阅读预览** · 在 Zotero 侧栏预览并复制格式化引文。 |
| [Zotero MindFlow](https://github.com/groele/Zotero-MindFlow) | **知识组织** · 将文献、批注与思路组织为可编辑导图。 |
| [Zotero TaskFlow](https://github.com/groele/Zotero-TaskFlow) | **任务推进** · 将文献研读转化为可追踪的任务与计划。 |
| [Zotero CiteFlow](https://github.com/groele/Zotero-CiteFlow) | **写作引用** · 追踪 Word 文档引用，并连接 Zotero 文献操作。 |
| [Zotero PaperFlow](https://github.com/groele/Zotero-PaperFlow) | **投稿审稿** · 管理手稿、投稿轮次与审稿回复。 |

---

<a id="license"></a>

## 📄 项目来源与许可

- **二次开发致谢声明**：Zotero CiteFlow 基于 MuiseDestiny（Polygon）的开源插件 [zotero-citation](https://github.com/MuiseDestiny/zotero-citation) 二次开发并独立演进维护。上游作者版权、`AGPL-3.0-only` 义务及 [第三方组件声明](THIRD_PARTY.md) 继续有效；本项目并非上游项目或 Zotero 官方发布产品。
- **开源许可**：[AGPL-3.0-only](LICENSE)。
- Zotero、Microsoft Word 及相关第三方产品名称与商标归各自权利人所有。
