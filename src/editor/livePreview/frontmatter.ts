/**
 * YAML frontmatter 识别（纯函数）。
 *
 * 语法：文档必须以 `---` 单独成行开头，向下找到同样单独成行的 `---`（或 `...`）结束。
 * 找不到闭合就当普通内容处理——宁可多显示，也不要把正文吞进"frontmatter"。
 */

export interface Frontmatter {
  /** 起始偏移（恒为 0）。 */
  from: number
  /** 结束偏移（闭合行末尾）。 */
  to: number
  /** 闭合行的行号（0 开始）。 */
  endLine: number
  /** `---` 之间的 YAML 正文。 */
  body: string
}

/** 识别文档开头的 frontmatter。 */
export function findFrontmatter(text: string): Frontmatter | null {
  if (!text.startsWith('---')) return null

  const lines = text.split('\n')
  if (lines.length < 3) return null
  if (lines[0].trim() !== '---') return null

  let closing = -1
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (trimmed === '---' || trimmed === '...') {
      closing = index
      break
    }
  }
  if (closing <= 0) return null

  const offsets: number[] = []
  let offset = 0
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }

  return {
    from: 0,
    to: offsets[closing] + lines[closing].length,
    endLine: closing,
    body: lines.slice(1, closing).join('\n'),
  }
}
