import { WidgetType } from '@codemirror/view'
import katex from 'katex'

/**
 * 数学公式 widget：用 KaTeX 把 TeX 渲染成 HTML。
 *
 * 出错时（例如 `\frac{1` 少了参数）KaTeX 会抛出异常；这里关掉 `throwOnError`，
 * 让它渲染成红色的错误公式，而不是把整段内容吞掉。
 */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super()
  }

  eq(other: MathWidget): boolean {
    return other.tex === this.tex && other.display === this.display
  }

  toDOM(): HTMLElement {
    const element = document.createElement(this.display ? 'div' : 'span')
    element.className = this.display ? 'cm-lp-math cm-lp-math-block' : 'cm-lp-math'

    try {
      katex.render(this.tex, element, {
        displayMode: this.display,
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
      })
    } catch (error) {
      element.classList.add('cm-lp-math-error')
      element.textContent = error instanceof Error ? error.message : String(error)
    }

    return element
  }

  ignoreEvent(): boolean {
    return false
  }
}
