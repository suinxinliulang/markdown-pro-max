// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MindMapView } from './MindMapView'

// 让 markmap 初始化失败，从而覆盖"自动回退到自研 SVG"这条路径
vi.mock('markmap-view', () => ({
  Markmap: {
    create: () => {
      throw new Error('markmap 无法在当前环境初始化')
    },
  },
}))

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
  // 等回退逻辑（异步 import + catch）跑完
  await act(async () => {})
  cleanups.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

const view = (markdown: string) => (
  <MindMapView markdown={markdown} title="设计文档.md" theme="light" onExit={() => {}} />
)

const texts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.mindmap-node text')).map((node) => node.textContent)

describe('MindMapView（回退渲染器）', () => {
  it('markmap 初始化失败时自动回退，并照常画出节点', async () => {
    const container = await mount(view('# 总览\n## 架构\n### 前端\n## 部署\n'))

    expect(container.querySelector('svg')).not.toBeNull()
    // 节点顺序是后序（子先于父），这里按集合比较
    expect(new Set(texts(container))).toEqual(new Set(['设计文档', '总览', '架构', '前端', '部署']))
    expect(container.querySelectorAll('.mindmap-node.root')).toHaveLength(1)
  })

  it('显示标题统计', async () => {
    const container = await mount(view('# A\n## B {#mm}\n## C\n'))
    const meta = container.querySelector('.mindmap-meta')?.textContent ?? ''
    expect(meta).toContain('共 3 个标题')
    expect(meta).toContain('仅显示 1 个带 {#mm} 标记的标题')
  })

  it('没有标记时显示全部标题', async () => {
    const container = await mount(view('# A\n## B\n'))
    expect(container.querySelector('.mindmap-meta')?.textContent).toContain('显示全部标题')
  })

  it('节点上有行号提示，便于以后跳转', async () => {
    const container = await mount(view('# 一级\n\n## 二级\n'))
    const titles = Array.from(container.querySelectorAll('.mindmap-node title')).map((n) => n.textContent)
    expect(titles.some((text) => text?.includes('第 3 行'))).toBe(true)
  })

  it('底部按钮可以放大、缩小、复位', async () => {
    const container = await mount(view('# A\n## B\n'))
    const percent = () => container.querySelector('.mindmap-scale')?.textContent
    const buttons = container.querySelectorAll('.mindmap-zoom')

    expect(percent()).toBe('100%')
    await act(async () => {
      buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(percent()).toBe('120%')
    await act(async () => {
      buttons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(percent()).toBe('100%')
  })

  it('滚轮可以缩放', async () => {
    const container = await mount(view('# A\n## B\n'))
    const canvas = container.querySelector('.mindmap-canvas') as HTMLElement
    await act(async () => {
      canvas.dispatchEvent(new window.WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }))
    })
    const scale = Number((container.querySelector('.mindmap-scale')?.textContent ?? '100%').replace('%', ''))
    expect(scale).toBeGreaterThan(100)
  })

  it('拖动可以平移画布', async () => {
    const container = await mount(view('# A\n## B\n'))
    const canvas = container.querySelector('.mindmap-canvas') as HTMLElement
    const stage = container.querySelector('.mindmap-stage') as HTMLElement
    const before = stage.style.transform

    await act(async () => {
      canvas.dispatchEvent(new window.PointerEvent('pointerdown', { clientX: 10, clientY: 10, button: 0, bubbles: true }))
      canvas.dispatchEvent(new window.PointerEvent('pointermove', { clientX: 60, clientY: 40, bubbles: true }))
    })

    expect(stage.style.transform).not.toBe(before)
  })

  it('没有标题时给出提示', async () => {
    const container = await mount(view('只有正文，没有标题'))
    expect(container.querySelector('.mindmap-hint')?.textContent).toContain('没有可用作节点的标题')
  })
})
