# MarkdownProMax · 设计规划 v0.2

> 2026-11-04 · 需求变更版（v0.1 → v0.2）
> 新增硬需求：**Mermaid 图 · 本地/远程图片 · 数学公式 · 所见即所得实时渲染**
> 本机环境：rustc 1.98.1 / cargo 1.98.1（`~/.cargo/bin`）· node v24.9.0 · pnpm 11.28.5

---

## 0. 需求变更推翻了 v0.1 的路线选择

先摆事实，再谈方案——因为这四个需求不是"加功能"，而是改变了架构下限：

| 需求 | 为什么纯 Rust 原生做不到（或代价极高） |
|---|---|
| **Mermaid 12.3** | 它是 JS 库，渲染强依赖 DOM：`document.createElement` 量文本宽度、`getBBox()` 量节点、SVG 布局都跑在浏览器里。Rust 生态**没有**等价实现，唯一的"Rust 方案"是包一层 Node + Chromium 的 mermaid-cli（比 Electron 更重）。 |
| **数学公式** | KaTeX 产出的是 HTML+CSS 片段，需要 DOM 排版；Rust 侧的 `ratex` 还是 **0.0.1**，`typst` 的数学排版语法与 LaTeX 不同（`$x^2$` 能渲，但 `\begin{aligned}` 这类不兼容）。 |
| **所见即所得** | "隐藏 `**` 只显示粗体"需要富文本渲染层（装饰区间、原子范围、光标映射、组合输入）。egui/iced 都没有这种控件，自研 ≈ 1.5–2 人月，且表格、撤销、IME 质量很难追平浏览器内核。 |
| **远程图片** | 这个纯 Rust 可以（reqwest + 缓存），不是瓶颈。 |

**结论：要满足这四条，渲染层必须是一个浏览器引擎。** 讨论的焦点因此从"要不要浏览器"变成"哪一层浏览器、以及 Rust 负责哪一半"。

在"不捆绑 Chromium"的约束下，唯一现实答案是 **Tauri 2 使用系统 WebView**（Windows: WebView2 / macOS: WKWebView / Linux: WebKitGTK）。它不是 Electron：没有随包分发的 Chromium，安装包 10–20MB 而不是 120MB+。

### 0.1 若你坚持"零 WebView"

只剩方案 C：纯原生 + 砍需求。可直接落地的是：源码编辑 + 语法着色 + 分栏预览 + 本地/远程图片 + 公式（走 typst 渲染 SVG）+ 表格渲染。**Mermaid 只能显示源码块，所见即所得退化为"高亮预览"**。工期反而更长（自研富文本渲染器），体验还更差。

本规划按 **方案 B（Tauri + 系统 WebView）** 展开。

---

## 1. 两个关键选型

### 1.1 渲染层：Tauri 2.12（唯一解）

| 维度 | Tauri 2.12 | Electron | 纯原生 egui |
|---|---|---|---|
| 捆绑浏览器 | 否（用系统 WebView） | 是（Chromium ~120MB） | 无 |
| 安装包 | ~12–20MB | ~120MB+ | ~20MB |
| Mermaid / KaTeX | 原生支持 | 原生支持 | 不支持 |
| 所见即所得 | 支持 | 支持 | 自研 1.5–2 月 |
| Linux 依赖 | 需 webkit2gtk-4.1 | 无 | 需 x11/wayland |
| 本设计结论 | ✅ 采用 | ❌ 违反约束 | ❌ 不满足需求 |

### 1.2 编辑引擎：CodeMirror 6 「Live Preview」 vs ProseMirror/Tiptap

| 维度 | **A. CodeMirror 6 + 装饰式 Live Preview** | **B. ProseMirror / Tiptap 富文本文档模型** |
|---|---|---|
| 代表产品 | Obsidian Live Preview、VS Code | Typora、Notion 类编辑器 |
| 文档真相 | **Markdown 文本本身** | 编辑器文档树 → 序列化回 Markdown |
| 格式保真 | 天然 100%（bytes 不变） | 序列化会重排（空行、对齐、转义），git diff 脏 |
| 与源码模式切换 | 同一份 `EditorState`，零成本 | 需两套模型 + 同步 |
| 表格编辑 | 弱（表格当整体 widget） | **强**（行列操作、拖拽） |
| 块级拖拽/斜杠菜单 | 需自研 | 现成生态 |
| 大文件性能 | 视口渲染，优秀 | 较好，需优化 |
| 实现成本 | 中（装饰边界情况多） | 中高（schema + 序列化器 + nodeView） |
| 生态热度 | CodeMirror 6 是编辑器事实标准 | Tiptap 3.32 是富文本事实标准 |

