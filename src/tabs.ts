import type { DocMeta, OpenedDoc } from './platform/types'

/** 一个打开的标签页。 */
export interface Tab {
  /** 标签自身 id（与文档路径解耦，另存为后保持不变）。 */
  id: string
  /** 文档元信息（`meta.id` 是 Rust 侧的文档句柄）。 */
  meta: DocMeta
  /** 最近一次同步的正文；切换标签时写入编辑器。 */
  text: string
  /** 是否有未保存修改。 */
  dirty: boolean
}

/** 新建一个空标签页。 */
export function createUntitledTab(): Tab {
  return {
    id: crypto.randomUUID(),
    meta: {
      id: crypto.randomUUID(),
      name: '未命名.md',
      path: '',
      charset: 'UTF-8',
      eol: 'lf',
      mtimeMs: 0,
      size: 0,
    },
    text: '',
    dirty: false,
  }
}

/** 把打开结果变成标签页。 */
export function tabFromOpened(opened: OpenedDoc, id: string = crypto.randomUUID()): Tab {
  return { id, meta: opened.meta, text: opened.text, dirty: false }
}

/**
 * 打开一个文档：如果同路径已经打开，就复用那个标签（返回它的 id）。
 */
export function openTab(tabs: readonly Tab[], next: Tab): { tabs: Tab[]; activeId: string; reused: boolean } {
  if (next.meta.path) {
    const existing = tabs.find((tab) => tab.meta.path === next.meta.path)
    if (existing) return { tabs: [...tabs], activeId: existing.id, reused: true }
  }
  return { tabs: [...tabs, next], activeId: next.id, reused: false }
}

/**
 * 关闭标签，并给出下一个应该激活的标签。
 *
 * 优先激活右边那个（即被关闭标签原位置的后一个），没有就激活左边。
 */
export function closeTabById(
  tabs: readonly Tab[],
  id: string,
): { tabs: Tab[]; nextActiveId: string | null } {
  const index = tabs.findIndex((tab) => tab.id === id)
  if (index === -1) return { tabs: [...tabs], nextActiveId: null }

  const rest = tabs.filter((tab) => tab.id !== id)
  if (rest.length === 0) return { tabs: rest, nextActiveId: null }

  const nextActiveId = rest[Math.min(index, rest.length - 1)].id
  return { tabs: rest, nextActiveId }
}

/** 切换上下一个标签（环形）。 */
export function cycleTab(tabs: readonly Tab[], activeId: string | null, direction: 1 | -1): string | null {
  if (tabs.length === 0) return null
  const index = tabs.findIndex((tab) => tab.id === activeId)
  if (index === -1) return tabs[0].id
  return tabs[(index + direction + tabs.length) % tabs.length].id
}
