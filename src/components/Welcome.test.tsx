// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocMeta } from '../platform/types'
import { Welcome } from './Welcome'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const RECENT: DocMeta[] = [
  {
    id: '/ws/a.md',
    name: 'a.md',
    path: '/ws/a.md',
    charset: 'UTF-8',
    eol: 'lf',
    mtimeMs: 1,
    size: 10,
  },
  {
    id: '/ws/b.md',
    name: 'b.md',
    path: '/ws/b.md',
    charset: 'UTF-8',
    eol: 'lf',
    mtimeMs: 2,
    size: 20,
  },
]

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

describe('Welcome 最近列表', () => {
  it('列出最近文件', async () => {
    const container = await mount(
      <Welcome
        recent={RECENT}
        kind="tauri"
        onOpen={() => {}}
        onPickRecent={() => {}}
        onRemoveRecent={() => {}}
      />,
    )

    expect(container.querySelectorAll('.recent li')).toHaveLength(2)
    expect(container.querySelector('.recent-name')?.textContent).toBe('a.md')
  })

  it('点击条目打开文件', async () => {
    const onPickRecent = vi.fn()
    const container = await mount(
      <Welcome
        recent={RECENT}
        kind="tauri"
        onOpen={() => {}}
        onPickRecent={onPickRecent}
        onRemoveRecent={() => {}}
      />,
    )

    await act(async () => {
      container
        .querySelector('.recent-item')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })
    expect(onPickRecent).toHaveBeenCalledWith(RECENT[0])
  })

  it('每个条目后面有删除按钮，点击只移除不打开', async () => {
    const onPickRecent = vi.fn()
    const onRemoveRecent = vi.fn()
    const container = await mount(
      <Welcome
        recent={RECENT}
        kind="tauri"
        onOpen={() => {}}
        onPickRecent={onPickRecent}
        onRemoveRecent={onRemoveRecent}
      />,
    )

    const buttons = container.querySelectorAll('.recent-remove')
    expect(buttons).toHaveLength(2)

    await act(async () => {
      buttons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    })

    expect(onRemoveRecent).toHaveBeenCalledWith('/ws/a.md')
    expect(onPickRecent).not.toHaveBeenCalled()
  })

  it('没有最近记录时不渲染列表', async () => {
    const container = await mount(
      <Welcome recent={[]} kind="tauri" onOpen={() => {}} onPickRecent={() => {}} onRemoveRecent={() => {}} />,
    )
    expect(container.querySelector('.recent')).toBeNull()
  })
})
