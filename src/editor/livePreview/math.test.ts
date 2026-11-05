import { describe, expect, it } from 'vitest'
import { scanBlockMath, scanInlineMath } from './math'

describe('scanInlineMath', () => {
  it('识别单个行内公式', () => {
    const spans = scanInlineMath('质能方程 $E = mc^2$ 很简洁')
    expect(spans).toHaveLength(1)
    expect(spans[0].tex).toBe('E = mc^2')
    expect('质能方程 $E = mc^2$ 很简洁'.slice(spans[0].from, spans[0].to)).toBe('$E = mc^2$')
  })

  it('识别同一行的多个公式', () => {
    const spans = scanInlineMath('$a$ 与 $b$')
    expect(spans.map((span) => span.tex)).toEqual(['a', 'b'])
  })

  it('带偏移量时给出绝对位置', () => {
    const spans = scanInlineMath('$x$', 100)
    expect(spans[0].from).toBe(100)
    expect(spans[0].to).toBe(103)
  })

  it('跳过转义的美元符号', () => {
    expect(scanInlineMath('价格是 \\$5 不便宜')).toHaveLength(0)
  })

  it('不把 $$ 当行内公式', () => {
    expect(scanInlineMath('$$x^2$$')).toHaveLength(0)
  })

  it('空公式不算', () => {
    expect(scanInlineMath('$$ $ $')).toHaveLength(0)
  })

  it('没闭合的美元符号不算', () => {
    expect(scanInlineMath('这里有个 $ 但不闭合')).toHaveLength(0)
  })

  it('公式里可以有转义字符', () => {
    const spans = scanInlineMath('$\\alpha \\$ \\beta$')
    expect(spans).toHaveLength(1)
    expect(spans[0].tex).toBe('\\alpha \\$ \\beta')
  })
})

describe('scanBlockMath', () => {
  it('识别单行块级公式', () => {
    const blocks = scanBlockMath('前文\n$$x^2 + y^2$$\n后文')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tex).toBe('x^2 + y^2')
    expect(blocks[0].startLine).toBe(1)
    expect(blocks[0].endLine).toBe(1)
  })

  it('识别多行块级公式', () => {
    const doc = ['前言', '$$', 'a = \\frac{1}{2}', 'b = 3', '$$', '后记'].join('\n')
    const blocks = scanBlockMath(doc)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tex).toBe('a = \\frac{1}{2}\nb = 3')
    expect(blocks[0].startLine).toBe(1)
    expect(blocks[0].endLine).toBe(4)
    expect(doc.slice(blocks[0].from, blocks[0].to)).toBe('$$\na = \\frac{1}{2}\nb = 3\n$$')
  })

  it('未闭合的块级公式被忽略', () => {
    expect(scanBlockMath('$$\nx = 1')).toHaveLength(0)
  })

  it('缩进的 $$ 也能识别', () => {
    const blocks = scanBlockMath('  $$\n  x = 1\n  $$')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].tex.trim()).toBe('x = 1')
  })
})
