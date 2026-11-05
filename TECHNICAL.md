# MarkdownProMax 技术方案

> 本文档描述**当前已经实现**的系统（as-built），包括架构分层、组件职责、技术选型理由与关键约束。
> 界面与功能清单见 [`UI-DESIGN.md`](UI-DESIGN.md)，需求演进见 [`DESIGN.md`](DESIGN.md)，使用说明见 [`README.md`](README.md)。

- 版本：0.1.0
- 更新：2026-11-05
- 规模：前端约 7.2k 行（TS/TSX）、Rust 约 2.6k 行；前端 214 项测试、Rust 45 项测试

---

## 1. 项目定位与边界

**做什么**：一个 Markdown 桌面编辑器，支持 Windows / Linux / macOS 三端部署。

**硬约束**：

| 约束 | 落地方式 |
|---|---|
| 不使用 Electron（不捆绑 Chromium） | Tauri 2 使用系统 WebView（WebView2 / WKWebView / WebKitGTK） |
| UI 层用社区主流组件 | CodeMirror 6、React 19、KaTeX、Mermaid、markmap |
| 重活放在 Rust | 文件读写、编码探测、原子写、资源代理、文件监听、工作区扫描 |

**能力范围**：所见即所得编辑（Live Preview）、多标签、工作区文件树、右键文件操作、公式、图表、HTML、脑图视图、窗口状态记忆。

**非目标（当前）**：协同编辑、插件系统、移动端、内置 Git、脑图内直接编辑。

---

## 2. 技术栈总览

### 2.1 运行时

| 层 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 桌面外壳 | Tauri | 2.12.5 | 系统 WebView + Rust 主进程，资源内嵌，单二进制分发 |
| 窗口/文件/更新插件 | tauri-plugin-dialog / opener / store / single-instance / window-state | 2.8.4 / 2.7.2 / 2.5.0 / 2.5.5 / 2.5.0 | 均为一手官方插件 |
| 前端框架 | React + TypeScript | 19.3.1 / 5.9.3 | 只负责 UI，不直接碰文件系统 |
| 构建 | Vite | 8.3.5 | rolldown 打包，产物由 oxc 压缩 |
| 编辑器 | CodeMirror 6 | 6.x（core `@codemirror/view` 6.43.15） | 文本即真相的 Live Preview |
| 语法解析 | Lezer（`@codemirror/lang-markdown` 6.5.2） | — | 增量解析，标题/表格/代码块识别 |
| 数学 | KaTeX | 0.19.1 | 行内与块级公式 |
| 图表 | Mermaid | 12.2.0 | 代码块内 mermaid，懒加载 |
| 脑图 | markmap-view | 0.18.12 | 缩放/平移/折叠；另有自研 SVG 渲染器兜底 |
| HTML 清洗 | 自研 allowlist（`sanitize.ts`） | — | 见 §6.6 |

### 2.2 Rust

| crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2.12.5 | 主进程、IPC、事件 |
| `notify` | 8.2.1 | 工作区递归监听 |
| `reqwest`（blocking + rustls） | 0.13.5 | 远程图片代理 |
| `sha2` | 0.10.9 | 缓存键 |
| `url` | 2.5.8 | URL 策略校验 |
| `encoding_rs` / `chardetng` | 0.8.44 / 1.0.0 | 编码探测与转换 |
| `thiserror` | 2.0.21 | 错误类型 |
| `serde` / `serde_json` | 1.0.229 / 1.0.154 | IPC 与配置 |
| `tokio` | 1.54.1 | 阻塞任务调度（`spawn_blocking`） |

> `rust-version = 1.90`：Tauri 2.12 的 MSRV。低于它时 Cargo 会**静默降级**到 Tauri 2.11，导致与 npm 包次版本不匹配（详见 §6.10）。

---

## 3. 总体架构

```
┌───────────────────────────────────────────────────────────────┐
│ WebView（系统内核：WebView2 / WKWebView / WebKitGTK）          │
│  React 19 + Vite + TypeScript                                  │
│  ├── editor/     CodeMirror 6 + Live Preview 装饰层            │
│  ├── mindmap/    标题树、树形布局、视口变换                     │
│  ├── components/ 工具栏、标签栏、侧栏、状态栏、脑图视图         │
│  └── platform/   Platform 接口（tauri 实现 / 浏览器降级实现）   │
├───────────────────────────────────────────────────────────────┤
│ IPC：invoke 命令 + 事件（workspace://changed）                 │
├───────────────────────────────────────────────────────────────┤
│ Rust 主进程                                                    │
│  ├── markdownpromax-core   文件内核（可脱离 Tauri 单测）            │
│  ├── markdownpromax-asset  图片代理内核（可脱离 Tauri 单测）        │
│  └── src-tauri         commands / recent / watcher / 配置       │
└───────────────────────────────────────────────────────────────┘
```

