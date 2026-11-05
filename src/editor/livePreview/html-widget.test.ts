// @vitest-environment happy-dom
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { HtmlBlockWidget, HtmlInlineWidget } from './html-widget'

function fakeView(length = 200) {
  const dispatch = vi.fn()
  const view = { state: { doc: { length } }, dispatch } as unknown as EditorView
  return { view, dispatch }
}

describe('HtmlInlineWidget', () => {
  it('渲染出真正的 HTML 元素', () => {
    const { view } = fakeView()
    const element = new HtmlInlineWidget('<b>加粗</b>', 0).toDOM(view)
    expect(element.querySelector('b')?.textContent).toBe('加粗')
  })

  it('保留 span 的内联样式', () => {
    const { view } = fakeView()
    const element = new HtmlInlineWidget('<span style="color: red">红</span>', 0).toDOM(view)
    const span = element.querySelector('span') as HTMLElement | null
    expect(span?.textContent).toBe('红')
    expect(span?.getAttribute('style')).toContain('color')
  })
})

describe('HtmlBlockWidget', () => {
  it('渲染块级 HTML', () => {
    const { view } = fakeView()
    const element = new HtmlBlockWidget('<div align="center"><strong>居中</strong></div>', 0, false).toDOM(view)
    expect(element.querySelector('strong')?.textContent).toBe('居中')
  })

  it('注释块渲染成占位而不是消失', () => {
    const { view } = fakeView()
    const element = new HtmlBlockWidget('<!-- 注释 -->', 0, true).toDOM(view)
    expect(element.textContent).toBe('HTML 注释')
  })
})
