import { describe, expect, it } from 'vitest'
import { findFrontmatter } from './frontmatter'

describe('findFrontmatter', () => {
  it('识别文档开头的 YAML 块', () => {
    const doc = ['---', 'title: 测试', 'tags: [a, b]', '---', '', '# 标题'].join('\n')
    const result = findFrontmatter(doc)
    expect(result).not.toBeNull()
    expect(result?.body).toBe('title: 测试\ntags: [a, b]')
    expect(doc.slice(0, result!.to)).toBe('---\ntitle: 测试\ntags: [a, b]\n---')
  })

  it('支持 ... 作为闭合', () => {
    const result = findFrontmatter('---\na: 1\n...\n正文')
    expect(result?.body).toBe('a: 1')
  })

  it('没有闭合时不算 frontmatter', () => {
    expect(findFrontmatter('---\ntitle: x\n\n正文')).toBeNull()
  })

  it('不从文档中间识别', () => {
    expect(findFrontmatter('正文\n---\na: 1\n---')).toBeNull()
  })

  it('普通文档返回 null', () => {
    expect(findFrontmatter('# 标题\n\n正文')).toBeNull()
    expect(findFrontmatter('')).toBeNull()
  })

  it('分隔线与正文中的 --- 不会被误判', () => {
    const doc = ['---', 'a: 1', '---', '', '---', '', '正文'].join('\n')
    const result = findFrontmatter(doc)
    expect(result?.endLine).toBe(2)
    expect(result?.body).toBe('a: 1')
  })
})
