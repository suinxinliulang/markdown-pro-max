import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, estimateTextWidth, layoutMindMap, truncateText } from './layout'
import type { MindNode } from './tree'

const node = (content: string, children: MindNode[] = []): MindNode => ({ content, line: 1, children })
const measure = (text: string) => text.length * 10

describe('layoutMindMap', () => {
  it('单节点：尺寸包含留白', () => {
    const layout = layoutMindMap(node('根'), measure)
    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0].x).toBe(DEFAULT_LAYOUT.margin)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBe(DEFAULT_LAYOUT.nodeHeight + DEFAULT_LAYOUT.margin * 2)
  })

  it('父子列：子节点在父节点右侧一列', () => {
    const layout = layoutMindMap(node('父', [node('子')]), measure)
    const parent = layout.nodes.find((n) => n.text === '父')!
    const child = layout.nodes.find((n) => n.text === '子')!
    expect(child.x).toBe(parent.x + parent.width + DEFAULT_LAYOUT.gapX)
    expect(layout.edges).toHaveLength(1)
    expect(layout.edges[0].path.startsWith('M ')).toBe(true)
  })

  it('父节点垂直居中于子节点跨度', () => {
    const layout = layoutMindMap(node('父', [node('A'), node('B'), node('C')]), measure)
    const parent = layout.nodes.find((n) => n.text === '父')!
    const a = layout.nodes.find((n) => n.text === 'A')!
    const c = layout.nodes.find((n) => n.text === 'C')!
    const parentCenter = parent.y + parent.height / 2
    const aCenter = a.y + a.height / 2
    const cCenter = c.y + c.height / 2
    expect(parentCenter).toBeCloseTo((aCenter + cCenter) / 2)
  })

  it('兄弟节点纵向不重叠', () => {
    const layout = layoutMindMap(node('父', [node('A'), node('B')]), measure)
    const a = layout.nodes.find((n) => n.text === 'A')!
    const b = layout.nodes.find((n) => n.text === 'B')!
    expect(b.y - (a.y + a.height)).toBeGreaterThanOrEqual(DEFAULT_LAYOUT.gapY - 0.001)
  })

  it('深层链式结构每层各占一列', () => {
    const chain = node('A', [node('B', [node('C')])])
    const layout = layoutMindMap(chain, measure)
    const xs = ['A', 'B', 'C'].map((t) => layout.nodes.find((n) => n.text === t)!.x)
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
  })

  it('长文本被限制在最大宽度内', () => {
    const layout = layoutMindMap(node('x'.repeat(200)), measure)
    expect(layout.nodes[0].width).toBe(DEFAULT_LAYOUT.maxNodeWidth)
  })

  it('记录源行号，便于以后跳转', () => {
    const layout = layoutMindMap({ content: '标题', line: 42, children: [] }, measure)
    expect(layout.nodes[0].line).toBe(42)
  })
})

describe('estimateTextWidth', () => {
  it('中文比英文宽', () => {
    expect(estimateTextWidth('中文', 13)).toBeGreaterThan(estimateTextWidth('ab', 13))
  })

  it('空串为 0', () => {
    expect(estimateTextWidth('', 13)).toBe(0)
  })
})

describe('truncateText', () => {
  it('放得下就原样返回', () => {
    expect(truncateText('短标题', 200, measure)).toBe('短标题')
  })

  it('放不下时截断并加省略号', () => {
    const result = truncateText('一二三四五六七八九十', 50, measure)
    expect(result.endsWith('…')).toBe(true)
    expect(measure(result)).toBeLessThanOrEqual(50)
  })
})
