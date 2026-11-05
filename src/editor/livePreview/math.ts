/**
 * 数学公式的扫描（纯函数）。
 *
 * Markdown 本身没有公式语法，所以这里自己做词法扫描，规则与 Typora/Obsidian 一致：
 * - `$...$`  行内公式
 * - `$$...$$` 独占一行，或跨多行的块级公式
 *
 * 扫描结果只给位置与 TeX 文本，渲染交给 KaTeX。
 */

/** 行内公式位置。 */
export interface InlineMath {
  from: number
  to: number
  tex: string
}

/** 块级公式位置。行号从 0 开始。 */
export interface BlockMath {
  from: number
  to: number
  tex: string
  startLine: number
  endLine: number
}

const isEscaped = (text: string, index: number): boolean => {
  let backslashes = 0
  let cursor = index - 1
  while (cursor >= 0 && text[cursor] === '\\') {
    backslashes += 1
    cursor -= 1
  }
  return backslashes % 2 === 1
}

/**
 * 扫描一行的行内公式。`offset` 是该行在文档中的起始偏移。
 *
 * `$$` 不当作行内公式（它属于块级公式），转义的 `\$` 会被跳过。
 */
export function scanInlineMath(text: string, offset = 0): InlineMath[] {
  const found: InlineMath[] = []
  let index = 0

  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2
      continue
    }
    if (text[index] !== '$') {
      index += 1
      continue
    }
    // 连续两个 `$` 属于块级公式，整对跳过，避免把 `$$x$$` 误判成行内 $x$
    if (text[index + 1] === '$') {
      index += 2
      continue
    }

    let cursor = index + 1
    let closing = -1
    while (cursor < text.length) {
      if (text[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (text[cursor] === '$') {
        closing = cursor
        break
      }
      cursor += 1
    }

    if (closing === -1) {
      index += 1
      continue
    }

    const tex = text.slice(index + 1, closing)
    if (tex.trim().length > 0) {
      found.push({ from: offset + index, to: offset + closing + 1, tex })
    }
    index = closing + 1
  }

  return found
}

/** 扫描整篇文档里的块级公式。 */
export function scanBlockMath(text: string): BlockMath[] {
  const lines = text.split('\n')
  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }

  const found: BlockMath[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    const delimiter = line.indexOf('$$')

    if (!trimmed.startsWith('$$') || delimiter === -1) {
      index += 1
      continue
    }

    // 单行 `$$ ... $$`
    const body = line.slice(delimiter)
    if (body.length > 4 && body.trimEnd().endsWith('$$')) {
      const end = delimiter + body.trimEnd().length
      found.push({
        from: offsets[index] + delimiter,
        to: offsets[index] + end,
        tex: line.slice(delimiter + 2, end - 2),
        startLine: index,
        endLine: index,
      })
      index += 1
      continue
    }

    // 多行 `$$ ... $$`
    if (trimmed !== '$$') {
      index += 1
      continue
    }

    let closing = index + 1
    while (closing < lines.length && lines[closing].trim() !== '$$') closing += 1
    if (closing >= lines.length) break // 没闭合，当普通文本

    const lastLine = lines[closing]
    const closingDelimiter = lastLine.lastIndexOf('$$')
    found.push({
      from: offsets[index] + delimiter,
      to: offsets[closing] + closingDelimiter + 2,
      tex: lines.slice(index + 1, closing).join('\n'),
      startLine: index,
      endLine: closing,
    })
    index = closing + 1
  }

  return found
}

export { isEscaped }
