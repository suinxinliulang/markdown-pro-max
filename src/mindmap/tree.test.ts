import { describe, expect, it } from 'vitest'
import { buildMindMap, buildTree, collectHeadings, parseHeadingText, stripInline } from './tree'

describe('stripInline / parseHeadingText', () => {
  it('去掉行内标记', () => {
    expect(stripInline('**粗体** 与 `代码` 和 [链接](https://x.y)')).toBe('粗体 与 代码 和 链接')
    expect(stripInline('![图](a.png) 说明')).toBe('图 说明')
  })

  it('识别并剥离 {#mm} 标记', () => {
    expect(parseHeadingText('架构 {#mm}')).toEqual({ text: '架构', marked: true })
    expect(parseHeadingText('架构')).toEqual({ text: '架构', marked: false })
    expect(parseHeadingText('{#mm}')).toEqual({ text: '(无标题)', marked: true })
  })
})

describe('collectHeadings', () => {
  const doc = [
    '# 一级', //                       1
    '', //                             2
    '正文', //                         3
    '', //                             4
    '## 二级 {#mm}', //                5
    '', //                             6
    '### 三级 **粗**', //               7
    '', //                             8
    'Setext 一级', //                   9
    '============', //                 10
    '', //                             11
    '```', //                          12
    '# 代码里的井号不算', //            13
    '```', //                          14
    '', //                             15
    '> # 引用里的标题也不算', //        16
  ].join('\n')

  it('抽取顶层标题，忽略代码块与引用块', () => {
    const headings = collectHeadings(doc)
    expect(headings.map((h) => [h.level, h.text, h.line])).toEqual([
      [1, '一级', 1],
      [2, '二级', 5],
      [3, '三级 粗', 7],
      [1, 'Setext 一级', 9],
    ])
  })

  it('记录标记状态', () => {
    expect(collectHeadings(doc).filter((h) => h.marked)).toHaveLength(1)
  })

  it('空文档没有标题', () => {
    expect(collectHeadings('没有任何标题')).toEqual([])
  })
})

describe('buildTree', () => {
  const heading = (level: number, text: string) => ({ level, text, line: 0, marked: false })

  it('按层级嵌套', () => {
    const tree = buildTree([heading(1, 'A'), heading(2, 'B'), heading(3, 'C'), heading(2, 'D')], 'root')
    expect(tree.content).toBe('root')
    expect(tree.children.map((n) => n.content)).toEqual(['A'])
    expect(tree.children[0].children.map((n) => n.content)).toEqual(['B', 'D'])
    expect(tree.children[0].children[0].children.map((n) => n.content)).toEqual(['C'])
  })

  it('跳级时挂到最近的祖先', () => {
    const tree = buildTree([heading(1, 'A'), heading(3, 'C')], 'root')
    expect(tree.children[0].children[0].content).toBe('C')
  })

  it('多个一级标题并列', () => {
    const tree = buildTree([heading(1, 'A'), heading(1, 'B')], 'root')
    expect(tree.children.map((n) => n.content)).toEqual(['A', 'B'])
  })
})

describe('buildMindMap', () => {
  it('没有标记时展示全部标题', () => {
    const result = buildMindMap('# A\n## B\n', 'doc')
    expect(result.markedCount).toBe(0)
    expect(result.root.children.map((n) => n.content)).toEqual(['A'])
    expect(result.root.children[0].children.map((n) => n.content)).toEqual(['B'])
  })

  it('有标记时只保留标记标题；未标记的父节点与子节点都不进脑图', () => {
    const doc = ['# 总览', '## 架构 {#mm}', '### 细节', '## 附录 {#mm}', '### 附录细节'].join('\n')
    const result = buildMindMap(doc, 'doc')

    expect(result.markedCount).toBe(2)
    // 总览未标记 → 被过滤；架构与附录同属 H2 → 都挂在根下
    expect(result.root.children.map((node) => node.content)).toEqual(['架构', '附录'])
    // 细节未标记 → 不出现
    expect(result.root.children[0].children).toEqual([])
    // 附录细节未标记 → 也不出现
    expect(result.root.children[1].children).toEqual([])
  })

  it('标记的子标题会挂到最近的已标记祖先下', () => {
    const doc = ['# 总览 {#mm}', '## 细节', '### 深层 {#mm}'].join('\n')
    const result = buildMindMap(doc, 'doc')

    expect(result.root.children.map((node) => node.content)).toEqual(['总览'])
    expect(result.root.children[0].children.map((node) => node.content)).toEqual(['深层'])
  })

  it('生成缩进正确的 mermaid 源码', () => {
    const result = buildMindMap('# A\n## B\n### C\n', 'doc')
    expect(result.source).toBe(['mindmap', '  doc', '    A', '      B', '        C'].join('\n'))
  })

  it('没有标题时仍然给出合法源码', () => {
    const result = buildMindMap('只有正文', 'doc')
    expect(result.source).toBe(['mindmap', '  doc'].join('\n'))
  })
})