**推荐 A（CM6 Live Preview）**，理由：
1. **Markdown 文件是唯一真相**——不会出现"打开再保存，全文被我重排了"这种劝退问题（ProseMirror 路线最常被吐槽的点）。
2. 源码模式 / 所见即所得 / 分栏预览**三者共用同一份文本**，切换零成本，也就没有"双模型同步"这个 bug 温床。
3. 与 Obsidian 同款实现路径，有成熟经验可参考；大文件性能天然更好。
4. Mermaid / KaTeX / 图片 全部以 **widget** 形式嵌入，不污染文档模型——它们本来就不是 Markdown 语法的一部分。

**选 B 的条件**：你要"Notion 式块编辑器"（拖拽块、斜杠命令、表格可视化编辑是核心卖点）。那 Tiptap 3 更合适，但要接受格式漂移，并额外做"源代码兜底模式"。

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────────┐
│  WebView（系统内核）                                          │
│  React 19 + Vite 8 + TypeScript + CodeMirror 6               │
│  ├── editor/   CM6 内核、Live Preview 装饰、源码模式、查找替换 │
│  ├── widgets/  MermaidWidget · MathWidget · ImageWidget ·      │
│  │             TableWidget · CodeBlockWidget                  │
│  ├── shell/    标签页、大纲、命令面板、状态栏、主题             │
│  └── ipc.ts    invoke() 封装，全部类型化                       │
├──────────────────────── IPC（invoke / event / 自定义协议）────┤
│  Rust（Tauri 2.12 主进程）                                    │
│  ├── md-core    编码探测、行尾、原子写、备份、自动保存/恢复     │
│  ├── md-io      打开/保存/监听、会话、最近文件                  │
│  ├── md-asset   远程图片代理 + 磁盘缓存 + 自定义协议 mdimg://   │
│  ├── md-export  HTML（comrak）/ PDF（typst，M6）               │
│  ├── md-index   工作区快速打开、全文搜索（ignore + regex）      │
│  └── commands   open_document / save_document / fetch_asset …   │
└──────────────────────────────────────────────────────────────┘
```

**核心原则：文本即真相，Rust 不做解析。**

- WebView 里 CM6 持有唯一的文本；每次保存把整篇文本交给 Rust 落盘。
- Rust 不维护第二份文档模型 → 没有双写一致性问题。
- Rust 只做「WebView 不擅长/不该做」的事：文件系统、编码、索引、网络代理、导出。

这条边界能砍掉大量复杂度，也是这套架构能在一个月量级做出雏形的原因。

### 2.1 IPC 契约（节选）

| 命令 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `open_document` | `path` | `{id, text, encoding, eol, mtime, scope}` | `scope` = 该文档允许访问的目录白名单 |
| `save_document` | `id, text, expect_mtime` | `{ok, mtime}` | `expect_mtime` 用于外部改动冲突检测 |
| `fetch_asset` | `url, doc_id` | `{uri, cached, bytes}` | 远程图片走代理，返回 `mdimg://` |
| `resolve_local_asset` | `doc_id, rel_path` | `asset://…` 或错误 | 越权路径直接拒绝 |
| `save_pasted_image` | `doc_id, bytes, ext` | `rel_path` | 落到 `assets/` 并返回相对路径 |
| `export_html` | `text, theme` | `path` | comrak 渲染 + 内联 CSS |
| `watch_document` | `id` | `event: doc://changed` | 外部修改提示 |

事件：`doc://changed`、`asset://progress`、`app://open-file`（第二实例/双开）。

---

## 3. 四个新能力的实现方案

### 3.1 所见即所得：CM6 装饰式 Live Preview

CM6 的机制：**文本不动，只在其上叠加 `Decoration`**。`Decoration.replace({widget})` 可以把 `**` 这对字符替换成零宽渲染，配合 `EditorView.atomicRanges` 让光标像跳过不可见区间一样跳过它。

