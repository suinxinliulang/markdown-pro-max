import { readFileSync } from 'node:fs'

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState, type Extension } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'

import { FrontmatterWidget } from './frontmatter-widget'
import { HtmlBlockWidget, HtmlInlineWidget } from './html-widget'
import { ImageWidget } from './image-widget'
import { buildDecorations, imageResolver } from './index'
import { MathWidget } from './math-widget'
import { MermaidWidget } from './mermaid-widget'
import { BulletWidget, CodeBlockWidget, RuleWidget, TableWidget } from './widgets'

/**
 * 用 `docs/fixtures/kitchen-sink.md` 做整篇回归：
 * 这份文档覆盖了 CommonMark + GFM 的常见语法、KaTeX 公式、15 种 Mermaid 图表。
 */

const FIXTURE = readFileSync(new URL('../../../docs/fixtures/kitchen-sink.md', import.meta.url), 'utf8')

interface Item {
  from: number
  to: number
  spec: { class?: string; attributes?: Record<string, string>; widget?: unknown }
}

function scan(anchor: number, resolveImages?: (src: string) => string | null) {
  const extensions: Extension[] = [markdown({ base: markdownLanguage })]
  if (resolveImages) extensions.push(imageResolver.of(resolveImages))

  const state = EditorState.create({ doc: FIXTURE, extensions, selection: { anchor } })
  const { decorations, atomic } = buildDecorations(state, [{ from: 0, to: state.doc.length }])
  return { state, decorations, atomic, items: collect(decorations, state.doc.length) }
}

function collect(set: DecorationSet, length: number): Item[] {
  const out: Item[] = []
  set.between(0, length, (from, to, value) => {
    out.push({ from, to, spec: value.spec as Item['spec'] })
  })
  return out
}

const widgetsOf = <T>(items: Item[], ctor: new (...args: never[]) => T): T[] =>
  items.map((item) => item.spec.widget).filter((widget): widget is T => widget instanceof ctor)

