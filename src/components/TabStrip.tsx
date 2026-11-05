import type { Tab } from '../tabs'

export interface TabStripProps {
  tabs: Tab[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

/** 顶部标签栏。没有打开的文档时不占空间。 */
export function TabStrip({ tabs, activeId, onActivate, onClose }: TabStripProps) {
  if (tabs.length === 0) return null

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          className={`tab${tab.id === activeId ? ' active' : ''}`}
          onClick={() => onActivate(tab.id)}
          title={tab.meta.path || tab.meta.name}
        >
          <span className="tab-name">{tab.meta.name}</span>
          {tab.dirty && (
            <span className="tab-dirty" aria-label="未保存">
              ●
            </span>
          )}
          <button
            type="button"
            className="tab-close"
            title="关闭标签页"
            onClick={(event) => {
              event.stopPropagation()
              onClose(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
