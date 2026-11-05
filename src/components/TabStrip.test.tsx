// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../tabs'
import { TabStrip } from './TabStrip'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const tab = (id: string, name: string, dirty = false): Tab => ({
  id,
  meta: { id, name, path: `/ws/${name}`, charset: 'UTF-8', eol: 'lf', mtimeMs: 0, size: 0 },
  text: '',
  dirty,
})

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

describe('TabStrip', () => {
  it('没有标签时不渲染', async () => {
    const container = await mount(
      <TabStrip tabs={[]} activeId={null} onActivate={() => {}} onClose={() => {}} />,
    )
    expect(container.querySelector('.tabstrip')).toBeNull()
  })

  it('点关闭按钮只触发关闭，不触发切换', async () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    const container = await mount(
      <TabStrip
        tabs={[tab('a', 'a.md'), tab('b', 'b.md')]}
        activeId="a"
        onActivate={onActivate}
        onClose={onClose}
      />,
    )

    const closeButton = container.querySelectorAll('.tab-close')[1] as HTMLElement
    await act(async () => {
      closeButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledWith('b')
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('脏标签显示圆点', async () => {
    const container = await mount(
      <TabStrip tabs={[tab('a', 'a.md', true)]} activeId="a" onActivate={() => {}} onClose={() => {}} />,
    )
    expect(container.querySelector('.tab-dirty')).not.toBeNull()
  })

  it('点击标签本体切换', async () => {
    const onActivate = vi.fn()
    const container = await mount(
      <TabStrip
        tabs={[tab('a', 'a.md'), tab('b', 'b.md')]}
        activeId="a"
        onActivate={onActivate}
        onClose={() => {}}
      />,
    )
    const second = container.querySelectorAll('.tab')[1] as HTMLElement
    await act(async () => {
      second.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onActivate).toHaveBeenCalledWith('b')
  })
})
