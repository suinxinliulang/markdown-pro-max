/**
 * 链接解析（纯函数）。
 *
 * 支持：
 * - 行内式 `[文字](https://a.b "标题")`
 * - 全引用式 `[文字][label]` / 折叠式 `[文字][]` / 简写式 `[文字]`（需要在文档里有定义）
 */

/** 文档里的引用式链接定义：`[label]: https://...`。 */
export function collectLinkDefinitions(text: string): Map<string, string> {
  const definitions = new Map<string, string>()

  for (const line of text.split('\n')) {
    const match = /^\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+.*)?$/.exec(line.trim())
    if (match) definitions.set(match[1].trim().toLowerCase(), match[2])
  }

  return definitions
}

export interface ParsedLink {
  /** 展示文字。 */
  text: string
  /** 目标地址。 */
  url: string
  /** 文字在原始片段中的起始偏移（`[` 之后）。 */
  textStart: number
}

const INLINE = /^\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)$/
const REFERENCE = /^\[([^\]]*)\]\[([^\]]*)\]$/
const SHORTCUT = /^\[([^\]]+)\]$/

/** 把一段链接源码解析成「文字 + 地址」。 */
export function parseLink(raw: string, definitions: Map<string, string>): ParsedLink | null {
  const inline = INLINE.exec(raw)
  if (inline) return { text: inline[1], url: inline[2], textStart: 1 }

  const reference = REFERENCE.exec(raw)
  if (reference) {
    const label = (reference[2] || reference[1]).trim().toLowerCase()
    const url = definitions.get(label)
    return url ? { text: reference[1], url, textStart: 1 } : null
  }

  const shortcut = SHORTCUT.exec(raw)
  if (shortcut) {
    const url = definitions.get(shortcut[1].trim().toLowerCase())
    return url ? { text: shortcut[1], url, textStart: 1 } : null
  }

  return null
}
