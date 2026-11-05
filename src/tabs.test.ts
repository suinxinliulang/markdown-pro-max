import { describe, expect, it } from 'vitest'
import type { DocMeta } from './platform/types'
import { closeTabById, createUntitledTab, cycleTab, openTab, type Tab } from './tabs'

const meta = (path: string): DocMeta => ({
  id: path,
  name: path.split('/').pop() ?? path,
  path,
  charset: 'UTF-8',
  eol: 'lf',
  mtimeMs: 0,
  size: 0,
})

const tab = (path: string): Tab => ({ id: `tab:${path}`, meta: meta(path), text: '', dirty: false })

describe('createUntitledTab', () => {
  it('没有路径、没有脏标记', () => {
    const created = createUntitledTab()
    expect(created.meta.path).toBe('')
    expect(created.dirty).toBe(false)
    expect(created.id).not.toBe(created.meta.id)
  })
})

describe('openTab', () => {
  it('新路径追加标签并激活它', () => {
    const result = openTab([tab('/a.md')], tab('/b.md'))
    expect(result.tabs.map((item) => item.meta.path)).toEqual(['/a.md', '/b.md'])
    expect(result.activeId).toBe('tab:/b.md')
    expect(result.reused).toBe(false)
  })

  it('同路径复用已有标签，不重复打开', () => {
    const result = openTab([tab('/a.md'), tab('/b.md')], tab('/b.md'))
    expect(result.tabs).toHaveLength(2)
    expect(result.activeId).toBe('tab:/b.md')
    expect(result.reused).toBe(true)
  })

  it('未命名文档可以开多个', () => {
    const first = createUntitledTab()
    const second = createUntitledTab()
    const result = openTab([first], second)
    expect(result.tabs).toHaveLength(2)
  })
})

describe('closeTabById', () => {
  it('关闭后激活右侧标签', () => {
    const tabs = [tab('/a.md'), tab('/b.md'), tab('/c.md')]
    const result = closeTabById(tabs, 'tab:/b.md')
    expect(result.tabs.map((item) => item.meta.path)).toEqual(['/a.md', '/c.md'])
    expect(result.nextActiveId).toBe('tab:/c.md')
  })

  it('关闭最后一个时激活左侧', () => {
    const tabs = [tab('/a.md'), tab('/b.md')]
    const result = closeTabById(tabs, 'tab:/b.md')
    expect(result.nextActiveId).toBe('tab:/a.md')
  })

  it('全部关闭后没有激活项', () => {
    const result = closeTabById([tab('/a.md')], 'tab:/a.md')
    expect(result.tabs).toHaveLength(0)
    expect(result.nextActiveId).toBeNull()
  })

  it('关闭不存在的标签是空操作', () => {
    const tabs = [tab('/a.md')]
    expect(closeTabById(tabs, 'nope').tabs).toHaveLength(1)
  })
})

describe('cycleTab', () => {
  it('向后/向前循环', () => {
    const tabs = [tab('/a.md'), tab('/b.md'), tab('/c.md')]
    expect(cycleTab(tabs, 'tab:/a.md', 1)).toBe('tab:/b.md')
    expect(cycleTab(tabs, 'tab:/a.md', -1)).toBe('tab:/c.md')
  })

  it('没有标签时返回 null', () => {
    expect(cycleTab([], null, 1)).toBeNull()
  })
})