| Markdown 元素 | 光标不在该行时 | 光标进入该行时（可编辑） |
|---|---|---|
| `**粗体**` `_斜体_` `~~删除~~` | 隐藏标记符，只显示样式化文本 | 标记符显示为**变暗的 40% 透明**，文本仍带样式 |
| `# 标题` | 隐藏 `#`，整行放大加粗 | 显示 `#`（变暗） |
| `[文字](url)` | 隐藏 `]`、`(url)`，文字变链接色，可点击打开 | 全量显示 |
| `- 列表` | 隐藏 `-` 或替换为样式化圆点 | 显示 |
| `` ```lang `` 围栏 | 隐藏围栏行，整块渲染为带高亮与复制按钮的代码卡 | 显示围栏、内部走 CM6 原生高亮 |
| `> 引用` | 隐藏 `>`，左侧竖线 + 斜体灰 | 显示 |
| `| 表格 |` | 整块替换为只读表格 widget | 点击 → 展开为源码行编辑 |
| `---` / 图片 / 公式 / 图 | 原子 widget | 光标落到 widget 两侧可编辑源码 |

工程要点（这几条决定成败）：
1. **原子范围**：`atomicRanges` + 自定义 `RangeSet`，否则方向键会在隐藏字符里"卡住"。
2. **光标策略**：按"行"决定显示还是隐藏标记，而不是按"字符"——按字符会在跨行 strong 上抖。
3. **IME 冻结**：`view.composing` 为真时不更新装饰，否则中文输入组合期间会跳字。
4. **视口优先**：只遍历 `view.visibleRanges` 构建装饰，块级缓存（`ViewPlugin` + 按块 hash 记忆），2MB 以上文档自动降级为源码模式。
5. **不要全量重建**：用 `StateField` + `RangeSetBuilder` 增量重建，重算开销压在 ~1–2ms/帧。

### 3.2 数学公式（KaTeX 0.19）

- 语法：`$行内$`、`$$块级$$`；解析在 CM6 侧用 `@codemirror/lang-markdown` 的 `MarkdownConfig` 注册自定义 inline parser（比正则可靠，能处理转义与嵌套）。
- 渲染：`katex.renderToString(tex, {displayMode, throwOnError:false, output:'html'})` → widget 内 `innerHTML`。
- 缓存：`Map<sha1(tex+displayMode), html>`；KaTeX 单次 ~1–3ms，可见区批量渲染无压力。
- 失败：渲染错误显示原公式 + 红色角标（Typora 式静默更容易让人崩溃）。
- 字体：KaTeX 自带 woff2 约 300KB（分块 lazy 加载），离线可用。
- 导出：HTML 导出沿用 KaTeX 输出；PDF 导出走 typst（M6），避免为了 PDF 再引一套 TeX。

### 3.3 Mermaid（12.3）

流程：**占位 → 防抖 → 队列渲染 → 清洗 → 缓存**

```
源码变化 → 300ms 防抖 → 进渲染队列（串行，一次一张）
        → mermaid.render(id, src, {theme, securityLevel:'strict'})
        → SVG 字符串 → 定点清洗（只去脚本与事件属性）→ 插入 widget
        → 缓存：内存 Map + Rust 磁盘缓存 sha256(src+theme+mermaid版本)
```

关键取舍（Mermaid 是整个方案里最容易拖慢体验的一环）：
- **主线程阻塞**：mermaid 渲染一张中等图 ~80–200ms，且必须主线程（要 DOM 测量）。对策：防抖 300ms、串行队列、只在视口内渲染、渲染时显示骨架占位、滚动时不渲染。
- **懒加载**：`import('mermaid')` 动态加载（约 1MB gz），首屏不含它。
- **安全**：`securityLevel:'strict'` + DOM 定点清洗（去 `<script>` 与 `on*` 属性）+ CSP `script-src 'self'`；禁外链。
- **失败降级**：显示错误信息 + 原始源码（可点开编辑）。
- **交互**：点击图表 → 右下角浮出"编辑源码 / 复制 / 导出 SVG·PNG"。

### 3.4 图片（本地 + 远程，重点在安全边界）

| 场景 | 方案 |
|---|---|
| 本地相对路径 | Tauri asset protocol，scope 限定在 **当前文档所在目录树 + 用户显式授权的库目录**；越权路径拒绝并提示 |
| 远程 URL | **默认不由 WebView 直连**：`fetch_asset` → Rust `reqwest` 下载 → 磁盘缓存 → 通过自定义协议 `mdimg://<sha256>` 回给 WebView |
| 缓存 | `~/.cache/md-editor/assets/<sha256>.<ext>`，MIME 白名单（png/jpg/gif/webp/svg/avif），单文件上限 10MB，超时 15s，重定向 ≤3 跳，仅 https |
| 隐私 | 可开关「离线模式」；可选剥离 `utm_*` 追踪参数；SVG 清洗后再插入 |
| 交互 | 懒加载（IntersectionObserver + 占位骨架）、加载失败占位、点击放大、`{width=400}` 属性、拖拽/粘贴图片自动存入 `assets/` 并插入相对路径 |

Rust 代理的好处：CSP 可以严格到"只允许 self + mdimg://"、离线可读、Git 仓库不掺二进制，且图片请求不会带着 `Referer` 泄露本地路径。

---

## 4. 依赖清单（版本均已核对，2026-11-04）

### 4.1 Rust

| crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 2.12.5 | 壳、窗口、IPC、自定义协议 |
| `tauri-plugin-dialog` | 2.8.4 | 原生文件对话框 |
| `tauri-plugin-fs` | 2.7.1 | 受限文件访问（含 asset scope） |
| `tauri-plugin-store` | 2.5.0 | 设置/会话持久化 |
| `tauri-plugin-opener` | 2.7.2 | 用系统程序打开链接 |
| `tauri-plugin-window-state` | 2.5.0 | 窗口位置/大小记忆 |
| `tauri-plugin-single-instance` | 2.5.5 | 单实例 + 文件关联转发 |
| `tauri-plugin-window-state` | 2.5.0 | 窗口大小/位置记忆 | 
| `tauri-plugin-updater` | 2.14.1 | 自动更新（M5） |
| `reqwest` | 0.13.5 | 远程图片代理（rustls） |
| `sha2` | 0.11.1 | 缓存键 |
| `mime_guess` | 2.0.5 | 扩展名/MIME 推断 |
| `encoding_rs` + `chardetng` | 0.8.44 / 1.0.0 | 编码探测（GBK 老文件） |
| `notify` | 8.2.1 | 外部改动监听 |
| `comrak` | 0.59.0 | HTML 导出（与 WebView 内解析无关，导出专用） |
| `serde` / `serde_json` / `toml` | 1.0.229 / 1.0.154 / 1.2.0 | 配置与 IPC 序列化 |
| `anyhow` + `thiserror` | 1.0.104 / 2.0.21 | 错误处理 |
| `tracing` + `tracing-subscriber` | 0.1.44 / 0.3.23 | 日志 |
| `ignore` + `regex` | 最新 / 1.13.1 | 工作区搜索（M4） |
| `typst` | 0.15.1 | PDF 导出（M6，可选，体积大） |

### 4.2 前端

| 包 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | 19.3.1 | UI 框架（生态最大） |
| `vite` | 8.3.5 | 构建 |
| `typescript` | 7.0.2 | 类型 |
| `@tauri-apps/api` / `cli` | 2.12.4 | IPC / 打包 |
| `codemirror` | 6.0.2 | 编辑器内核（聚合包） |
| `@codemirror/lang-markdown` | 6.5.2 | Markdown 语法 + 自定义 inline node 扩展点 |
| `katex` | 0.19.1 | 公式 |
| `mermaid` | 12.3.0 | 图表（动态 import） |
| ~~`dompurify`~~ | — | 已移除：按 HTML 规则解析会丢掉 SVG 里的 `<style>` 与 `foreignObject` 内容，改用 DOM 定点清洗 |
| `shiki` | 4.6.0 | 代码块高亮（按语言懒加载；备选 highlight.js） |
| `remark-parse` / `mdast-util-to-markdown` | 11.0.0 / 2.2.2 | 查找替换、大纲、导出时的 AST 工具（可选） |

> 备选：`@tiptap/core` 3.32.2（若改走方案 B）、`milkdown` 7.23.0（markdown-first 的 PM 封装）。

---

## 5. 里程碑（单人，按可验收切片）

| 阶段 | 内容 | 工期 | 验收 |
|---|---|---|---|
| **M0 骨架** | Tauri 工程、React+CM6 空编辑器、打开/保存、主题、CI | 1 周 | 三端能开、能存、能构建 |
| **M1 编辑器** | CM6 源码模式、Markdown 高亮、查找替换、快捷键、标签页 | 1.5 周 | 10k 行文档输入 60fps |
| **M2 Live Preview** | §3.1 全部装饰类型、光标揭示策略、原子范围、IME 冻结 | 2.5 周 | Typora 级观感；中文输入不跳字 |
| **M3 富内容** | KaTeX 公式、Mermaid widget、本地/远程图片代理与缓存 | 1.5 周 | 三类内容都能在文档里优雅渲染与编辑 |
| **M4 工程化** | 自动保存/崩溃恢复、外部改动冲突、大纲、快速打开、工作区搜索、i18n | 1 周 | 断电不丢稿 |
| **M5 分发** | 三端安装包、签名/公证、更新器、文件关联、图标 | 1 周 | 干净机器一键装 |
| **M6 进阶** | HTML/PDF 导出（typst）、表格可视化编辑、图导出 PNG/SVG、拼写 | 按需 | — |

合计 ≈ **8–9 周**（不含 M6）。相比 v0.1 的纯原生方案，多 2–3 周，但能力完全不同量级。

---

## 6. 跨平台要点

