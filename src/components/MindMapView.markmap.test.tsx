// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MindMapView } from './MindMapView'

const mocks = vi.hoisted(() => ({
  fit: vi.fn(async () => {}),
  rescale: vi.fn(async () => {}),
  destroy: vi.fn(),
  create: vi.fn(),
}))

vi.mock('markmap-view', () => ({
  Markmap: {
    create: (element: Element, options: unknown, data: unknown) => {
      mocks.create(element, options, data)
      ;(element as Element).innerHTML = '<g><foreignObject><div>节点</div></foreignObject></g>'
      return { fit: mocks.fit, rescale: mocks.rescale, destroy: mocks.destroy }
    },
  },
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function mount(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {})
  return { container, root }
}

describe('MindMapView（markmap 渲染）', () => {
  it('用 markmap 画布渲染，不回退', async () => {
    const { container, root } = await mount(
      <MindMapView markdown={'# A\n## B\n'} title="doc.md" theme="light" onExit={() => {}} />,
    )

    expect(container.querySelector('.mindmap-markmap')).not.toBeNull()
    expect(container.querySelector('.mindmap-stage')).toBeNull()
    expect(mocks.create).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
  })

  it('{#mm} 过滤在建树阶段完成，markmap 只拿到筛过的节点', async () => {
    mocks.create.mockClear()
    const { container, root } = await mount(
      <MindMapView
        markdown={'# 总览\n## 架构 {#mm}\n### 细节\n## 附录 {#mm}\n'}
        title="doc.md"
        theme="light"
        onExit={() => {}}
      />,
    )

    // 标题栏统计仍然生效
    const meta = container.querySelector('.mindmap-meta')?.textContent ?? ''
    expect(meta).toContain('共 4 个标题')
    expect(meta).toContain('仅显示 2 个带 {#mm} 标记的标题')

    // 交给 markmap 的数据里只有带标记的标题
    const data = mocks.create.mock.calls[0]?.[2] as { content: string; children: Array<{ content: string }> }
    expect(data.content).toBe('doc')
    expect(data.children.map((child) => child.content)).toEqual(['架构', '附录'])
    // 未标记的父子节点都不在里面
    expect(JSON.stringify(data)).not.toContain('总览')
    expect(JSON.stringify(data)).not.toContain('细节')

    await act(async () => root.unmount())
  })

  it('缩放按钮调用 markmap 的 rescale，适配按钮调用 fit', async () => {
    const onExit = vi.fn()
    const { container, root } = await mount(
      <MindMapView markdown={'# A\n'} title="doc.md" theme="light" onExit={onExit} />,
    )

    const buttons = container.querySelectorAll('.mindmap-zoom')
    await act(async () => {
      buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.rescale).toHaveBeenCalledWith(1.2)

    await act(async () => {
      buttons[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(mocks.fit).toHaveBeenCalled()

    await act(async () => root.unmount())
    expect(mocks.destroy).toHaveBeenCalled()
  })
})
