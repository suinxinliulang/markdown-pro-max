import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { buildDecorations } from './index'
import { ImageWidget } from './image-widget'
import { MathWidget } from './math-widget'
import { BulletWidget, CodeBlockWidget, RuleWidget, TableWidget } from './widgets'

/**
 * 这些测试直接跑在真实的 Lezer 语法树上（Node 环境，不需要浏览器），
 * 断言的是"哪段文本被隐藏、哪一行被加了什么类、哪些区间进了原子范围"。
 */

const LINES = [
  '# 标题', //                                        1
  '', //                                              2
  '普通 **粗体** 与 `代码` 和 [链接](https://example.com)', // 3
  '', //                                              4
  '> 引用内容', //                                     5
  '', //                                              6
  '```js', //                                         7
  'const a = 1', //                                   8
  '```', //                                           9
  '', //                                              10
  '| 名称 | 数量 |', //                                 11
  '| --- | ---: |', //                                12
  '| 苹果 | 3 |', //                                   13
  '', //                                              14
  '---', //                                           15
]

const DOC = LINES.join('\n')

/** 某一行在文档里的起始偏移（1 基）。 */
function lineStart(line: number): number {
  let offset = 0
  for (let i = 0; i < line - 1; i += 1) offset += LINES[i].length + 1
  return offset
}

interface Item {
  from: number
  to: number
  spec: { class?: string; widget?: unknown }
}

function setup(cursor: number) {
  const state = EditorState.create({ doc: DOC, extensions: [markdown({ base: markdownLanguage })], selection: { anchor: cursor } })
  const { decorations, atomic } = buildDecorations(state, [{ from: 0, to: state.doc.length }])
  return { state, decorations, atomic }
}

function items(set: DecorationSet, length: number): Item[] {
  const out: Item[] = []
  set.between(0, length, (from, to, value) => {
    out.push({ from, to, spec: value.spec as Item['spec'] })
  })
  return out
}

const lastLine = lineStart(15)

describe('Live Preview 装饰', () => {
  it('光标不在标题行时隐藏 #，并给整行加 h1 类', () => {
    const { state, decorations } = setup(lastLine)
    const list = items(decorations, state.doc.length)
    const headingStart = lineStart(1)

    expect(
      list.some((item) => item.from === headingStart && item.to === headingStart && item.spec.class === 'cm-lp-h1'),
    ).toBe(true)

    // `#` 连同其后的空格一起隐藏（range 是 0..2）
    const hidden = list.find((item) => item.from === headingStart && item.to === headingStart + 2)
    expect(hidden).toBeDefined()
    expect(hidden?.spec.widget).toBeUndefined()
  })

  it('光标在标题行时保留标记符，只做变暗', () => {
    const { state, decorations } = setup(0)
    const list = items(decorations, state.doc.length)
    const mark = list.find((item) => item.from === 0 && item.to === 2)
    expect(mark?.spec.class).toBe('cm-lp-mark')
  })

  it('行内标记符（粗体 / 行内代码 / 链接）在非当前行被隐藏', () => {
    const { state, decorations } = setup(lastLine)
    const list = items(decorations, state.doc.length)
    const line = state.doc.line(3)
    const hiddenOnLine = list.filter(
      (item) => item.to > item.from && item.from >= line.from && item.to <= line.to && item.spec.class === undefined,
    )
    // `**` ×2、反引号 ×2、`[`、`](url)` 等
    expect(hiddenOnLine.length).toBeGreaterThanOrEqual(4)
  })

  it('围栏代码块在光标外被整块替换成代码卡片', () => {
    const { state, decorations, atomic } = setup(0)
    const list = items(decorations, state.doc.length)
    const widget = list.find((item) => item.spec.widget instanceof CodeBlockWidget)

    expect(widget).toBeDefined()
    expect(widget?.from).toBe(lineStart(7))
    expect(widget?.to).toBe(state.doc.line(9).to)

    // 同一区间必须是原子的，否则方向键会钻进隐藏内容里
    const atomicItems = items(atomic, state.doc.length)
    expect(atomicItems.some((item) => item.from === widget?.from && item.to === widget?.to)).toBe(true)
  })

  it('光标进入围栏代码块时改用源码视图', () => {
    const { state, decorations } = setup(lineStart(8))
    const list = items(decorations, state.doc.length)

    expect(list.some((item) => item.spec.widget instanceof CodeBlockWidget)).toBe(false)

    for (const lineNumber of [7, 8, 9]) {
      const from = lineStart(lineNumber)
      expect(
        list.some((item) => item.from === from && item.to === from && item.spec.class === 'cm-lp-src-block'),
      ).toBe(true)
    }
    expect(state.doc.line(7).from).toBe(lineStart(7))
  })

  it('表格在光标外渲染成只读 widget', () => {
    const { decorations } = setup(0)
    const list = items(decorations, DOC.length)
    const widget = list.find((item) => item.spec.widget instanceof TableWidget)

    expect(widget).toBeDefined()
    expect(widget?.from).toBe(lineStart(11))
    expect(widget?.to).toBe(LINES.slice(0, 13).join('\n').length)
  })

  it('分割线渲染成 hr widget', () => {
    const { decorations } = setup(0)
    const list = items(decorations, DOC.length)
    const widget = list.find((item) => item.spec.widget instanceof RuleWidget)
    expect(widget?.from).toBe(lineStart(15))
  })

  it('引用块整段带左侧竖线类', () => {
    const { decorations } = setup(0)
    const list = items(decorations, DOC.length)
    const from = lineStart(5)
    expect(list.some((item) => item.from === from && item.to === from && item.spec.class === 'cm-lp-quote')).toBe(true)
  })

  it('被 widget 覆盖的行上不会再挂行装饰（避免块级装饰重叠）', () => {
    const { decorations } = setup(0)
    const list = items(decorations, DOC.length)
    const widgets = list.filter((item) => item.spec.widget !== undefined)

    for (const widget of widgets) {
      const lineDecorations = list.filter(
        (item) => item.from === item.to && item.from >= widget.from && item.to <= widget.to,
      )
      expect(lineDecorations).toHaveLength(0)
    }
  })
})