### 3.1 核心原则：**文本即真相**

- Markdown 文本是唯一真相，由 WebView 里的 CodeMirror 持有；
- Rust 不维护第二份文档模型，保存时只接收整篇文本；
- 因此不存在"双模型同步"问题，也不会出现"打开再保存，全文被重排"。

这条原则直接决定了下面的架构：Rust 只做 WebView 不擅长或不安全的事（文件系统、编码、索引、网络、监听），不做解析与渲染。

---

## 4. Rust 侧设计

### 4.1 `crates/markdownpromax-core`（不依赖 Tauri）

| 模块 | 职责 | 关键 API |
|---|---|---|
| `encoding.rs` | BOM → 严格 UTF-8 → chardetng 猜测；保存时按原编码回写 | `decode` / `encode` / `Charset` |
| `eol.rs` | LF / CRLF / CR 探测与还原 | `Eol::detect` / `normalize` / `apply` |
| `atomic.rs` | 同目录临时文件 + `fsync` + `rename`，失败清理 | `write_atomic` / `backup_path` |
| `document.rs` | 打开/保存、mtime 冲突检测、备份 | `open` / `save` / `SaveRequest` |
| `workspace.rs` | 目录单层扫描、过滤、排序、上限 | `list_dir` / `ListOptions` |
| `fs_ops.rs` | 新建/删除/复制/移动 + 名字校验 | `validate_name` / `create_file` / `delete_path` / `copy_path` / `move_path` |
| `error.rs` | 统一错误类型 | `Error` / `Result` |

设计要点：

- **不依赖 Tauri/GUI**，所以能在没有 WebView 开发包的机器上跑全部测试；
- 编码与行尾**往返保真**：GBK 文件打开再保存是逐字节一致的，CRLF 文件不会被改成 LF；
- 原子写防止断电写坏原文件；
- `validate_name` 从入口拒绝 `../`、路径分隔符与控制字符，堵住路径穿越。

### 4.2 `crates/markdownpromax-asset`（不依赖 Tauri）

| 模块 | 职责 |
|---|---|
| `policy.rs` | 只允许 HTTPS（可配置放开 HTTP）；拒绝 `file:`/`data:`/`ftp:`；URL 长度上限 |
| `cache.rs` | `sha256(url)` → `<key>.<ext>`，原子落盘，扩展名白名单与清洗 |
| `data_url.rs` | base64 编码 + `data:` URL 构造（含 MIME 映射） |
| `lib.rs` | `fetch_image()`：命中缓存不发请求；超限拒绝且不落盘 |

抓取通过 `Fetcher` trait 注入（生产实现是 reqwest），因此缓存、策略、大小限制都能在**无网络**环境下测试。

### 4.3 `src-tauri`

| 模块 | 职责 |
|---|---|
| `commands.rs` | 打开/保存/另存、最近文件、远程与本地图片、工作区扫描、文件操作、文件管理器定位 |
| `recent.rs` | 最近文件持久化（`app_config_dir/recent.json`，最多 12 条） |
| `watcher.rs` | notify 递归监听，300ms 节流后发 `workspace://changed`；用"代际号"让旧线程自动退出 |
| `tauri.conf.json` | 窗口、CSP、devCsp、打包配置、`mainBinaryName` |
| `capabilities/default.json` | `core:default` / `dialog:default` / `opener:default`；窗口白名单含 `main` 与 `window-*`（新建窗口需要） |

### 4.4 IPC 契约

| 命令 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `open_document` | `path` | `{ meta, text }` | 打开并登记到文档表 |
| `pick_document` | — | `{ meta, text } \| null` | 系统对话框选文件 |
| `save_document` | `id, text, expectMtimeMs` | `{ mtimeMs, bytes }` | mtime 不匹配返回冲突错误 |
| `save_document_as` | `text, suggestedName` | `{ meta, text } \| null` | 新文件统一 UTF-8 + LF |
| `recent_documents` | — | `DocMeta[]` | 最近列表 |
| `remove_recent` | `path` | `DocMeta[]` | 从最近列表移除一条（不删文件） |
| `pick_folder` | — | `string \| null` | 选工作区 |
| `list_directory` | `path` | `DirEntry[]` | 单层，过滤后排序 |
| `create_entry` | `parent, name, directory` | `path` | 新建文件/目录 |
| `delete_entry` | `path` | — | 文件或目录（递归） |
| `copy_entry` / `move_entry` | `from, to` | — | 复制 / 剪切粘贴 |
| `reveal_entry` | `path` | — | xdg-open / open -R / explorer /select |
| `load_image` | `docPath, src` | `data:` URL | 本地图片限制在文档目录内 |
| `fetch_remote_image` | `url` | `data:` URL | 走策略 + 缓存 |
| `open_new_window` | — | — | 新建应用窗口（label `window-<毫秒>`） |
| `watch_workspace` | `path` | — | 启动监听 |

