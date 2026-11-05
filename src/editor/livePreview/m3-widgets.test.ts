// @vitest-environment happy-dom
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { ImageWidget } from './image-widget'
import { MathWidget } from './math-widget'

function fakeView(length = 200) {
  const dispatch = vi.fn()
  const view = { state: { doc: { length } }, dispatch } as unknown as EditorView
  return { view, dispatch }
}

describe('MathWidget', () => {
  it('行内公式渲染成 KaTeX 结构', () => {
    const element = new MathWidget('E = mc^2', false).toDOM()
    expect(element.tagName).toBe('SPAN')
    expect(element.classList.contains('cm-lp-math')).toBe(true)
    expect(element.classList.contains('cm-lp-math-block')).toBe(false)
    expect(element.querySelector('.katex')).not.toBeNull()
  })

  it('块级公式用 div 并居中显示', () => {
    const element = new MathWidget('\\frac{1}{2}', true).toDOM()
    expect(element.tagName).toBe('DIV')
    expect(element.classList.contains('cm-lp-math-block')).toBe(true)
    expect(element.querySelector('.katex-display')).not.toBeNull()
  })

  it('非法公式不抛异常，渲染成错误提示', () => {
    const element = new MathWidget('\\frac{1', false).toDOM()
    // throwOnError:false 时 KaTeX 自己渲染错误样式；无论如何不应抛异常
    expect(element.textContent?.length).toBeGreaterThan(0)
  })
})

const noLoader = async () => null

describe('ImageWidget', () => {
  it('已解析的地址渲染成 img', () => {
    const { view } = fakeView()
    const element = new ImageWidget('images/a.png', '示意图', 'asset://localhost/a.png', noLoader, 0).toDOM(view)

    const image = element.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe('asset://localhost/a.png')
    expect(image?.getAttribute('alt')).toBe('示意图')
  })

  it('未解析（远程图片）时给出占位而不是发请求', () => {
    const { view } = fakeView()
    const element = new ImageWidget('https://example.com/a.png', '远程图', null, noLoader, 0).toDOM(view)

    expect(element.querySelector('img')).toBeNull()
    expect(element.querySelector('.cm-lp-image-blocked')?.textContent).toContain('远程图')
  })

  it('点击远程占位会触发加载并替换成图片', async () => {
    const { view } = fakeView()
    let requested = ''
    const loader = async (src: string) => {
      requested = src
      return 'data:image/png;base64,AAAA'
    }
    const element = new ImageWidget('https://example.com/a.png', '远程图', null, loader, 0).toDOM(view)
    const chip = element.querySelector('.cm-lp-image-blocked') as HTMLElement

    chip.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(requested).toBe('https://example.com/a.png')
    expect((element.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('点一下回到源码', () => {
    const { view, dispatch } = fakeView()
    const element = new ImageWidget('a.png', '', 'a.png', noLoader, 5).toDOM(view)
    element.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
    expect(dispatch.mock.calls[0][0].selection.anchor).toBe(6)
  })
})
