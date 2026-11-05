import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { clickable } from './clickable'

/** Frontmatter 的折叠卡片：默认收起，点一下回到源码编辑。 */
export class FrontmatterWidget extends WidgetType {
  constructor(
    readonly body: string,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: FrontmatterWidget): boolean {
    return other.body === this.body
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-frontmatter'

    const label = document.createElement('span')
    label.className = 'cm-lp-frontmatter-label'
    label.textContent = 'Frontmatter'

    const pre = document.createElement('pre')
    pre.textContent = this.body

    wrapper.append(label, pre)
    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}
