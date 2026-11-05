import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownEditor, type CursorInfo, type EditorMode, type ThemeName } from './editor'
import { platform, type DocMeta } from './platform'
import { copyText } from './platform/clipboard'
import { MindMapView } from './components/MindMapView'
import { Sidebar, type SidebarActions } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TabStrip } from './components/TabStrip'
import { Toolbar, type Segment } from './components/Toolbar'
import { Welcome } from './components/Welcome'
import { closeTabById, createUntitledTab, openTab, tabFromOpened, type Tab } from './tabs'

const THEME_KEY = 'markdownpromax.theme'
const MODE_KEY = 'markdownpromax.mode'
const WORKSPACE_KEY = 'markdownpromax.workspace'
const SIDEBAR_KEY = 'markdownpromax.sidebar'
const SIDEBAR_WIDTH_KEY = 'markdownpromax.sidebarWidth'

const MIN_SIDEBAR_WIDTH = 160
const MAX_SIDEBAR_WIDTH = 480

function initialTheme(): ThemeName {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function initialMode(): EditorMode {
  return localStorage.getItem(MODE_KEY) === 'source' ? 'source' : 'preview'
}

function initialWorkspace(): string | null {
  const saved = localStorage.getItem(WORKSPACE_KEY)
  return saved && saved.length > 0 ? saved : null
}

function initialSidebarOpen(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) !== 'closed'
}

