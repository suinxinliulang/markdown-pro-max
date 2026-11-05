/**
 * 行内 HTML 的成组（纯函数）。
 *
 * Lezer 把 `<kbd>` 和 `</kbd>` 解析成两个独立的 `HTMLTag` 节点，中间的文字是普通文本。
 * 要渲染成真正的 `<kbd>Ctrl</kbd>`，必须把「开标签 → 闭标签」这一整段（含中间文字）
 * 一起替换成一个 widget。
 */

export interface HtmlTagRange {
  from: number
  to: number
  /** 原始标签文本，例如 `<kbd>`。 */
  raw: string
}

export interface HtmlRun {
  from: number
  to: number
}

/** 取标签名：`<kbd>` → `kbd`，`</kbd >` → `kbd`。 */
export function tagName(raw: string): string | null {
  const match = /^<\s*\/?\s*([A-Za-z][\w:-]*)/.exec(raw.trim())
  return match ? match[1].toLowerCase() : null
}

/** 是否为闭合标签。 */
export function isClosing(raw: string): boolean {
  return /^<\s*\//.test(raw.trim())
}

/** 是否为自闭合标签（`<br/>`、`<img ... />`）。 */
export function isSelfClosing(raw: string): boolean {
  return /\/\s*>$/.test(raw.trim())
}

/**
 * 把同一行上的标签配对成可以整体渲染的区间。
 *
 * 找不到闭合标签（例如 `<br>`）时，只把该标签自身作为一段。
 */
export function groupHtmlRuns(tags: HtmlTagRange[]): HtmlRun[] {
  const runs: HtmlRun[] = []
  let index = 0

  while (index < tags.length) {
    const open = tags[index]
    const name = tagName(open.raw)

    if (!name || isClosing(open.raw) || isSelfClosing(open.raw)) {
      runs.push({ from: open.from, to: open.to })
      index += 1
      continue
    }

    let closing = -1
    for (let cursor = index + 1; cursor < tags.length; cursor += 1) {
      if (isClosing(tags[cursor].raw) && tagName(tags[cursor].raw) === name) {
        closing = cursor
        break
      }
    }

    if (closing === -1) {
      runs.push({ from: open.from, to: open.to })
      index += 1
      continue
    }

    runs.push({ from: open.from, to: tags[closing].to })
    index = closing + 1
  }

  return runs
}
