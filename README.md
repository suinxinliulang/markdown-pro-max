# MarkdownProMax

用 Rust 写的跨平台 Markdown 编辑器。**不是 Electron**：UI 由系统 WebView 渲染（Windows 用 WebView2、macOS 用 WKWebView、Linux 用 WebKitGTK），不捆绑 Chromium；文件系统、编码、资源代理等重活全部在 Rust 侧。

> 当前进度：**M0–M3 已完成并在 Linux 真机验收**（文件读写、Live Preview、KaTeX、Mermaid、HTML、图片）。
> 界面与功能见 [`UI-DESIGN.md`](UI-DESIGN.md)，系统架构见 [`TECHNICAL.md`](TECHNICAL.md)，设计与决策记录见 [`DESIGN.md`](DESIGN.md)。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 外壳 | Tauri 2.12 | 系统 WebView + Rust 主进程，安装包 ~15MB |
| 编辑引擎 | CodeMirror 6 | M2 起改为「Live Preview」装饰式所见即所得，文本始终是 Markdown 原文 |
| 前端 | React 19 + TypeScript + Vite 8 | 只负责 UI 与编辑器，不碰文件系统 |
| 文件内核 | `markdownpromax-core`（本仓库） | 编码探测、行尾保真、原子写、外部改动冲突检测 |
| 公式 | KaTeX 0.19 | `$...$` / `$$...$$`，随 Live Preview 实时渲染 |
| 图表 | Mermaid 12 | ` ```mermaid ` 围栏，**动态 import**，首屏不含 |
| 图片 | Rust `load_image` 命令 | 本地图片限制在文档目录内；远程默认不加载，点击后才下载；统一返回 `data:` URL |

## 目录结构

```
crates/markdownpromax-core/     Rust 文件内核（不依赖 Tauri，可独立测试）
crates/markdownpromax-asset/    远程图片代理内核：URL 策略 + 磁盘缓存 + 可注入的抓取器
  src/encoding.rs        编码探测（UTF-8 / BOM / UTF-16 / GBK…）
  src/eol.rs             行尾策略（LF / CRLF / CR）
  src/atomic.rs          原子写：临时文件 + fsync + rename
  src/document.rs        打开/保存 + mtime 冲突检测
src-tauri/               Tauri 外壳与 IPC 命令
  src/commands.rs        open_document / save_document / save_document_as / …
  src/recent.rs          最近文件持久化
src/                     前端
  editor/                CodeMirror 6 封装与主题
    livePreview/         Live Preview 装饰层（标记隐藏/揭示、块级 widget）
  platform/              平台抽象（tauri 实现 + 浏览器降级实现）
  components/            工具栏、状态栏、欢迎页
```

**关键边界**：Rust 不维护第二份文档模型。Markdown 文本是唯一真相，Rust 只在保存时接收整篇文本。这样没有双写一致性问题，也不会出现"打开再保存，全文被重排"。

## 开发

### 前置依赖

- Rust **1.90+**（Tauri 2.12 的 MSRV；`rustup update stable` 升级）
- Node 20+ 与 pnpm 11
- **Linux 额外需要**：`libwebkit2gtk-4.1-dev`、`libgtk-3-dev`、`libsoup-3.0-dev`（Debian/Ubuntu 系用 `apt install`）

### 常用命令

```bash
pnpm install          # 安装前端依赖
pnpm dev              # 只跑前端（浏览器里预览，走 File System Access API 降级）
pnpm build            # 类型检查 + 前端构建
pnpm tauri dev        # 跑完整桌面应用
pnpm tauri build      # 打包安装包

cargo test -p markdownpromax-core -p markdownpromax-asset   # 纯 Rust 内核测试（不需要 WebView）
pnpm test                                     # 前端单测（vitest + happy-dom）
```

### 版本对齐（踩过的坑）

Tauri 的 CLI 会在启动时比对 npm 包与 Rust crate 的版本，**次版本号必须一致**。Cargo 默认做 MSRV 感知解析：
如果 `Cargo.toml` 里的 `rust-version` 低于 Tauri 要求的 1.90，它会静默把 `tauri` 降级到 2.11，
然后报：

```
Found version mismatched Tauri packages:
tauri (v2.11.6) : @tauri-apps/api (v2.12.4)
```

本仓库已把 `rust-version` 设为 1.90、`Cargo.lock` 锁到 2.12.5 / dialog 2.8.4 / opener 2.7.2。
若你本地是从旧 lock 升上来的，执行：

```bash
cargo update -p tauri -p tauri-build -p tauri-plugin-dialog \
  -p tauri-plugin-opener -p tauri-plugin-store -p tauri-plugin-single-instance