function initialSidebarWidth(): number {
  const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  if (!Number.isFinite(stored) || stored <= 0) return 240
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, stored))
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MarkdownEditor | null>(null)

  const themeRef = useRef<ThemeName>(initialTheme())
  const modeRef = useRef<EditorMode>(initialMode())

  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  /** 与 state 同步的镜像，供事件回调/闭包里读取最新值。 */
  const tabsRef = useRef<Tab[]>([])
  const activeIdRef = useRef<string | null>(null)

  const [dirty, setDirtyState] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(themeRef.current)
  const [mode, setMode] = useState<EditorMode>(modeRef.current)
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selected: 0 })
  const [chars, setChars] = useState(0)
  const [recent, setRecent] = useState<DocMeta[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(initialWorkspace)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(initialSidebarOpen)
  const [sidebarWidth, setSidebarWidth] = useState<number>(initialSidebarWidth)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  /** 中心区域：编辑器 或 脑图。 */
  const [viewMode, setViewMode] = useState<'editor' | 'mindmap'>('editor')
  /** 进入脑图时快照下来的 Markdown 文本。 */
  const [mindMapText, setMindMapText] = useState('')
  /** 待确认关闭的标签（有未保存修改时）。 */
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null)
  /** 保存进行中（保存对话框还没返回）。 */
  const savingRef = useRef(false)

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null
  const pendingTab = pendingCloseId ? (tabs.find((tab) => tab.id === pendingCloseId) ?? null) : null

  const flash = useCallback((message: string) => setNotice(message), [])

  const syncTabs = useCallback((next: Tab[]) => {
    tabsRef.current = next
    setTabs(next)
  }, [])

  // 在渲染期把 ref 对齐到已提交的 state：
  // 事件回调读 ref 永远拿到"最近一次渲染"的真实值，不会因为某次 updater 延后执行而错位。
  tabsRef.current = tabs
  activeIdRef.current = activeId

  const syncActive = useCallback((next: string | null) => {
    activeIdRef.current = next
    setActiveId(next)
  }, [])

  /** 从最近列表移除一条记录。 */
  const removeRecent = useCallback(async (path: string) => {
    try {
      setRecent(await platform.removeRecent(path))
    } catch {
      // 移除失败不影响主流程
    }
  }, [])

  const refreshRecent = useCallback(async () => {
    try {
      setRecent(await platform.recent())
    } catch {
      // 最近文件是可选的
    }
  }, [])

  /**
   * 把编辑器里的当前文本回写到活动标签。
   *
   * 注意：这里必须**同步**基于 `tabsRef` 计算并用 `syncTabs` 写回。
   * 早期版本写成 `setTabs(prev => { tabsRef.current = next })`，
   * React 延后执行 updater 时会用「不含新标签」的旧数组覆盖 `tabsRef`，
   * 造成 state 有标签、ref 里没有，点关闭时查不到标签——表现为点了没反应。
   */
  /** 进入脑图：先把编辑器当前内容快照下来（脑图只读，不跟随输入）。 */
  const openMindMap = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    if (!tabsRef.current.some((tab) => tab.id === activeIdRef.current)) return
    setMindMapText(editor.getText())
    setViewMode('mindmap')
  }, [])

  const closeMindMap = useCallback(() => {
    setViewMode('editor')
    editorRef.current?.focus()
  }, [])

  /** 三档显示模式：源码 / 即时编辑 / 脑图。 */
  const selectSegment = useCallback(
    (segment: Segment) => {
      if (segment === 'mindmap') {
        openMindMap()
        return
      }
      setMode(segment)
      if (viewMode === 'mindmap') closeMindMap()
    },
    [closeMindMap, openMindMap, viewMode],
  )

  const captureActiveText = useCallback(() => {
    const id = activeIdRef.current
    const editor = editorRef.current
    if (!id || !editor) return
    const text = editor.getText()
    const next = tabsRef.current.map((tab) => (tab.id === id ? { ...tab, text } : tab))
    syncTabs(next)
  }, [syncTabs])

  /** 激活（必要时新建）一个标签，并把文本灌进编辑器。 */
  const showTab = useCallback(
    (tab: Tab, reuse: boolean) => {
      setViewMode('editor')
      syncActive(tab.id)
      editorRef.current?.setText(tab.text)
      setChars(tab.text.length)
      setDirtyState(reuse ? tab.dirty : false)
      editorRef.current?.focus()
    },
    [syncActive],
  )

  const activateTabData = useCallback(
    (tab: Tab) => {
      captureActiveText()
      const result = openTab(tabsRef.current, tab)
      syncTabs(result.tabs)
      const target = result.tabs.find((item) => item.id === result.activeId) ?? tab
      showTab(target, result.reused)
    },
    [captureActiveText, showTab, syncTabs],
  )

  const activateTabById = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return
      const target = tabsRef.current.find((tab) => tab.id === id)
      if (!target) return
      captureActiveText()
      showTab(target, true)
    },
    [captureActiveText, showTab],
  )

  /** 真正移除标签（调用方负责先处理未保存提示）。 */
  const doCloseTab = useCallback(
    (id: string) => {
      const result = closeTabById(tabsRef.current, id)
      syncTabs(result.tabs)

      if (activeIdRef.current === id) {
        const next = result.tabs.find((item) => item.id === result.nextActiveId)
        syncActive(result.nextActiveId)
        editorRef.current?.setText(next?.text ?? '')
        setChars(next?.text.length ?? 0)
        setDirtyState(next?.dirty ?? false)
      }
    },
    [syncActive, syncTabs],
  )

  /**
   * 关闭标签。有未保存修改时弹应用内确认框。
   *
   * 这里刻意不用 `window.confirm`：WebKitGTK 下没有实现，返回 false，
   * 表现就是"点关闭没反应"。
   */
  const closeTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) {
        // 正常不该发生：留个线索，真出现时能在控制台看到
        console.warn('[markdownpromax] 关闭标签失败：找不到标签', id)
        return
      }
      if (tab.dirty) {
        setPendingCloseId(id)
        return
      }
      doCloseTab(id)
    },
    [doCloseTab],
  )

  const open = useCallback(async () => {
    try {
      const opened = await platform.pickAndOpen()
      if (!opened) return
      activateTabData(tabFromOpened(opened))
      await refreshRecent()
    } catch (error) {
      flash(`打开失败：${errorText(error)}`)
    }
  }, [activateTabData, flash, refreshRecent])

  const openPath = useCallback(
    async (path: string) => {
      try {
        const opened = await platform.openPath(path)
        if (opened) activateTabData(tabFromOpened(opened))
      } catch (error) {
        flash(`打开失败：${errorText(error)}`)
      }
    },
    [activateTabData, flash],
  )

  const newDoc = useCallback(() => {
    activateTabData(createUntitledTab())
  }, [activateTabData])

  const applySavedTab = useCallback(
    (id: string, meta: DocMeta, text: string) => {
      const next = tabsRef.current.map((item) =>
        item.id === id ? { ...item, meta, text, dirty: false } : item,
      )
      syncTabs(next)
      if (activeIdRef.current === id) setDirtyState(false)
    },
    [syncTabs],
  )

  /** 保存指定标签（活动标签取编辑器内容，其余取缓存的文本）。 */
  const saveTab = useCallback(
    async (id: string): Promise<boolean> => {
      // 保存对话框是模态的：还在等用户选择时，重复触发直接忽略
      if (savingRef.current) return false

      const tab = tabsRef.current.find((item) => item.id === id)
      if (!tab) return false

      savingRef.current = true

      const editor = editorRef.current
      const text = id === activeIdRef.current && editor ? editor.getText() : tab.text

      try {
        if (!tab.meta.path) {
          const opened = await platform.saveAs(text, tab.meta.name)
          if (!opened) return false
          applySavedTab(id, opened.meta, opened.text)
          await refreshRecent()
          flash('已保存')
          return true
        }

        const result = await platform.save(tab.meta, text)
        applySavedTab(id, { ...tab.meta, mtimeMs: result.mtimeMs, size: result.bytes }, text)
        flash('已保存')
        return true
      } catch (error) {
        flash(`保存失败：${errorText(error)}`)
        return false
      } finally {
        savingRef.current = false
      }
    },
    [applySavedTab, flash, refreshRecent],
  )

  const save = useCallback(async () => {
    const id = activeIdRef.current
    if (id) await saveTab(id)
  }, [saveTab])

  const cancelClose = useCallback(() => setPendingCloseId(null), [])

  const discardClose = useCallback(() => {
    const id = pendingCloseId
    setPendingCloseId(null)
    if (id) doCloseTab(id)
  }, [doCloseTab, pendingCloseId])

  const saveAndClose = useCallback(async () => {
    const id = pendingCloseId
    if (!id) return
    const saved = await saveTab(id)
    setPendingCloseId(null)
    if (saved) doCloseTab(id)
  }, [doCloseTab, pendingCloseId, saveTab])

  const saveAs = useCallback(async () => {
    const editor = editorRef.current
    const id = activeIdRef.current
    const tab = tabsRef.current.find((item) => item.id === id)
    if (!editor || !tab) return

    try {
      const opened = await platform.saveAs(editor.getText(), tab.meta.name)
      if (!opened) return
      applySavedTab(tab.id, opened.meta, opened.text)
      await refreshRecent()
      flash('已保存')
    } catch (error) {
      flash(`保存失败：${errorText(error)}`)
    }
  }, [applySavedTab, flash, refreshRecent])

  const loadDirectory = useCallback((path: string) => platform.listDirectory(path), [])

  const sidebarActions = useMemo<SidebarActions>(
    () => ({
      createEntry: (parent, name, directory) => platform.createEntry(parent, name, directory),
      deleteEntry: (path) => platform.deleteEntry(path),
      copyEntry: (from, to) => platform.copyEntry(from, to),
      moveEntry: (from, to) => platform.moveEntry(from, to),
      revealEntry: (path) => platform.revealEntry(path),
      copyText,
    }),
    [],
  )

  /** 文件/目录被删除后，关掉对应的标签页。 */
  const handleEntryDeleted = useCallback(
    (path: string) => {
      const doomed = tabsRef.current.filter(
        (tab) =>
          tab.meta.path === path ||
          tab.meta.path.startsWith(`${path}/`) ||
          tab.meta.path.startsWith(`${path}\\`),
      )
      if (doomed.length === 0) return

      const removed = new Set(doomed.map((tab) => tab.id))
      const remaining = tabsRef.current.filter((tab) => !removed.has(tab.id))
      syncTabs(remaining)

      if (removed.has(activeIdRef.current ?? '')) {
        const next = remaining[remaining.length - 1] ?? null
        syncActive(next?.id ?? null)
        editorRef.current?.setText(next?.text ?? '')
        setChars(next?.text.length ?? 0)
        setDirtyState(next?.dirty ?? false)
      }
    },
    [syncActive, syncTabs],
  )

  const pickFolder = useCallback(async () => {
    if (platform.kind === 'web') {
      flash('浏览器预览模式不支持打开文件夹，请用桌面版')
      return
    }
    try {
      const root = await platform.pickFolder()
      if (!root) return
      setWorkspaceRoot(root)
      setSidebarOpen(true)
    } catch (error) {
      flash(`打开文件夹失败：${errorText(error)}`)
    }
  }, [flash])

  const startSidebarResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    const move = (moveEvent: MouseEvent) => {
      setSidebarWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, moveEvent.clientX)))
    }
    const stop = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }, [])

  // 键盘动作经 ref 转发，避免编辑器里的键位绑定捕获到旧的闭包。
  const actionsRef = useRef({ save, saveAs, open, newDoc, closeTab })
  useEffect(() => {
    actionsRef.current = { save, saveAs, open, newDoc, closeTab }
  })

  // 编辑器只创建一次；文本替换走 setText。
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const editor = new MarkdownEditor({
      parent: host,
      theme: themeRef.current,
      mode: modeRef.current,
      resolveImage: (src) => (src.startsWith('data:') ? src : null),
      loadRemoteImage: (src) => platform.loadImage(tabsRef.current.find((tab) => tab.id === activeIdRef.current)?.meta.path ?? '', src),
      openExternal: (url) => {
        void platform.openExternal(url).catch((error: unknown) => {
          flash(`打开链接失败：${errorText(error)}`)
        })
      },
      onDocChanged: (length) => {
        setChars(length)
        const id = activeIdRef.current
        if (!id) return
        const current = tabsRef.current.find((tab) => tab.id === id)
        if (!current) return
        if (!current.dirty) {
          syncTabs(tabsRef.current.map((tab) => (tab.id === id ? { ...tab, dirty: true } : tab)))
          setDirtyState(true)
        }
      },
      onCursor: setCursor,
      onSave: () => {
        void actionsRef.current.save()
      },
    })

    editorRef.current = editor
    editor.focus()
    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [flash])

  useEffect(() => {
    if (workspaceRoot) localStorage.setItem(WORKSPACE_KEY, workspaceRoot)
    else localStorage.removeItem(WORKSPACE_KEY)
  }, [workspaceRoot])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? 'open' : 'closed')
  }, [sidebarOpen])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  // 工作区监听：目录变化后递增 revision，侧栏据此刷新
  useEffect(() => {
    if (!workspaceRoot || platform.kind === 'web') return

    let disposed = false
    let unlisten: (() => void) | null = null

    void (async () => {
      try {
        await platform.watchWorkspace(workspaceRoot)
        const stop = await platform.onWorkspaceChanged(() => setWorkspaceRevision((value) => value + 1))
        if (disposed) stop()
        else unlisten = stop
      } catch (error) {
        flash(`监听工作区失败：${errorText(error)}`)
      }
    })()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [workspaceRoot, flash])

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode)
    modeRef.current = mode
    editorRef.current?.setMode(mode)
  }, [mode])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
    themeRef.current = theme
    editorRef.current?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    void refreshRecent()
  }, [refreshRecent])

  useEffect(() => {
    document.title = activeTab ? `${dirty ? '● ' : ''}${activeTab.meta.name} — MarkdownProMax` : 'MarkdownProMax'
  }, [activeTab, dirty])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!tabsRef.current.some((tab) => tab.dirty)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Ctrl/Cmd+S 在编辑器内部已绑定；这里兜住焦点不在编辑器时的场景。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingCloseId(null)
        return
      }
      // 编辑器内部的 CM6 键位已经处理过（并调用了 preventDefault），这里别再处理一次，
      // 否则 Ctrl+S 会触发两次保存、弹两个对话框。
      if (event.defaultPrevented) return
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 's' && event.shiftKey) {
        event.preventDefault()
        void actionsRef.current.saveAs()
      } else if (key === 's') {
        event.preventDefault()
        void actionsRef.current.save()
      } else if (key === 'o') {
        event.preventDefault()
        void actionsRef.current.open()
      } else if (key === 'n') {
        event.preventDefault()
        actionsRef.current.newDoc()
      } else if (key === 'w') {
        event.preventDefault()
        const id = activeIdRef.current
        if (id) actionsRef.current.closeTab(id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2200)
    return () => window.clearTimeout(timer)
  }, [notice])

  return (
    <div className="app">
      <Toolbar
        docName={activeTab?.meta.name ?? 'MarkdownProMax'}
        dirty={dirty}
        theme={theme}
        activePath={activeTab?.meta.path ?? ''}
        segment={viewMode === 'mindmap' ? 'mindmap' : mode}
        canSelectMindMap={activeTab !== null}
        onSelectSegment={selectSegment}
        onOpenFile={() => void open()}
        onOpenFolder={() => void pickFolder()}
        onNewWindow={() => void platform.newWindow()}
        onOpenSettings={() => flash('设置功能开发中')}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />

      <div className="main">
        {sidebarOpen && (
          <Sidebar
            root={workspaceRoot}
            activePath={activeTab?.meta.path ?? ''}
            revision={workspaceRevision}
            width={sidebarWidth}
            onResizeStart={startSidebarResize}
            onResetWidth={() => setSidebarWidth(240)}
            onCollapse={() => setSidebarOpen(false)}
            onOpenFile={(path) => void openPath(path)}
            onNewFile={newDoc}
            onEntryDeleted={handleEntryDeleted}
            actions={sidebarActions}
            loadDirectory={loadDirectory}
          />
        )}

        {!sidebarOpen && (
          <button
            type="button"
            className="sidebar-reopen"
            onClick={() => setSidebarOpen(true)}
            title="展开文件列表"
            aria-label="展开文件列表"
          >
            »
          </button>
        )}

        <div className="content">
          <TabStrip tabs={tabs} activeId={activeId} onActivate={activateTabById} onClose={closeTab} />

          <main className="workspace">
            <div className="editor-host" ref={hostRef} />
            {viewMode === 'mindmap' && activeTab && (
              <MindMapView
                markdown={mindMapText}
                title={activeTab.meta.name}
                theme={theme}
                onExit={closeMindMap}
              />
            )}
            {!activeTab && (
              <Welcome
                recent={recent}
                kind={platform.kind}
                onOpen={() => void open()}
                onPickRecent={(meta) => void openPath(meta.path)}
                onRemoveRecent={(path) => void removeRecent(path)}
              />
            )}
          </main>
        </div>
      </div>

      <StatusBar meta={activeTab?.meta ?? null} cursor={cursor} chars={chars} dirty={dirty} kind={platform.kind} />

      {pendingCloseId && (
        <div className="modal-backdrop" role="presentation" onClick={cancelClose}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="关闭标签页"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>「{pendingTab?.meta.name ?? '未命名'}」有未保存的修改</h2>
            <p>关闭前要先保存吗？</p>
            <div className="modal-actions">
              <button type="button" className="tool" onClick={cancelClose}>
                取消
              </button>
              <button type="button" className="tool danger" onClick={discardClose}>
                不保存
              </button>
              <button type="button" className="primary" onClick={() => void saveAndClose()}>
                保存并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}
