import type { DocMeta } from '../platform/types'

interface WelcomeProps {
  recent: DocMeta[]
  kind: 'tauri' | 'web'
  onOpen: () => void
  onPickRecent: (meta: DocMeta) => void
  /** 从最近列表移除（不会删除磁盘上的文件）。 */
  onRemoveRecent: (path: string) => void
}

export function Welcome({ recent, kind, onOpen, onPickRecent, onRemoveRecent }: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>MarkdownProMax</h1>
        <p className="welcome-sub">Rust + Tauri 构建的 Markdown 编辑器</p>

        <button type="button" className="primary" onClick={onOpen}>
          打开 Markdown 文件
        </button>

        {kind === 'web' && (
          <p className="welcome-hint">
            当前运行在浏览器预览模式，文件读写走浏览器的 File System Access API。
          </p>
        )}

        {recent.length > 0 && (
          <div className="recent">
            <h2>最近打开</h2>
            <ul>
              {recent.map((item) => (
                <li key={item.path}>
                  <button type="button" className="recent-item" onClick={() => onPickRecent(item)}>
                    <span className="recent-name">{item.name}</span>
                    <span className="recent-path">{item.path}</span>
                  </button>
                  <button
                    type="button"
                    className="recent-remove"
                    title="从最近列表移除（不会删除文件）"
                    aria-label={`从最近列表移除 ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemoveRecent(item.path)
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
