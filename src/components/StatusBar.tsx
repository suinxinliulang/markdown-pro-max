import type { CursorInfo } from '../editor'
import type { DocMeta } from '../platform/types'

interface StatusBarProps {
  meta: DocMeta | null
  cursor: CursorInfo
  chars: number
  dirty: boolean
  kind: 'tauri' | 'web'
}

export function StatusBar({ meta, cursor, chars, dirty, kind }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>
        行 {cursor.line}，列 {cursor.col}
      </span>
      {cursor.selected > 0 && <span>已选 {cursor.selected}</span>}
      <span>{chars} 字符</span>
      <span className="spacer" />
      {dirty && <span className="status-dirty">未保存</span>}
      {meta && <span>{meta.charset}</span>}
      {meta && <span>{meta.eol.toUpperCase()}</span>}
      {kind === 'web' && <span className="status-hint">浏览器预览模式</span>}
    </footer>
  )
}
