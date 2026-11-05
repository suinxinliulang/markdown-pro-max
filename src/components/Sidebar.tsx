import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DirEntry } from '../platform/types'
import { basename, flattenTree, joinPath, parentOf, relativeTo } from './sidebar-model'

/** 文件操作能力（由 App 注入，方便测试）。 */
export interface SidebarActions {
  createEntry(parent: string, name: string, directory: boolean): Promise<string>
  deleteEntry(path: string): Promise<void>
  copyEntry(from: string, to: string): Promise<void>
  moveEntry(from: string, to: string): Promise<void>
  revealEntry(path: string): Promise<void>
  copyText(text: string): Promise<boolean>
}

export interface SidebarProps {
  root: string | null
  activePath: string
  revision: number
  width: number
  onResizeStart: (event: React.MouseEvent) => void
  onResetWidth: () => void
  /** 收起侧栏（按钮放在侧栏中部边缘）。 */
  onCollapse: () => void
  onOpenFile: (path: string) => void
  onNewFile: () => void
  /** 某个文件/目录被删除后通知外部（用于关掉对应标签）。 */
  onEntryDeleted: (path: string) => void
  loadDirectory: (path: string) => Promise<DirEntry[]>
  actions: SidebarActions
}

interface MenuState {
  x: number
  y: number
  entry: DirEntry | null
}