| 平台 | 要点 |
|---|---|
| **Linux** | 需要 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libsoup-3.0-dev`（Tauri v2 硬依赖）。发行版碎片是最大部署风险：Ubuntu 22.04+ / Fedora 39+ / Debian 12+ 正常；老系统需自行装库。产物：AppImage / deb / rpm。 |
| **Windows** | 依赖 WebView2 Runtime（Win10/11 已预装，Win7 不支持）。MSVC 工具链、Per-Monitor DPI、CRLF、GBK 老文件。 |
| **macOS** | WKWebView；universal2（arm64+x86_64）；`notarytool` 公证；Cmd 键位。 |
| **共同** | `tauri-plugin-updater` + GitHub Releases 做更新；CI 矩阵三端构建；CSP 严格（`default-src 'self'`，仅放行 `mdimg:` 与本地 asset）。 |

### 6.1 本机环境的实测结论（重要）

- 容器内**没有** `webkit2gtk-4.1` / `gtk+-3.0` / `libsoup-3.0` 的 dev 包，且没有 `apt`/`sudo` 权限 → **Tauri 的 Linux 链接步骤在本容器里跑不通**。
- 可以跑通的是：Rust 纯逻辑 crate（`md-core`/`md-io`/`md-asset`）的 `cargo test`、前端 `pnpm build` 与 Vitest。
- 因此工程上要**刻意分层**：把不依赖 Tauri 的 crate 独立成 workspace 成员，保证在任何环境都能编译测试；`src-tauri` 只做薄壳。
- 完整构建需要：宿主机装 `libwebkit2gtk-4.1-dev` 等包后本地构建，或直接用 GitHub Actions 的 Linux runner（预装这些库，一次配置最省事）。

---

## 7. 风险与对策

| # | 风险 | 对策 |
|---|---|---|
| 1 | **Linux WebKitGTK 版本碎片**（最大部署风险） | 基线定 Ubuntu 22.04+；AppImage 打包；CI 覆盖三版本；文档写明依赖 |
| 2 | Live Preview 边界情况（跨行 strong、表格内光标、嵌套 emphasis） | 先做行级策略；装饰逻辑集中一处并写 property test；给"关闭实时渲染"开关 |
| 3 | Mermaid 渲染阻塞主线程 | 防抖 + 串行队列 + 视口内渲染 + 骨架占位 + 磁盘缓存 |
| 4 | 表格可视化编辑（方案 A 的天然弱项） | v1 表格=只读 widget + 源码编辑；M6 再评估 ProseMirror 表格子编辑器 |
| 5 | 远程图片安全/隐私/CSP | Rust 代理 + 域名策略 + MIME/大小限制 + SVG 清洗 + 离线开关 |
| 6 | 包体积与冷启动 | 前端按需分包（mermaid/shiki 懒加载）；KaTeX 字体子集；目标 <20MB |
| 7 | WebView 内核差异（WKWebView/Safari 与 Chromium 的 CSS 行为） | 用标准 CSS，避免 `backdrop-filter` 等差异项；三端截图冒烟 |
| 8 | IME 在 WebView 里通常**更好**（系统原生输入法） | 仍需测：组合中输入不触发装饰重建、光标不闪 |

---

## 8. 与 v0.1 的差异摘要

| 项 | v0.1 | v0.2 |
|---|---|---|
| 渲染层 | egui 0.37 纯原生 | Tauri 2.12 + 系统 WebView |
| 编辑引擎 | egui `TextEdit` + LayoutJob 着色 | CodeMirror 6 + 装饰式 Live Preview |
| Markdown 解析 | Rust comrak（编辑时） | 前端 CM6/lezer（编辑时）；Rust comrak 仅用于导出 |
| Mermaid | 不支持 | widget + 异步队列 + 缓存 |
| 公式 | 不支持 | KaTeX |
| 图片 | 本地 + Rust 直读 | 本地 asset 协议 + Rust 远程代理 + 磁盘缓存 |
| 工期 | 6–7 周 | 8–9 周 |

---

## 9. 已确认的决策（2026-11-04）

1. ✅ **接受系统 WebView** → 采用 Tauri 2.12 + 系统 WebView，纯原生 egui 方案作废。
2. ✅ **编辑引擎用 CodeMirror 6**（Live Preview 装饰式），不用 Tiptap/ProseMirror。
3. ✅ **表格支持可视化渲染** → v1 为「只读表格 widget + 点击展开源码编辑」；单元格级编辑（行列增删、拖拽列宽）放到 M6。

---

## 10. 实现状态

### M0 骨架（已完成）

| 产物 | 路径 | 状态 |
|---|---|---|
| 文件内核 | `crates/markdownpromax-core` | ✅ 16 个测试全绿（`cargo test -p markdownpromax-core`）、clippy 无告警、fmt 通过 |
| Tauri 外壳 | `src-tauri/`（commands / recent / 配置 / 能力） | ✅ 2026-11-05 首次 `pnpm tauri dev` 在 Linux（Deepin）上构建并启动成功，UI 正常 |
| 前端 | React 19 + CM6 + 主题 + 工具栏 + 状态栏 + 欢迎页 | ✅ `pnpm build` 通过（tsc + vite） |
| CI | `.github/workflows/ci.yml` | ✅ 三端矩阵，Linux 步骤自动装 WebKitGTK |

**M0 的实际能力**：打开/保存/另存为、最近文件、浅深主题、行列与字数状态栏、未保存标记、原子写 + `.bak` 备份 + 外部改动冲突检测、编码与行尾保真（GBK/CRLF 均有测试覆盖）。

### 本机验证边界（2026-11-04 记录，2026-11-05 已解除）

> **更新**：在宿主机装好 WebKitGTK 依赖后，`pnpm tauri dev` 已成功构建并启动，UI 正常。
> 下面的限制只适用于当时的无 GUI 容器环境，保留作为踩坑记录。
>
> 首次启动会看到一条 `GLib-GObject-CRITICAL: g_value_set_boxed` 告警，来自 GTK/WebKitGTK 内部，
> 不影响运行，详见 README「Linux 已知问题」。


当前开发容器**没有** `webkit2gtk-4.1` / `gtk+-3.0` / `libsoup-3.0` 的 dev 包，也没有 `apt`/`sudo`，因此：

- ✅ 可验证：`markdownpromax-core` 的全部逻辑（cargo test / clippy / fmt）、前端类型检查与构建。
- ❌ 不可验证：`src-tauri` 的链接与运行（`pkg-config` 找不到 WebKitGTK）。
- 解决路径：在装有上述依赖的机器上 `pnpm tauri dev`，或直接依赖 CI 的 Linux runner（已装齐依赖）。

> 结论：`src-tauri` 的代码是按 Tauri 2.12 的 API 写的（`DialogExt` / `FilePath::into_path` 已对 docs.rs 核对），但**首次真正编译时仍可能需要小幅修正**——这是环境限制，不是设计问题。

### 真机验收记录（2026-11-05）

在 Linux（Deepin + WebKitGTK 4.1）上用 `docs/fixtures/kitchen-sink.md` 完成人工验收并通过：
frontmatter 折叠、6 级标题、表格、代码卡片、KaTeX 公式、15 种 Mermaid 图、行内与块级 HTML、
本地/远程图片点击加载、链接单击打开、光标揭示策略、模式切换、保存后原文不变。

验收过程中修掉的四个真机问题（逻辑测试都覆盖不到）：

| 症状 | 根因 | 修复 |
|---|---|---|
| 行内 HTML / 链接 / 图片全部失效 | 行内层的"跳过被覆盖行"守卫命中了 Document 根节点，整棵树停止遍历 | 改为「整段落在 widget 区间内才跳过」 |
| 点击位置随文档下移逐渐错行 | 块级 widget 用 `margin` 做垂直间距，而 CM6 只测盒模型（不含外边距），误差累加 | 垂直间距改 `padding`；异步变高的 widget 调用 `requestMeasure()` |
| 点图片无反应 | `mousedown` 未阻止冒泡，CM6 移动光标导致 widget 被销毁，异步结果写进游离节点 | 补 `stopPropagation()` |
| 链接点不开 | 只绑定了 Ctrl/Cmd + 点击 | 改为单击打开 |

### M1 文件列表 / 标签页（已完成）

- **文件监听**：`src-tauri/src/watcher.rs` 用 notify 递归监听工作区，300ms 节流后发 `workspace://changed` 事件；
  切换工作区靠「代际号」让旧监听线程自行退出。