describe('M3：公式与图片', () => {
  const MATH_DOC = ['# 公式', '', '行内公式 $E = mc^2$ 在这里。', '', '$$', '\\int_0^1 x^2 dx', '$$', '', '![示意图](images/a.png)', ''].join('\n')

  function mathSetup(anchor: number) {
    const state = EditorState.create({
      doc: MATH_DOC,
      extensions: [markdown({ base: markdownLanguage })],
      selection: { anchor },
    })
    const { decorations } = buildDecorations(state, [{ from: 0, to: state.doc.length }])
    const list: Item[] = []
    decorations.between(0, state.doc.length, (from, to, value) => {
      list.push({ from, to, spec: value.spec as Item['spec'] })
    })
    return { state, list }
  }

  it('块级 $$ 公式渲染成 MathWidget', () => {
    // 光标放在第一行，避免揭示块级公式
    const { list } = mathSetup(0)
    const widget = list.find((item) => item.spec.widget instanceof MathWidget && (item.spec.widget as MathWidget).display)
    expect(widget).toBeDefined()
    expect((widget?.spec.widget as MathWidget).tex).toBe('\\int_0^1 x^2 dx')
  })

  it('行内 $..$ 公式渲染成行内 MathWidget', () => {
    const { list } = mathSetup(0)
    const inline = list.find((item) => item.spec.widget instanceof MathWidget && !(item.spec.widget as MathWidget).display)
    expect(inline).toBeDefined()
    expect((inline?.spec.widget as MathWidget).tex).toBe('E = mc^2')
  })

  it('图片渲染成 ImageWidget（默认不加载）', () => {
    const { list } = mathSetup(0)
    const image = list.find((item) => item.spec.widget instanceof ImageWidget)
    expect(image).toBeDefined()
    expect((image?.spec.widget as ImageWidget).src).toBe('images/a.png')
    expect((image?.spec.widget as ImageWidget).resolved).toBeNull()
  })

  it('代码块里的 $$ 不会被当成公式', () => {
    const doc = ['```', '$$', 'x = 1', '$$', '```', ''].join('\n')
    // 光标放在围栏之后的空行上，这样围栏处于"收起"状态
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
      selection: { anchor: doc.length },
    })
    const { decorations } = buildDecorations(state, [{ from: 0, to: state.doc.length }])
    const widgets: unknown[] = []
    decorations.between(0, state.doc.length, (_from, _to, value) => {
      widgets.push(value.spec.widget)
    })
    expect(widgets.some((widget) => widget instanceof MathWidget)).toBe(false)
    expect(widgets.some((widget) => widget instanceof CodeBlockWidget)).toBe(true)
  })
})

describe('M2.1：链接与列表', () => {
  function build(doc: string, anchor: number) {
    const state = EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage })],
      selection: { anchor },
    })
    const { decorations } = buildDecorations(state, [{ from: 0, to: state.doc.length }])
    const list: Array<{ from: number; to: number; spec: { class?: string; attributes?: Record<string, string>; widget?: unknown } }> = []
    decorations.between(0, state.doc.length, (from, to, value) => {
      list.push({ from, to, spec: value.spec })
    })
    return { state, list }
  }

  it('链接文字带上可点击标记与目标地址', () => {
    const doc = ['# 标题', '', '看这个 [示例](https://example.com) 链接', ''].join('\n')
    const { list } = build(doc, 0)
    const link = list.find((item) => item.spec.class === 'cm-lp-link')

    expect(link).toBeDefined()
    expect(link?.spec.attributes?.['data-url']).toBe('https://example.com')
    // 覆盖的正是链接文字（不含方括号）
    expect(doc.slice(link!.from, link!.to)).toBe('示例')
  })

  it('文档以代码块/表格开头时，后面的行内装饰不受影响', () => {
    const doc = ['```js', 'const a = 1', '```', '', '看 [链接](https://example.com)', ''].join('\n')
    const { list } = build(doc, doc.length)
    expect(list.some((item) => item.spec.class === 'cm-lp-link')).toBe(true)
  })

  it('标题末尾的 {#mm} 标记在非编辑态被隐藏', () => {
    const doc = ['# 架构 {#mm}', '', '正文'].join('\n')
    const { list } = build(doc, doc.length)
    // ` {#mm}` 这段被 replace 掉（行内容共 10 个字符）
    expect(list.some((item) => item.from === 4 && item.to === 10)).toBe(true)
  })

  it('无序列表的 - 被替换成圆点 widget', () => {
    const doc = ['- 第一项', '- 第二项', ''].join('\n')
    const { list } = build(doc, doc.length)
    const bullets = list.filter((item) => item.spec.widget instanceof BulletWidget)
    expect(bullets).toHaveLength(2)
  })

  it('有序列表保留数字，不做替换', () => {
    const doc = ['1. 第一项', '2. 第二项', ''].join('\n')
    const { list } = build(doc, doc.length)
    expect(list.some((item) => item.spec.widget instanceof BulletWidget)).toBe(false)
  })
})
