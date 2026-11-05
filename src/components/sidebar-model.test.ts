import { describe, expect, it } from 'vitest'
import type { DirEntry } from '../platform/types'
import { basename, ellipsizePath, flattenTree, joinPath, parentOf, relativeTo } from './sidebar-model'

const entry = (name: string, path: string, isDir = false): DirEntry => ({
  name,
  path,
  isDir,
  size: isDir ? 0 : 10,
})

describe('basename', () => {
  it('取 POSIX 与 Windows 路径的最后一段', () => {
    expect(basename('/home/fan/docs')).toBe('docs')
    expect(basename('C:\\Users\\fan\\docs')).toBe('docs')
    expect(basename('/home/fan/docs/')).toBe('docs')
  })

  it('路径为空时原样返回', () => {
    expect(basename('')).toBe('')
  })
})

describe('ellipsizePath', () => {
  it('短路径原样返回', () => {
    expect(ellipsizePath('/home/docs')).toBe('/home/docs')
  })

  it('长路径保留尾部并加省略号', () => {
    const path = '/home/fan/Code/hello-rust/docs/fixtures'
    const result = ellipsizePath(path, 20)
    expect(result.startsWith('…')).toBe(true)
    expect(result.endsWith('fixtures')).toBe(true)
    expect(path.endsWith(result.slice(1))).toBe(true)
  })

  it('在分隔符处截断，不留半截目录名', () => {
    const result = ellipsizePath('/aaaa/bbbb/cccc/dddd', 10)
    expect(result.startsWith('…/')).toBe(true)
  })

  it('Windows 路径同样处理', () => {
    const result = ellipsizePath('C:\\Users\\fan\\Documents\\notes', 16)
    expect(result.startsWith('…')).toBe(true)
    expect(result).toContain('\\')
  })
})

describe('flattenTree', () => {
  const root = [entry('docs', '/r/docs', true), entry('README.md', '/r/README.md')]
  const children = new Map<string, DirEntry[]>([
    ['/r/docs', [entry('a.md', '/r/docs/a.md')]],
  ])

  it('未展开时只显示一层', () => {
    const rows = flattenTree(root, (path) => children.get(path) ?? [], () => false)
    expect(rows.map((row) => row.entry.name)).toEqual(['docs', 'README.md'])
    expect(rows.every((row) => row.depth === 0)).toBe(true)
  })

  it('展开后把子项接在目录后面', () => {
    const rows = flattenTree(root, (path) => children.get(path) ?? [], (path) => path === '/r/docs')
    expect(rows.map((row) => row.entry.name)).toEqual(['docs', 'a.md', 'README.md'])
    expect(rows[1].depth).toBe(1)
  })

  it('没有加载过的目录展开也不会报错', () => {
    const rows = flattenTree(root, () => [], () => true)
    expect(rows.map((row) => row.entry.name)).toEqual(['docs', 'README.md'])
  })

  it('目录数据自引用时不会无限递归', () => {
    const cyclic: DirEntry[] = [entry('self', '/r/self', true)]
    const rows = flattenTree(cyclic, () => cyclic, () => true)
    expect(rows.map((row) => row.entry.name)).toEqual(['self'])
  })
})

describe('路径拼接与相对化', () => {
  it('joinPath 不产生重复分隔符', () => {
    expect(joinPath('/home/docs/', 'a.md')).toBe('/home/docs/a.md')
    expect(joinPath('C:\\docs', 'a.md')).toBe('C:\\docs\\a.md')
  })

  it('parentOf 取父目录', () => {
    expect(parentOf('/home/docs/a.md')).toBe('/home/docs')
    expect(parentOf('/home')).toBe('/home')
  })

  it('relativeTo 去掉工作区前缀', () => {
    expect(relativeTo('/ws', '/ws/docs/a.md')).toBe('docs/a.md')
    expect(relativeTo('/ws/', '/ws/a.md')).toBe('a.md')
    expect(relativeTo('/other', '/ws/a.md')).toBe('/ws/a.md')
    expect(relativeTo(null, '/ws/a.md')).toBe('/ws/a.md')
  })
})
