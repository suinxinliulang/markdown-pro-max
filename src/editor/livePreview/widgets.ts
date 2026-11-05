import type { EditorView } from '@codemirror/view'
import { WidgetType } from '@codemirror/view'
import { clickable } from './clickable'
import { externalOpener } from './facets'
import { renderInlineMarkdown } from './inline-markdown'
import { parseTable } from './table'

const FENCE = /^(`{3,}|~{3,})\s*([\p{L}\p{N}_+-]*)/u

/** 围栏代码块的只读卡片。M3 会在这里接 syntax highlight。 */
export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: CodeBlockWidget): boolean {
    return other.source === this.source
  }

  toDOM(view: EditorView): HTMLElement {
    const lines = this.source.split('\n')
    const match = FENCE.exec(lines[0] ?? '')
    const language = match?.[2] ?? ''

    const body = [...lines]
    if (body.length > 0) body.shift()
    const last = body[body.length - 1]
    if (last !== undefined && /^\s*(`{3,}|~{3,})\s*$/.test(last)) body.pop()

    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-code'
    wrapper.dataset.language = language

    if (language) {
      const label = document.createElement('span')
      label.className = 'cm-lp-code-lang'
      label.textContent = language
      wrapper.append(label)
    }

    const pre = document.createElement('pre')
    pre.textContent = body.join('\n')
    wrapper.append(pre)

    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** 表格的只读渲染；点一下回到源码编辑。 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly pos: number,
  ) {
    super()
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source
  }

  toDOM(view: EditorView): HTMLElement {
    const parsed = parseTable(this.source)
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-table'

    if (!parsed) {
      const pre = document.createElement('pre')
      pre.textContent = this.source
      wrapper.append(pre)
      clickable(wrapper, view, this.pos)
      return wrapper
    }

    const table = document.createElement('table')
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    parsed.header.forEach((cell, index) => {
      const th = document.createElement('th')
      th.innerHTML = renderInlineMarkdown(cell)
      th.style.textAlign = parsed.align[index] ?? 'left'
      headRow.append(th)
    })
    thead.append(headRow)
    table.append(thead)

    if (parsed.rows.length > 0) {
      const tbody = document.createElement('tbody')
      for (const row of parsed.rows) {
        const tr = document.createElement('tr')
        for (let i = 0; i < parsed.header.length; i += 1) {
          const td = document.createElement('td')
          td.innerHTML = renderInlineMarkdown(row[i] ?? '')
          td.style.textAlign = parsed.align[i] ?? 'left'
          tr.append(td)
        }
        tbody.append(tr)
      }
      table.append(tbody)
    }

    // 单元格里的链接：点开用系统浏览器，不触发"回到源码"
    table.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest?.('.cm-lp-link')
      const url = link?.getAttribute('data-href')
      if (!url) return
      event.preventDefault()
      event.stopPropagation()
      view.state.facet(externalOpener)(url)
    })

    wrapper.append(table)
    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}

/** 无序列表的圆点：替换掉源码里的 `-` / `*` / `+`。 */
export class BulletWidget extends WidgetType {
  constructor(readonly pos: number) {
    super()
  }

  eq(other: BulletWidget): boolean {
    return other.pos === this.pos
  }

  toDOM(): HTMLElement {
    const dot = document.createElement('span')
    dot.className = 'cm-lp-bullet'
    dot.textContent = '•'
    return dot
  }

  ignoreEvent(): boolean {
    return true
  }
}

/** 分割线：把 `---` 渲染成真正的横线。 */
export class RuleWidget extends WidgetType {
  constructor(readonly pos: number) {
    super()
  }

  eq(other: RuleWidget): boolean {
    return other.pos === this.pos
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-lp-block cm-lp-rule'
    wrapper.append(document.createElement('hr'))
    clickable(wrapper, view, this.pos)
    return wrapper
  }

  ignoreEvent(): boolean {
    return false
  }
}
