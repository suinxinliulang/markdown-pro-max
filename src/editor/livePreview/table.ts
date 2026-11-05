/**
 * GFM 表格解析（纯函数，便于单测）。
 *
 * 只处理「源码 → 单元格文本」这一步；单元格内的行内 Markdown 在 M2 里
 * 直接按原文显示，M3 再接行内渲染。
 */

export type Align = 'left' | 'center' | 'right' | null

export interface ParsedTable {
  /** 表头单元格。 */
  header: string[]
  /** 每列对齐方式。 */
  align: Align[]
  /** 数据行。 */
  rows: string[][]
}

/** 按未转义的 `|` 切分一行，并去掉首尾的管道符。 */
export function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''

  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]
    if (char === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

/** 解析分隔行（`| --- | :--: |`），非法时返回 null。 */
export function parseAlign(delimiter: string[], columns: number): Align[] | null {
  if (delimiter.length !== columns) return null
  const align: Align[] = []
  for (const cell of delimiter) {
    if (!/^:?-+:?$/.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    align.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null)
  }
  return align
}

/**
 * 解析整张表格；不是合法表格时返回 null。
 *
 * 允许首尾空行，但不允许表头与分隔行列数不一致——那种情况宁可显示源码。
 */
export function parseTable(source: string): ParsedTable | null {
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) return null

  const header = splitRow(lines[0])
  if (header.length === 0) return null

  const align = parseAlign(splitRow(lines[1]), header.length)
  if (!align) return null

  const rows = lines.slice(2).map(splitRow)
  return { header, align, rows }
}