事件：`workspace://changed`（payload 为工作区路径）。

---

## 5. 前端设计

### 5.1 编辑器与 Live Preview

**结构**：`MarkdownEditor` 薄封装 CodeMirror 6，向外只暴露 `getText / setText / setTheme / setMode / focus / destroy`。

**Live Preview 的核心是"文本不动，只叠装饰"**：

| 文件 | 职责 |
|---|---|
| `livePreview/index.ts` | 遍历语法树产出装饰；分块/行内两层；`atomicRanges`；`insideBlock` 区间跳过 |
| `livePreview/widgets.ts` | 代码卡片、表格、分割线、项目符号 |
| `livePreview/table.ts` | GFM 表格解析（纯函数） |
| `livePreview/inline-markdown.ts` | 行内 Markdown → HTML（表格单元格用）：先抠代码/公式，再整体转义，最后套语法 |
| `livePreview/facets.ts` | 宿主注入的 `externalOpener` 等 facet（避免 index 与 widgets 循环依赖） |
| `livePreview/math.ts` | `$…$` / `$$…$$` 扫描（纯函数） |
| `livePreview/math-widget.ts` | KaTeX 渲染 |
| `livePreview/mermaid-widget.ts` | Mermaid 异步渲染 + 串行队列 + 缓存 + DOM 定点清洗 + 节点标签居中（`centerNodeLabels`，字体加载后再校正） |
| `livePreview/image-widget.ts` | 图片占位与点击加载 |
| `livePreview/html.ts` / `html-widget.ts` | 行内 HTML 成组与块级 HTML |
| `livePreview/frontmatter.ts` / `frontmatter-widget.ts` | YAML frontmatter 折叠卡片 |
| `livePreview/links.ts` | 行内式/引用式/自动链接解析 |
| `livePreview/sanitize.ts` | HTML allowlist 清洗 |
| `livePreview/clickable.ts` | 统一的"点击回源码"行为 |

**关键的架构约束**：CodeMirror **不允许 ViewPlugin 提供块级装饰**。因此装饰分为两层：

```
块级（代码卡片/表格/分割线/块级公式/Mermaid/HTML 块/frontmatter）
  → StateField + EditorView.decorations.from(field)
  → 组件内带"选区行号快照"短路，光标同行移动不重算
  → 文档 > 2MB 时关闭块级 widget

行内（标记隐藏、标题字号、引用竖线、行内公式、图片、链接）
  → ViewPlugin，仅在 view.visibleRanges 内计算
```

**揭示策略**：光标所在行内的标记符不隐藏，而是降到 42% 透明度；隐藏区间进 `atomicRanges`，让方向键跳过不可见字符。

**IME**：`view.composing` 期间冻结装饰重建，避免中文输入跳字。

### 5.2 脑图

| 文件 | 职责 |
|---|---|
| `mindmap/tree.ts` | 从 Markdown 抽标题、`{#mm}` 标记过滤、建树、生成 Mermaid 源码 |
| `mindmap/layout.ts` | 自研"从左到右"紧凑树布局（纯函数） |
| `mindmap/viewport.ts` | 缩放/平移数学（锚点缩放、适配居中、范围夹取） |
| `components/MindMapView.tsx` | 双渲染器：markmap 优先，失败自动回退自研 SVG |

过滤语义：

- 文档中**出现任意 `{#mm}`** → 只保留带标记的标题；
- **一个都没有** → 展示全部标题（避免空白脑图）；
- 未标记的父节点被过滤时，标记的子节点挂到最近的已标记祖先；
- 标记在所见即所得视图里自动隐藏。

### 5.3 平台抽象

`platform/` 定义 `Platform` 接口，两个实现：

- `tauri.ts`：真实桌面，所有文件操作走 `invoke`；
- `web.ts`：浏览器降级（`pnpm dev` 直接用浏览器调试 UI），文件读写走 File System Access API，目录相关能力返回空。

UI 只依赖接口，因此同一套界面可以在没有 Tauri 的环境里跑起来。

