import { useEffect, useRef, useState } from 'react'
import type { ThemeName } from '../editor'

/** 三档显示模式。 */
export type Segment = 'source' | 'preview' | 'mindmap'

const SEGMENTS: Array<{ id: Segment; label: string; title: string }> = [
  { id: 'source', label: '源码', title: '纯文本源码模式' },
  { id: 'preview', label: '即时编辑', title: '所见即所得（实时渲染）' },
  { id: 'mindmap', label: '脑图', title: '把标题结构渲染成脑图' },
]

export interface ToolbarProps {
  /** 当前标签的文件绝对路径；未保存的新文档为空串。 */
  activePath: string
  docName: string
  dirty: boolean
  theme: ThemeName
  /** 当前显示模式段：源码 / 即时编辑 / 脑图。 */
  segment: Segment
  canSelectMindMap: boolean
  onSelectSegment: (segment: Segment) => void
  onToggleTheme: () => void
  /** 文件菜单里的动作。 */
  onOpenFile: () => void
  onOpenFolder: () => void
  onNewWindow: () => void
  onOpenSettings: () => void
}

const mod = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

export function Toolbar(props: ToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  // 点击菜单外或按 Esc 关闭
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const run = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <header className="toolbar">
      <div className="menu-anchor" ref={anchorRef}>
        <button
          type="button"
          className="tool menu-trigger"
          onClick={() => setMenuOpen(!menuOpen)}
          title="文件菜单"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          ☰
        </button>

        {menuOpen && (
          <div className="context-menu toolbar-menu" role="menu">
            <button type="button" className="context-item" onClick={() => run(props.onOpenFile)}>
              打开文件
              <span className="menu-hint">{mod}+O</span>
            </button>
            <button type="button" className="context-item" onClick={() => run(props.onOpenFolder)}>
              打开文件夹
            </button>
            <button type="button" className="context-item" onClick={() => run(props.onNewWindow)}>
              新建窗口
            </button>
            <div className="context-sep" />
            <button type="button" className="context-item" onClick={() => run(props.onOpenSettings)}>
              设置
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-center" title={props.activePath || props.docName}>
        <span className="doc-path">
          {props.activePath || `${props.docName}（未保存）`}
        </span>
        {props.dirty && <span className="dot" title="有未保存的修改" aria-label="未保存" />}
      </div>

      <div className="toolbar-right">

      <div className="segmented" role="tablist" aria-label="显示模式">
        <span
          className="segment-thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${Math.max(0, SEGMENTS.findIndex((item) => item.id === props.segment)) * 100}%)` }}
        />
        {SEGMENTS.map((segment) => {
          const disabled = segment.id === 'mindmap' && !props.canSelectMindMap
          return (
            <button
              key={segment.id}
              type="button"
              role="tab"
              aria-selected={props.segment === segment.id}
              className={`segment${props.segment === segment.id ? ' active' : ''}`}
              disabled={disabled}
              title={segment.title}
              onClick={() => props.onSelectSegment(segment.id)}
            >
              {segment.label}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className={`theme-switch${props.theme === 'dark' ? ' on' : ''}`}
        role="switch"
        aria-checked={props.theme === 'dark'}
        aria-label="深色模式"
        onClick={props.onToggleTheme}
        title={props.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      >
          <span className="theme-switch-knob" aria-hidden="true">
            {props.theme === 'dark' ? '☾' : '☀'}
          </span>
        </button>
      </div>
    </header>
  )
}
