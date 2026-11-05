// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarkdownEditor } from './index'

// Mermaid 需要真实浏览器布局，这里换成桩，只验证"图表挂载点"确实进了 DOM。
vi.mock('mermaid', () => ({
  default: {
    initialize() {},
    render: async () => ({ svg: '<svg class="mock-mermaid"></svg>' }),
  },
}))

const FIXTURE = readFileSync(join(process.cwd(), 'docs/fixtures/kitchen-sink.md'), 'utf8')

/**
 * CodeMirror 是视口渲染：happy-dom 没有真实布局，长文档只会渲染开头一部分。
 * 所以「整篇文档」的完整覆盖交给装饰层测试（fixture.test.ts），
 * 这里对每种元素用 1–3 行的迷你文档，确保它一定在视口内，验证 DOM 真的生成了。
 */

let mounted: MarkdownEditor | null = null
let host: HTMLElement | null = null

afterEach(() => {
  mounted?.destroy()
  mounted = null
  host?.remove()
  host = null
})

function render(doc: string, mode: 'preview' | 'source' = 'preview', park = true) {
  // 末尾补两个空行，把光标停在块外，否则“光标所在行”永远处于揭示状态
  const text = park ? `${doc}\n\n` : doc
  host = document.createElement('div')
  document.body.append(host)
  mounted = new MarkdownEditor({
    parent: host,
    theme: 'light',
    mode,
    onDocChanged: () => {},
    onCursor: () => {},
    onSave: () => {},
  })
  mounted.setText(text)
  mounted.view.dispatch({ selection: { anchor: text.length } })
  return mounted
}

const count = (selector: string) => host?.querySelectorAll(selector).length ?? 0

interface Case {
  name: string
  doc: string
  selector: string
}

const CASES: Case[] = [
  { name: 'frontmatter', doc: '---\ntitle: x\n---', selector: '.cm-lp-frontmatter' },
  { name: '一级标题', doc: '# 标题', selector: '.cm-line.cm-lp-h1' },
  { name: '引用', doc: '> 引用内容', selector: '.cm-line.cm-lp-quote' },
  { name: '链接', doc: '[链接](https://example.com)', selector: '.cm-lp-link' },
  { name: '无序列表', doc: '- 项目一', selector: '.cm-lp-bullet' },
  { name: '代码卡片', doc: '```js\nconst a = 1\n```', selector: '.cm-lp-code' },
  { name: '表格', doc: '| a | b |\n| - | - |\n| 1 | 2 |', selector: '.cm-lp-table' },
  { name: '分割线', doc: '---', selector: '.cm-lp-rule' },
  { name: '图片', doc: '![图](a.png)', selector: '.cm-lp-image' },
  { name: '行内公式', doc: '行内 $a^2$ 公式', selector: '.cm-lp-math .katex' },
  { name: '块级公式', doc: '$$\nx^2\n$$', selector: '.cm-lp-math-block .katex-display' },
  { name: 'Mermaid', doc: '```mermaid\nflowchart TD\n  A --> B\n```', selector: '.cm-lp-mermaid' },
  { name: '行内 HTML', doc: '按键 <kbd>Ctrl</kbd> 保存', selector: '.cm-lp-html kbd' },
  { name: '块级 HTML', doc: '<div align="center"><strong>居中</strong></div>', selector: '.cm-lp-html-block strong' },
]

describe('真实 EditorView 里的渲染', () => {
  for (const item of CASES) {
    it(`${item.name} 落成 DOM 节点`, () => {
      render(item.doc)
      expect(count(item.selector)).toBe(1)
    })
  }

  it('Mermaid 围栏不会同时渲染成代码卡片', () => {
    render('```mermaid\nflowchart TD\n  A --> B\n```')
    expect(count('.cm-lp-mermaid')).toBe(1)
    expect(count('.cm-lp-code')).toBe(0)
  })

  it('链接带 data-url，可被 Ctrl/Cmd 点击打开', () => {
    render('[链接](https://example.com "标题")')
    const link = host?.querySelector('.cm-lp-link') as HTMLElement | null
    expect(link?.getAttribute('data-url')).toBe('https://example.com')
  })

  it('带 frontmatter 的文档，正文里的行内装饰仍然生效', () => {
    render(['---', 'title: x', '---', '', '看 [链接](https://example.com) 与 <kbd>Ctrl</kbd>', ''].join('\n'))
    expect(count('.cm-lp-frontmatter')).toBe(1)
    expect(count('.cm-lp-link')).toBe(1)
    expect(count('.cm-lp-html kbd')).toBe(1)
  })

  it('单击链接就用系统程序打开（不需要修饰键）', () => {
    const opened: string[] = []
    host = document.createElement('div')
    document.body.append(host)
    mounted = new MarkdownEditor({
      parent: host,
      theme: 'light',
      mode: 'preview',
      onDocChanged: () => {},
      onCursor: () => {},
      onSave: () => {},
      openExternal: (url) => opened.push(url),
    })
    mounted.setText('[链接](https://example.com)\n\n')
    mounted.view.dispatch({ selection: { anchor: mounted.view.state.doc.length } })

    const link = host.querySelector('.cm-lp-link')
    expect(link).not.toBeNull()
    link?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(opened).toEqual(['https://example.com'])
  })

  it('整篇文档：所见即所得不改变原文（逐字比对）', () => {
    const current = render(FIXTURE, 'preview', false)
    expect(current.getText()).toBe(FIXTURE)
  })

  it('整篇文档：切到源码再切回来，文字仍然一字不差', () => {
    const current = render(FIXTURE, 'preview', false)
    current.setMode('source')
    expect(count('.cm-lp-frontmatter')).toBe(0)
    expect(current.getText()).toBe(FIXTURE)

    current.setMode('preview')
    expect(count('.cm-lp-frontmatter')).toBe(1)
    expect(current.getText()).toBe(FIXTURE)
  })
})