### 5.4 组件清单

| 组件 | 职责 |
|---|---|
| `Toolbar` | 文件菜单（打开文件/文件夹、新建窗口、设置）、居中显示当前文件绝对路径、显示模式三档滑块（源码/即时编辑/脑图）、主题开关 |
| `TabStrip` | 多标签、脏标记、关闭 |
| `Sidebar` | 工作区树、懒加载、右键菜单、新建/删除确认、拖拽改宽；中部边缘有折叠按钮 |
| `StatusBar` | 行列、字数、编码、行尾、未保存标记 |
| `Welcome` | 空状态与最近文件 |
| `MindMapView` | 脑图视图、缩放/平移控制条 |

标签页模型抽成纯函数（`tabs.ts`）：打开去重、关闭后选右侧邻居、环形切换。

---

## 6. 关键技术决策

| # | 问题 | 选择 | 理由 | 代价 |
|---|---|---|---|---|
| 6.1 | 桌面壳 | Tauri 2 | 不捆绑 Chromium，体积主要是 Rust 二进制 + 前端资源 | 依赖系统 WebView（Linux 需 WebKitGTK） |
| 6.2 | 编辑引擎 | CodeMirror 6 | 文本即真相、保真、生态最热 | 富文本能力弱于 ProseMirror |
| 6.3 | 文档真相 | Markdown 文本 | 不重排、git diff 干净 | 结构编辑（表格可视化）要额外做 |
| 6.4 | 装饰分层 | StateField + ViewPlugin | CM6 硬约束 | 两处代码要共享规则 |
| 6.5 | 图片 | Rust 代理 → `data:` URL | CSP 只放行 `data:`，不用 asset 协议；离线可读 | base64 有 33% 膨胀，单张限 10MB |
| 6.6 | HTML 清洗 | 自研 allowlist | DOMPurify 依赖浏览器特性探测，在测试环境会静默降级（实测连 `onerror` 都不清） | 需要自己维护白名单 |
| 6.6b | Mermaid SVG 清洗 | DOM 定点清洗（`DOMParser` + 只去脚本/事件属性） | DOMPurify 按 HTML 规则解析字符串，会把 `<style>` 和 `foreignObject` 里的 HTML 全部丢掉，表现为"有框没字" | 依赖 mermaid 的 `securityLevel:'strict'` 与 CSP 兜底 |
| 6.6c | Mermaid 标签渲染 | `htmlLabels: false`（全局） | mermaid 12 起 `flowchart.htmlLabels` 已废弃；SVG `<text>` 比 `foreignObject` 在各 WebView 下更稳 | 复杂标签不再支持 HTML 排版 |
| 6.6d | 标签居中 | 插入 DOM 后按实测包围盒平移标签组（`centerNodeLabels`） | Mermaid 的标签定位依赖它自己的文本测量，换字体/WebView 会偏；实测校正与渲染器无关 | 依赖真实布局，测试环境只能验证数学 |
| 6.7 | 脑图渲染 | markmap + 自研 SVG 回退 | markmap 有折叠/缩放；回退保证任何 WebView 都能出图 | 多约 30KB gzip（懒加载） |
| 6.8 | 布局测量 | 垂直间距必须用 `padding` | CM6 只测盒模型，`margin` 不计入，会累加偏移 | CSS 约束需写进文档 |
| 6.9 | 异步变高 | `view.requestMeasure()` | 图片/Mermaid 高度变化后需重新测量，否则点击错行 | 每处异步回调都要记得调用 |
| 6.10 | 版本对齐 | `rust-version = 1.90` + 锁 `2.12.5` | 低于 MSRV 时 Cargo 静默降级 Tauri，导致 CLI 版本校验失败 | 对开发机 Rust 版本有要求 |
| 6.11 | 文件监听 | notify + 代际号 | 切换工作区时旧线程自行退出，不泄漏 | 300ms 节流意味着刷新略有延迟 |
| 6.12 | 文件名输入 | 应用内模态框 | `window.prompt/confirm` 在 WebKitGTK 下未实现，会静默返回 false | 多写两个组件 |

---

## 7. 关键数据流

### 7.1 打开与保存

```
点击文件 → platform.openPath → invoke('open_document')
        → Rust: 探测编码/行尾 → 返回 { meta, text }
        → 前端建标签 → editor.setText(text)

Ctrl+S → saveTab → invoke('save_document', { id, text, expectMtimeMs })
       → Rust: mtime 比对（冲突则拒绝）→ 备份 → 原子写
       → 返回新 mtime，前端更新标签状态
```

### 7.2 Live Preview 重建

