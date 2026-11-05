// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toolbar, type ToolbarProps } from './Toolbar'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

function renderToolbar(overrides: Partial<ToolbarProps> = {}) {
  return (
    <Toolbar
      activePath="/home/user/notes/doc.md"
      docName="doc.md"
      dirty={false}
      theme="light"
      segment="preview"
      canSelectMindMap
      onSelectSegment={() => {}}
      onToggleTheme={() => {}}
      onOpenFile={() => {}}
      onOpenFolder={() => {}}
      onNewWindow={() => {}}
      onOpenSettings={() => {}}
      {...overrides}
    />
  )
}

describe('Toolbar 文件菜单', () => {
  it('不再有独立的打开/保存/另存为/新建按钮', async () => {
    const container = await mount(renderToolbar())
    const labels = Array.from(container.querySelectorAll('.tool')).map((button) => button.textContent?.trim())
    expect(labels).not.toContain('打开')
    expect(labels).not.toContain('保存')
    expect(labels).not.toContain('另存为')
    expect(labels).not.toContain('新建')
  })

  it('点击图标展开菜单，包含四项', async () => {
    const container = await mount(renderToolbar())
    await act(async () => {
      container.querySelector('.menu-trigger')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.toolbar-menu .context-item')).map(
      (item) => item.textContent?.trim() ?? '',
    )
    expect(items.some((text) => text.startsWith('打开文件'))).toBe(true)
    expect(items.some((text) => text.startsWith('打开文件夹'))).toBe(true)
    expect(items.some((text) => text.startsWith('新建窗口'))).toBe(true)
    expect(items.some((text) => text.startsWith('设置'))).toBe(true)
  })

  it('点击菜单项触发回调并关闭菜单', async () => {
    const onOpenFile = vi.fn()
    const container = await mount(renderToolbar({ onOpenFile }))

    await act(async () => {
      container.querySelector('.menu-trigger')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    const item = Array.from(container.querySelectorAll('.context-item')).find((node) =>
      node.textContent?.startsWith('打开文件'),
    ) as HTMLElement

    await act(async () => {
      item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenFile).toHaveBeenCalled()
    expect(container.querySelector('.toolbar-menu')).toBeNull()
  })

  it('按 Esc 关闭菜单', async () => {
    const container = await mount(renderToolbar())
    await act(async () => {
      container.querySelector('.menu-trigger')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.toolbar-menu')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.querySelector('.toolbar-menu')).toBeNull()
  })

  it('主题是一个滑块开关，点击触发切换', async () => {
    const onToggleTheme = vi.fn()
    const container = await mount(renderToolbar({ onToggleTheme }))

    const toggle = container.querySelector('.theme-switch') as HTMLElement
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('role')).toBe('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onToggleTheme).toHaveBeenCalled()
  })

  it('深色模式下滑块处于打开状态', async () => {
    const container = await mount(renderToolbar({ theme: 'dark' }))
    const toggle = container.querySelector('.theme-switch') as HTMLElement
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.classList.contains('on')).toBe(true)
  })

  it('工具栏居中展示当前文件的绝对路径', async () => {
    const container = await mount(renderToolbar())
    expect(container.querySelector('.doc-path')?.textContent).toBe('/home/user/notes/doc.md')
  })

  it('未保存的新文档显示名字并标注未保存', async () => {
    const container = await mount(renderToolbar({ activePath: '', docName: '未命名.md' }))
    expect(container.querySelector('.doc-path')?.textContent).toContain('未命名.md')
    expect(container.querySelector('.doc-path')?.textContent).toContain('未保存')
  })

  it('工具栏不再展示文件夹路径', async () => {
    const container = await mount(renderToolbar())
    expect(container.querySelector('.workspace-path')).toBeNull()
  })

  it('显示模式是三档滑块，点击切换', async () => {
    const onSelectSegment = vi.fn()
    const container = await mount(renderToolbar({ onSelectSegment }))

    const segments = container.querySelectorAll('.segmented .segment')
    expect(segments).toHaveLength(3)
    expect(Array.from(segments).map((node) => node.textContent)).toEqual(['源码', '即时编辑', '脑图'])
    expect(container.querySelector('.segment.active')?.textContent).toBe('即时编辑')

    await act(async () => {
      segments[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onSelectSegment).toHaveBeenCalledWith('source')
  })

  it('没有打开文档时脑图档位禁用', async () => {
    const container = await mount(renderToolbar({ canSelectMindMap: false }))
    const segments = container.querySelectorAll('.segment')
    expect((segments[2] as HTMLButtonElement).disabled).toBe(true)
  })

  it('设置项回调可用（功能待实现）', async () => {
    const onOpenSettings = vi.fn()
    const container = await mount(renderToolbar({ onOpenSettings }))

    await act(async () => {
      container.querySelector('.menu-trigger')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    const item = Array.from(container.querySelectorAll('.context-item')).find((node) =>
      node.textContent?.startsWith('设置'),
    ) as HTMLElement
    await act(async () => {
      item.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenSettings).toHaveBeenCalled()
  })
})