- **标签页**：`src/tabs.ts` 是纯函数模型（打开去重、关闭后选右侧邻居、环形切换），有 10 个测试；
  编辑器文本在切标签时回写/重灌，脏状态按标签独立记录。
- **侧栏宽度**：App 受控，拖拽时监听 window 的 mousemove，范围 160–480px，双击恢复默认，宽度持久化。

### M1 文件列表（已完成）

Rust 侧新增 `markdownpromax-core::workspace`（`list_dir` + `ListOptions`，7 个测试覆盖排序/过滤/隐藏文件/上限/符号链接），
Tauri 暴露 `pick_folder` / `list_directory` 两个命令，前端 `Sidebar` 组件做懒加载树。

设计取舍：
- **一次只列一层**，展开才读盘，避免打开大仓库时递归扫描；
- 过滤与跳过规则放在 Rust 侧（`.git`/`node_modules`/`target`/`dist`、隐藏文件、非 Markdown 扩展名）；
- 不跟随符号链接，避免环和越出工作区。

### M2 Live Preview（已完成核心）

实现方式：**文本不动，只叠装饰**。装饰层拆成三个文件：

| 文件 | 职责 |
|---|---|
| `src/editor/livePreview/index.ts` | 遍历 Lezer 语法树，产出隐藏区间、行装饰与块级 widget；`atomicRanges` 让光标跳过隐藏内容 |
| `src/editor/livePreview/widgets.ts` | 代码卡片 / 表格 / 分割线三个只读 widget，点击回到源码 |
| `src/editor/livePreview/table.ts` | GFM 表格解析（纯函数） |

