/**
 * 平台能力抽象。
 *
 * 同一个 React 界面要能跑在两种宿主里：
 * - `tauri`：真实桌面应用，文件系统/编码/原子写都在 Rust 侧。
 * - `web`：`pnpm dev` 打开的浏览器，用 File System Access API 做降级，
 *   方便在没有 WebView 开发包的机器上验证 UI 与编辑器行为。
 */

export type Eol = 'lf' | 'crlf' | 'cr'

export interface DocMeta {
  /** 会话内唯一的文档 id。 */
  id: string
  /** 展示用文件名。 */
  name: string
  /** 绝对路径；浏览器降级时是文件名。 */
  path: string
  /** 文件编码，例如 UTF-8 / GBK。 */
  charset: string
  /** 行尾风格。 */
  eol: Eol
  /** 磁盘 mtime（毫秒），用于外部改动冲突检测。 */
  mtimeMs: number
  /** 文件大小（字节）。 */
  size: number
}

export interface OpenedDoc {
  text: string
  meta: DocMeta
}

export interface SaveResult {
  mtimeMs: number
  bytes: number
}

/** 工作区里的一个目录项。 */
export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  size: number
}

export interface Platform {
  readonly kind: 'tauri' | 'web'
  /** 弹出选择框并打开文件；用户取消时返回 null。 */
  pickAndOpen(): Promise<OpenedDoc | null>
  /** 按已有路径直接打开（最近文件列表用）。 */
  openPath(path: string): Promise<OpenedDoc | null>
  /** 按已知元信息保存（覆盖写）。 */
  save(meta: DocMeta, text: string): Promise<SaveResult>
  /** 另存为；用户取消时返回 null。 */
  saveAs(text: string, suggestedName: string): Promise<OpenedDoc | null>
  /** 打开一个新的应用窗口。 */
  newWindow(): Promise<void>
  /** 选择工作区文件夹；取消返回 null。 */
  pickFolder(): Promise<string | null>
  /** 列出目录的一层内容。 */
  listDirectory(path: string): Promise<DirEntry[]>
  /** 新建文件或目录，返回新路径。 */
  createEntry(parent: string, name: string, directory: boolean): Promise<string>
  /** 删除文件或目录。 */
  deleteEntry(path: string): Promise<void>
  /** 复制文件或目录。 */
  copyEntry(from: string, to: string): Promise<void>
  /** 移动/重命名。 */
  moveEntry(from: string, to: string): Promise<void>
  /** 在系统文件管理器中定位。 */
  revealEntry(path: string): Promise<void>
  /** 开始监听工作区变化（递归）。 */
  watchWorkspace(path: string): Promise<void>
  /** 订阅工作区变化事件；返回取消订阅函数。 */
  onWorkspaceChanged(handler: (root: string) => void): Promise<() => void>
  /** 从最近列表移除一条记录（不删除磁盘文件），返回新的列表。 */
  removeRecent(path: string): Promise<DocMeta[]>
  /** 最近打开的文件（可能为空）。 */
  recent(): Promise<DocMeta[]>
  /** 用系统默认程序打开链接。 */
  openExternal(url: string): Promise<void>
  /** 加载图片（本地相对路径或远程 URL），返回 data URL；失败返回 null。 */
  loadImage(docPath: string, src: string): Promise<string | null>
}