```

### 关于 `markdownpromax-core`

这一层刻意不依赖 Tauri，所以在没有 WebKitGTK 开发包的机器/容器里也能 `cargo test`。CI 也是先跑它再做三端构建。

## 回归测试文档

`docs/fixtures/kitchen-sink.md` 是一份覆盖全部语法的测试文档：

- **Markdown**：6 级标题、Setext 标题、粗体/斜体/删除线、行内代码、转义字符、HTML 实体、行内/引用式/自动链接、本地与远程图片（`assets/demo.png` 可直接加载）、有序/无序/任务列表、三级嵌套引用、7 种代码围栏、缩进代码、对齐表格、分割线、脚注、换行、HTML 块与行内 HTML
- **扩展**：YAML frontmatter、KaTeX 行内与块级公式
- **Mermaid（15 种）**：flowchart、sequence、class、state、ER、gantt、pie、journey、gitGraph、mindmap、timeline、quadrant、xy chart、requirement、sankey

它被三组测试直接使用：

```bash
pnpm test          # 装饰层 + 真实 EditorView 渲染 + Mermaid 官方解析器校验
cargo test -p markdownpromax-core   # 文件层逐字节往返
```

也可以直接用编辑器打开它做人工验收：`pnpm tauri dev` 后打开该文件。

## 文件列表（工作区）

左侧栏中部边缘有一个小按钮（«）用于收起；收起后在编辑区左缘中部会出现 »，点击重新展开。

- 侧栏顶部显示当前工作区路径（过长时只保留尾部，前面用 `…` 省略），**点击它可以选择/切换文件夹**。
- 没有打开工作区时，侧栏中间是一个加粗的「新建文件」按钮，点击即新建一个未命名标签页；
  保存时才弹保存对话框。
- 侧栏列出工作区里的 Markdown 文件（`.md` / `.markdown` / `.mdx` / `.txt`）与子目录，点文件直接打开，当前文件高亮。

- 目录树是**懒加载**的：只有展开的目录才会去读盘，打开大仓库也不会卡。
- **文件变化自动刷新**：Rust 侧用 `notify` 递归监听工作区，变更节流 300ms 后通知前端重读目录。
- 侧栏宽度可拖拽（160–480px），双击分隔条恢复默认；宽度记在 `localStorage`。
- 自动跳过 `.git`、`node_modules`、`target`、`dist` 与隐藏文件；不跟随符号链接。
- 工作区路径与侧栏开关状态记在 `localStorage`，重启后恢复。

### 右键菜单

| 位置 | 菜单项 |
|---|---|
| 空白处 | 新建文件 / 新建文件夹 / 粘贴（有剪贴板内容时）/ 刷新目录 |
| 文件或文件夹 | 在文件管理器中显示 / 剪切 / 复制 / 复制文件相对路径 / 复制文件绝对路径 / 删除 |

- **删除必须二次确认**（目录会提示"连同全部内容"），确认后不可撤销
- 剪切/复制后，右键空白处可粘贴到工作区根目录；剪切是移动，复制是拷贝（目录递归复制）
- 删除的文件如果正开在标签页里，对应标签会自动关闭
- 新建文件默认名 `未命名.md`，创建后直接打开
- 浏览器预览模式没有目录概念，会提示改用桌面版。

## 脑图视图

工具栏点「脑图」，当前文档的标题结构会渲染成一张只读脑图（全屏替换编辑区，点「编辑」返回）。

- **默认展示全部标题**；文档里只要出现一个 `{#mm}` 标记，就**只展示带标记的标题**
- 标记写法：`## 架构 {#mm}`；在所见即所得视图里该标记会自动隐藏
- 未标记的父标题被过滤时，标记的子标题会挂到最近的已标记祖先下
- 代码块、引用块里的 `#` 不算标题（走语法树，不是正则）
- 标题里的粗体、行内代码、链接会被还原成纯文本；没有标题时给出提示
- **markmap-view 渲染**（懒加载，约 30KB gzip 的 d3 + markmap 本体）：缩放、平移、节点折叠都是内置的
- 若 markmap 加载失败，或它在当前 WebView 里画不出标签（`foreignObject` 尺寸为 0），**自动回退**到自研 SVG 渲染器，
  状态栏会显示「已切换兼容渲染」
- **缩放与平移**：滚轮以光标为锚点缩放（20%–500%），拖动空白处平移，底部悬浮条有 − / ＋ / 适应画布 三个按钮

## 窗口状态

窗口大小与位置会在退出时自动保存、下次启动恢复（`tauri-plugin-window-state`）。
状态文件位于应用配置目录（Linux 下是 `~/.config/app.markdownpromax.desktop/.window-state.json`）。

> Wayland 下合成器不允许客户端自己决定窗口位置，通常只有尺寸会生效；X11 下两者都能恢复。

## 快捷键

| 操作 | 快捷键 |
|---|---|
| 打开 | `Ctrl/Cmd + O` |
| 保存 | `Ctrl/Cmd + S` |
| 另存为 | `Ctrl/Cmd + Shift + S` |
| 新建 | `Ctrl/Cmd + N` |
| 查找 / 替换 | `Ctrl/Cmd + F` |
| 关闭当前标签页 | `Ctrl/Cmd + W` |
| 切换源码 / 所见即所得 | 工具栏按钮 |

## 路线图

- [x] **M0** 骨架：打开/保存、最近文件、主题、状态栏、CI
- [x] **M2** Live Preview：标记符隐藏/揭示、标题/引用/分割线样式、代码卡片与表格只读 widget、原子范围、IME 冻结
- [x] **M1（部分）** 文件列表：工作区目录树、懒加载、点击打开、文件监听自动刷新、可拖拽宽度
- [x] **M1（部分）** 标签页：多文档、脏标记、关闭确认
- [ ] **M1** 编辑器增强：标签页、大纲、查找替换面板、快捷键补全
- [x] **M3** 富内容：KaTeX 公式、Mermaid 图表、本地图片渲染
- [x] **M3.1（内核）** 远程图片代理：URL 策略、SHA-256 缓存、大小限制、可注入 Fetcher（`crates/markdownpromax-asset`）
- [x] **M3.1（接入）** `fetch_remote_image` 命令：reqwest 抓取 + 磁盘缓存 + 返回 data URL（点击占位才加载）
- [x] **M2.1** 细节：无序列表圆点、Ctrl/Cmd 点击链接用系统浏览器打开
- [ ] **M2.2** 细节：粘贴图片落盘、图片拖拽插入
- [ ] **M3** 富内容：KaTeX 公式、Mermaid、本地/远程图片代理与缓存
- [ ] **M4** 工程化：自动保存/崩溃恢复、外部改动冲突合并、i18n
- [ ] **M5** 分发：三端安装包、签名/公证、自动更新
- [ ] **M6** 进阶：HTML/PDF 导出、表格单元格编辑

## 编辑区布局约束（重要）

块级 widget（代码卡片 / 表格 / Mermaid / 公式 / HTML / frontmatter）的**垂直间距必须用 `padding`，不能用 `margin`**。

CodeMirror 测量块级 widget 高度时取的是元素盒子（内容 + padding + border），外边距不计入。
一旦用了 `margin`，每多一个 widget 就漏算一段高度，且误差会向下累加——表现就是
「越往下点击，光标落点越偏」。

同理，异步改变 widget 高度的场景（Mermaid 渲染完成、图片加载完成）必须调用
`view.requestMeasure()`，否则坐标映射会停留在旧布局上。

## Linux 已知问题

启动时终端里可能出现：

```
GLib-GObject-CRITICAL **: g_value_set_boxed: assertion 'G_VALUE_HOLDS_BOXED (value)' failed
```

这是 **GTK / WebKitGTK 内部（C 层）**在设置某个 boxed 类型的 GObject 属性时类型不匹配产生的告警，
不是 MarkdownProMax 的 Rust 代码发出的（本项目不直接调用 GTK API）。它是 `CRITICAL` 而非 `ERROR`，一般不影响运行。

判断方法是看窗口：**能正常显示并交互就忽略它**。若出现白屏 / 不渲染，先试关闭 WebKit 的渲染加速：

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri dev
# 或
WEBKIT_DISABLE_COMPOSITING_MODE=1 pnpm tauri dev
```

还不行的话，用 `G_DEBUG=fatal-criticals` 让它在第一个 critical 处直接 abort，配合 `gdb` 拿到调用栈：

```bash
G_DEBUG=fatal-criticals gdb --args ./src-tauri/target/debug/markdownpromax
```

## 已知限制

- Linux 端依赖系统 WebKitGTK，老发行版需要自行安装（这是 Tauri 的固有取舍）。
- 图片默认不加载：点击占位后由 Rust 读取（本地需在文档目录内，远程要求 HTTPS）并返回 `data:` URL，单张上限 10MB。
- 不使用 Tauri asset 协议，因此 CSP 不需要为 `asset:` / 自定义 scheme 开口子。
- 已在 Linux（Deepin，WebKitGTK 4.1）上 `pnpm tauri dev` 启动成功；Windows / macOS 尚未实机验证。
- Mermaid 依赖浏览器 DOM，在 Node 单测里只验证占位与降级路径。
- 单文档编辑，标签页在 M1。
- Live Preview 的代码块暂无语法高亮（M3 接 shiki/syntect 主题）。
