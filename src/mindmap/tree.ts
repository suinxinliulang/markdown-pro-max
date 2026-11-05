/**
 * 从 Markdown 提取标题并构建脑图数据。
 *
 * 只做纯逻辑：解析 → 抽标题 → 过滤 → 建树 → 生成 Mermaid mindmap 源码。
 * 渲染交给已有的 Mermaid 渲染管线，这样这里可以用 jsdom 之外的纯字符串测试。
 */

import { markdownLanguage } from '@codemirror/lang-markdown'

/** 脑图节点。 */
export interface MindNode {
  /** 展示文本。 */
  content: string
  /** 源文件行号（1 基）。 */
  line: number
  children: MindNode[]
}

/** 抽出来的一级标题信息。 */
export interface Heading {
  level: number
  /** 去掉行内标记与 `{#mm}` 之后的纯文本。 */
  text: string
  line: number
  /** 是否带 `{#mm}` 标记。 */
  marked: boolean
}

export interface MindMapResult {
  root: MindNode
  /** 可直接交给 mermaid 的 mindmap 源码。 */
  source: string
  /** 标题总数。 */
  headingCount: number
  /** 带 `{#mm}` 标记的标题数。 */
  markedCount: number
}

/** 标记语法：标题末尾的 `{#mm}`。 */
const MARKER = /\s*\{#mm\}\s*$/i

/** 去掉标题里的行内 Markdown 标记，只留纯文本。 */
export function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 把一段标题原文加工成展示文本。
 *
 * `## **架构** {#mm}` → `{ text: '架构', marked: true }`
 */
export function parseHeadingText(raw: string): { text: string; marked: boolean } {
  const marked = MARKER.test(raw)
  const withoutMarker = raw.replace(MARKER, '')
  const text = stripInline(withoutMarker)
  return { text: text.length > 0 ? text : '(无标题)', marked }
}

/**
 * 从 Markdown 文本里抽取顶层标题。
 *
 * 只看文档根节点下的标题——引用块、列表、表格里的 `#` 不算大纲。
 */
export function collectHeadings(markdown: string): Heading[] {
  const tree = markdownLanguage.parser.parse(markdown)
  const lineStarts: number[] = [0]
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown[index] === '\n') lineStarts.push(index + 1)
  }

  const lineAt = (offset: number): number => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (lineStarts[mid] <= offset) low = mid
      else high = mid - 1
    }
    return low + 1
  }

  const headings: Heading[] = []
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const match = /^(?:ATXHeading([1-6])|SetextHeading([12]))$/.exec(node.name)
    if (!match) continue

    const level = Number(match[1] ?? match[2])
    const raw = markdown.slice(node.from, node.to)
    // Setext 的节点范围包含下划线那一行，只取第一行
    const firstLine = raw.split('\n')[0]
    const withoutHashes = match[1] ? firstLine.replace(/^#{1,6}\s*/, '').replace(/\s+#+\s*$/, '') : firstLine

    const { text, marked } = parseHeadingText(withoutHashes)
    headings.push({ level, text, line: lineAt(node.from), marked })
  }

  return headings
}

/**
 * 过滤规则：文档里只要出现过 `{#mm}`，就只保留带标记的标题；
 * 一个标记都没有时，退化成「全部标题」——避免用户没加标记时看到空白脑图。
 */
export function selectHeadings(headings: Heading[]): Heading[] {
  const markedCount = headings.filter((heading) => heading.marked).length
  if (markedCount === 0) return headings
  return headings.filter((heading) => heading.marked)
}

/** 按层级把标题序列建成树；跳级时挂到最近的祖先。 */
export function buildTree(headings: Heading[], rootLabel: string): MindNode {
  const root: MindNode = { content: rootLabel, line: 0, children: [] }
  const stack: Array<{ level: number; node: MindNode }> = []

  for (const heading of headings) {
    const node: MindNode = { content: heading.text, line: heading.line, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop()
    }
    const parent = stack.length > 0 ? stack[stack.length - 1].node : root
    parent.children.push(node)
    stack.push({ level: heading.level, node })
  }

  return root
}

/** 生成 mermaid mindmap 源码。 */
export function toMermaidMindmap(root: MindNode): string {
  const lines: string[] = ['mindmap', `  ${sanitizeLabel(root.content)}`]

  const walk = (nodes: MindNode[], depth: number) => {
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}${sanitizeLabel(node.content)}`)
      walk(node.children, depth + 1)
    }
  }
  walk(root.children, 2)

  return lines.join('\n')
}

/** mermaid mindmap 的标签不需要引号，但要把换行和多余空白压掉。 */
function sanitizeLabel(text: string): string {
  const cleaned = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : '(无标题)'
}

/** 一站式：Markdown 文本 → 脑图数据 + mermaid 源码。 */
export function buildMindMap(markdown: string, rootLabel: string): MindMapResult {
  const headings = collectHeadings(markdown)
  const selected = selectHeadings(headings)
  const root = buildTree(selected, rootLabel)

  return {
    root,
    source: toMermaidMindmap(root),
    headingCount: headings.length,
    markedCount: headings.filter((heading) => heading.marked).length,
  }
}