**一个被运行时测试逼出来的架构约束**：CodeMirror 不允许 ViewPlugin 提供块级装饰
（`Block decorations may not be specified via plugins`）。所以最终拆成两层：

- 块级 widget（表格 / 代码卡片 / 分割线）→ `StateField` + `EditorView.decorations.from(field)`；
- 行内标记与行样式（`#`、`**`、引用竖线、标题字号）→ `ViewPlugin`（视口内计算，性能更好）。

块级 StateField 带一个"选区行号快照"做短路：光标在同一行内移动时直接复用上一次结果，不重复遍历语法树；
文档超过 2MB 时自动关闭块级 widget。

已覆盖的行为：
- 光标不在该行 → 隐藏 `#`、`>`、`**`、`` ` ``、`[..](..)`；光标进入该行 → 标记符以 42% 透明度浮现（可编辑）。
- 标题整行放大（h1–h6）、引用整段加左侧竖线、分割线渲染成 `<hr>`。
- 围栏代码块与表格在非编辑状态下渲染为只读卡片，点一下落回源码。
- `view.composing` 期间冻结装饰重建，避免中文输入跳字。
- 装饰构建失败时自动退回源码显示，不会白屏。

**验证策略（关键）**：

1. `buildDecorations(state, visibleRanges)` 刻意不依赖 `EditorView`/DOM，可以在 Node 里用**真实 Lezer 语法树**断言"哪段文本被隐藏、哪行加了什么类、哪些区间是原子的"；
2. widget 的 DOM 用 happy-dom 断言（表格对齐、HTML 转义、点击回源码）；
3. 在 happy-dom 里真正挂载 `EditorView` 与整个 React 应用，断言装饰确实落到了 DOM。

当前 **65 个前端单测全绿**（表格 10 + 公式扫描 12 + 装饰 9 + widget DOM 8 + M3 widget 6 + 路径 12 + 编辑器端到端 7 + 应用挂载 1）。
第 3 层测试第一次运行就抓出了上面那个块级装饰的架构错误——这类问题纯逻辑测试是发现不了的。


### M3 富内容（已完成前端部分）

| 能力 | 实现 | 说明 |
|---|---|---|
| 行内公式 `$..$` | `math.ts` 扫描 + `MathWidget`（KaTeX） | 跳过代码块、行内代码、链接、图片内部 |
| 块级公式 `$$..$$` | 行扫描 + 块级 `MathWidget` | 同样是"块级装饰"，走 StateField |
| Mermaid | `MermaidWidget` + 动态 `import('mermaid')` | 串行渲染队列、按主题缓存、DOM 定点清洗 SVG |
| 图片 | `ImageWidget` + `imageResolver` Facet | 本地相对路径 → asset 协议；远程默认不加载 |

工程细节：
- KaTeX 的 quirks-mode 检查发生在**模块加载时**，所以测试环境用 `vitest.setup.ts` 提前把 `document.compatMode` 摆正，否则渲染直接禁用。
- Mermaid 会被 Vite 拆成独立 chunk（`mermaid.core` / 各图形子包），首屏不加载；KaTeX 独立成 258KB chunk。
- 公式扫描是行级纯函数，遇到 `\$` 转义、`$$` 与未闭合的 `$` 都有测试覆盖。

**M3 的 Rust 侧**：新增 `crates/markdownpromax-asset`，把"抓取"抽象成 `Fetcher` trait（生产实现是 reqwest），
这样 URL 策略、SHA-256 缓存键、大小上限、扩展名清洗都能在无网络环境下测试：

| 模块 | 职责 |
|---|---|
| `policy.rs` | 只允许 https（可配置放开 http）、拒绝 `file:`/`data:`/`ftp:`、URL 长度上限 |
| `cache.rs` | `sha256(url)` → `<key>.<ext>`，原子落盘，查找时按扩展名白名单探测 |
| `lib.rs` | `fetch_image()`：命中缓存不发请求、超限拒绝且不落盘 |

**仍待接入**：reqwest 抓取器与 `mdimg://` 自定义协议需要在能编译 Tauri 的环境里完成
（本容器无法下载 reqwest / 链接 WebKitGTK）。当前远程图片在前端显示占位。