interface CreatePrompt {
  parent: string
  directory: boolean
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 左侧工作区文件树 + 右键菜单。
 *
 * 右键空白处：新建文件 / 新建文件夹 / 粘贴 / 刷新目录。
 * 右键条目：在文件管理器中显示 / 剪切 / 复制 / 复制相对路径 / 复制绝对路径 / 删除。
 */
export function Sidebar({
  root,
  activePath,
  revision,
  width,
  onResizeStart,
  onResetWidth,
  onCollapse,
  onOpenFile,
  onNewFile,
  onEntryDeleted,
  loadDirectory,
  actions,
}: SidebarProps) {
  const [children, setChildren] = useState<Map<string, DirEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [createPrompt, setCreatePrompt] = useState<CreatePrompt | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DirEntry | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [clipboard, setClipboard] = useState<{ path: string; mode: 'cut' | 'copy' } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const previousRoot = useRef<string | null>(null)

  const load = useCallback(
    async (path: string) => {
      setLoading((prev) => new Set(prev).add(path))
      try {
        const entries = await loadDirectory(path)
        setChildren((prev) => new Map(prev).set(path, entries))
        setError(null)
      } catch (cause) {
        setError(`无法读取目录：${messageOf(cause)}`)
      } finally {
        setLoading((prev) => {
          const next = new Set(prev)
          next.delete(path)
          return next
        })
      }
    },
    [loadDirectory],
  )

  // 切换工作区时重置；文件变化（revision）时刷新根目录与已展开的目录
  useEffect(() => {
    const rootChanged = previousRoot.current !== root
    previousRoot.current = root

    if (rootChanged) {
      setChildren(new Map())
      setExpanded(new Set())
      setError(null)
      if (root) void load(root)
      return
    }

    if (!root) return
    void load(root)
    for (const path of expandedRef.current) void load(path)
  }, [root, revision, load])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(timer)
  }, [toast])

  // 点击别处或按 Esc 关闭菜单
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const rows = useMemo(() => {
    if (!root) return []
    return flattenTree(
      children.get(root) ?? [],
      (path) => children.get(path) ?? [],
      (path) => expanded.has(path),
    )
  }, [root, children, expanded])

  const activate = (entry: DirEntry) => {
    if (!entry.isDir) {
      onOpenFile(entry.path)
      return
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      return next
    })
    if (!children.has(entry.path)) void load(entry.path)
  }

  const openMenu = (event: React.MouseEvent, entry: DirEntry | null) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 240),
      entry,
    })
  }

  const startCreate = (entry: DirEntry | null, directory: boolean) => {
    if (!root) return
    const parent = entry ? (entry.isDir ? entry.path : parentOf(entry.path)) : root
    setCreateError(null)
    setCreateName(directory ? '新建文件夹' : '未命名.md')
    setCreatePrompt({ parent, directory })
    setMenu(null)
  }

  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!createPrompt) return

    try {
      const created = await actions.createEntry(createPrompt.parent, createName, createPrompt.directory)
      setExpanded((prev) => new Set(prev).add(createPrompt.parent))
      setCreatePrompt(null)
      setCreateName('')
      await load(createPrompt.parent)
      if (!createPrompt.directory) onOpenFile(created)
      setToast(createPrompt.directory ? '已创建文件夹' : '已创建文件')
    } catch (cause) {
      setCreateError(messageOf(cause))
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    try {
      await actions.deleteEntry(target.path)
      setPendingDelete(null)
      onEntryDeleted(target.path)
      await load(parentOf(target.path))
      setToast('已删除')
    } catch (cause) {
      setDeleteError(messageOf(cause))
    }
  }

  const pasteInto = async (entry: DirEntry | null) => {
    if (!clipboard || !root) return
    const directory = entry ? (entry.isDir ? entry.path : parentOf(entry.path)) : root
    const destination = joinPath(directory, basename(clipboard.path))
    setMenu(null)

    try {
      if (clipboard.mode === 'cut') await actions.moveEntry(clipboard.path, destination)
      else await actions.copyEntry(clipboard.path, destination)

      if (clipboard.mode === 'cut') setClipboard(null)
      setExpanded((prev) => new Set(prev).add(directory))
      await load(directory)
      setToast(clipboard.mode === 'cut' ? '已移动' : '已复制')
    } catch (cause) {
      setToast(messageOf(cause))
    }
  }

  const copyPath = async (entry: DirEntry, mode: 'absolute' | 'relative') => {
    const text = mode === 'absolute' ? entry.path : relativeTo(root, entry.path)
    const ok = await actions.copyText(text)
    setToast(ok ? `已复制${mode === 'absolute' ? '绝对' : '相对'}路径` : '复制失败')
  }

  return (
    <aside className="sidebar" style={{ width, flexBasis: width }}>
      <div className="sidebar-list" onContextMenu={(event) => openMenu(event, null)}>
        {!root && (
          <div className="sidebar-empty">
            <button type="button" className="sidebar-new-file" onClick={onNewFile}>
              新建文件
            </button>
          </div>
        )}

        {root && rows.length === 0 && !error && !loading.has(root) && (
          <div className="sidebar-empty">
            <p className="sidebar-empty-hint">这个文件夹里还没有 Markdown 文件</p>
            <button type="button" className="sidebar-new-file" onClick={onNewFile}>
              新建文件
            </button>
          </div>
        )}

        {error && <p className="sidebar-error">{error}</p>}

        {rows.map((row) => {
          const isActive = row.entry.path === activePath
          const isOpen = expanded.has(row.entry.path)
          return (
            <div
              key={row.entry.path}
              className={`sidebar-row${isActive ? ' active' : ''}`}
              style={{ paddingLeft: 8 + row.depth * 14 }}
              onClick={() => activate(row.entry)}
              onContextMenu={(event) => openMenu(event, row.entry)}
              title={row.entry.path}
            >
              <span className="sidebar-icon">{row.entry.isDir ? (isOpen ? '▾' : '▸') : '·'}</span>
              <span className="sidebar-name">{row.entry.name}</span>
              {loading.has(row.entry.path) && <span className="sidebar-loading">…</span>}
            </div>
          )
        })}
      </div>

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {menu.entry ? (
            <>
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  void actions.revealEntry(menu.entry!.path)
                  setMenu(null)
                }}
              >
                在文件管理器中显示
              </button>
              <div className="context-sep" />
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  setClipboard({ path: menu.entry!.path, mode: 'cut' })
                  setToast('已剪切')
                  setMenu(null)
                }}
              >
                剪切
              </button>
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  setClipboard({ path: menu.entry!.path, mode: 'copy' })
                  setToast('已复制')
                  setMenu(null)
                }}
              >
                复制
              </button>
              <div className="context-sep" />
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  void copyPath(menu.entry!, 'relative')
                  setMenu(null)
                }}
              >
                复制文件相对路径
              </button>
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  void copyPath(menu.entry!, 'absolute')
                  setMenu(null)
                }}
              >
                复制文件绝对路径
              </button>
              <div className="context-sep" />
              <button
                type="button"
                className="context-item danger"
                onClick={() => {
                  setDeleteError(null)
                  setPendingDelete(menu.entry)
                  setMenu(null)
                }}
              >
                删除{menu.entry.isDir ? '文件夹' : '文件'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="context-item" onClick={() => startCreate(null, false)}>
                新建文件
              </button>
              <button type="button" className="context-item" onClick={() => startCreate(null, true)}>
                新建文件夹
              </button>
              {clipboard && (
                <button type="button" className="context-item" onClick={() => void pasteInto(null)}>
                  粘贴
                </button>
              )}
              <div className="context-sep" />
              <button
                type="button"
                className="context-item"
                onClick={() => {
                  setMenu(null)
                  if (root) {
                    void load(root)
                    for (const path of expandedRef.current) void load(path)
                  }
                  setToast('已刷新')
                }}
              >
                刷新目录
              </button>
            </>
          )}
        </div>
      )}

      {createPrompt && (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreatePrompt(null)}>
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void submitCreate(event)}
          >
            <h2>新建{createPrompt.directory ? '文件夹' : '文件'}</h2>
            <input
              className="modal-input"
              autoFocus
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder={createPrompt.directory ? '文件夹名' : '文件名，例如 笔记.md'}
            />
            {createError && <p className="modal-error">{createError}</p>}
            <div className="modal-actions">
              <button type="button" className="tool" onClick={() => setCreatePrompt(null)}>
                取消
              </button>
              <button type="submit" className="primary">
                创建
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingDelete(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>删除「{pendingDelete.name}」？</h2>
            <p>
              {pendingDelete.isDir ? '目录及其全部内容将被删除，' : '文件将被删除，'}
              此操作不可撤销。
            </p>
            {deleteError && <p className="modal-error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="tool" onClick={() => setPendingDelete(null)}>
                取消
              </button>
              <button type="button" className="primary danger" onClick={() => void confirmDelete()}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="sidebar-toast">{toast}</div>}

      <button
        type="button"
        className="sidebar-collapse"
        onClick={onCollapse}
        title="收起文件列表"
        aria-label="收起文件列表"
      >
        «
      </button>

      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        title="拖动调整宽度（双击恢复默认）"
        onMouseDown={onResizeStart}
        onDoubleClick={onResetWidth}
      />
    </aside>
  )
}
