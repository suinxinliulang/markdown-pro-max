import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { clickable } from './clickable'
import { sanitizeHtml } from './sanitize'

/**
 * 行内 HTML widget：把 `<kbd>Ctrl</kbd>`、`<span style="...">文字</span>` 真正渲染出来。
 *
 * 安全：插入前统一过 `sanitize.ts` 的 allowlist 清洗（CSP 里也没有放开内联脚本），
 * 文档可以来自任意来源，不能假设它可信。
 */


export class HtmlInlineWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: HtmlInlineWidget): boolean {
    return other.html === this.html
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'cm-lp-html'
    wrapper.innerHTML = sanitizeHtml(this.html)
    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

export class HtmlBlockWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly pos: number,
    readonly isComment: boolean,
  ) {
    super()
  }

  eq(other: HtmlBlockWidget): boolean {
    return other.html === this.html && other.isComment === this.isComment
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-html-block'

    if (this.isComment) {
      wrapper.classList.add('is-comment')
      wrapper.textContent = 'HTML 注释'
      wrapper.title = this.html
    } else {
      wrapper.innerHTML = sanitizeHtml(this.html)
    }

    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}
