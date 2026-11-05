// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirEntry } from '../platform/types'
import { Sidebar, type SidebarActions, type SidebarProps } from './Sidebar'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ENTRIES: DirEntry[] = [
  { name: 'docs', path: '/ws/docs', isDir: true, size: 0 },
  { name: 'README.md', path: '/ws/README.md', isDir: false, size: 12 },
]

const actions: SidebarActions = {
  createEntry: vi.fn(async () => '/ws/未命名.md'),
  deleteEntry: vi.fn(async () => {}),
  copyEntry: vi.fn(async () => {}),
  moveEntry: vi.fn(async () => {}),
  revealEntry: vi.fn(async () => {}),
  copyText: vi.fn(async () => true),
}

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
})

async function mount(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
  })
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

const menuLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.context-menu .context-item')).map((item) =>
    item.textContent?.trim(),
  )

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  return (
    <Sidebar
      root="/ws"
      activePath=""
      revision={0}
      width={240}
      onResizeStart={() => {}}
      onResetWidth={() => {}}
      onCollapse={() => {}}
      onOpenFile={() => {}}
      onNewFile={() => {}}
      onEntryDeleted={() => {}}
      loadDirectory={async (path: string) => (path === '/ws' ? ENTRIES : [])}
      actions={actions}
      {...overrides}
    />
  )
}

const rightClick = (element: Element) =>
  element.dispatchEvent(
    new window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    }),
  )

describe('Sidebar', () => {
  it('没有工作区时显示引导按钮', async () => {
    const container = await mount(renderSidebar({ root: null }))
    const button = container.querySelector('.sidebar-new-file')
    expect(button).not.toBeNull()
    expect(button?.textContent).toBe('新建文件')
  })

  it('不再显示文件夹路径（已移到工具栏）', async () => {
    const container = await mount(renderSidebar())
    expect(container.querySelector('.sidebar-head')).toBeNull()
    expect(container.querySelector('.sidebar-path')).toBeNull()
  })

  it('侧栏中部有收起按钮', async () => {
    const onCollapse = vi.fn()
    const container = await mount(renderSidebar({ onCollapse }))
    const button = container.querySelector('.sidebar-collapse') as HTMLElement
    expect(button).not.toBeNull()

    await act(async () => {
      button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onCollapse).toHaveBeenCalled()
  })

  it('打开了文件夹但里面没有文件时，仍显示新建文件按钮', async () => {
    const container = await mount(renderSidebar({ loadDirectory: async () => [] }))

    expect(container.querySelectorAll('.sidebar-row')).toHaveLength(0)
    const button = container.querySelector('.sidebar-new-file')
    expect(button).not.toBeNull()
    expect(container.querySelector('.sidebar-empty-hint')?.textContent).toContain('还没有 Markdown 文件')
  })

  it('目录里有文件时不显示空状态', async () => {
    const container = await mount(renderSidebar())
    expect(container.querySelector('.sidebar-empty')).toBeNull()
  })

  it('加载根目录并渲染文件与目录', async () => {
    const loadDirectory = vi.fn(async () => ENTRIES)
    const container = await mount(renderSidebar({ loadDirectory }))

    expect(loadDirectory).toHaveBeenCalledWith('/ws')
    const rows = container.querySelectorAll('.sidebar-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('docs')
    expect(rows[1].textContent).toContain('README.md')
  })

  it('点击文件触发打开回调', async () => {
    const onOpenFile = vi.fn()
    const container = await mount(renderSidebar({ onOpenFile }))

    const row = container.querySelectorAll('.sidebar-row')[1] as HTMLElement
    await act(async () => {
      row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onOpenFile).toHaveBeenCalledWith('/ws/README.md')
  })

  it('高亮当前打开的文件', async () => {
    const container = await mount(renderSidebar({ activePath: '/ws/README.md' }))
    expect(container.querySelectorAll('.sidebar-row.active')).toHaveLength(1)
  })

  it('右键空白处显示新建与刷新菜单', async () => {
    const container = await mount(renderSidebar())
    await act(async () => {
      rightClick(container.querySelector('.sidebar-list') as Element)
    })

    expect(menuLabels(container)).toEqual(['新建文件', '新建文件夹', '刷新目录'])
  })

  it('右键文件显示文件操作菜单', async () => {
    const container = await mount(renderSidebar())
    await act(async () => {
      rightClick(container.querySelectorAll('.sidebar-row')[1])
    })

    expect(menuLabels(container)).toEqual([
      '在文件管理器中显示',
      '剪切',
      '复制',
      '复制文件相对路径',
      '复制文件绝对路径',
      '删除文件',
    ])
  })

  it('右键目录时删除项显示为删除文件夹', async () => {
    const container = await mount(renderSidebar())
    await act(async () => {
      rightClick(container.querySelectorAll('.sidebar-row')[0])
    })
    expect(menuLabels(container)).toContain('删除文件夹')
  })

  it('删除需要二次确认', async () => {
    const deleteEntry = vi.fn(async () => {})
    const container = await mount(renderSidebar({ actions: { ...actions, deleteEntry } }))

    await act(async () => {
      rightClick(container.querySelectorAll('.sidebar-row')[1])
    })
    const remove = Array.from(container.querySelectorAll('.context-item')).find(
      (item) => item.textContent?.trim() === '删除文件',
    ) as HTMLElement
    await act(async () => {
      remove.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    // 弹出确认框，但还没删
    expect(container.querySelector('.modal')).not.toBeNull()
    expect(deleteEntry).not.toHaveBeenCalled()

    const confirm = Array.from(container.querySelectorAll('.modal .primary')).find(
      (item) => item.textContent?.trim() === '删除',
    ) as HTMLElement
    await act(async () => {
      confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(deleteEntry).toHaveBeenCalledWith('/ws/README.md')
  })

  it('新建文件走创建弹窗并带上默认名', async () => {
    const createEntry = vi.fn(async () => '/ws/未命名.md')
    const container = await mount(renderSidebar({ actions: { ...actions, createEntry } }))

    await act(async () => {
      rightClick(container.querySelector('.sidebar-list') as Element)
    })
    const create = Array.from(container.querySelectorAll('.context-item')).find(
      (item) => item.textContent?.trim() === '新建文件',
    ) as HTMLElement
    await act(async () => {
      create.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const input = container.querySelector('.modal-input') as HTMLInputElement
    expect(input.value).toBe('未命名.md')

    await act(async () => {
      container.querySelector('form.modal')?.dispatchEvent(
        new window.Event('submit', { bubbles: true, cancelable: true }),
      )
    })

    expect(createEntry).toHaveBeenCalledWith('/ws', '未命名.md', false)
  })

  it('复制绝对路径调用剪贴板', async () => {
    const copyText = vi.fn(async () => true)
    const container = await mount(renderSidebar({ actions: { ...actions, copyText } }))

    await act(async () => {
      rightClick(container.querySelectorAll('.sidebar-row')[1])
    })
    const item = Array.from(container.querySelectorAll('.context-item')).find(
      (node) => node.textContent?.trim() === '复制文件绝对路径',
    ) as HTMLElement
    await act(async () => {
      item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(copyText).toHaveBeenCalledWith('/ws/README.md')
  })
})