```
编辑器 dispatch → updateListener
  ├─ docChanged → 行内插件标记重建
  └─ selectionSet → 块级 StateField（选区行号变了才重算）+ 行内插件
                   → 遍历可见区间 → 生成 Replace/Mark/Line 装饰 + atomicRanges
```

### 7.3 脑图

```
点击「脑图」→ 快照 editor.getText()
           → buildMindMap：抽标题 → {#mm} 过滤 → 建树
           → markmap 渲染（失败/自检不通过 → 自研 SVG 布局渲染）
           → 缩放/平移由渲染器各自处理
```

### 7.4 工作区监听

```
Rust 线程：notify 事件 → 300ms 节流 → app.emit('workspace://changed')
前端：listen → revision++ → Sidebar 重读根目录与所有已展开目录
```

---

## 8. 构建与发布

```bash
pnpm install
pnpm dev                 # 仅前端（浏览器调试）
pnpm tauri dev           # 完整桌面应用
pnpm test                # 前端测试（vitest + happy-dom）
cargo test -p markdownpromax-core -p markdownpromax-asset

pnpm tauri build --bundles deb     # 打 deb
```

- 产物路径：`target/release/bundle/deb/MarkdownProMax_<version>_<arch>.deb`
- 包名由 `productName` 经 kebab-case 得到（`MarkdownProMax` → `markdown-pro-max`），二进制名与 `mainBinaryName` 为 `markdownpromax`
- 注意 `targets: "all"` 会连带尝试 AppImage/RPM，建议显式 `--bundles deb`
- CI：`.github/workflows/ci.yml` 三端矩阵（Linux 步骤自动安装 WebKitGTK 依赖）

**Linux 运行时依赖**：`libwebkit2gtk-4.1-0`、`libgtk-3-0`。

---

## 9. 测试策略

| 层 | 手段 | 数量 |
|---|---|---|
| Rust 内核 | `cargo test`（tempdir 真实文件系统） | 45 |
| 纯函数 | 标题树、表格解析、公式扫描、布局、视口变换、路径工具 | — |
| 语法树级 | 用真实 Lezer 树断言"哪段被隐藏 / 哪行加了什么类 / 哪些区间是原子的" | — |
| DOM 级 | happy-dom 挂载真实 `EditorView` 与 React 组件，断言节点与交互 | — |
| 外部校验 | 把生成的 Mermaid 源码喂给官方 `mermaid.parse()` | — |

前端合计 214 项，Rust 45 项。

**为什么这样分层**：装饰逻辑被刻意写成不依赖 `EditorView` 的纯函数（`buildDecorations(state, visibleRanges)`），否则这段代码只能靠肉眼验证。

---

## 10. 已知限制与风险

| 项 | 说明 |
|---|---|
| Linux WebKitGTK 碎片 | 老发行版需自行安装 4.1 版本；deb 的 glibc 基线取决于构建机 |
| Windows / macOS | 代码跨平台，但只在 Linux 实机验证过 |
| 大文档 | 块级 widget 在 >2MB 时关闭；脑图对超大文档只能靠缩放 |
| 脑图交互 | markmap 模式有折叠；回退模式暂不支持折叠 |
| 表格 | 只读渲染 + 源码编辑；无单元格级编辑 |
| 图片 | 单张上限 10MB；远程需 HTTPS；本地必须位于文档目录内 |
| 自动更新 | 未接入（`tauri-plugin-updater` 已在依赖规划中） |
| 崩溃恢复 | 保存是原子的，但无自动保存与恢复草稿 |

---

## 11. 目录结构

```
.
├── crates/
│   ├── markdownpromax-core/     文件内核（编码/行尾/原子写/工作区/文件操作）
│   └── markdownpromax-asset/    图片代理内核（策略/缓存/data URL）
├── src-tauri/               Tauri 外壳：命令、最近文件、监听器、配置
├── src/
│   ├── editor/              CodeMirror 封装 + Live Preview 装饰体系
│   ├── mindmap/             标题树、树形布局、视口变换
│   ├── components/          工具栏/标签栏/侧栏/状态栏/欢迎页/脑图视图
│   ├── platform/            Platform 接口与两套实现、剪贴板
│   ├── tabs.ts              标签页模型（纯函数）
│   └── App.tsx              应用装配
├── docs/fixtures/           全语法回归文档（15 种 Mermaid 图）
├── .github/workflows/       CI 矩阵
├── DESIGN.md                设计规划与决策记录
├── UI-DESIGN.md             界面、交互与功能清单
└── TECHNICAL.md             本文档
```
