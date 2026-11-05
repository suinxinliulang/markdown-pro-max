// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { platform } from './platform'
import App from './App'

// 脑图渲染依赖真实布局，这里只验证视图切换
vi.mock('./editor/livePreview/mermaid-widget', () => ({
  renderDiagram: async () => '<svg class="mock-mindmap"></svg>',
  clearDiagramCache: () => {},
  MermaidWidget: class {
    constructor() {}
  },
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let mounted: { root: ReturnType<typeof createRoot>; container: HTMLElement } | null = null

afterEach(async () => {
  if (!mounted) return
  const { root, container } = mounted
  await act(async () => root.unmount())
  container.remove()
  mounted = null
})

async function renderApp() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  mounted = { root, container }
  await act(async () => {
    root.render(<App />)
  })
  return container
}

function clickButton(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === text,
  )
  button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  return button
}

describe('App 挂载', () => {
  it('渲染工具栏、编辑器与状态栏', async () => {
    const container = await renderApp()
    expect(container.querySelector('.toolbar')).not.toBeNull()
    expect(container.querySelector('.cm-editor')).not.toBeNull()
    expect(container.querySelector('.statusbar')).not.toBeNull()
    expect(container.querySelector('.welcome')).not.toBeNull()
  })

  it('新建文件后出现标签页，再次新建可叠加', async () => {
    const container = await renderApp()

    await act(async () => {
      clickButton(container, '新建文件')
    })
    expect(container.querySelectorAll('.tab')).toHaveLength(1)

    await act(async () => {
      clickButton(container, '新建文件')
    })
    expect(container.querySelectorAll('.tab')).toHaveLength(2)
  })

  it('Ctrl+S 在编辑器里只触发一次保存（不会弹两个对话框）', async () => {
    const spy = vi.spyOn(platform, 'saveAs').mockResolvedValue(null)
    try {
      const container = await renderApp()
      await act(async () => {
        clickButton(container, '新建文件')
      })

      const content = container.querySelector('.cm-content') as HTMLElement
      content.focus()
      await act(async () => {
        content.dispatchEvent(
          new window.KeyboardEvent('keydown', {
            key: 's',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        )
      })

      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('新建文档后可以切换到脑图视图，并返回编辑', async () => {
    const container = await renderApp()

    await act(async () => {
      clickButton(container, '新建文件')
    })

    await act(async () => {
      clickButton(container, '脑图')
    })
    expect(container.querySelector('.mindmap')).not.toBeNull()

    await act(async () => {
      clickButton(container, '即时编辑')
    })
    expect(container.querySelector('.mindmap')).toBeNull()
  })

  it('已有标签时新建的未命名标签，点叉号能正常关闭', async () => {
    const container = await renderApp()

    // 第一次新建（此时还没有活动标签）
    await act(async () => {
      clickButton(container, '新建文件')
    })
    // 第二次新建会先把上一个标签的文本回写，曾经在这里把 tabsRef 写坏
    await act(async () => {
      clickButton(container, '新建文件')
    })
    expect(container.querySelectorAll('.tab')).toHaveLength(2)

    const activeClose = container.querySelectorAll('.tab-close')[1] as HTMLElement
    await act(async () => {
      activeClose.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelectorAll('.tab')).toHaveLength(1)
    expect(container.querySelector('.modal-backdrop')).toBeNull()
  })
})
