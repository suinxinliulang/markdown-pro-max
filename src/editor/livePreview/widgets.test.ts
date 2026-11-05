// @vitest-environment happy-dom
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { CodeBlockWidget, RuleWidget, TableWidget } from './widgets'

/**
 * widget 的 DOM 构建不依赖 CodeMirror 的视图内部，只用到 `view.dispatch`，
 * 所以可以用 happy-dom 在 Node 里断言真实产出的 DOM。
 */

function fakeView(length = 200) {
  const dispatch = vi.fn()
  const view = { state: { doc: { length } }, dispatch } as unknown as EditorView
  return { view, dispatch }
}

describe('TableWidget', () => {
  const source = ['| 名称 | 数量 |', '| :--- | ---: |', '| 苹果 | 3 |', '| 梨 | 5 |'].join('\n')

  it('单元格里的行内 Markdown 会渲染', () => {
    const { view } = fakeView()
    const source = ['| 名称 | 说明 |', '| --- | --- |', '| **重要** | `代码` 与 ~~废弃~~ |'].join('\n')
    const element = new TableWidget(source, 0).toDOM(view)

    const cells = element.querySelectorAll('tbody td')
    expect(cells[0].querySelector('strong')?.textContent).toBe('重要')
    expect(cells[1].querySelector('code')?.textContent).toBe('代码')
    expect(cells[1].querySelector('del')?.textContent).toBe('废弃')
  })

  it('单元格里的链接可以点开', () => {
    const open = vi.fn()
    const view = {
      state: { doc: { length: 200 }, facet: () => open },
      dispatch: vi.fn(),
    } as unknown as EditorView
    const source = ['| 链接 |', '| --- |', '| [文档](https://a.dev) |'].join('\n')
    const element = new TableWidget(source, 0).toDOM(view)

    const link = element.querySelector('td .cm-lp-link') as HTMLElement
    expect(link.getAttribute('data-href')).toBe('https://a.dev')

    link.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(open).toHaveBeenCalledWith('https://a.dev')
  })

  it('渲染表头、行与对齐样式', () => {
    const { view } = fakeView()
    const element = new TableWidget(source, 0).toDOM(view)

    const headers = element.querySelectorAll('th')
    expect(headers).toHaveLength(2)
    expect(headers[0].textContent).toBe('名称')
    expect(headers[1].textContent).toBe('数量')
    expect(headers[0].style.textAlign).toBe('left')
    expect(headers[1].style.textAlign).toBe('right')

    const rows = element.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelectorAll('td')[0].textContent).toBe('苹果')
  })

  it('单元格文本按纯文本插入，不会被当成 HTML', () => {
    const { view } = fakeView()
    const element = new TableWidget('| <b>x</b> |\n| --- |\n| <script>y</script> |', 0).toDOM(view)
    expect(element.querySelector('b')).toBeNull()
    expect(element.querySelector('th')?.textContent).toBe('<b>x</b>')
  })

  it('点一下就回到源码（dispatch 选区）', () => {
    const { view, dispatch } = fakeView()
    const element = new TableWidget(source, 10).toDOM(view)
    element.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
    expect(dispatch).toHaveBeenCalledTimes(1)
    const arg = dispatch.mock.calls[0][0]
    expect(arg.selection.anchor).toBe(11)
  })

  it('非表格源码退化为等宽文本', () => {
    const { view } = fakeView()
    const element = new TableWidget('not a table', 0).toDOM(view)
    expect(element.querySelector('table')).toBeNull()
    expect(element.querySelector('pre')?.textContent).toBe('not a table')
  })
})

describe('CodeBlockWidget', () => {
  it('去掉围栏并显示语言标签', () => {
    const { view } = fakeView()
    const element = new CodeBlockWidget('```rust\nfn main() {}\n```', 0).toDOM(view)

    expect(element.dataset.language).toBe('rust')
    expect(element.querySelector('.cm-lp-code-lang')?.textContent).toBe('rust')
    expect(element.querySelector('pre')?.textContent).toBe('fn main() {}')
  })

  it('未闭合的围栏不会吞掉最后一行', () => {
    const { view } = fakeView()
    const element = new CodeBlockWidget('```js\nconst a = 1', 0).toDOM(view)
    expect(element.querySelector('pre')?.textContent).toBe('const a = 1')
  })

  it('没有语言标识时不渲染标签', () => {
    const { view } = fakeView()
    const element = new CodeBlockWidget('```\nplain\n```', 0).toDOM(view)
    expect(element.querySelector('.cm-lp-code-lang')).toBeNull()
  })
})

describe('RuleWidget', () => {
  it('渲染一条水平线', () => {
    const { view } = fakeView()
    const element = new RuleWidget(0).toDOM(view)
    expect(element.querySelector('hr')).not.toBeNull()
  })
})