describe('整篇测试文档（kitchen-sink.md）', () => {
  it('文档本身包含全部段落类型', () => {
    expect(FIXTURE).toContain('# 一级标题')
    expect(FIXTURE).toContain('###### 六级标题')
    expect(FIXTURE).toContain('Setext 一级标题')
    expect(FIXTURE).toContain('| 左对齐 |')
    expect(FIXTURE).toContain('$$')
    expect(FIXTURE).toContain('```mermaid')
  })

  it('解析整篇不抛异常，并产出去重后的行号', () => {
    const { items } = scan(0)
    expect(items.length).toBeGreaterThan(50)
  })

  it('frontmatter 折叠成一张卡片', () => {
    // 光标放在文末：frontmatter 处于"收起"状态
    const { items, state } = scan(FIXTURE.length)
    const cards = widgetsOf(items, FrontmatterWidget)
    expect(cards).toHaveLength(1)
    expect(cards[0].body).toContain('title: MarkdownProMax 全语法测试文档')
    // 覆盖的是文档开头的 6 行
    const first = items.find((item) => item.spec.widget instanceof FrontmatterWidget)
    expect(first?.from).toBe(0)
    expect(first?.to).toBe(state.doc.line(6).to)
  })

  it('15 种 Mermaid 图表都被识别，且正文提取正确', () => {
    const { items } = scan(0)
    const diagrams = widgetsOf(items, MermaidWidget)
    expect(diagrams).toHaveLength(15)

    const kinds = diagrams
      .map((widget) => widget.source.trim().split('\n')[0].trim().split(/\s+/)[0])
      .sort()
    expect(kinds).toEqual(
      [
        'classDiagram',
        'erDiagram',
        'flowchart',
        'gantt',
        'gitGraph',
        'journey',
        'mindmap',
        'pie',
        'quadrantChart',
        'requirementDiagram',
        'sankey-beta',
        'sequenceDiagram',
        'stateDiagram-v2',
        'timeline',
        'xychart-beta',
      ].sort(),
    )

    // 围栏本身不能混进图表源码
    for (const widget of diagrams) {
      expect(widget.source.startsWith('```')).toBe(false)
      expect(widget.source.trimEnd().endsWith('```')).toBe(false)
    }
  })

  it('光标进入某张图后，只有那一张回到源码', () => {
    const { state } = scan(0)
    const diagramLine = FIXTURE.slice(0, FIXTURE.indexOf('flowchart TD')).split('\n').length
    const anchor = state.doc.line(diagramLine).from
    const { items } = scan(anchor)

    expect(widgetsOf(items, MermaidWidget)).toHaveLength(14)
  })

  it('代码块（含引用里的）都渲染成卡片', () => {
    const { items } = scan(0)
    expect(widgetsOf(items, CodeBlockWidget)).toHaveLength(7)
  })

  it('表格与分割线', () => {
    const { items } = scan(0)
    expect(widgetsOf(items, TableWidget)).toHaveLength(1)
    // 3 条在「分割线」小节里，另 1 条是 Setext 标题之后的 ---
    expect(widgetsOf(items, RuleWidget)).toHaveLength(4)
  })

  it('公式：1 个块级 + 2 个行内', () => {
    const { items } = scan(0)
    const maths = widgetsOf(items, MathWidget)
    expect(maths.filter((widget) => widget.display)).toHaveLength(1)
    expect(maths.filter((widget) => !widget.display).map((widget) => widget.tex)).toEqual([
      'E = mc^2',
      '\\int_0^1 x^2\\,\\mathrm{d}x = \\frac{1}{3}',
    ])
  })

  it('HTML：块级与行内都渲染成真实元素', () => {
    const { items } = scan(0)
    expect(widgetsOf(items, HtmlBlockWidget)).toHaveLength(1)
    // <kbd>Ctrl</kbd>、<kbd>S</kbd>、<span style=...> 三段
    expect(widgetsOf(items, HtmlInlineWidget)).toHaveLength(3)
  })

  it('图片：本地可解析，远程默认不加载', () => {
    const { items } = scan(0, (src) =>
      src.startsWith('http') ? null : `asset://local/${src.replace('./', '')}`,
    )
    const images = widgetsOf(items, ImageWidget)
    expect(images).toHaveLength(2)
    expect(images[0].resolved).toBe('asset://local/assets/demo.png')
    expect(images[1].resolved).toBeNull()
  })

  it('无序列表换成圆点，有序列表保留数字', () => {
    const { items } = scan(0)
    expect(widgetsOf(items, BulletWidget)).toHaveLength(8)
  })

  it('六个级别的标题都带上了行样式', () => {
    const { items } = scan(0)
    const headingClasses = items
      .filter((item) => item.from === item.to && item.spec.class?.startsWith('cm-lp-h'))
      .map((item) => item.spec.class)

    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(headingClasses).toContain(`cm-lp-h${level}`)
    }
  })

  it('frontmatter 收起时，行内装饰没有被整棵树吞掉', () => {
    // 光标放到文末：frontmatter 折叠成 widget，第 1 行进入"被覆盖"状态。
    // 这里曾经出过 bug：行内层按"节点起始行是否被覆盖"跳过，
    // 结果文档根节点（from=0）被跳过，所有行内装饰全部消失。
    const { items } = scan(FIXTURE.length)
    expect(widgetsOf(items, HtmlInlineWidget)).toHaveLength(3)
    expect(widgetsOf(items, ImageWidget)).toHaveLength(2)
    expect(items.filter((item) => item.spec.class === 'cm-lp-link').length).toBeGreaterThanOrEqual(3)
  })

  it('链接文字带 data-url，便于点击打开', () => {
    const { items } = scan(0)
    const links = items.filter((item) => item.spec.class === 'cm-lp-link')
    expect(links.length).toBeGreaterThanOrEqual(3)
    expect(links.some((item) => item.spec.attributes?.['data-url'] === 'https://example.com')).toBe(true)
  })
})