### M3.1 远程图片（已实现，待首次真实构建验证）

实现路线与最初规划略有调整：**用 `data:` URL 而不是 `mdimg://` 自定义协议**。

| 方案 | 优点 | 代价 |
|---|---|---|
| `mdimg://` + 自定义协议 | 大图不占内存、可流式 | 需要 `register_asynchronous_uri_scheme_protocol`、CSP 放行、三端行为差异 |
| **`data:` URL（采用）** | CSP 只放行 `data:`，无自定义协议，接入面最小 | base64 膨胀 33%，受 10MB 上限约束 |

链路：`ImageWidget` 占位 → 点击 → `platform.fetchRemoteImage` → Tauri `fetch_remote_image`
→ `markdownpromax-asset`（策略校验 → 缓存命中？ → reqwest 抓取 → 大小校验 → 原子落盘）
→ `to_data_url()` → 前端替换成 `<img>`。

磁盘缓存仍然生效：同一 URL 第二次打开直接读缓存，不再发请求。


### 回归测试文档（2026-11-04）

`docs/fixtures/kitchen-sink.md`（374 行）覆盖 CommonMark + GFM 常见语法、KaTeX、15 种 Mermaid 图表，
被三组测试消费：装饰层断言（节点数量/类型）、真实 `EditorView` DOM 断言、Mermaid 官方 `parse()` 语法校验，
外加 Rust 侧逐字节往返。

**它抓到的三个真问题**（都已修复）：

| # | 现象 | 根因 | 修复 |
|---|---|---|---|
| 1 | 长文档后半部分的图表/公式完全不渲染 | `syntaxTree(state)` 返回的是**未解析完**的树；Lezer 按时间预算增量解析，Node 里只走了一部分 | 块级装饰改用 `ensureSyntaxTree(state, doc.length, timeout)` |
| 2 | YAML frontmatter 被解析成 Setext 标题，`---` 变成分割线 | 解析器不认识 frontmatter | 新增 `frontmatter.ts` + `FrontmatterWidget`，并让树遍历跳过该区间 |
| 3 | 引用式链接 `[文字][label]`、自动链接 `<https://…>` 不可点击 | 只处理了 `[文字](url)` 行内式 | 新增 `links.ts`：解析文档内 `[label]: url` 定义并解析三种链接形态 |

第 1 条尤其关键：纯逻辑单测（构造短文档）永远发现不了，只有整篇真实文档跑一遍才暴露。


### 脑图视图（MVP 已完成）

把 Markdown 的标题结构转成只读脑图，全屏替换编辑区。

| 层 | 实现 | 说明 |
|---|---|---|
| 标题抽取 | `src/mindmap/tree.ts` + `markdownLanguage.parser` | 只看文档根节点下的 ATX/Setext 标题；代码块、引用块里的 `#` 天然排除 |
| 过滤 | `selectHeadings` | 文档中出现任意 `{#mm}` → 只保留带标记的；否则退化成全部标题 |
| 建树 | `buildTree` | 层级栈，跳级挂到最近祖先，多个 H1 并列 |
| 布局 | `src/mindmap/layout.ts` | 自研"从左到右"紧凑树布局：列宽取同层最大值、父节点居中于子节点跨度、贝塞尔连线 |
| 渲染 | `markmap-view`（默认）+ 自研 SVG（回退） | markmap 提供缩放/平移/折叠；自研渲染器在 markmap 不可用时兜底 |
| 联动 | 工具栏切换 | 进入脑图时快照编辑器文本；切文档自动退出脑图 |

**缩放与平移**：变换逻辑抽在 `src/mindmap/viewport.ts`（纯函数，10 个测试），
`MindMapView` 用 `transform: translate() scale()` 作用于 SVG 外层容器，因此与渲染器无关——
将来换成 markmap 也可以复用。滚轮以光标为锚点缩放，拖动平移，底部按钮 − / ＋ / ⤒ 适应画布。

**渲染器演进**：Mermaid mindmap 的标签是 `foreignObject` 里的 HTML，在我们的 CSS transform 容器里
WebKit 下曾出现"只有框没有字"。markmap-view 的标签同样是 `foreignObject`，但缩放/平移由它自己的
SVG 内部 transform 完成（没有祖先元素变换），因此默认采用；同时保留自研 SVG 渲染器作为
**运行时回退**：初始化失败、或检测到 `foreignObject` 内标签滚动尺寸为 0 时自动切换，并在标题栏提示。

**MVP 的取舍**：暂无节点折叠交互，超大文档靠缩放应对。
若后续需要交互，可把 `MindMapView` 的渲染部分换成 `markmap-view`（约 90KB gzip，动态加载），
树构建与过滤逻辑完全不用改。
